# Tydora

> 指尖上的礼物 —— 一个现代的桌面 Markdown 编辑器

[![GitHub Stars](https://img.shields.io/github/stars/zuorn/Tydora?style=flat-square)](https://github.com/zuorn/Tydora)
[![Release](https://img.shields.io/github/v/release/zuorn/Tydora?style=flat-square)](https://github.com/zuorn/Tydora/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev/)

## 截图

<!-- 请替换为实际截图 -->
<table>
  <tr>
    <td><img src="docs/screenshot-main.png" alt="主界面" width="800"/></td>
  </tr>
  <tr>
    <td><img src="docs/screenshot-graph.png" alt="知识图谱" width="800"/></td>
  </tr>
</table>

## 核心特性

- **双模式编辑** —— WYSIWYG 即时渲染模式（TipTap）与源码模式（CodeMirror 6）无缝切换
- **WikiLink 双向链接** —— Obsidian 风格的 `[[双向链接]]`，支持反向链接面板和自动补全
- **知识图谱** —— 基于 D3.js 的力导向图，可视化文档间的链接关系
- **思维导图** —— 从 Markdown 标题层级自动生成交互式思维导图
- **白板画布** —— 支持文本、笔记、媒体、URL 等多种节点类型的无限画布
- **丰富主题** —— 8 种内置主题 + 自定义 CSS 主题导入 + 11 种代码高亮配色
- **一键发布** —— 将 Vault 发布为静态网站，内置预览服务器
- **多窗口架构** —— 设置、图谱、思维导图、画布等独立窗口，支持多显示器

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6 |
| 编辑器 | TipTap 3.x (WYSIWYG) + CodeMirror 6 (源码) |
| 后端 | Rust (Tauri v2) |
| 可视化 | D3.js (图谱) + markmap (思维导图) + React Flow (画布) |
| 插件 | tauri-plugin-fs / dialog / window-state / updater / process |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.75
- Tauri v2 系统依赖（参考 [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/zuorn/Tydora.git
cd Tydora

# 安装依赖
npm install

# 启动开发模式
npm run tauri
```

### 构建

```bash
# 构建生产版本
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 项目结构

```
Tydora/
├── src/                        # 前端源码
│   ├── App.tsx                 # 主组件，状态管理
│   ├── Editor/                 # 编辑器模块
│   │   ├── TipTapEditor.tsx    # WYSIWYG 编辑器
│   │   └── SourceEditor.tsx    # 源码编辑器
│   ├── wikilink/               # WikiLink 双向链接系统
│   ├── graph/                  # 知识图谱
│   ├── mindmap/                # 思维导图
│   ├── Canvas/                 # 白板画布
│   ├── components/             # 共享 UI 组件
│   ├── publish/                # 发布系统
│   └── themes/                 # 主题系统
├── src-tauri/                  # Rust 后端
│   └── src/
│       ├── lib.rs              # Tauri 命令与插件
│       └── commands/           # 模块化命令
├── docs/                       # 项目文档
└── website/                    # MkDocs 文档站点
```

## 相关文档

- [技术架构文档](docs/technical-architecture.md)
- [产品设计文档](docs/product-design.md)

## 贡献

欢迎提交 Issue 和 Pull Request！请先阅读项目文档了解架构设计。

## 许可证

本项目使用 [Apache License 2.0](LICENSE) 许可证。
