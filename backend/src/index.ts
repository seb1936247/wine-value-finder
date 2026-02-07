import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import uploadRouter from './routes/upload.js';
import winesRouter from './routes/wines.js';
import lookupRouter from './routes/lookup.js';

validateConfig();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed) || origin.match(/\.vercel\.app$/))) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now; tighten in production
    }
  },
}));
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/wines', winesRouter);
app.use('/api/lookup', lookupRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Wine Value Finder backend running on port ${config.port}`);
});
