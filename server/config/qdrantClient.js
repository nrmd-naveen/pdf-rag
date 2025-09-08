import { QdrantClient } from "@qdrant/js-client-rest";
import dotenv from 'dotenv';
dotenv.config();

// Create the Qdrant client instance
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Helper function to create payload indexes
export async function createPayloadIndexes() {
  try {
    await qdrant.createPayloadIndex('pdf-embeddings', {
      field_name: 'userId',
      field_schema: 'keyword', // Adjust as needed
    });

    await qdrant.createPayloadIndex('pdf-embeddings', {
      field_name: 'docId',
      field_schema: 'keyword', // Adjust as needed
    });

    console.log('Payload indexes created successfully!');
  } catch (error) {
    console.error('Error creating payload indexes:', error);
  }
}

export default qdrant;