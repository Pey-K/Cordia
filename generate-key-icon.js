// Script to generate .ico file for .key file association
// Requires: npm install sharp to-ico

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
// Prefer cordia-key.svg, fall back to roo-key.svg
const svgPath = fs.existsSync(path.join(iconsDir, 'cordia-key.svg'))
  ? path.join(iconsDir, 'cordia-key.svg')
  : path.join(iconsDir, 'roo-key.svg');

async function generateKeyIcon() {
  try {
    const sharp = (await import('sharp')).default;
    const toIco = (await import('to-ico')).default;
    
    console.log('Generating .key file icon (cordia-key.ico)...');
    
    if (!fs.existsSync(svgPath)) {
      console.error(`SVG file not found: ${svgPath}`);
      console.log('Please create cordia-key.svg or roo-key.svg in src-tauri/icons.');
      return;
    }
    
    const svgBuffer = fs.readFileSync(svgPath);
    const sizes = [16, 32, 48, 256];
    const pngBuffers = [];
    
    for (const size of sizes) {
      const buffer = await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toBuffer();
      pngBuffers.push(buffer);
      console.log(`Generated ${size}x${size} PNG`);
    }
    
    const icoBuffer = await toIco(pngBuffers);
    const icoPath = path.join(iconsDir, 'cordia-key.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Generated cordia-key.ico');
    console.log('Icon generation complete!');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('Missing dependencies. Install with:');
      console.error('  npm install --save-dev sharp to-ico');
    } else {
      console.error('Error generating icon:', error);
    }
  }
}

generateKeyIcon();
