# Tydora Website

Tydora 官方网站的静态资源。

## 目录结构

```
website/
├── index.html              # 主页面
├── styles.css              # 样式表
├── script.js               # 交互脚本（含中英双语）
├── assets/
│   ├── fonts/              # 自托管 Lexend + Source Code Pro
│   ├── images/             # 应用图标
│   └── images/placeholder/ # 截图占位（待替换）
├── .nojekyll               # 禁用 GitHub Pages 的 Jekyll 处理
├── robots.txt              # 搜索引擎配置
└── README.md               # 本文件
```

## 本地预览

```bash
# 方式 1：直接用浏览器打开
open index.html

# 方式 2：启动本地 HTTP 服务器（推荐，避免 file:// 限制）
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署到 GitHub Pages

### 推荐方式：使用 gh-pages 分支

```bash
# 在 website/ 目录下
git init
git checkout -b gh-pages
git add .
git commit -m "Deploy website"
git push origin gh-pages
```

然后在 GitHub 仓库 Settings → Pages 选择 `gh-pages` 分支作为来源。

### 自动化部署（推荐）

后续可创建 `.github/workflows/pages.yml` 实现 push 到 main 时自动部署。

## 修改文案

- 中英文文案集中在 `script.js` 顶部的 `i18n` 对象中
- HTML 中所有可翻译文本都带有 `data-i18n="key"` 标识
- 默认语言为中文（可在脚本中调整）

## 替换占位截图

`assets/images/placeholder/` 中预留了截图占位。提供真实截图后：

1. 将截图放入该目录
2. 编辑 `index.html` 中 `#preview` section
3. 将 `<div class="preview-placeholder">` 替换为 `<img src="./assets/images/your-screenshot.png" />`

## 字体说明

- **Lexend**（英文字体）：自托管（约 200KB）
- **Noto Sans SC**（中文字体）：从 Google Fonts CDN 加载
- **Source Code Pro**（等宽字体）：从 Google Fonts CDN 加载

如需完全自托管，将 Google Fonts 链接替换为本地字体文件并在 CSS 中声明 `@font-face`。
