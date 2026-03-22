# Codex Agent Instructions

Apply the skills in `skills/`. Follow `system_prompt.md` rules at every session start.

---

## Session Start — Run in Order

```
1. detecting-environment   → OS, installed tools, correct commands for this machine
2. initializing-projects   → detect project type, scaffold if needed (no unnecessary questions)
3. project-patterns        → load project-info/commands.md + patterns.md if present
```

---

## Always-Active Rule

**`best-practices`** is always active — apply its universal rules and the matching language file to **every file written or modified**. No trigger needed; load silently.

---

## Skill Reference

### Session & Environment

| Skill | Folder | Trigger |
|-------|--------|---------|
| `detecting-environment` | `env-detect/` | Before any shell command; identifies OS, tools, package manager |
| `initializing-projects` | `project-init/` | New project, adding structure, "scaffold", "init", "set up" |
| `project-patterns` | `project-patterns/` | Before running build/test/dev commands; persist recurring commands |
| `project-commands` | `project-commands/` | Looking up build / test / run / lint command syntax |

### Planning & Architecture

| Skill | Folder | Trigger |
|-------|--------|---------|
| `planning` | `planning/` | Task has 3+ steps, multi-file changes, or hard-to-reverse actions |
| `scaffold-arch` | `scaffold-arch/` | "new project", "which architecture", "scaffold", "what pattern", "project structure" |
| `architecture` | `architecture/` | Module design decisions, splitting a monolith, structural trade-offs |

### Code Development

| Skill | Folder | Trigger |
|-------|--------|---------|
| `best-practices` | `best-practices/` | **Always active** — every file written or modified |
| `code-generation` | `code-generation/` | Writing new code, new module, new endpoint, boilerplate |
| `code-analysis` | `code-analysis/` | Reviewing code quality, assessing technical debt, auditing a codebase |
| `debugging` | `debugging/` | Bug hard to reproduce, error trace unclear, fix made things worse |
| `testing` | `testing/` | Writing or improving tests, coverage gaps, choosing test strategy |
| `refactoring` | `refactoring/` | Restructuring without behavior change, extracting logic, reducing duplication |
| `security` | `security/` | Auth, input handling, secrets management, SQL queries, user data flows |
| `clean-code` | `clean-code/` | Naming inconsistency, functions too long, deep nesting, readability |

### Code Quality Gates

| Skill | Folder | Trigger |
|-------|--------|---------|
| `writing-commits` | `writing-commits/` | After `git add`, before committing, "write a commit message" |
| `reviewing-code` | `reviewing-code/` | Before committing or merging, "review this", "check this PR", "audit changes" |
| `fixing-ci` | `fixing-ci/` | CI check failing, "fix CI", "green the build", pipeline broken |

### Documentation & Utilities

| Skill | Folder | Trigger |
|-------|--------|---------|
| `documentation` | `documentation/` | README, API docs, inline comments, onboarding guides |
| `encoding-utf8` | `encoding-utf8/` | Garbled text, Windows Unicode files, non-ASCII content |

---

## Decision Rules

| Situation | Action |
|-----------|--------|
| Task has 3+ steps or multi-file changes | Use `planning` first |
| Running any shell command | Check `detecting-environment` result — never assume tool is installed |
| Lockfile present | Use the matching package manager — never ask |
| Project type clear from existing files | Scaffold immediately, state what was detected |
| Project type ambiguous | Ask with trade-off explanation for each option |
| Recurring command identified | Save to `project-info/commands.md` via `project-patterns` |
| Before any commit | Run `reviewing-code` → then `writing-commits` |
| CI is failing | Use `fixing-ci` — read logs, find root cause, make minimal fix |
| Non-ASCII text on Windows | Use `encoding-utf8` |
| Writing or editing any code | Apply `best-practices` language rules (silently) |

---

## Project Info Files

| File | Purpose |
|------|---------|
| `project-info/commands.md` | Project-specific build/test/dev commands — always check before running anything |
| `project-info/patterns.md` | Recurring project patterns — load on session start |
