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

    // 不按包名做 manualChunks：
    // 之前按包名把整个包塞进一个 chunk，入口静态依赖图只要碰到包内任一模块，
    // 整包就进入首屏，穿透了 lazy() 边界；且 tiptap→katex/codemirror/lowlight
    // 被串成一条必加载链。交回 Rollup 按真实模块依赖切分，动态 import 边界
    // 才会真正生效。构建后用 `npm run analyze:bundle` 校验首屏体积。
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
