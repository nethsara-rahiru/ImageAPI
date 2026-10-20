// Test-only isolated server; normal npm start never imports this module.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
const dataDir = mkdtempSync(path.join(tmpdir(), 'imageapi-browser-'));
const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#b9e2f2' } })
  .png()
  .toBuffer();
const runtime = createApp({
  config: { dataDir, port: 8765, publicOrigin: 'http://127.0.0.1:8765' },
  generateImage: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { encoded: png.toString('base64'), width: 256, height: 256 };
  },
});
const server = runtime.app.listen(8765, '127.0.0.1');
process.on('SIGTERM', () =>
  server.close(async () => {
    await runtime.close();
    rmSync(dataDir, { recursive: true, force: true });
  }),
);
