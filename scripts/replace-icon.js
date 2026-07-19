import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, '../src/assets/icon.png');
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

console.log('Done!');