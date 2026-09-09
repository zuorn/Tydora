# Tydora 发布流程

本文档详细描述了 Tydora 的版本管理、Conventional Commits 规范、以及从提交代码到自动发布的完整自动化流水线。

---

## 目录

- [整体架构](#整体架构)
- [版本管理](#版本管理)
  - [VERSION 文件 —— 单一版本源](#version-文件--单一版本源)
  - [sync-version.mjs —— 版本同步脚本](#sync-versionmjs--版本同步脚本)
- [Conventional Commits —— 提交规范](#conventional-commits--提交规范)
  - [提交格式](#提交格式)
  - [可用类型](#可用类型)
  - [工具支持](#工具支持)
- [版本决策规则](#版本决策规则)
  - [三步决策流程](#三步决策流程)
  - [版本 bump 速查表](#版本-bump-速查表)
  - [常见场景](#常见场景)
  - [预发布版本的特殊行为](#预发布版本的特殊行为)
  - [常见误区](#常见误区)
- [发布流水线](#发布流水线)
  - [Pipeline 一：Release Please（版本决策）](#pipeline-一release-please版本决策)
  - [Pipeline 二：Build & Release（构建发布）](#pipeline-二build--release构建发布)
- [配置文件速查](#配置文件速查)
- [日常开发工作流](#日常开发工作流)
- [操作指南](#操作指南)
  - [日常提交代码](#日常提交代码)
  - [检查提交是否合规](#检查提交是否合规)
  - [发布新版本](#发布新版本)
  - [手动触发构建](#手动触发构建)
  - [本地版本同步](#本地版本同步)
  - [本地生成 Changelog](#本地生成-changelog)

---

## 整体架构

Tydora 的发布系统由两条 GitHub Actions 工作流 + 本地工具链共同组成：

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  开发者提交    │────▶│  Release Please   │────▶│  Build & Release   │
│ conventional  │     │  版本决策 & Tag    │     │  构建 & 发布资产     │
│   commits     │     │                  │     │                   │
└──────────────┘     └──────────────────┘     └───────────────────┘
     push main             merge PR               tag push (v*)
```

| 阶段 | 触发条件 | 做什么 | 产出 |
|------|---------|--------|------|
| **开发** | 本地 `npm run commit` | 生成规范的 commit | 带 Conventional Commits 的提交 |
| **Release Please** | push 到 `main` 分支 | 维护 Release PR，自动 bump 版本号 | Release PR → 合并后打 tag |
| **Build & Release** | push `v*` tag | 生成 Release Notes，跨平台构建，创建 GitHub Release | 安装包 + Release Notes |

---

## 版本管理

### VERSION 文件 —— 单一版本源

`VERSION` 文件是项目的**唯一版本源**（Single Source of Truth），包含纯文本版本号：

```
0.1.3
```

当需要进行本地版本更新时，修改此文件后运行同步脚本。

### sync-version.mjs —— 版本同步脚本

`scripts/sync-version.mjs` 负责将 `VERSION` 中的版本号同步到以下目标文件：

| 目标文件 | 路径 | 用途 |
|---------|------|------|
| `package.json` | 项目根目录 | npm 包版本 |
| `Cargo.toml` | `app/`（`[workspace.package]`） | workspace 根版本；`tydora-core` / `tydora-cli` / `tydora-desktop` 通过 `version.workspace = true` 继承 |
| `tauri.conf.json` | `app/tydora-desktop/` | Tauri 应用版本 |
| `index.html` | `website/landing/` | 落地页版本显示 |
| `02-关于.md` / `02-About.md` | `website/docs_zh/…` / `website/docs_en/…` | 文档站点版本表格 |

**用法：**

```bash
npm run sync-version
```

> **注意**：在 CI 流水线中，release-please 通过 `extra-files` 机制直接更新这些文件，无需手动运行此脚本。此脚本主要用于本地版本同步。

---

## Conventional Commits —— 提交规范

### 提交格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**示例：**

```
feat(editor): add split view support

- Left/right pane resizable via drag
- Saves split ratio to window state

Closes #42
```

### 可用类型

| 类型 | 图标 | 说明 | 影响版本 |
|------|------|------|---------|
| `feat` | 🚀 | 新功能 | MINOR |
| `fix` | 🐛 | Bug 修复 | PATCH |
| `perf` | ⚡ | 性能优化 | PATCH |
| `refactor` | ♻️ | 代码重构 | PATCH |
| `docs` | 📝 | 文档更新 | — |
| `style` | 💄 | 代码格式（不影响逻辑） | — |
| `test` | ✅ | 测试相关 | — |
| `ci` | 🔧 | CI/CD 配置 | — |
| `build` | 🔧 | 构建系统 | — |
| `chore` | 🏗️ | 杂项（依赖更新等） | — |

**关键规则：**

- `feat:` → 触发 **MINOR** 版本（0.1.x → 0.2.0）
- `fix:` → 触发 **PATCH** 版本（0.1.3 → 0.1.4）
- 其他类型 → 不触发版本变更
- 在 body 或 footer 中包含 `BREAKING CHANGE:` 或 `!:` → 触发 **MAJOR** 版本

### 工具支持

项目已集成以下工具来帮助遵循 Conventional Commits 规范：

| 工具 | 命令 | 用途 |
|------|------|------|
| **commitizen** | `npm run commit` | 交互式创建规范化提交 |
| **commitlint** | `npm run lint:commit` | 检查最近一次提交是否合规 |
| **git-cliff** | `npm run changelog` | 本地生成 CHANGELOG.md |

---

## 版本决策规则

Release Please 根据 Conventional Commits 和 Semantic Versioning (SemVer) 规则自动决定下一个版本号。理解其决策逻辑对于预测和控制版本演进至关重要。

---

### 三步决策流程

版本号的决策遵循一个严格的三步流程：

```
第一步：找到基线版本
       │
       │  按优先级查找：
       │  1. git tags 匹配 v* 模式（上一次正式发布）
       │  2. .release-please-manifest.json 中的版本
       │  3. package.json 中的 version 字段
       │
       ▼
第二步：扫描提交历史
       │
       │  从基线点扫描全部提交（不是只看最新的 push）
       │  逐个匹配 Conventional Commits 类型
       │
       ▼
第三步：决定版本 bump
       │
       │  根据扫描结果套用 SemVer 规则
       │
       ▼
    输出新版本号 → 更新所有版本文件 → 创建 Release PR
```

#### 1. 找到基线版本

Release Please 通过以下优先级确定「上次发版点」：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| **1** | git tags (`v*`) | 仓库中匹配 `v*` 模式的最新 tag，代表上一次正式发布 |
| **2** | `.release-please-manifest.json` | 如果没找到 tag，回退读取 manifest 文件中的版本号 |
| **3** | `package.json` | 最后的兜底方案，读取 `version` 字段 |

基线确定后，起始扫描点可能是：

- **有历史 tag**：从上一个 `v*` tag 的 commit 之后开始扫描
- **无历史 tag（首次使用）**：从仓库的第一个 commit 开始，扫描全部提交历史

#### 2. 扫描提交历史

从基线点到 HEAD，逐一检查每条 commit message，匹配 Conventional Commits 格式：

```
git log (基线点..HEAD)
    │
    ├── feat: add markdown preview    → 标记为 feat
    ├── fix: correct export path      → 标记为 fix
    ├── chore: update dependencies    → 标记为 chore（不影响版本）
    ├── docs: update README           → 标记为 docs（不影响版本）
    ├── refactor: extract parser      → 标记为 refactor（不影响版本）
    └── fix!: change API signature    → 标记为 fix + BREAKING CHANGE
```

| commit 类型 | 是否影响版本号？ |
|------------|:---:|
| `feat:` | ✅ 是 |
| `fix:` | ✅ 是 |
| `fix!/feat!` 或含 `BREAKING CHANGE:` | ✅ 是 |
| `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `ci:`, `build:` | ❌ 否 |

#### 3. 套用 SemVer 规则

根据扫描到的最高优先级变更类型，决定 MAJOR / MINOR / PATCH bump：

```
扫描结果
    │
    ├── 包含 BREAKING CHANGE（! / fix! / feat! / footer）
    │       → MAJOR bump    0.1.3 → 1.0.0
    │
    ├── 包含 feat:（且无 BREAKING CHANGE）
    │       → MINOR bump    0.1.3 → 0.2.0
    │
    ├── 包含 fix:（无 feat, 无 BREAKING CHANGE）
    │       → PATCH bump    0.1.3 → 0.1.4
    │
    └── 无 feat 也无 fix
            → 不 bump        版本号不变
```

> **核心原则**：取影响级别最高的那条规则。如果既有 `feat:` 又有 `fix!`，结果为 MAJOR bump（BREAKING CHANGE 优先级最高）。

---

### 版本 bump 速查表

| 当前版本 | 只有 `fix:` | 有 `feat:` | 有 `BREAKING CHANGE` |
|----------|:----------:|:---------:|:-------------------:|
| 0.1.3 | → 0.1.4 | → 0.2.0 | → 1.0.0 |
| 0.2.0 | → 0.2.1 | → 0.3.0 | → 1.0.0 |
| 1.0.0 | → 1.0.1 | → 1.1.0 | → 2.0.0 |
| 1.5.2 | → 1.5.3 | → 1.6.0 | → 2.0.0 |

---

### 常见场景

**场景一：纯 Bug 修复**

```bash
git commit -m "fix: resolve crash on startup"
git commit -m "fix(ui): correct button alignment"
```

结果：`0.1.3` → `0.1.4`（PATCH bump）

**场景二：新增功能 + Bug 修复**

```bash
git commit -m "feat: add dark mode"
git commit -m "fix: update broken styles"
```

结果：`0.1.3` → `0.2.0`（MINOR bump，因为 feat 的优先级高于 fix）

**场景三：破坏性变更**

```bash
git commit -m "feat!: drop support for legacy API

BREAKING CHANGE: The legacy API endpoints are no longer available."
```

结果：`0.2.0` → `1.0.0`（MAJOR bump）

**场景四：只有非功能性变更**

```bash
git commit -m "chore: update deps"
git commit -m "docs: update README"
git commit -m "refactor: simplify logic"
```

结果：**版本号不变**，不会创建 Release PR

---

### 预发布版本的特殊行为

对于 `0.x.y` 版本（major 为 0），Release Please 的默认行为与 SemVer 规范一致：

- `feat:` → 触发 **MINOR** bump（0.1.3 → 0.2.0）
- `fix:` → 触发 **PATCH** bump（0.1.3 → 0.1.4）
- `BREAKING CHANGE` → 触发 **MAJOR** bump（0.1.3 → 1.0.0）

如果需要更保守的版本策略（如不希望在 1.0.0 之前频繁增加 minor 版本），可以在 `release-please-config.json` 中配置：

```json
"bump-minor-pre-major": false
```

配置后，在 `0.x` 阶段 `feat:` 也仅触发 PATCH bump。

---

### 常见误区

**误区 1："我只 push 了一次，版本号怎么跳了这么多？"**

Release Please 扫描的是**所有自上次 tag 以来的提交**，不是只看最新的一次 push。如果仓库之前没有 release-please 打过的 tag，首次运行时它会扫描整个 git 历史，将所有符合 Conventional Commits 的提交都纳入计算。

> 举例：仓库从第一个 commit 起就有 `feat:` 提交，并且从未有过 release-please tag。首次运行时，`0.1.3` 会直接 bump 到 `0.2.0`（因为历史中有 `feat:` 提交）。

**误区 2："我这次只修了 bug，为什么版本没变？"**

如果扫描范围内**没有** `feat:` 或 `fix:` 提交（只有 `chore:`, `docs:` 等），Release Please 不会创建 Release PR。只有在检测到可发版的变更时，才会创建或更新 PR。

**误区 3："feat 和 fix 各取最高还是累计算？"**

Release Please **只看类型、不计数**。1 个 `feat:` 和 100 个 `feat:` 结果一样，都是 MINOR bump。同理，1 个 `fix:` 和 100 个 `fix:` 都是 PATCH bump。一旦同时存在 `feat:` 和 `fix:`，结果是 MINOR（feat 优先级更高）。

---

## 发布流水线

### Pipeline 一：Release Please（版本决策）

**工作流文件：** `.github/workflows/release-please.yml`  
**触发条件：** push 到 `main` 分支  
**配置文件：** `release-please-config.json` + `.release-please-manifest.json`

**执行流程：**

```
push to main（含 feat:/fix: 提交）
        │
        ▼
release-please 分析自上次发版以来的提交
        │
        ├── 无可发版变更 → 结束
        │
        └── 有可发版变更 →
              ┌─────────────────────────────────────────────┐
              │  创建/更新 Release PR                        │
              │                                             │
              │  标题: "chore(main): release 0.2.0"         │
              │  内容:                                       │
              │    • VERSION         ← 更新为新版本号         │
              │    • package.json    ← version 字段更新       │
              │    • tauri.conf.json ← version 字段更新       │
              │    • Cargo.toml      ← version 字段更新       │
              │    • CHANGELOG.md    ← 新增版本段             │
              └────────────┬────────────────────────────────┘
                           │
              开发者审查 PR 内容无误后，合并 PR
                           │
                           ▼
              release-please 执行：
              1. 创建 git tag（如 v0.2.0）
              2. 推送 tag 到 origin
                           │
                           ▼
              触发 Pipeline 二 → Build & Release
```

**关键行为：**

- Release PR 持续存在，每次 push 到 main 时自动更新（不创建新 PR）
- 可以**随时合并**，也可以在开发过程中忽略它
- 合并前可以在 PR 中预览即将发布的变更内容
- 如果一段时间没有任何 `feat:` 或 `fix:` 提交，PR 不会出现

---

### Pipeline 二：Build & Release（构建发布）

**工作流文件：** `.github/workflows/release.yml`  
**触发条件：** push `v*` tag（或 `workflow_dispatch` 手动触发）  
**配置文件：** `cliff.toml`

**执行流程：**

```
push v0.2.0 tag（由 release-please 自动创建）
        │
        ▼
并行矩阵构建（4 个平台）
        │
        ├── 1. checkout（fetch-depth: 0，获取完整历史）
        ├── 2. Setup Node.js + Rust + 前端依赖
        ├── 3. git-cliff 生成 Release Notes
        │      └── 从上次 tag 到当前 tag 的提交
        │      └── 按 feat/fix/perf 等类型分组
        └── 4. tauri-action 构建并创建 GitHub Release
               ├── Windows: .msi/.exe (NSIS)
               ├── macOS:   .dmg (Intel + Apple Silicon)
               └── Linux:   .deb/.rpm/.AppImage
```

**Release Notes 生成规则：**

1. `git-cliff` 读取当前 tag 与上一个 tag 之间的提交历史
2. 根据 `cliff.toml` 中的 `commit_parsers` 按类型分组
3. 符合 Conventional Commits 的提交会加上类型图标和提交短 hash
4. 不符合规范的提交归入「📦 Other Changes」

**Release Notes 示例：**

```markdown
# Tydora v0.2.0

### 🚀 Features
- Add split view support (a1b2c3d)
- Add dark mode theme (e4f5g6h)

### 🐛 Bug Fixes
- Fix crash when opening large files (i7j8k9l)
- Fix table rendering in preview (m0n1o2p)

### 📝 Documentation
- Update install guide (q3r4s5t)
```

---

## 配置文件速查

| 文件 | 位置 | 用途 |
|------|------|------|
| `release-please-config.json` | 项目根目录 | Release Please 配置（版本策略、extra-files） |
| `.release-please-manifest.json` | 项目根目录 | 当前版本清单（release-please 维护） |
| `cliff.toml` | 项目根目录 | git-cliff 配置（提交分组规则、模板） |
| `commitlint.config.js` | 项目根目录 | commitlint 规范配置 |
| `.github/workflows/release-please.yml` | 版本决策流水线 | Release PR + 自动 Tag |
| `.github/workflows/release.yml` | 构建发布流水线 | 跨平台构建 + 创建 Release |
| `VERSION` | 项目根目录 | 单一版本源 |
| `scripts/sync-version.mjs` | 本地版本同步脚本 |

---

## 日常开发工作流

```
                  ┌──────────────────────────────────────┐
                  │           日常开发循环                  │
                  │                                      │
                  │  1. 编写代码                           │
                  │  2. npm run commit（规范提交）          │
                  │  3. git push                          │
                  │  4. 循环...                            │
                  └─────────────┬────────────────────────┘
                                │
                  每当 push 到 main 分支
                                │
                                ▼
                  ┌──────────────────────────────────────┐
                  │        Release Please 检查             │
                  │                                      │
                  │  有新 feat/fix?                       │
                  │    ├── 是 → 更新 Release PR           │
                  │    └── 否 → 不做任何操作                │
                  └─────────────┬────────────────────────┘
                                │
                                ▼
                  ┌──────────────────────────────────────┐
                  │         准备发版（需要时）               │
                  │                                      │
                  │  1. 检查 Release PR 中的内容            │
                  │  2. 确认版本号是否正确                   │
                  │  3. 点击 "Merge pull request"         │
                  │                                      │
                  │  之后一切自动化：                        │
                  │  → Tag 创建 → 构建开始 → Release 创建     │
                  └──────────────────────────────────────┘
```

---

## 操作指南

### 日常提交代码

**方式 1：交互式（推荐）**

```bash
npm run commit
```

按提示依次选择 type、填写 scope 和 subject，自动生成规范的 commit message。

**方式 2：手动编写**

确保 commit message 遵循 Conventional Commits 格式：

```bash
git commit -m "feat(editor): add real-time collaboration"
git commit -m "fix(export): resolve PDF page break issue"
```

### 检查提交是否合规

```bash
# 检查最近一次提交
npm run lint:commit

# 检查最近 N 次提交
npx commitlint --from HEAD~3
```

### 发布新版本

1. 确认所有需要发布的变更已合并到 `main` 分支
2. 在 GitHub 仓库中找到 Release Please 自动创建的 PR：
   - 标题类似于 `chore(main): release 0.2.0`
   - 检查 PR 中的版本号和变更列表是否正确
3. 点击 **Merge pull request** 按钮
4. Release Please 会在合并后自动：
   - 创建 `v0.2.0` tag
   - 推送 tag
5. Tag 推送触发 Build & Release 工作流
6. 等待构建完成，在仓库的 Releases 页面查看结果

### 手动触发构建

前往 **Actions → Release → Run workflow**，即可手动触发构建（需提前有对应 tag）。

### 本地版本同步

如果在本地手动修改了 `VERSION` 文件：

```bash
npm run sync-version
```

该脚本会读取 `VERSION` 的内容并同步到所有相关文件。

### 本地生成 Changelog

需先安装 `git-cliff`（`cargo install git-cliff` 或参考 [安装文档](https://github.com/orhun/git-cliff#installation)）：

```bash
npm run changelog
```

生成的 `CHANGELOG.md` 包含自项目开始以来的完整变更历史。
