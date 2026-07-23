---
name: commit-code
description: |
  Automatically stage, commit, and push code changes. Use when the user says
  "提交代码", "commit code", "push code", "git push", "提交", "推送代码",
  or any variation of committing and pushing changes. Analyzes git diff to
  generate a semantic commit message (conventional commits format), stages all
  changes, commits, and pushes to the current remote branch. Shows full
  command output at each step so the user can see the complete process.
---

# Commit Code

Automatically analyze changes, generate a commit message, stage, commit, and push.

## Workflow

Execute each step in order. Print a step header before running each command, and show the full command output to the user.

### Step 1: Check Changes

Run `git status` and `git diff --stat` to show what files have changed.

If there are no changes, tell the user and stop.

### Step 2: View Diff

Run `git diff` for unstaged changes and `git diff --cached` for staged changes.

Show the diff output so the user can see exactly what will be committed.

### Step 3: Generate Commit Message

Analyze the changes and generate a commit message using [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

Type rules:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `docs:` — documentation only
- `style:` — formatting, missing semicolons, etc.
- `chore:` — build process, tooling, dependencies

Scope is optional. Use the project context to pick a meaningful scope (e.g., `editor`, `sidebar`, `tauri`).

Keep the description under 72 characters, imperative mood, no period.

### Step 4: Stage

Run `git add -A` to stage all changes.

Run `git status` to confirm what was staged.

### Step 5: Commit

Run `git commit -m "<message>"` with the generated message.

Show the commit output.

### Step 6: Push

Run `git push` to push to the current remote branch.

If push fails (e.g., needs pull), report the error and suggest the user handle it manually.

### Step 7: Summary

Output a summary:
- Commit hash (short)
- Commit message
- Push status (success or failure)
- Number of files changed

## Safety Rules

- Never use `git push --force`
- Never modify git config
- If no changes exist, skip gracefully
- If push fails, do not retry — report and stop
