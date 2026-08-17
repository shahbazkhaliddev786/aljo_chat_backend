---
name: git-storyteller
description: Automates diff parsing to write crisp, structured Pull Request notes mapping changes back to feature metrics. Use when handling generate pr, commit message, changelog, pull request.
---

# Git Storyteller & PR Automation (`git-storyteller`)

This skill automates git diff parsing to write structured Conventional Commits, Pull Request summaries, release notes, and changelogs.

## Pull Request & Commit Standards

### 1. Conventional Commit Messages
Structure commit messages following the Conventional Commits specification:
```text
<type>(<scope>): <short summary>

[optional body describing technical rationale]

[optional footer(s), e.g., BREAKING CHANGE or issue references]
```
- Common types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`.

### 2. Structured PR Description Template
When generating PR documentation from git diffs, use the following structure:

```markdown
## Summary of Changes
Brief high-level description of what this PR introduces or fixes.

## Key Technical Modifications
- **[Component/Module]**: Specific change breakdown.
- **Database/Schema**: Any migrations or index updates.

## Verification & Testing
- Automated tests added/run.
- Manual verification steps performed.

## Breaking Changes / Migrations
Highlight any breaking changes or required environment updates.
```

### 3. Automated Changelog Generation
Group commits by scope and type, filtering out merge commits or minor chore updates to produce readable release logs.
