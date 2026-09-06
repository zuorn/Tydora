import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 防止 Vite 遮盖 Rust 的错误信息
  clearScreen: false,

  // 默认会扫描仓库内所有 HTML（含 website/site 文档产物），
  // 嵌套页里相对路径的 main-*.js 会触发 “could not be resolved”。
  // 仅以应用入口做依赖预构建扫描。
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{js,jsx,ts,tsx}"],
  },

  build: {
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
      // 监听 src-tauri 目录变化会触发不必要的重建
      ignored: [
        "**/src-tauri/**",
        // website 目录仅用于文档与 README 图片，
        // Windows 下被外部程序锁定的图片（EBUSY）会导致 fs.watch 崩溃
        "**/website/**",
      ],
    },
  },
});
