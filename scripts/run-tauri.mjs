import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..');
const ENV_FILE = resolve(PROJECT_DIR, '.env');
const KEY_FILE = resolve(PROJECT_DIR, 'src-tauri', 'tydora.key');

// 1. 从 .env 加载环境变量
if (existsSync(ENV_FILE)) {
  const content = readFileSync(ENV_FILE, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && val && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// 2. 设置私钥文件路径
if (existsSync(KEY_FILE)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY_PATH = KEY_FILE;
}

// 3. 运行 tauri CLI，透传参数
const args = process.argv.slice(2);
const tauri = spawn('npx', ['tauri', ...args], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

tauri.on('close', (code) => {
  exit(code ?? 1);
});
