# Cortex Brain MCP Server

Expose your Cortex AI brain to **any MCP-compatible tool** — Cline, Claude Code, Continue, Cursor, and more.

Cortex Brain reads your existing Cortex Desktop database (codebase embeddings, 3-tier memory, knowledge graph) and serves it as a standard MCP server over stdio. Your favorite IDE tools get instant access to deep codebase understanding, persistent memory, and project intelligence.

```
Your IDE (Cline / Claude Code / Cursor / Continue)
         |
         |  MCP Protocol (stdio)
         v
   cortex-brain (this package)
         |
         |  Read-only SQLite (WAL)
         v
   Cortex Desktop Database
   (brain, memory, knowledge graph)
```

---

## Quick Start

**Prerequisites**: [Cortex Desktop](https://github.com/nhonh/cortex) installed with at least one indexed project.

```bash
# 1. Install and build
cd mcp-server
npm install
npm run build

# 2. Find your project ID and get config snippets
node dist/cli.js --config

# 3. Copy the config for your tool (see output)
# 4. Restart your IDE tool — cortex-brain appears as an MCP server
```

That's it. Your Cline / Claude Code / Cursor agent can now call `cortex_search`, `cortex_memory_read`, and other tools to tap into Cortex's brain.

---

## Setup by Tool

Run `node dist/cli.js --config` to auto-generate configs with the correct paths for your system. Below are the manual configs for reference.

### Cline (VS Code)

File: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "cortex-brain": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-server/dist/cli.js",
        "--project-id=YOUR_PROJECT_ID"
      ],
      "disabled": false
    }
  }
}
```

### Claude Desktop

File: `~/.claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cortex-brain": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-server/dist/cli.js",
        "--project-id=YOUR_PROJECT_ID"
      ]
    }
  }
}
```

### Continue (VS Code)

File: `~/.continue/config.json` (merge into existing config)

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/absolute/path/to/mcp-server/dist/cli.js",
            "--project-id=YOUR_PROJECT_ID"
          ]
        }
      }
    ]
  }
}
```

### Cursor

File: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "cortex-brain": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-server/dist/cli.js",
        "--project-id=YOUR_PROJECT_ID"
      ]
    }
  }
}
```

---

## CLI Reference

```
cortex-brain [options]

Options:
  --db-path=PATH       Path to Cortex SQLite database
                       (auto-detected if omitted)
  --project-id=ID      Default project ID for all tool calls
  --project=ID         Alias for --project-id
  --config             Print setup configs for all supported tools
  -h, --help           Show help
```

Database auto-detection paths:
- **macOS**: `~/Library/Application Support/Cortex/cortex-data/cortex.db`
- **Linux**: `~/.config/Cortex/cortex-data/cortex.db`
- **Windows**: `%APPDATA%/Cortex/cortex-data/cortex.db`

---

## Tool Reference

### cortex_search

Hybrid RAG search over your codebase. Combines vector similarity (70%) with keyword matching (30%) — the same algorithm Cortex Desktop uses.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | yes | — | Natural language query |
| projectId | string | no | CLI default | Cortex project ID |
| maxResults | number | no | 10 | Max results to return |

**Returns**: Ranked code chunks with `file`, `lines`, `language`, `type`, `name`, `score`, and `content`.

```
Example: "How does authentication work?"
→ Returns auth middleware, JWT verification, login handler chunks
```

### cortex_memory_read

Read from Cortex's 3-tier persistent memory system.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tier | `"core"` \| `"archival"` \| `"recall"` | yes | — | Memory tier |
| projectId | string | no | CLI default | Cortex project ID |
| query | string | no | — | Search within archival/recall |
| limit | number | no | 20 | Max results |

**Memory tiers**:
- **core** — Project conventions, coding style, user preferences. Always-in-context. Small and curated.
- **archival** — Past decisions, architecture notes, debugging insights. Long-term, vector-searchable. Unlimited.
- **recall** — Conversation history across sessions. Timestamp-ordered.

### cortex_graph_query

Query the code knowledge graph. Traverse relationships between files, functions, classes, and modules.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| nodeType | string | no | — | Filter: `file`, `function`, `class`, `module`, `variable` |
| startNodeId | string | no | — | Start node for BFS traversal |
| hops | number | no | 2 | Traversal depth |
| projectId | string | no | CLI default | Cortex project ID |

**Edge types**: `imports`, `calls`, `inherits`, `implements`, `uses`

### cortex_find_similar

Find code patterns similar to a given snippet.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| code | string | yes | — | Code snippet to match against |
| projectId | string | no | CLI default | Cortex project ID |
| limit | number | no | 5 | Max results |

### cortex_project_info

Get a project overview: chunk counts, languages, repositories, brain health, memory statistics.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| projectId | string | no | CLI default | Cortex project ID |

### cortex_list_projects

List all Cortex projects with their IDs, names, and timestamps. No parameters required.

### cortex_directory_tree

Get the directory tree structure of a project.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| projectId | string | no | CLI default | Cortex project ID |

---

## Resource Reference

MCP resources provide direct data access (read-only). Clients can subscribe to these for automatic context injection.

| URI Pattern | Content | Format |
|-------------|---------|--------|
| `cortex://memory/core/{projectId}` | Core memory entries (conventions, preferences) | JSON |
| `cortex://project/{projectId}/stats` | Project statistics and brain health | JSON |
| `cortex://graph/{projectId}/overview` | Knowledge graph nodes and edges | JSON |
| `cortex://project/{projectId}/tree` | Directory tree | Plain text |

