import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import Document from '../models/Document.js';
import ChatHistory from '../models/ChatHistory.js';
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
  const doc = await Document.findById(req.params.id);

  if (!doc) return res.status(404).json({ message: 'Document not found' });

  if (doc.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'User not authorized to delete this document' });
  }
  
  await doc.deleteOne();
  // Optionally: delete from S3 and Qdrant
  res.json({ message: 'Document removed' });
};

export const chatWithDocument = async (req, res) => {
  let { query, chatId } = req.body;
  const { id: docId } = req.params;  

  try {
    let chat;
    if (chatId) {
      chat = await ChatHistory.findById(chatId);
    } else {
      // Create a new chat history if one doesn't exist
      const doc = await Document.findById(docId);
      chat = new ChatHistory({ user: req.user._id, document: docId, title: `Chat with ${doc.title}` });
    }

    const history = chat.messages.map(msg => ({ sender: msg.sender, text: msg.text }));

    // 1. Embed the user's query
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const queryEmbeddingResult = await embeddingModel.embedContent(query);

    // Check if embedding was successful
    if (!queryEmbeddingResult || !queryEmbeddingResult.embedding || !queryEmbeddingResult.embedding.values) {
      return res.status(400).json({ message: 'Failed to generate query embedding' });
    }
    
    const queryEmbedding = queryEmbeddingResult.embedding.values;  // Fixed to 'values'
    console.log("queryEmbedding ----------", queryEmbedding);

    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit: 3,
      with_payload: true,
      filter: {
        must: [{
          key: 'userId',
          match: { value: req.user._id.toString() }
        }]
      },
    });

    console.log("searchResult ----------", searchResult);

    // Check if search returned any results
    if (!searchResult || searchResult.length === 0) {
      return res.status(404).json({ message: 'No relevant documents found.' });
    }
    const filtered = searchResult.filter(item => item.payload.docId === docId);
    const context = filtered.map(item => item.payload.text).join('\n\n');

    // 3. Generate a response with Gemini
    const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const prompt = `Based on the following context, answer the user's question. If the context doesn't have the answer, say you don't know.\n\nContext:\n${context}\n\nHistory:\n${history.map(h => `${h.sender}: ${h.text}`).join('\n')}\n\nQuestion: ${query}`;
    const result = await chatModel.generateContent(prompt);
    const botResponse = result.response.text();

    // 4. Save chat history
    chat.messages.push({ sender: 'user', text: query });
    chat.messages.push({ sender: 'bot', text: botResponse });
    await chat.save();

    res.json({ response: botResponse, chatId: chat._id });
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


export const getChatHistories = async (req, res) => {
  try {
    const histories = await ChatHistory.find({ user: req.user._id, document: { $exists: false } })
      .sort({ updatedAt: -1 })
      .select('title updatedAt'); // Only select title and last update time
    res.json(histories);
  } catch (error) {
    console.error('Error fetching chat histories:', error);
    res.status(500).json({ message: 'Failed to fetch chat histories' });
  }
};

export const getChatHistory = async (req, res) => {
  const { id } = req.params;
  try {
    const chat = await ChatHistory.findById(id);
    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
};

export const getDocChatHistory = async (req, res) => {
  const { id } = req.params;
  try {
    const chat = await ChatHistory.find({ document: id }).sort({ updatedAt: -1 });
    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ message: 'Failed to fetch chat history' });
  }
};



export const chatAcrossAllDocuments = async (req, res) => {
  let { query, chatId } = req.body;

  if (!query) {
    return res.status(400).json({ message: 'Query is required' });
  }

  try {
    // 1. Generate embedding for the query
    let chat;
    if (chatId) {
      chat = await ChatHistory.findById(chatId);
    } else {
      // Create a new chat history if one doesn't exist
      chat = new ChatHistory({ user: req.user._id, title: query.substring(0, 40) + '...' });
    }

    const history = chat.messages.map(msg => ({ sender: msg.sender, text: msg.text }));

    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const queryEmbeddingResult = await embeddingModel.embedContent(query);
    const queryEmbedding = queryEmbeddingResult?.embedding?.values;

    if (!queryEmbedding) {
      return res.status(400).json({ message: 'Failed to generate query embedding' });
    }

    // 2. Search across all documents of this user
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

    if (!searchResult || searchResult.length === 0) {
      return res.status(404).json({ message: 'No relevant document chunks found.' });
    }

    const context = searchResult.map(item => item.payload.text).join('\n\n');

    // 3. Generate a Gemini response based on the context and chat history
    const chatModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
    const prompt = `You are a helpful assistant. Use the provided context and conversation history to answer the user’s question. 
    - If the context is relevant, incorporate it into your answer. 
    - If the context is missing or not relevant, simply answer the question naturally without mentioning the lack of context.

    Context:
    ${context}

    History:
    ${history.map(h => `${h.sender}: ${h.text}`).join('\n')}

    Question: ${query}
    `;

    const result = await chatModel.generateContent(prompt);
    const botResponse = result.response.text();

    // 4. Save chat history
    chat.messages.push({ sender: 'user', text: query });
    chat.messages.push({ sender: 'bot', text: botResponse });
    await chat.save();

    res.json({ response: botResponse, chatId: chat._id });
  } catch (error) {
    console.error('Chat error (across all docs):', error);
    res.status(500).json({ message: 'Error during chat processing.' });
  }
};
