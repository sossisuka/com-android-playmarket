# Instructions

Follow the skills in `skills/`. Check `project-info/` on every session start.

---

## Environment Detection

- Run `detecting-environment` before any shell command.
- Use OS-appropriate syntax: PowerShell on Windows, bash on macOS/Linux.
- Check which tools are installed before using them — never assume.
- Lockfile priority (JS/TS): `bun.lockb` → `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`
- Python tool priority: uv → poetry → venv/pip

---

## Project Structure

- Use `initializing-projects` to detect project type from existing files.
- Do not ask about structure when the type is clearly detectable.
- When ambiguous, ask with clear explanations of each option's trade-offs.
- For new projects needing architecture decisions, use `scaffold-arch`.

---

## Best Practices (Always Apply)

- `best-practices` skill is always active — apply it to every file touched.
- Load the matching language file: `best-practices/languages/<lang>.md`
- Enforce CI rules from `best-practices/enforcement.md` on PRs.

---

## Code Quality Workflow

```
Write code → best-practices (auto) → reviewing-code → writing-commits
```

- Before committing: run `reviewing-code` (blockers must be fixed first).
- For commit messages: use `writing-commits` (Conventional Commits format).
- For failing CI: use `fixing-ci` (diagnose logs, minimal fix).

---

## Project Commands

- Always check `project-info/commands.md` before running build/test/dev commands.
- If a recurring command is identified, save it to `project-info/commands.md`.
- Reference `project-commands/` for language and OS-specific command syntax.
- Reference `project-commands/os/` for platform-specific developer tools.

---

## Architecture & Scaffolding

- New project → `scaffold-arch` picks architecture, scaffolds structure, generates `AGENTS.md`
- Architecture decisions → `architecture` for module boundaries and pattern selection
- Project structure questions → `initializing-projects` for adding structure to existing code

---

## Planning

Use `planning` for any task with:
- 3 or more distinct steps
- Changes to multiple files
- Actions that are hard to reverse (migrations, deletes, API changes)

---

## File Encoding

- Write all text files in UTF-8.
- On Windows: use `encoding-utf8` when text appears garbled or non-ASCII content is involved.
- Fix encoding issues immediately when detected.

---

## Security

- Use `security` skill for: auth flows, input validation, secrets management, SQL queries.
- Never hardcode secrets — use environment variables or secret managers.
- Validate all inputs at system boundaries (API, CLI, file input, user forms).