---

## Project Structure

```
mcp-server/
  src/
    cli.ts                — CLI entry point (arg parsing, stdio transport)
    server.ts             — MCP server core (7 tools, 4 resources)
    index.ts              — Public API exports
    config-generator.ts   — Auto-gen config snippets for Cline/Claude/Continue/Cursor
    db/
      reader.ts           — Read-only SQLite access (30+ query methods)
      types.ts            — TypeScript interfaces for all DB tables
    search/
      vector.ts           — Hybrid search (vector similarity + keyword matching)
    utils/
      cosine.ts           — Cosine similarity for Float32Array embeddings
      logger.ts           — stderr logger (stdout reserved for MCP protocol)
      paths.ts            — Cross-platform Cortex DB path detection
```

---

## Design Decisions

**Read-only access**: The database is opened with `{ readonly: true }`. The MCP server cannot modify your data under any circumstances.

**WAL journal mode**: SQLite WAL (Write-Ahead Logging) allows the MCP server to read concurrently while Cortex Desktop writes. Both processes can run simultaneously without conflicts.

**Zero coupling**: This package has zero imports from `electron/`. It reads the same database but shares no code with the Electron app. You can update either independently.

**stderr logging**: The MCP protocol communicates over stdout (JSON-RPC). All diagnostic logging goes to stderr to avoid corrupting the protocol stream.

**Cross-platform**: Database path auto-detection works on macOS, Linux, and Windows. The server itself runs anywhere Node.js 18+ is available.

---

## Troubleshooting

### "Cortex database not found"

The server could not auto-detect the database. Either:
- Cortex Desktop is not installed
- The database is at a non-standard location

Fix: specify the path manually:
```bash
node dist/cli.js --db-path=/path/to/cortex.db
```

### "projectId is required"

Tools need a project ID to know which codebase to search. Either:
- Pass `--project-id=ID` when starting the server (recommended)
- Include `projectId` in every tool call from your agent

To find your project ID:
```bash
node dist/cli.js --config
# Lists available projects if the database is found
```

Or start the server and call `cortex_list_projects` from your MCP client.

### Tool returns empty results

- Verify the project has been indexed in Cortex Desktop (status should be "ready")
- Check chunk count: call `cortex_project_info` — if `chunks: 0`, the project needs re-indexing
- For vector search: embeddings must exist. If Cortex was run without an embedding provider configured, chunks will lack embeddings and only keyword search will work.

### Server not appearing in Cline/Claude Code

- Verify the path in your config is **absolute**, not relative
- Verify `node dist/cli.js --help` works from your terminal
- Restart the IDE/tool completely after config changes
- Check the tool's MCP logs for connection errors

### "SQLITE_CANTOPEN: unable to open database file"

The database file doesn't exist at the specified path, or permissions are wrong.
```bash
ls -la ~/Library/Application\ Support/Cortex/cortex-data/cortex.db
```

---

## Requirements

- Node.js >= 18
- Cortex Desktop installed (provides the database)
- At least one project indexed in Cortex Desktop

---

## License

MIT
