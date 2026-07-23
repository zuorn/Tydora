---
name: commit-code
description: |
  自动暂存、提交并推送代码变更。当用户说"提交代码"、"commit code"、"push code"、
  "git push"、"提交"、"推送代码"等任何与提交推送相关的表述时使用。
  分析 git diff 自动生成语义化 commit message（conventional commits 格式），
  暂存所有变更，提交并推送到当前远程分支。每步都展示完整命令输出。
---

# 提交代码

自动分析变更、生成提交信息、暂存、提交并推送。

## 工作流程

按顺序执行每个步骤。每步执行前输出步骤标题，执行命令后将完整输出展示给用户。

### 第 1 步：检查变更

运行 `git status` 和 `git diff --stat`，展示变更文件列表。

如果没有变更，告知用户并停止。

### 第 2 步：查看差异

运行 `git diff`（未暂存）和 `git diff --cached`（已暂存）。

展示 diff 输出，让用户看到具体改动内容。

### 第 3 步：生成提交信息

分析变更内容，使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式生成提交信息：

```
<type>(<scope>): <description>
```

类型规则：
- `feat:` — 新功能
- `fix:` — Bug 修复
- `refactor:` — 重构（不改变行为）
- `docs:` — 仅文档变更
- `style:` — 格式调整、缺少分号等
- `chore:` — 构建流程、工具、依赖

scope 可选。根据项目上下文选择有意义的 scope（如 `editor`、`sidebar`、`tauri`）。

描述控制在 72 字符以内，使用祈使语气，不加句号。

### 第 4 步：暂存

运行 `git add -A` 暂存所有变更。

运行 `git status` 确认暂存结果。

### 第 5 步：提交

运行 `git commit -m "<message>"` 提交。

展示提交输出。

### 第 6 步：推送

运行 `git push` 推送到当前远程分支。

如果推送失败（如需要先 pull），报告错误并建议用户手动处理。

### 第 7 步：摘要

输出最终结果：
- Commit hash（短）
- 提交信息
- 推送状态（成功或失败）
- 变更文件数量

## 安全规则

- 绝不使用 `git push --force`
- 绝不修改 git 配置
- 如果没有变更，正常跳过
- 如果推送失败，不要重试 — 报告并停止
