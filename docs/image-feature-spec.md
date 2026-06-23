# Tydora 图像功能 — 产品交互文档

## 一、功能概述

为 Tydora 编辑器添加完整的图像支持能力，包括：粘贴图片、拖拽图片、通过文件选择器插入图片、图片存储管理、以及图床上传功能。参考 Typora 的图像交互模式，采用本地存储为主、图床为辅的策略。

---

## 二、图像插入方式

### 2.1 粘贴图片（Ctrl+V / 右键粘贴）

**交互流程：**
1. 用户从剪切板粘贴图片（截图、复制的图片文件等）
2. 系统自动检测粘贴内容为图片
3. 根据当前配置决定存储策略（见第三章）
4. 图片保存后，在光标位置插入 Markdown 图片语法
5. 显示短暂的上传/保存进度提示

**Markdown 插入格式：**
```markdown
![图片描述](./assets/image-20260623-143021.png)
```

### 2.2 拖拽图片

**交互流程：**
1. 用户从文件管理器/浏览器拖拽图片文件到编辑器区域
2. 编辑器显示虚线边框的拖拽放置区域提示
3. 释放鼠标后，根据配置存储图片
4. 在光标位置（或文档末尾）插入图片引用

**细节：**
- 拖拽多个图片时，依次保存并逐个插入
- 拖拽过程中如果编辑器为空或无光标，默认插入到文档末尾

### 2.3 工具栏/右键菜单插入

**交互流程：**
1. 用户通过右键菜单「插入 → 图像」或命令面板「插入图像」触发
2. 弹出系统文件选择对话框（支持多选）
3. 选择图片文件后，根据配置存储
4. 选中的图片逐个插入编辑器

**支持格式：** jpg, jpeg, png, gif, webp, bmp, svg, avif, ico

### 2.4 粘贴图片 URL

**交互流程：**
1. 用户粘贴一个图片 URL（以 `http://` 或 `https://` 开头，且扩展名为图片格式）
2. 系统询问：「检测到图片链接，是否插入为图片？」
3. 用户确认后，直接插入 Markdown 图片语法（不下载到本地）
4. 可选：如果配置了 linkToImgUrl，可选择重新上传该图片

---

## 三、图片存储策略

### 3.1 存储模式配置

在设置面板中新增「图像」设置页，提供以下存储模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Vault 内 assets 目录** | 图片保存到当前 Vault 的 `./assets/` 子目录 | 个人笔记、Git 管理 |
| **固定本地目录** | 图片保存到用户指定的固定目录 | 多项目共用图片 |
| **图床上传** | 图片上传到远程图床，Markdown 中使用 URL | 博客发布、分享 |

默认模式：**Vault 内 assets 目录**

### 3.2 Vault 内 assets 目录（默认）

**存储路径规则：**
```
{vault_path}/assets/{filename}.{ext}
```

**文件命名规则（Typora 风格）：**
```
{原始文件名前缀}-{YYYYMMDD-HHmmss}.{扩展名}
```
例如：`image-20260623-143021.png`

如果原始文件名已存在同名文件，追加序号：`image-20260623-143021-2.png`

**Markdown 引用格式（相对路径）：**
```markdown
![图片描述](./assets/image-20260623-143021.png)
```

**目录自动创建：**
- 首次保存图片时，如果 `assets/` 目录不存在，自动创建
- 在文件树中显示 assets 目录（但默认折叠）

**优势：**
- 图片与笔记在同一仓库，便于 Git 管理
- 移动/重命名 Vault 后图片引用不失效
- 支持 Obsidian/Logseq 等工具兼容

### 3.3 固定本地目录

**配置项：**
- 本地存储路径：用户通过目录选择器指定
- 文件命名：同 Vault 模式，但使用绝对路径

**Markdown 引用格式：**
```markdown
![图片描述](C:\Users\xxx\Documents\images\image-20260623-143021.png)
```

**注意事项：**
- 绝对路径在跨设备时会失效
- 适合个人单设备使用场景

### 3.4 未打开 Vault 时的处理

当用户未打开任何 Vault（直接打开单个 .md 文件）时：
1. 优先使用「固定本地目录」配置的路径
2. 如果未配置固定目录，弹窗询问：「请选择图片存储位置」
3. 用户选择后记住该路径（关联到当前文件）

---

## 四、图床功能

### 4.1 内置图床支持

**SM.MS（免费，无需注册即可使用）：**
- API 地址：`https://sm.ms/api/v2/upload`
- 单张图片限制：5MB
- 支持格式：JPG, PNG, GIF, BMP, WEBP
- 无需 Token 即可使用（有频率限制）

**配置项：**
- API Token（可选，注册后获取，提升上传配额）
- 自定义 API 地址

### 4.2 自定义图床

支持用户配置自定义图床 API，需满足以下规范：

