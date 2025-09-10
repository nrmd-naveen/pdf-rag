import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import { createPayloadIndexes } from './config/qdrantClient.js';
import connectMongoDB from './config/mongoClient.js';
import googleRouter from './routes/googleAuthRoutes.js';

// Load environment variables
dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/auth', googleRouter)
const PORT = process.env.PORT || 5001;

// Connect to MongoDB
connectMongoDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server due to MongoDB connection error:', error.message);
    process.exit(1); // Exit the process if MongoDB connection fails
  });

// Load Qdrant client and create payload indexes
createPayloadIndexes().then(() => {
  console.log('Qdrant client is ready');
});