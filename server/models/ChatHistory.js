import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['user', 'bot'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
  },
  { _id: false, timestamps: true }
);

const chatHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // For chats across all documents (ChatPage)
    title: {
      type: String,
    },
    // For chats with a single document (ChatModal)
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
    messages: [messageSchema],
  },
  { timestamps: true }
);

const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);
export default ChatHistory;

