import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '../public/icon.png');
const iconsDir = path.join(__dirname, '../src-tauri/icons');

console.log(`Using source image: ${sourcePath}`);

try {
  execSync(`npx tauri icon "${sourcePath}" --output "${iconsDir}"`, {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('Icons generated successfully!');
} catch (error) {
  console.error('Failed to generate icons:', error.message);
  process.exit(1);
}

try {
  const icoPath = path.join(iconsDir, 'icon.ico');
  const srcIcoPath = path.join(__dirname, '../src/icons/icon.ico');
  fs.copyFileSync(icoPath, srcIcoPath);
  console.log(`Copied icon.ico to ${srcIcoPath}`);
} catch (error) {
  console.error('Failed to copy icon.ico:', error.message);
}

console.log('Done!');