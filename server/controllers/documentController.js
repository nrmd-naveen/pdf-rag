import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import Document from '../models/Document.js';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_S3_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});
const COLLECTION_NAME = 'pdf-store';

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


    const [summaryResult, tagsResult] = await Promise.all([
      model.generateContent(`Summarize in 2-3 sentences:\n\n${textContent.substring(0, 4000)}`),
      model.generateContent(`Generate 3-5 relevant tags, separated by commas:\n\n${textContent.substring(0, 2000)}`),
    ]);

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
    query.tags = { $all: tags.split(',') };
  }

  const documents = await Document.find(query).populate('createdBy', 'email');
  res.json(documents);
};

export const semanticSearch = async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ message: 'Query is required' });

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
};

export const deleteDocument = async (req, res) => {
  const doc = await Document.findById(req.params.id);

  if (!doc) return res.status(404).json({ message: 'Document not found' });

  if (doc.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'User not authorized to delete this document' });
  }
  
  await doc.deleteOne();
  // Optionally: delete from S3 and Qdrant
  res.json({ message: 'Document removed' });
};

// export const chatWithDocument = async (req, res) => {
//   const { query, history } = req.body;
//   const { id: docId } = req.params;
//   console.log(query, history);
//   try {
//     // 1. Embed the user's query
//     const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
//     const queryEmbeddingResult = await embeddingModel.embedContent(query);
//     const queryEmbedding = queryEmbeddingResult.embedding.value;
//     console.log("queryEmbedding ----------", queryEmbedding);
//     // 2. Find relevant chunks in Qdrant for this specific document
//     const searchResult = await qdrant.search(COLLECTION_NAME, {
//       vector: queryEmbedding,
//       limit: 3,
//       with_payload: true,
//       filter: { must: [{ key: 'docId', match: { value: docId } }] },
//     });
//     console.log("searchResult ----------", searchResult);
//     const context = searchResult.map(item => item.payload.text).join('\n\n');

//     // 3. Generate a response with Gemini
//     const chatModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
//     const prompt = `Based on the following context, answer the user's question. If the context doesn't have the answer, say you don't know.\n\nContext:\n${context}\n\nHistory:\n${history.map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nQuestion: ${query}`;
//     const result = await chatModel.generateContent(prompt);
//     console.log("result ----------", result);

//     res.json({ response: result.response.text() });
//   } catch (error) {
//     console.error('Chat error:', error);
//     res.status(500).json({ message: 'Error during chat processing.' });
//   }
// };
export const chatWithDocument = async (req, res) => {
  const { query, history } = req.body;
  const { id: docId } = req.params;  // Ensure docId is passed in params
  console.log("query, history ----------", query, history);
  try {
    // 1. Embed the user's query
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const queryEmbeddingResult = await embeddingModel.embedContent(query);
    
    // Check if embedding was successful
    if (!queryEmbeddingResult || !queryEmbeddingResult.embedding || !queryEmbeddingResult.embedding.values) {
      return res.status(400).json({ message: 'Failed to generate query embedding' });
    }
    
    const queryEmbedding = queryEmbeddingResult.embedding.values;  // Fixed to 'values'
    console.log("queryEmbedding ----------", queryEmbedding);
    
    console.log("user Id", req.user._id.toString())
    // 2. Find relevant chunks in Qdrant for this specific document
    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: 3,
      with_payload: true,
      filter: { must: [{ key: 'userId', match: { value:  req.user._id.toString() } }] },
    });

    console.log("searchResult ----------", searchResult);

    // Check if search returned any results
    if (!searchResult || searchResult.length === 0) {
      return res.status(404).json({ message: 'No relevant documents found.' });
    }

    const context = searchResult.map(item => item.payload.text).join('\n\n');

    // 3. Generate a response with Gemini
    const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const prompt = `Based on the following context, answer the user's question. If the context doesn't have the answer, say you don't know.\n\nContext:\n${context}\n\nHistory:\n${history.map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nQuestion: ${query}`;
    const result = await chatModel.generateContent(prompt);
    console.log("result ----------", result);
    
    res.json({ response: result.response.text() });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ message: 'Error during chat processing.' });
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
// async function processAndStoreEmbeddings(docId, userId, text) {
//   try {
//     const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

//     const chunks = text.match(/[\s\S]{1,1000}/g)?.filter(c => c.trim()) || [];

//     if (chunks.length === 0) {
//       console.warn(`⚠️ No valid chunks for document ${docId}`);
//       return;
//     }

//     console.log(`✅ Found ${chunks.length} chunks for doc ${docId}`);

//     const result = await embeddingModel.batchEmbedContents({
//       model: "gemini-embedding-001",
//       requests: chunks.map(chunk => ({
//         content: {
//           parts: [{ text: chunk }],
//         },
//         taskType: "RETRIEVAL_DOCUMENT",
//         // outputDimensionality: 768,
//       })),
//     });

//     const embeddings = result.embeddings;
//     console.log(`✅ Got ${embeddings.length} embeddings for doc ${docId}`);

//     if (!embeddings || embeddings.length === 0) {
//       console.warn(`⚠️ No valid embeddings for document ${docId}`);
//       return;
//     }

//     await qdrant.upsert(COLLECTION_NAME, {
//       wait: true,
//       points: embeddings.map((embedding, i) => ({
//         id: uuidv4(),
//         vector: embedding.values,
//         payload: { docId: docId.toString(), userId: userId.toString(), text: chunks[i] },
//       })),
//     });

//     console.log(`✅ Stored ${embeddings.length} embeddings for doc ${docId}`);
//   } catch (error) {
//     console.error(`❌ Embedding pipeline failed for doc ${docId}:`, error);
//   }
// }


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
