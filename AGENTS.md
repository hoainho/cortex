# AGENTS.md

> Persistent context for AI agents working on this repository.
> Loaded at the start of every session. Keep it short and high-signal.
>
> Sources: distilled from [Anthropic's Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) and
> [Karpathy's LLM coding guidelines](https://github.com/multica-ai/andrej-karpathy-skills), tuned to Cortex's Electron + React + AI stack.

---

## 1. Project Snapshot

**Cortex** is a macOS desktop AI assistant (Electron 33 + React 18 + TypeScript 5.7) with persistent memory, multi-agent orchestration, and self-learning. Not a ChatGPT wrapper — it indexes the user's codebase, runs a 5-path chat pipeline, and coordinates 12 specialized agents.

| Layer | Tech |
|---|---|
| Desktop shell | Electron 33, electron-vite, electron-builder |
| Frontend | React 18, Tailwind 3.4, Zustand 5 |
| Storage | SQLite (better-sqlite3) + Qdrant (optional, Docker) + Keychain |
| Embeddings | Voyage AI (bulk) · GitHub Models (query) · Ollama (offline fallback) |
| Code parsing | Tree-sitter, 20+ languages |
| Docs | pdf-parse, mammoth (DOCX), xlsx, turndown (HTML) |
| LLM | OpenAI-compatible proxy with multi-model routing |
| Testing | Vitest (unit + UI) + Playwright (E2E) |

**Read first** when ramping up: [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [CHANGELOG.md](./CHANGELOG.md), [SKILL_CATALOG.md](./SKILL_CATALOG.md).

---

## 2. Commands You Cannot Guess

```bash
npm run dev          # electron-vite dev with hot reload
npm run build        # production build (electron-vite build)
npm run dist:mac     # build signed macOS .dmg
npm run dist:win     # build Windows installer
npm run test         # vitest run (main + services)
npm run test:ui      # vitest run for React renderer
npm run test:all     # both suites
npm run test:watch   # vitest watch (main suite)
```

**IMPORTANT**: prefer `npm run test` over a single-file watcher when you change anything in `electron/services/` — many tests share fixtures.

**Native deps**: `better-sqlite3` and `web-tree-sitter` are rebuilt by `postinstall` (`electron-builder install-app-deps`). If you see `NODE_MODULE_VERSION` mismatches, run `npm install` again — do NOT delete `node_modules` blindly.

---

## 3. Repository Map

```
electron/
  ipc/                  # 9 domain IPC modules (brain, memory, chat, skills, settings, scheduler, backup, slack, appinsights)
  services/
    agents/             # 12 agents + resource-lock.ts (multi-agent file write guard)
    memory/             # 3-tier memory: core / archival / recall
    skills/             # 30+ tools, MCP client, efficiency, learning, RAG
    storage/            # VectorStore interface, HybridVectorStore, BrainSnapshot
    permissions/        # permission-engine, yolo-mode, path-access-policy
    scheduler/          # cron jobs, freshness-logger
    backup/             # SQLite + Qdrant + settings export/import
  main.ts               # app lifecycle + chat:send entry point

src/
  components/           # chat, agent, memory, skills, efficiency, settings, ui
  stores/               # Zustand: chat, project, skill, cost, memory, learning

mcp-server/             # Cortex-as-MCP-server (exposes local brain to external tools)
packages/               # internal packages (when present)
scripts/                # download-models, patch-electron-name, test-cloud-pipeline
tests/                  # vitest suites mirroring electron/ and src/
```

The chat pipeline path matters more than file paths. Trace any chat bug by following:
`main.ts → ipc/chat.ts → chat-pipeline → intent-classifier → router (orchestrate | skill_chain | slash_command | perplexity | standard) → tool-runner → hooks(after:chat)`.

---

## 4. Code Style & Conventions

- **TypeScript strict mode** is on. **NEVER** silence errors with `as any`, `@ts-ignore`, or `@ts-expect-error`. Fix the type.
- ES modules only (`"type": "module"`). Use `import` / `export`. No `require`.
- React function components. Hooks only — no class components.
- State: **Zustand** in `src/stores/`. **Do not** add Redux, Jotai, or Context-based global state.
- Styles: **Tailwind utility classes**. Avoid inline `style={{...}}` except for dynamic values that can't be expressed in classes.
- Filesystem ops in `electron/` go through tools in `services/skills/builtin/filesystem-tools.ts` — they enforce the 10 MB limit, sandbox checks, and the 7-tier fuzzy matcher. Do not re-implement raw `fs.writeFile`.
- IPC handlers: each new handler MUST validate input with the lightweight schema check used in sibling handlers. Unvalidated IPC = security regression.
- Logs from agents follow the format `[Origin][DD/MM/YYYY HH:mm:ss] message` — match it when adding new log surfaces (CLI dashboard parses this).

---

## 5. Architectural Invariants (do not break)

1. **The brain is incremental.** `HybridVectorStore` auto-selects Qdrant → SQLite. Never re-implement a vector store; extend the interface.
2. **Agent pool has exponential backoff** (1s/2s/4s) + Retry-After + tier fallback (`fast → balanced → premium`). New LLM call sites MUST go through agent-pool, not raw fetch.
3. **Circuit breaker** guards LLM cost: 3 failures → open 30 min; daily budget exceeded → open until midnight. New background work MUST check the breaker first.
4. **Resource lock** prevents multi-agent file write collisions. Atlas + Sisyphus writing the same file = lock.acquire / release.
5. **Hooks system** is the extension surface: `before:chat`, `after:chat`, `on:tool:call`, `on:error`, `on:session:start`, `on:session:end`. Cross-cutting logic (audit, sanitize, cost-check, cache) goes here, not into the pipeline body.
6. **Memory tiers are not interchangeable.** Core = preferences (always in context). Archival = semantic search. Recall = timeline. Writing to the wrong tier degrades retrieval.
7. **Permission engine** governs every tool call. File RW auto-approves by default; Bash / network / MCP do not, unless YOLO is on. System paths (`/System`, `/etc`, `~/.ssh`, …) stay protected even in YOLO.

---

## 6. Working Principles (Karpathy)

> Adapted verbatim from [andrej-karpathy-skills/CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md). These bias toward **caution over speed**. For trivial tasks (typo, one-liner) use judgment.

### 6.1 Think Before Coding — *Don't assume. Don't hide confusion. Surface tradeoffs.*

- State assumptions explicitly. If uncertain, **ask** rather than guess.
- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

### 6.2 Simplicity First — *Minimum code that solves the problem. Nothing speculative.*

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- The test: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

### 6.3 Surgical Changes — *Touch only what you must. Clean up only your own mess.*

- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — **do not delete it**.
- When your changes create orphans (imports, helpers), remove **only those** your changes orphaned.
- The test: every changed line should trace directly to the user's request.

### 6.4 Goal-Driven Execution — *Define success criteria. Loop until verified.*

Transform vague tasks into verifiable goals:

| Vague | Concrete |
|---|---|
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug" | "Write a test that reproduces it, then make it pass" |
| "Refactor X" | "Ensure tests pass before and after" |

For multi-step work, state a brief plan with verification per step:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## 7. Verification — The Single Highest-Leverage Practice

From [Anthropic best practices](https://www.anthropic.com/engineering/claude-code-best-practices): *give Claude a way to verify its work. This is the single highest-leverage thing you can do.*

**YOU MUST** verify before claiming a task done:

- **TypeScript changes** → `npm run build` exits 0 (catches strict-mode errors LSP misses).
- **Logic changes in `electron/services/`** → `npm run test` passes; pre-existing failures explicitly noted.
- **React UI changes** → `npm run test:ui` passes; for visual changes, screenshot and compare.
- **Tool / skill additions** → run the tool end-to-end in `npm run dev` and inspect the actual output, not just unit tests.
- **Cost-sensitive code** (LLM calls, embeddings) → confirm Circuit Breaker still triggers and budget caps still hold.

`build` + `test` + `lsp_diagnostics` green is the floor, not the ceiling. End-to-end usage is the gate.

**Address root causes, not symptoms.** If a test fails, fix the bug — never delete the test, never special-case a literal value to make it pass.

---

## 8. Exploration → Plan → Implement (Anthropic Workflow)

For non-trivial changes:

1. **Explore** — read relevant files. For multi-file investigations, delegate to a subagent so context stays clean.
2. **Plan** — write the plan. For anything touching the chat pipeline, agent pool, or storage layer, post it for human review before coding.
3. **Implement** — execute the plan; verify each step against its check.
4. **Commit** — descriptive Conventional Commits message (see §10).

Skip planning only when the diff fits in one sentence (typo, log line, variable rename).

---

## 9. Gotchas — Non-Obvious Behaviors

- **GUI launch ≠ shell launch.** When Cortex.app is opened from Finder/Dock on macOS, it does **not** inherit shell PATH. Any code that spawns external binaries (`npx`, `python3`, etc.) MUST go through `resolve-mcp-command.ts`-style PATH augmentation. Bare `spawn('npx', …)` will throw `ENOENT` in production.
- **MCP child processes block on stderr** unless drained. If you add a new child-process spawner, drain both stdout and stderr line-by-line — see `mcp-client.ts` for the pattern.
- **Voyage AI rate limit**: 3 M TPM, throttled at 80 K tokens / minute in the bulk indexer. Bypassing the throttle floods the API and triggers a multi-hour 429 window.
- **GitHub Models embedding**: 14 requests / minute. Used only for **query-time** embedding, never bulk. Bulk embedding via GitHub Models will burn through the rate budget in seconds.
- **Qdrant is optional.** Everything must keep working without it; `HybridVectorStore` warns at >50 K chunks but does not require Qdrant.
- **Brain snapshot**: every `npm run dev` re-index auto-snapshots the previous brain. Three snapshots are retained. Test code that mutates brain state should clean up to keep the snapshot ring meaningful.
- **`filesystem_unrestricted_mode`** lets agents read/write **anywhere on the user's machine**. Anything that touches this setting needs an explicit user-facing toggle and audit log entry.
- **AutoScan runs only when idle** (≥ 2 min) and respects the daily budget ($100 default). Do not call AutoScan paths from synchronous chat handlers — it will deadlock the idle detector.

---

## 10. Repo Etiquette

- **Branches**: `main` is the release branch. Feature work lands via PR from short-lived branches.
- **Commits**: Conventional Commits. `feat:`, `fix:`, `perf:`, `chore:`, `docs:`, `refactor:`, `test:`.
- **Releases**: see how prior releases were cut in `git log --oneline` — pattern is one `chore(release): bump to vX.Y.Z` commit + annotated tag `vX.Y.Z`. Update `package.json` + `CHANGELOG.md` together.
- **Identity**: git config is managed globally per directory (`/Users/nhonh/Documents/personal/`). Do NOT set `git config --local user.*` in this repo.
- **No commits without explicit user request.**

---

## 11. When to Ask vs. Act

| Situation | Action |
|---|---|
| Diff fits in one sentence, scope obvious | Act |
| Multiple interpretations, similar effort | Pick default, **state the assumption** |
| Multiple interpretations, 2× effort difference | **Ask** |
| User's design seems wrong | **Push back** with concrete reason + alternative, then await confirmation |
| Missing required info (file path, exact behavior) | **Ask** |
| Cost-sensitive change (LLM, embedding, AutoScan) | **Confirm** before merging |

---

## 12. Common Failure Patterns to Avoid

From Anthropic + observed in this repo:

- **Kitchen-sink session** — unrelated tasks pile up in one conversation. Reset context between tasks.
- **Correcting over and over** — after two failed corrections, stop, summarize what was learned, start fresh with a better prompt.
- **Trust-then-verify gap** — plausible-looking code that doesn't handle edge cases. Always run the verification step in §7.
- **Infinite exploration** — "investigate auth" without scope. Always scope to specific files / questions.
- **Over-specified instructions** — if a rule in this file is being ignored, the file is too long. Prune, don't add.

---

<!-- OPENCODE-MEMORY:START -->
<!-- Managed block - do not edit manually. Updated by: npx nano-brain init -->

## Memory System (nano-brain)

This project uses **nano-brain** for persistent context across sessions.

### Quick Reference

All commands use the CLI via Bash tool:

| I want to... | Command |
|--------------|---------|
| Recall past work on a topic | `npx nano-brain query "topic"` |
| Find exact error/function name | `npx nano-brain search "exact term"` |
| Explore a concept semantically | `npx nano-brain vsearch "concept"` |
| Save a decision for future sessions | Create file in `~/.nano-brain/memory/`, then `npx nano-brain update` |
| Check index health | `npx nano-brain status` |

### Session Workflow

**Start of session:** Check memory for relevant past context before exploring the codebase.
```
npx nano-brain query "what have we done regarding {current task topic}"
```

**End of session:** Save key decisions, patterns discovered, and debugging insights.
```bash
cat > ~/.nano-brain/memory/$(date +%Y-%m-%d)-summary.md << 'EOF'
## Summary
- Decision: ...
- Why: ...
- Files: ...
EOF
npx nano-brain update
```

### When to Search Memory vs Codebase

- **"Have we done this before?"** → `npx nano-brain query` (searches past sessions)
- **"Where is this in the code?"** → grep / ast-grep (searches current files)
- **"How does this concept work here?"** → Both (memory for past context + grep for current code)

<!-- OPENCODE-MEMORY:END -->

<!-- RTK:START -->
<!-- Managed block - do not edit manually. Updated by: rtk-setup skill -->

## RTK Token Optimizer

This project uses **RTK** (Rust Token Killer) to reduce LLM token consumption by 60-90%.

### Rules for ALL agents (including subagents)

**ALWAYS** prefix these commands with `rtk`:

| Command | Use instead |
|---------|-------------|
| `git status/diff/log/add/commit/push/pull` | `rtk git ...` |
| `ls`, `ls -la` | `rtk ls` |
| `cat file` | `rtk read file` |
| `grep pattern .` / `rg pattern` | `rtk grep pattern .` |
| `npm test` / `cargo test` / `pytest` | `rtk test <cmd>` |
| `npm run build` / `cargo build` | `rtk err <cmd>` |
| `gh pr list/view` | `rtk gh pr list/view` |
| `docker ps` | `rtk docker ps` |
| `eslint` / `tsc` | `rtk lint` / `rtk tsc` |

**Do NOT** prefix: `npx`, `npm install`, `pip install`, `node`, `python3`, heredocs, piped commands.

<!-- RTK:END -->
