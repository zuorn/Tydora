import { cp, mkdir, access, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "node_modules/vditor/dist");
const dest = resolve(root, "public/vditor/dist");

async function main() {
  try {
    await access(src);
  } catch {
    console.error("❌ vditor dist not found. Run: npm install");
    process.exit(1);
  }

  // Ensure public directory exists
  await mkdir(resolve(root, "public"), { recursive: true });

  console.log("📦 Copying Vditor assets...");
  await cp(src, dest, { recursive: true, force: true });

  // Vditor 源码中引用 highlight.js (无 .min 后缀), 但 dist 中只有 highlight.min.js
  // 创建别名以兼容 Vditor 的加载逻辑
  const hljsDir = resolve(dest, "js/highlight.js");
  await copyFile(
    resolve(hljsDir, "highlight.min.js"),
    resolve(hljsDir, "highlight.js"),
  );
  console.log("   ✅ highlight.js alias created");

  console.log("   ✅ index.min.js");
  console.log("   ✅ index.css");
  console.log("   ✅ js/lute/lute.min.js");
  console.log("   ✅ js/icons/");
  console.log("   ✅ js/i18n/");
  console.log("   ✅ js/echarts/");
  console.log("   ✅ js/flowchart.js/");
  console.log("   ✅ js/mermaid/");
  console.log("   ✅ js/abcjs/");
  console.log("   ✅ css/content-theme/");
  console.log("   ✅ images/");

  // Copy theme fonts
  const fontSrc = resolve(root, "themes/mint");
  const fontDest = resolve(root, "public/themes/mint");
  try {
    await mkdir(fontDest, { recursive: true });
    await cp(fontSrc, fontDest, { recursive: true, force: true });
    console.log("   ✅ themes/mint/ (fonts)");
  } catch (e) {
    console.log("   ⚠ themes/mint/ not found, skipping fonts");
  }

  console.log("Done! Vditor assets copied to public/vditor/");
}

main().catch((err) => {
  console.error("Copy failed:", err);
  process.exit(1);
});
