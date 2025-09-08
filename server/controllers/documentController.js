import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';
import Document from '../models/Document.js';
import ChatHistory from '../models/ChatHistory.js';

import s3Client from '../config/s3Client.js';
import genAI from '../config/googleGenerativeAI.js';
import qdrant from '../config/qdrantClient.js';
import dotenv from 'dotenv';

dotenv.config();

// const COLLECTION_NAME = 'pdf-store';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME;

const chatHistoryCache = new Map(); // Optional, not used in current code

export const getUploadUrl = async (req, res) => {
  const { filename } = req.query;
  const key = `${req.user._id}/${uuidv4()}-${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: 'application/pdf',
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
    res.json({ url, key });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ message: 'Error generating upload URL', error: error.message });
  }
};

export const createDocument = async (req, res) => {
  const { title, s3Path } = req.body;

  try {
    // 1. Fetch PDF from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Path,
    });
    const s3Response = await s3Client.send(getObjectCommand);
    const pdfBuffer = await streamToBuffer(s3Response.Body);

    // 2. Extract text
    const data = await pdf(pdfBuffer);
    const textContent = data.text;

    // 3. Generate summary and tags
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const documents = await Document.find({});  // Get all documents, or use a filter

    // Extract all tags from the documents
    const existingTags = documents.reduce((acc, doc) => {
      if (doc.tags && Array.isArray(doc.tags)) {
        acc.push(...doc.tags);  // Add tags from each document
      }
      return acc;
    }, []);

    const [summaryResult, tagsResult] = await Promise.all([
      model.generateContent(`
        Summarize the following document in 2-3 sentences, ensuring that the key points are captured while keeping it concise:
        \n\n${textContent.substring(0, 4000)}
      `),
      model.generateContent(`
        Generate 3-5 relevant tags for the following document, considering the previous tags provided. If the document content is relevant to those tags, include them; otherwise, suggest new ones. The tags should be concise, separated by commas.

        Existing Tags: ${existingTags.join(', ')}

        Document content:
        \n\n${textContent.substring(0, 2000)}
      `),
    ]);
    
    console.log("All Tags", existingTags);
    const summary = summaryResult.response.text();
    const tags = tagsResult.response.text().split(',').map(tag => tag.trim());
    
    // 4. Save metadata
    const document = new Document({
      title,
      s3Path,
      summary,
      tags,
      createdBy: req.user._id,
    });
    await document.save();
    
    // 6. Handle Thumbnail Generation Async
    generateThumbnail(s3Path, document._id);

    // 5. Process embeddings async
    processAndStoreEmbeddings(document._id, req.user._id, textContent);


    res.status(201).json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ message: 'Server error during document creation.' });
  }
};

export const getDocuments = async (req, res) => {
  const { text, tags } = req.query;
  const query = {};

  if (req.user.role !== 'admin') {
    query.createdBy = req.user._id;
  }

  if (text) {
    query.title = { $regex: text, $options: 'i' };
  }

  if (tags) {
    query.tags = { $in: tags.split(',').map(tag => new RegExp(tag.trim(), 'i')) };
  }

  const documents = await Document.find(query).populate('createdBy', 'email');
  res.json(documents);
};

export const semanticSearch = async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  try {
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await embeddingModel.embedContent(query);
    const queryEmbedding = result.embedding.values;

    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: 5,
      with_payload: true,
      filter: {
        must: [
          { key: 'userId', match: { value: req.user._id.toString() } }
        ]
      }
    });

    const docIds = [...new Set(searchResult.map(item => item.payload.docId))];
    const documents = await Document.find({ '_id': { $in: docIds } }).populate('createdBy', 'email');

    res.json(documents);
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ message: 'Semantic search failed.' });
  }
};


export const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) return res.status(404).json({ message: 'Document not found' });

    if (doc.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'User not authorized to delete this document' });
    }

    // Delete associated chat history
    await ChatHistory.deleteMany({ document: req.params.id });

    // Delete embeddings from Qdrant using a filter
    await qdrant.delete(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: 'docId',
            match: {
              value: req.params.id.toString(), // ensure string type match
            },
          },
        ],
      },
      wait: true, // optional, wait for operation to finish
    });

    // Need to delete document from S3 here - in future

    await doc.deleteOne();

    res.json({ message: 'Document and related data removed' });
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    res.status(500).json({ message: 'Server error while deleting document' });
  }
};



// Utility: convert S3 stream to buffer
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Background job for embedding
async function processAndStoreEmbeddings(docId, userId, text) {
  try {
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });

    // Split text into chunks of up to 1000 characters
    const chunks = text.match(/[\s\S]{1,1000}/g)?.filter(c => c.trim()) || [];

    if (chunks.length === 0) {
      console.warn(`⚠️ No valid chunks for document ${docId}`);
      return;
    }

    console.log(`✅ Found ${chunks.length} chunks for doc ${docId}`);

    // Batch embed the chunks
    const result = await embeddingModel.batchEmbedContents({
      model: "embedding-001",
      requests: chunks.map(chunk => ({
        content: {
          parts: [{ text: chunk }],
        },
        taskType: "RETRIEVAL_DOCUMENT",
      })),
    });

    const embeddings = result.embeddings;
    console.log(`✅ Got ${embeddings.length} embeddings for doc ${docId}`);

    if (!embeddings || embeddings.length === 0) {
      console.warn(`⚠️ No valid embeddings for document ${docId}`);
      return;
    }

    // Upsert embeddings to Qdrant
    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: embeddings.map((embedding, i) => ({
        id: uuidv4(),  // Generate a unique UUID for each point
        vector: embedding.values,  // Embedding vector
        payload: { 
          docId: docId.toString(),  // Store docId as a string for filtering
          userId: userId.toString(),  // User ID
          text: chunks[i],  // Store the chunk text
        },
      })),
    });

    console.log(`✅ Stored ${embeddings.length} embeddings for doc ${docId}`);
  } catch (error) {
    console.error(`❌ Embedding pipeline failed for doc ${docId}:`, error);
  }
}

export const generateThumbnail = async (s3Path, docId) => {
  const pdfUrl = `https://nrmd-pdf-store.s3.amazonaws.com/${s3Path}`;
  try {
    const thumbGenEndpoint = 'https://ba4hcgqlga.execute-api.ap-south-1.amazonaws.com/stage-1/generatePdfThumbnail';
    const response = await fetch(thumbGenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdfUrl }),
    });
    console.log("response ----------", response);
    const data = await response.json();
    const thumbnailUrl = data.thumbnailUrl;
    console.log("thumbnailUrl ----------", thumbnailUrl);
    // return thumbnailUrl;
    await Document.updateOne({ _id: docId }, { $set: { thumbnailUrl } });
  } catch (error) {
    console.error(`❌ Thumbnail generation failed for doc ${docId}:`, error);
  }
}

export const getThumbnailUrl = async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await Document.findById(id);
    res.json({ thumbnailUrl: doc?.thumbnailUrl });
  } catch (error) {
    console.error(`❌ Thumbnail generation failed for doc ${id}:`, error);
  }
}