**请求方式：** POST（multipart/form-data）

**配置项：**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API 地址 | 上传接口 URL | `https://api.example.com/upload` |
| 请求头 | 自定义 HTTP 头 | `Authorization: Bearer xxx` |
| 文件字段名 | form-data 中的文件字段名 | `file` |
| 图片 URL 提取 | 从响应中提取图片 URL 的 JSON Path | `data.url` |
| 自定义参数 | 额外的 form-data 参数 | `type: "image"` |

**响应格式要求：**
```json
{
  "code": "200",
  "data": {
    "url": "https://example.com/image.png"
  },
  "success": true
}
```

### 4.3 图床设置面板

**设置页面结构（新增「图像」Tab）：**

```
图像
├── 存储模式
│   └── [下拉选择] Vault assets 目录 | 固定本地目录 | 图床上传
├── 本地存储设置（Vault assets 模式时显示）
│   ├── 文件命名格式
│   │   └── [下拉选择] 原始名称 | 时间戳 | 原始名称+时间戳
│   └── 自动创建 assets 目录
│       └── [开关]
├── 固定目录设置（固定本地目录模式时显示）
│   ├── 存储路径
│   │   └── [路径输入框] + [选择目录按钮]
│   └── 文件命名格式
│       └── [下拉选择]
├── 图床设置（图床上传模式时显示）
│   ├── 图床类型
│   │   └── [下拉选择] SM.MS | 自定义
│   ├── SM.MS Token（选 SM.MS 时显示）
│   │   └── [输入框]
│   └── 自定义图床配置（选自定义时显示）
│       ├── API 地址
│       │   └── [输入框]
│       ├── 请求头
│       │   └── [键值对编辑器]
│       ├── 文件字段名
│       │   └── [输入框] 默认: file
│       └── 图片 URL 提取路径
│           └── [输入框] 默认: data.url
├── 图片质量
│   ├── 上传前压缩
│   │   └── [开关]
│   └── 最大宽度（压缩时）
│       └── [滑块] 0-4096px
└── 粘贴行为
    ├── 粘贴图片 URL 时
    │   └── [下拉选择] 直接引用 | 下载到本地 | 询问
    └── 粘贴 HTML 中的图片时
        │   └── [下拉选择] 下载图片 | 忽略 | 询问
```

---

## 五、图片管理交互

### 5.1 图片预览

**编辑器内预览：**
- WYSIWYG/IR 模式：图片直接渲染显示
- SV 模式：图片在预览区渲染显示
- 图片加载失败时显示占位符 + 文件名

**悬停预览（类似 Typora）：**
- 鼠标悬停在图片 Markdown 语法上时，显示浮层预览
- 浮层显示图片实际尺寸（等比缩放以适配窗口）
- 浮层右上角显示操作按钮：「打开」「复制路径」「删除」

### 5.2 图片操作

**右键菜单（图片元素上）：**
- 打开图片（系统默认图片查看器）
- 复制图片
- 复制图片路径
- 在文件管理器中显示
- 修改图片描述（alt text）
- 修改图片尺寸（插入宽高参数）
- 删除图片

**图片尺寸控制：**
```markdown
<!-- 插入时默认不带尺寸，由 CSS 控制 -->
![描述](./assets/image.png)

<!-- 用户可手动添加尺寸（Typora 风格） -->
<img src="./assets/image.png" width="500" />
```

### 5.3 图片引用完整性

**文件移动/重命名时自动更新引用：**
- 当用户在文件树中重命名 `.md` 文件时，检查并更新其中的图片引用
- 当用户移动文件到其他目录时，更新图片的相对路径

**孤立图片清理（可选功能）：**
- 扫描 Vault 中未被任何 `.md` 文件引用的图片
- 提供清理建议

---

## 六、Vditor 配置对接

### 6.1 上传配置（IUpload）

当前 VditorEditor 初始化时需要添加 `upload` 配置：

```typescript
upload: {
  // 不使用 Vditor 内置的 HTTP 上传（由我们自定义 handler 处理）
  handler: async (files: File[]): Promise<string | null> => {
    // 1. 根据配置的存储模式处理文件
    // 2. 保存到本地或上传到图床
    // 3. 返回 Markdown 图片语法
    // 返回 null 表示使用默认行为
    return null;
  },
  // 接受的文件类型
  accept: "image/*",
  // 单文件最大 20MB
  max: 20 * 1024 * 1024,
  // 多文件上传
  multiple: true,
  // 文件名安全处理
  filename: (name: string) => {
    // 生成带时间戳的安全文件名
    return generateImageFilename(name);
  },
  // 文件校验
  validate: (files: File[]): string | boolean => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml"];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return `不支持的文件类型: ${file.name}`;
      }
    }
    return true;
  },
  // 上传成功回调
  success: (editor: HTMLPreElement, msg: string) => {
    // 显示成功提示
  },
  // 上传失败回调
  error: (msg: string) => {
    // 显示错误提示
  },
}
```

