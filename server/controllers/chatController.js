
import Document from '../models/Document.js';
import ChatHistory from '../models/ChatHistory.js';

import genAI from '../config/googleGenerativeAI.js';
import qdrant from '../config/qdrantClient.js';

const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME;

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
    // console.log("Chat History ----", history)
    // 1. Embed the user's query
    const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" });
    const queryEmbeddingResult = await embeddingModel.embedContent(query);
    
    // Check if embedding was successful
    if (!queryEmbeddingResult || !queryEmbeddingResult.embedding || !queryEmbeddingResult.embedding.values) {
        return res.status(400).json({ message: 'Failed to generate query embedding' });
    }
    
    const queryEmbedding = queryEmbeddingResult.embedding.values;  // Fixed to 'values'
    // console.log("queryEmbedding ----------", queryEmbedding);
    
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


// console.log("searchResult ----------", searchResult);

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


export const chatAcrossAllDocuments = async (req, res) => {
    let { query, chatId } = req.body;
    // console.log("chatId ----------", chatId);
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
    // console.log("Added History --------",history)

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
    
    // console.log("prompt ----------", prompt)
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

    