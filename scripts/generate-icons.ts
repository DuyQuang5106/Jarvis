// One-off: renders the PWA icons (solid square + "AI" drawn as shapes, so no font is needed).
// Run: pnpm exec tsx scripts/generate-icons.ts
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BG = '#111827';
const FG = '#ffffff';

// "AI" laid out on a 100x100 grid inside the safe zone (maskable-friendly).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${BG}"/>
  <g fill="none" stroke="${FG}" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M24 70 L38 30 L52 70"/>
    <path d="M29 56 H47"/>
    <path d="M67 30 V70"/>
  </g>
</svg>`;

const outDir = path.join(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });

async function main() {
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, name));
    console.log('wrote', name);
  }
}

void main();