### 6.2 图片预览配置

```typescript
image: {
  isPreview: true,
  preview: (bom: Element) => {
    // 自定义图片预览行为
    // 可以弹出自定义预览浮层
  },
}
```

### 6.3 粘贴事件处理

需要在 VditorEditor 中增强粘贴事件处理：

```typescript
// 增强的粘贴 hook
const hookPaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        // 处理粘贴的图片
        handlePastedImage(file);
      }
      return;
    }
  }

  // 检查是否粘贴了图片 URL
  const text = e.clipboardData?.getData("text/plain");
  if (text && isImageUrl(text)) {
    // 询问用户是否插入为图片
    handleImageUrl(text);
    return;
  }

  // 默认粘贴行为
  setTimeout(() => {
    if (vditorRef.current) {
      onChangeRef.current(vditorRef.current.getValue());
    }
  }, 50);
};
```

---

## 七、实现文件变更清单

### 前端（src/）

| 文件 | 变更内容 |
|------|----------|
| `src/VditorEditor.tsx` | 添加 upload 配置、增强粘贴/拖拽处理、图片操作右键菜单 |
| `src/Settings.tsx` | 新增「图像」设置 Tab，包含存储模式、图床配置 |
| `src/Settings.css` | 图像设置面板样式 |
| `src/App.tsx` | 图像存储路径配置传递给编辑器 |
| `src/ImageManager.ts`（新建） | 图像存储管理模块：文件保存、路径生成、引用更新 |
| `src/ImageUploader.ts`（新建） | 图床上传模块：SM.MS 和自定义图床适配器 |
| `src/VditorEditor.css` | 图片拖拽放置区域样式、图片预览浮层样式 |

### 后端（src-tauri/）

| 文件 | 变更内容 |
|------|----------|
| `src-tauri/src/lib.rs` | 添加图像处理命令（可选，用于文件系统操作优化） |
| `src-tauri/Cargo.toml` | 如需添加图像处理依赖（可选） |

### Tauri 插件

当前已有的插件足够：
- `@tauri-apps/plugin-fs`：文件读写（writeBinaryFile / writeTextFile）
- `@tauri-apps/plugin-dialog`：文件/目录选择对话框

如需图像压缩功能，可能需要额外引入 Rust 侧的图像处理库（如 `image` crate），或在前端使用 Canvas API 压缩。

---

## 八、设置持久化

新增 localStorage 存储键：

```typescript
// 图像设置
const IMAGE_SETTINGS_KEY = "zmd-image-settings";

interface ImageSettings {
  // 存储模式: "vault-assets" | "fixed-directory" | "image-bed"
  storageMode: "vault-assets" | "fixed-directory" | "image-bed";
  
  // 本地存储配置
  local: {
    // 文件命名: "original" | "timestamp" | "both"
    filenameFormat: "original" | "timestamp" | "both";
    // 自动创建 assets 目录
    autoCreateAssetsDir: boolean;
  };
  
  // 固定目录配置
  fixedDirectory: {
    path: string;
  };
  
  // 图床配置
  imageBed: {
    // "smms" | "custom"
    type: "smms" | "custom";
    smmsToken: string;
    custom: {
      apiUrl: string;
      headers: Record<string, string>;
      fieldName: string;
      urlPath: string; // JSON path to extract URL
    };
  };
  
  // 图片压缩
  compression: {
    enabled: boolean;
    maxWidth: number; // 0 = 不限制
  };
  
  // 粘贴行为
  pasteBehavior: {
    imageUrl: "direct" | "download" | "ask"; // 粘贴图片URL时
    htmlImage: "download" | "ignore" | "ask"; // 粘贴HTML中的图片时
  };
}
```

---

## 九、交互流程图

### 9.1 粘贴图片流程

