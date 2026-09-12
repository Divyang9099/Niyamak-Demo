import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../public/logo.png');
const out = join(__dirname, '../public/icons');

mkdirSync(out, { recursive: true });

const BG_DARK  = { r: 18,  g: 19,  b: 23,  alpha: 1 };   // obsidian #121317
const BG_CLEAR = { r: 0,   g: 0,   b: 0,   alpha: 0 };
const PURPLE   = { r: 139, g: 92,  b: 246, alpha: 1 };    // #8b5cf6

async function resize(size, outPath, bg = BG_DARK, padding = 0) {
  const inner = size - padding * 2;
  let pipeline = sharp(src)
    .resize(inner, inner, { fit: 'contain', background: BG_CLEAR });
  if (padding > 0) {
    pipeline = pipeline.extend({
      top: padding, bottom: padding, left: padding, right: padding,
      background: bg,
    });
  } else if (bg !== BG_CLEAR) {
    pipeline = sharp(src)
      .resize(size, size, { fit: 'contain', background: bg });
  }
  await pipeline.png().toFile(outPath);
  console.log('  ✓', outPath.replace(join(__dirname, '..'), ''));
}

console.log('Generating PWA icons from logo.png...');

// Standard icons (transparent bg so they layer correctly on any OS tint)
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const s of sizes) {
  await resize(s, join(out, `pwa-${s}x${s}.png`), BG_CLEAR);
}

// Maskable — safe-zone is inner 80% (10% padding each side), purple bg
for (const s of [192, 512]) {
  const pad = Math.round(s * 0.1);
  await resize(s, join(out, `maskable-${s}x${s}.png`), PURPLE, pad);
}

// Apple touch icon (180x180 white bg, no alpha)
{
  const s = 180;
  const pad = Math.round(s * 0.12);
  await resize(s, join(join(__dirname, '../public'), 'apple-touch-icon.png'),
    { r: 255, g: 255, b: 255, alpha: 1 }, pad);
}

// Shortcut icon (96x96)
await sharp(join(out, 'pwa-96x96.png')).toFile(join(out, 'shortcut-96x96.png'));

console.log('\nAll icons generated.');
