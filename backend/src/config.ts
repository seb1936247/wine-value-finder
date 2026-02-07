import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Search for .env file walking up directory tree from multiple starting points
const searchDirs = [
  __dirname,                          // backend/src/
  path.resolve(__dirname, '..'),      // backend/
  path.resolve(__dirname, '../..'),   // wine-value-finder/
  process.cwd(),                      // wherever npm runs from
  path.resolve(process.cwd(), '..'),  // parent of cwd
];

let loaded = false;
for (const dir of searchDirs) {
  const envPath = path.resolve(dir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    loaded = true;
    break;
  }
}

if (!loaded) {
  // Not an error in production — Railway/Vercel set env vars directly
  console.log('No .env file found, using environment variables.');
}

// Use /tmp for uploads in production (Railway ephemeral filesystem)
const uploadsDir = process.env.RAILWAY_ENVIRONMENT
  ? '/tmp/uploads'
  : path.resolve(__dirname, '../uploads');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  wineSearcherApiKey: process.env.WINE_SEARCHER_API_KEY || '',
  uploadsDir,
  maxFileSizeMB: 20,
};

export function validateConfig() {
  if (!config.anthropicApiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY is required. Copy .env.example to .env and add your key.');
    process.exit(1);
  }
}
