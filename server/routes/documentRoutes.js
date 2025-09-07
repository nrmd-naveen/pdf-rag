import express from 'express';
import {
  getUploadUrl,
  createDocument,
  getDocuments,
  semanticSearch,
  deleteDocument,
  chatWithDocument,
  chatAcrossAllDocuments,
  getChatHistories,
  getChatHistory,
  getDocChatHistory,
  getThumbnailUrl
} from '../controllers/documentController.js';
import { protect, admin } from '../middleware/auth.js';

const router = express.Router();

router.route('/').get(protect, getDocuments).post(protect, createDocument);
router.get('/upload-url', protect, getUploadUrl);
router.get('/poll-thumbnail/:id', protect, getThumbnailUrl);
router.post('/semantic-search', protect, semanticSearch);
router.route('/:id').delete(protect, deleteDocument)
router.post('/chat/ask', protect, chatAcrossAllDocuments)
router.post('/:id/chat', protect, chatWithDocument);
router.get('/chathistories', protect, getChatHistories)
router.get('/chathistories', protect, getChatHistories)
router.get('/chathistory/:id', protect, getChatHistory)
router.get('/:id/chatHistory', protect, getDocChatHistory)


export default router;