<div align="center">

# Cortex

**The AI Brain That Knows Your Codebase**

[![Version](https://img.shields.io/badge/version-3.0.0-orange.svg)](https://github.com/hoainho/cortex/releases/tag/v3.0.0)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](https://github.com/hoainho/cortex/releases)
[![Built With](https://img.shields.io/badge/built%20with-Electron%20%2B%20React%20%2B%20TypeScript-61DAFB.svg)](#tech-stack)

A desktop AI assistant that deeply understands your entire codebase — with persistent memory, multi-agent orchestration, self-learning, and 30+ pluggable skills.

[Download for Mac](https://github.com/hoainho/cortex/releases/download/v3.0.0/Cortex-3.0.0-arm64.dmg) · [Landing Page](https://hoainho.github.io/cortex-landing) · [Changelog](CHANGELOG.md)

</div>

---

## What is Cortex?

Cortex is **not** another ChatGPT wrapper. It's a personal AI engineering platform that lives on your machine and builds a deep, persistent understanding of every project you work on.

- **Indexes your entire codebase** using vector embeddings, AST parsing, and code dependency graphs
- **Remembers everything** — 3-tier memory system that learns your preferences, coding style, and past decisions
- **Self-improves over time** — collects behavioral feedback and optimizes prompts via DSPy
- **Multi-agent system** — 4 named agents with specialized reasoning strategies, plus 8 background agents
- **30+ skills** — plugin architecture with MCP protocol support, browser automation, Git actions, code execution
- **Privacy-first** — your code never leaves your machine. Only compressed context is sent to the LLM proxy
- **Cost-conscious** — semantic caching, 10-tier model routing, and token usage tracking

---

## Why Cortex?

| Capability | Cortex | Cursor | GitHub Copilot | ChatGPT |
|---|:---:|:---:|:---:|:---:|
| Full codebase indexing | ✅ Vector + Graph | Partial | ❌ | ❌ |
| Persistent memory | ✅ 3-tier | ❌ | ❌ | Limited |
| Self-learning | ✅ DSPy | ❌ | ❌ | ❌ |
| Multi-agent system | ✅ 12 agents | ❌ | ❌ | ❌ |
| Privacy (local-first) | ✅ | ❌ Cloud | ❌ Cloud | ❌ Cloud |
| Semantic cache | ✅ 92% threshold | ❌ | ❌ | ❌ |
| Plugin skills | ✅ 30+ / MCP | Limited | ❌ | Plugins |
| Model routing | ✅ 10-tier auto | Single | Single | Single |
| Open source | ✅ MIT | ❌ | ❌ | ❌ |

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Cortex Desktop                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────┐  │
│  │  Chat UI  │  │  Agent    │  │  Memory   │  │  Skill  │  │
│  │  + Slash  │  │  Panel    │  │  Dashboard│  │  Manager│  │
│  │  Commands │  │           │  │           │  │         │  │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬────┘  │
│        │              │              │             │        │
│  ══════╧══════════════╧══════════════╧═════════════╧══════  │
│                     IPC Bridge (preload.ts)                  │
│  ═══════════════════════════════════════════════════════════  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Hook System                        │   │
│  │  cost-guard │ cache-check │ context-monitor │ audit   │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                             │                               │
│  ┌────────────┐  ┌─────────┴────────┐  ┌────────────────┐  │
│  │   Brain    │  │   Agent System   │  │   Efficiency   │  │
│  │   Engine   │  │                  │  │   Engine       │  │
│  │            │  │  Sisyphus        │  │                │  │
│  │  ChromaDB  │  │  Hephaestus     │  │  Semantic      │  │
│  │  Tree-sit  │  │  Prometheus     │  │  Cache         │  │
│  │  GraphRAG  │  │  Atlas          │  │  Model Router  │  │
│  │  Hybrid    │  │                  │  │  Cost Tracker  │  │
│  │  Search    │  │  ReAct / Plan   │  │                │  │
│  │  Agentic   │  │  & Execute /    │  │  10-tier       │  │
│  │  RAG       │  │  Reflexion      │  │  Ranking       │  │
│  └────────────┘  └──────────────────┘  └────────────────┘  │
│                                                             │
│  ┌────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Memory    │  │  Skill Registry  │  │  Self-Learning │  │
│  │  System    │  │                  │  │                │  │
│  │            │  │  30+ Skills      │  │  Event         │  │
│  │  Core      │  │  MCP Protocol    │  │  Collector     │  │
│  │  Archival  │  │  Playwright      │  │  Feedback      │  │
│  │  Recall    │  │  Git Actions     │  │  Detector      │  │
│  │            │  │  Code Executor   │  │  DSPy Bridge   │  │
│  └────────────┘  └──────────────────┘  └────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SQLite + Electron safeStorage            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 🧠 Brain Engine

- **Vector Search** — ChromaDB embeddings with cosine similarity for semantic code retrieval
- **GraphRAG** — Code dependency graph with multi-hop reasoning across modules
- **Hybrid Search** — Combines vector search + keyword fallback for maximum recall
- **Agentic RAG** — Multi-step retrieval: decompose → iterative search → relevance boost → gap detection → confidence scoring
- **Contextual Chunking** — Enriches code chunks with file-level context (imports, exports) before embedding
- **RAG Fusion** — Multi-query with Reciprocal Rank Fusion for diverse results

### 🤖 Multi-Agent System

- **Sisyphus** — Ultraworker that breaks complex tasks into atomic steps and delegates to specialists
- **Hephaestus** — Deep Agent that researches thoroughly before acting, traces root causes
- **Prometheus** — Strategic Planner that produces architecture proposals with execution blueprints
- **Atlas** — Heavy Lifter for parallel execution across multiple files and systems
- **8 background agents** — Implementation, Review, Security, Performance, Writer, Formatter, Feedback, Knowledge Crystallizer
- **33 slash commands** — `/review`, `/security`, `/architect`, `/implement`, `/refactor`, `/playwright`, `/git-master`, and more
- **3 reasoning strategies** — ReAct (reasoning + acting loop), Plan & Execute (two-phase), Reflexion (self-evaluating)

### 💾 Persistent Memory

- **Core Memory** — Always in context: your preferences, coding style, project conventions
- **Archival Memory** — Long-term knowledge with semantic search across all past interactions
- **Recall Memory** — Conversation history with timeline navigation
- **Memory Dashboard** — Visual UI to browse, edit, and manage all memory tiers

### 🔌 Skills & MCP

- **30+ built-in skills** — Code analysis, RAG search, browser automation, Git operations, code execution
- **CortexSkill interface** — Plugin architecture with health checks, metrics, and confidence-based routing
- **MCP Protocol** — Model Context Protocol client for external tool integration
- **Playwright Adapter** — Browser automation skill for web scraping and testing
- **Skill Manager UI** — Toggle skills on/off, view metrics, manage categories

### ⚡ Efficiency Engine

- **Semantic Cache** — Embedding-based response cache with 92% similarity threshold, saves tokens on repeated queries
- **10-tier Model Routing** — Automatic model selection based on quality ranking (GitLab models at T10 highest priority)
- **Cost Tracker** — Per-query token usage, daily cost charts, cache savings visualization
- **Auto-rotation** — Automatically switches to next best model on auth errors (401/403)

### 🔒 Security

- **Prompt injection detection** — 15+ regex patterns with automatic sanitization
- **Sandboxed code execution** — Isolated temp directories with auto-cleanup
- **Terminal allowlist** — Only 30 pre-approved safe commands, dangerous patterns blocked
- **Electron security** — `contextIsolation: true`, `nodeIntegration: false`, safeStorage for secrets
- **Audit logging** — Every action tracked with full audit trail
- **Memory isolation** — Each project uses separate collections, no cross-brain data leaks

### 🔄 Self-Learning

- **Event Collector** — Tracks behavioral events: message sent, code accepted/rejected, follow-up patterns
- **Feedback Detector** — Identifies implicit feedback from user behavior
- **DSPy Bridge** — Connects to DSPy framework for automated prompt optimization
- **Prompt Optimizer** — Continuously improves prompts based on accumulated feedback data

---

## Quick Start

### 1. Download

Download the latest release for macOS (Apple Silicon):

**[⬇ Download Cortex v3.0.0](https://github.com/hoainho/cortex/releases/download/v3.0.0/Cortex-3.0.0-arm64.dmg)**

### 2. Install

Open the `.dmg` file and drag Cortex to your `/Applications` folder.

### 3. First Launch

The onboarding wizard will guide you through:

1. **Welcome** — Overview of what Cortex can do
2. **Proxy Setup** — Configure your LLM API proxy (default: `localhost:3456`)
3. **Get Started** — Create your first project

### 4. Import a Project

- **From local folder** — Point to any directory on your machine
- **From GitHub** — Paste a repository URL (supports private repos with PAT)

### 5. Start Chatting

Cortex indexes your entire codebase and is ready to answer questions, analyze architecture, review code, and more. Use `/` to see all available slash commands.

---

## Development Setup

```bash
git clone https://github.com/hoainho/cortex.git
cd cortex
npm install
npm run dev
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run dist:mac` | Build + package macOS `.dmg` |
| `npm run test` | Run unit tests |
| `npm run test:all` | Run all test suites |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 33 |
| Frontend | React 18, TypeScript 5.7, Tailwind CSS 3.4 |
| State Management | Zustand 5 |
| Database | better-sqlite3 (SQLite) |
| Vector Search | ChromaDB (via HuggingFace Transformers) |
| Code Parsing | Tree-sitter (web-tree-sitter) |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` (local) |
| LLM Communication | OpenAI-compatible API via proxy |
| Tool Protocol | Model Context Protocol (MCP) SDK |
| Markdown | react-markdown, remark-gfm, rehype-highlight, Mermaid |
| Testing | Vitest, Testing Library, Playwright |
| Build | electron-vite, electron-builder |

---

## Agent System

Cortex's agent system is inspired by [OpenCode's Sisyphus architecture](https://github.com/opencode-ai/opencode). Each agent has a distinct personality, specialized mode directives, and delegated capabilities.

### Named Agents

| Agent | Role | Mode Directives |
|-------|------|----------------|
| **Sisyphus** | Ultraworker — breaks tasks into atomic steps, delegates to specialists, never stops until done | `[analyze-mode]` `[search-mode]` `[todo-continuation]` |
| **Hephaestus** | Deep Agent — researches thoroughly before acting, traces call chains and root causes | `[deep-research-mode]` `[root-cause-analysis]` |
| **Prometheus** | Strategic Planner — produces architecture proposals with task breakdowns and risk assessments | `[planning-mode]` `[architecture-mode]` |
| **Atlas** | Heavy Lifter — parallel execution across codebases with systematic batch operations | `[parallel-execution-mode]` `[bulk-operation-mode]` |

### Reasoning Strategies

| Strategy | Mechanism |
|----------|-----------|
| **ReAct** | Reasoning + Acting loop — think → act → observe → repeat (max 10 iterations) |
| **Plan & Execute** | Two-phase: generate 2-6 step plan → execute each step sequentially with code context |
| **Reflexion** | Self-evaluating: execute → self-critique → improve (max 3 reflections, early stop at score ≥ 8/10) |

### Agent Selection

Agents are selected via the agent popup badge in the chat input. The selected agent's system prompt and mode directives are injected into the LLM context transparently — the chat UI only shows what you type.

---

## Roadmap

- [ ] Windows and Linux builds
- [ ] Local LLM support (Ollama, MLX, llama.cpp)
- [ ] Self-RAG, CRAG, HyDE retrieval strategies
- [ ] Slack and Discord MCP integration
- [ ] LoRA personalization for coding style
- [ ] Multi-project cross-referencing
- [ ] Collaborative mode (team brains)

---

## License

MIT License

```
Copyright (c) 2026 Hoài Nhớ

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Cortex is an independent project created and maintained by Hoài Nhớ. All intellectual property rights, including but not limited to the architecture design, agent system, and brand identity, are exclusively owned by the author.

---

<div align="center">

**Built with ❤️ by [Hoài Nhớ](mailto:nhoxtvt@gmail.com)**

[GitHub](https://github.com/hoainho/cortex) · [Releases](https://github.com/hoainho/cortex/releases) · [Landing Page](https://hoainho.github.io/cortex-landing)

</div>
