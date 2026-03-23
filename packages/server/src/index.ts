import express from 'express';
import cors from 'cors';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import harnessRoutes from './routes/harness.js';
import partsRoutes from './routes/parts.js';
import cablesRoutes from './routes/cables.js';
import exportRoutes from './routes/export.js';
import { closeDb } from './db/schema.js';
import { seedDatabase } from './db/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists before DB init
mkdirSync(resolve(__dirname, '../../..', 'data'), { recursive: true });

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/harnesses', harnessRoutes);
app.use('/api/parts', partsRoutes);
app.use('/api/cables', cablesRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Seed parts library on first run
seedDatabase();

const server = app.listen(PORT, () => {
  console.log(`Route Core API running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close();
  closeDb();
});

process.on('SIGINT', () => {
  server.close();
  closeDb();
});