```
用户粘贴 (Ctrl+V)
    │
    ├─ 检测到剪切板有图片数据
    │   │
    │   ├─ 存储模式 = "vault-assets"
    │   │   ├─ 检查当前是否有打开的文件
    │   │   │   ├─ 有 → 保存到 {file_dir}/assets/
    │   │   │   └─ 无 → 弹窗询问存储位置
    │   │   └─ 插入: ![描述](./assets/xxx.png)
    │   │
    │   ├─ 存储模式 = "fixed-directory"
    │   │   ├─ 检查是否配置了固定目录
    │   │   │   ├─ 有 → 保存到固定目录
    │   │   │   └─ 无 → 弹出目录选择器
    │   │   └─ 插入: ![描述](absolute_path/xxx.png)
    │   │
    │   └─ 存储模式 = "image-bed"
    │       ├─ 上传到配置的图床
    │       ├─ 获取返回的 URL
    │       └─ 插入: ![描述](https://xxx.png)
    │
    ├─ 检测到剪切板有图片 URL
    │   │
    │   ├─ pasteBehavior.imageUrl = "direct"
    │   │   └─ 直接插入: ![描述](url)
    │   │
    │   ├─ pasteBehavior.imageUrl = "download"
    │   │   ├─ 下载图片到本地
    │   │   └─ 插入: ![描述](./assets/xxx.png)
    │   │
    │   └─ pasteBehavior.imageUrl = "ask"
    │       ├─ 弹窗询问用户
    │       └─ 根据选择执行
    │
    └─ 检测到剪切板有 HTML（含 img 标签）
        │
        ├─ pasteBehavior.htmlImage = "download"
        │   ├─ 提取 img src
        │   ├─ 下载图片
        │   └─ 插入: ![描述](./assets/xxx.png)
        │
        ├─ pasteBehavior.htmlImage = "ignore"
        │   └─ 忽略图片，只粘贴文本
        │
        └─ pasteBehavior.htmlImage = "ask"
            ├─ 弹窗询问用户
            └─ 根据选择执行
```

### 9.2 拖拽图片流程

```
用户拖拽文件到编辑器
    │
    ├─ 显示拖拽放置提示（虚线边框）
    │
    └─ 释放鼠标
        │
        ├─ 检查文件类型
        │   ├─ 图片文件 → 处理
        │   └─ 非图片文件 → 忽略
        │
        ├─ 逐个处理图片（同粘贴流程）
        │
        └─ 在光标位置插入图片引用
```

---

## 十、样式设计

### 10.1 拖拽放置区域

```css
.vditor-editor-container.drag-over {
  outline: 2px dashed var(--text-secondary);
  outline-offset: -4px;
  background: color-mix(in srgb, var(--primary) 5%, transparent);
}
```

### 10.2 图片预览浮层

```css
.image-preview-tooltip {
  position: fixed;
  z-index: 1000;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 400px;
  max-height: 300px;
}

.image-preview-tooltip img {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
  border-radius: 4px;
}
```

### 10.3 图片操作按钮

```css
.image-preview-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  justify-content: flex-end;
}

.image-preview-action-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}
```

---

## 十一、快捷键

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| 粘贴图片 | Ctrl+V | 自动检测并处理 |
| 插入图片 | 无（通过菜单/命令面板） | 打开文件选择器 |

可在设置面板中自定义「插入图像」的快捷键。

---

## 十二、错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 图片保存失败 | 显示 Toast 错误提示，编辑器内容不变更 |
| 图床上传失败 | 显示错误详情，提供重试按钮 |
| 图片文件过大 | 在校验阶段拦截，提示最大允许大小 |
| 不支持的格式 | 在校验阶段拦截，提示支持的格式列表 |
| assets 目录创建失败 | 回退到 Vault 根目录，或弹窗询问 |
| 网络断开（图床模式） | 提示网络异常，建议切换到本地存储 |

---

## 十三、后续迭代（Phase 2）

以下功能可在基础图像功能完成后迭代：

1. **图片压缩**：上传前自动压缩超大图片
2. **图片裁剪**：插入前裁剪图片
3. **批量图片管理**：扫描并清理孤立图片
4. **图片水印**：可选的自动水印功能
5. **多图床备份**：同时上传到多个图床
6. **图片搜索**：在 Vault 中搜索图片
7. **图片缩略图**：文件树中显示图片缩略图
8. **拖拽调整大小**：在编辑器中直接拖拽调整图片显示尺寸

---

## 十四、验证方案

### 14.1 功能测试

1. **粘贴测试**：截图后在编辑器中 Ctrl+V，验证图片保存和引用正确
2. **拖拽测试**：从文件管理器拖拽图片到编辑器，验证保存和引用
3. **菜单插入测试**：右键菜单 → 插入 → 图像，验证文件选择和保存
4. **URL 粘贴测试**：复制图片 URL 后粘贴，验证行为符合配置
5. **图床上传测试**：配置 SM.MS 后上传图片，验证 URL 正确
6. **多图片测试**：一次拖拽/粘贴多张图片，验证逐个保存

### 14.2 路径测试

1. **相对路径测试**：在 Vault 子目录的 .md 文件中插入图片，验证相对路径正确
2. **文件移动测试**：移动 .md 文件后，验证图片引用是否更新
3. **Vault 切换测试**：切换 Vault 后插入图片，验证保存到正确的 Vault

### 14.3 设置测试

1. **存储模式切换**：切换不同存储模式后插入图片，验证保存位置正确
2. **设置持久化**：关闭重启应用后，验证设置保持不变
3. **图床配置测试**：配置自定义图床后上传，验证请求格式正确
