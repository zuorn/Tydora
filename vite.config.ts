import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// 2026-09-09 重构后：前端源码搬到 app/tydora-web/。
// 根 vite.config.ts 仅做配置"指针"，所有前端源与构建配置都集中在 app/tydora-web/。
// Vite 的 root 必须是绝对路径或相对 **当前工作目录** 的路径。
// 因为 npm scripts（package.json）会在仓库根执行 vite，所以相对根的路径即可。
const frontendRoot = resolve(__dirname, "app/tydora-web");

// https://vitejs.dev/config/
export default defineConfig({
  root: frontendRoot,
  publicDir: resolve(frontendRoot, "public"),

  plugins: [react()],

  // 防止 Vite 遮盖 Rust 的错误信息
  clearScreen: false,

  build: {
    // 与 tauri.conf.json 的 frontendDist 对齐：仓库根 .build/web-dist。
    // 相对 root（app/tydora-web），所以是 ../../.build/web-dist。
    outDir: resolve(__dirname, ".build", "web-dist"),
    emptyOutDir: true,

    rollupOptions: {
      output: {
        // 将重型 vendor 库拆入独立 chunk，减小 App chunk 体积；
        // 浏览器可并行下载多个 chunk，且未被首屏需要的 chunk 可延后加载。
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "tiptap-vendor";
            if (id.includes("lowlight") || id.includes("highlight.js")) return "lowlight-vendor";
            if (id.includes("@codemirror") || id.includes("@lezer")) return "codemirror-vendor";
            if (id.includes("@tauri-apps")) return "tauri-vendor";
            if (id.includes("katex")) return "katex-vendor";
            if (id.includes("mermaid")) return "mermaid-vendor";
          }
        },
      },
    },
  },

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 监听 Tauri 桌面端目录变化会触发不必要的重建（src-tauri 已搬入 app/tydora-desktop/）
      ignored: [
        "**/app/tydora-desktop/**",
        // website 目录仅用于文档与 README 图片，
        // Windows 下被外部程序锁定的图片（EBUSY）会导致 fs.watch 崩溃
        "**/website/**",
      ],
    },
  },
});
