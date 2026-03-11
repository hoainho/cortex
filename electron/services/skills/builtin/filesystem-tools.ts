/**
 * Built-in Filesystem Tools for Cortex AI Chat
 *
 * Provides 4 tools that allow the AI to interact with project source code:
 * - cortex_read_file: Read file content
 * - cortex_write_file: Write/create files
 * - cortex_edit_file: Search & replace in files
 * - cortex_list_directory: List directory contents
 *
 * All paths are sandboxed to project repository directories for security.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, dirname, relative } from 'path'
import type { MCPToolDefinition } from '../mcp/mcp-manager'
import { getDb, repoQueries } from '../../db'

// =====================
// Tool Definitions
// =====================

const TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'cortex_read_file',
      description: 'Read the contents of a file at the given path relative to the project repository root. Returns the file content as text. Maximum file size: 1MB.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repository root (e.g., "src/index.ts", "package.json")'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cortex_write_file',
      description: 'Write content to a file at the given path. Creates parent directories if they do not exist. Path is relative to the project repository root.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repository root (e.g., "src/new-file.ts")'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cortex_edit_file',
      description: 'Edit a file by replacing all occurrences of old_string with new_string. Path is relative to the project repository root. Returns the number of replacements made.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the repository root'
          },
          old_string: {
            type: 'string',
            description: 'The exact text to find in the file'
          },
          new_string: {
            type: 'string',
            description: 'The text to replace old_string with'
          }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cortex_list_directory',
      description: 'List the contents of a directory. Path is relative to the project repository root. Use "." or empty string for repository root.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path relative to the repository root (e.g., "src", "src/components"). Defaults to root.'
          }
        },
        required: []
      }
    }
  }
]

// =====================
// Path Security
// =====================

const MAX_READ_SIZE = 1024 * 1024 // 1MB

/**
 * Resolve a relative path against project repo roots with security checks.
 * Returns the first valid absolute path that falls within a repo directory.
 * Throws if the path escapes all repo boundaries.
 */
function resolveSafePath(repoPaths: string[], relativePath: string): string {
  if (!relativePath || relativePath.trim() === '') {
    throw new Error('Path cannot be empty')
  }

  // Normalize the input path
  const normalized = relativePath.replace(/\\/g, '/')

  for (const repoRoot of repoPaths) {
    const resolved = resolve(repoRoot, normalized)

    // Security: ensure resolved path is within repo root
    // Use resolve to canonicalize, then check prefix
    const repoRootResolved = resolve(repoRoot)
    if (resolved.startsWith(repoRootResolved + '/') || resolved === repoRootResolved) {
      return resolved
    }
  }

  throw new Error(
    `Path "${relativePath}" is outside all project repositories. ` +
    `Allowed roots: ${repoPaths.join(', ')}`
  )
}

/**
 * Get absolute paths for all repos in a project.
 */
function getRepoPaths(projectId: string): string[] {
  const db = getDb()
  const repos = repoQueries.getByProject(db).all(projectId) as Array<{
    id: string
    source_path: string
    source_type: string
  }>
  const paths = repos
    .map(r => r.source_path)
    .filter(p => p && existsSync(p))

  if (paths.length === 0) {
    throw new Error('No accessible repositories found for this project')
  }

  return paths
}

// =====================
// Tool Implementations
// =====================

function toolReadFile(repoPaths: string[], args: { path: string }): { content: string; isError: boolean } {
  try {
    const absPath = resolveSafePath(repoPaths, args.path)

    if (!existsSync(absPath)) {
      return { content: `File not found: ${args.path}`, isError: true }
    }

    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      return { content: `"${args.path}" is a directory, not a file. Use cortex_list_directory instead.`, isError: true }
    }

    if (stat.size > MAX_READ_SIZE) {
      return { content: `File too large (${(stat.size / 1024 / 1024).toFixed(2)}MB). Maximum: 1MB.`, isError: true }
    }

    const content = readFileSync(absPath, 'utf-8')

    // Basic binary detection: check for null bytes in first 8KB
    const sample = content.slice(0, 8192)
    if (sample.includes('\0')) {
      return { content: `"${args.path}" appears to be a binary file. Only text files can be read.`, isError: true }
    }

    console.log(`[FilesystemTools] Read file: ${args.path} (${content.length} chars)`)
    return { content, isError: false }
  } catch (err) {
    return { content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

function toolWriteFile(repoPaths: string[], args: { path: string; content: string }): { content: string; isError: boolean } {
  try {
    const absPath = resolveSafePath(repoPaths, args.path)

    // Auto-create parent directories
    const dir = dirname(absPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(absPath, args.content, 'utf-8')

    // Find which repo root this belongs to for nice output
    let relDisplay = args.path
    for (const root of repoPaths) {
      const resolved = resolve(root)
      if (absPath.startsWith(resolved)) {
        relDisplay = relative(resolved, absPath)
        break
      }
    }

    console.log(`[FilesystemTools] Wrote file: ${relDisplay} (${args.content.length} chars)`)
    return { content: `Successfully wrote ${args.content.length} characters to ${relDisplay}`, isError: false }
  } catch (err) {
    return { content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

function toolEditFile(repoPaths: string[], args: { path: string; old_string: string; new_string: string }): { content: string; isError: boolean } {
  try {
    const absPath = resolveSafePath(repoPaths, args.path)

    if (!existsSync(absPath)) {
      return { content: `File not found: ${args.path}`, isError: true }
    }

    const stat = statSync(absPath)
    if (stat.isDirectory()) {
      return { content: `"${args.path}" is a directory, not a file.`, isError: true }
    }

    const original = readFileSync(absPath, 'utf-8')

    if (!original.includes(args.old_string)) {
      return { content: `old_string not found in "${args.path}". Make sure the search text matches exactly (including whitespace and indentation).`, isError: true }
    }

    // Count occurrences
    let count = 0
    let idx = 0
    while ((idx = original.indexOf(args.old_string, idx)) !== -1) {
      count++
      idx += args.old_string.length
    }

    const updated = original.split(args.old_string).join(args.new_string)
    writeFileSync(absPath, updated, 'utf-8')

    console.log(`[FilesystemTools] Edited file: ${args.path} (${count} replacement${count > 1 ? 's' : ''})`)
    return {
      content: `Successfully replaced ${count} occurrence${count > 1 ? 's' : ''} in ${args.path}`,
      isError: false
    }
  } catch (err) {
    return { content: `Error editing file: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

function toolListDirectory(repoPaths: string[], args: { path?: string }): { content: string; isError: boolean } {
  try {
    const targetPath = args.path || '.'

    // Special case: if path is "." or empty, list ALL repo roots
    if (targetPath === '.' || targetPath === '') {
      const entries: string[] = []
      for (const repoRoot of repoPaths) {
        const repoName = repoRoot.split('/').pop() || repoRoot
        try {
          const items = readdirSync(repoRoot, { withFileTypes: true })
          entries.push(`=== ${repoName} (${repoRoot}) ===`)
          for (const item of items) {
            if (item.name.startsWith('.') && item.name !== '.env.example') continue // skip hidden except .env.example
            entries.push(item.isDirectory() ? `  ${item.name}/` : `  ${item.name}`)
          }
        } catch {
          entries.push(`=== ${repoName} (${repoRoot}) === [unreadable]`)
        }
      }
      return { content: entries.join('\n'), isError: false }
    }

    const absPath = resolveSafePath(repoPaths, targetPath)

    if (!existsSync(absPath)) {
      return { content: `Directory not found: ${targetPath}`, isError: true }
    }

    const stat = statSync(absPath)
    if (!stat.isDirectory()) {
      return { content: `"${targetPath}" is a file, not a directory.`, isError: true }
    }

    const items = readdirSync(absPath, { withFileTypes: true })
    const lines = items
      .filter(item => !item.name.startsWith('.') || item.name === '.env.example')
      .map(item => item.isDirectory() ? `${item.name}/` : item.name)
      .sort((a, b) => {
        // Directories first
        const aDir = a.endsWith('/')
        const bDir = b.endsWith('/')
        if (aDir && !bDir) return -1
        if (!aDir && bDir) return 1
        return a.localeCompare(b)
      })

    console.log(`[FilesystemTools] Listed directory: ${targetPath} (${lines.length} entries)`)
    return { content: lines.join('\n') || '(empty directory)', isError: false }
  } catch (err) {
    return { content: `Error listing directory: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

// =====================
// Public API
// =====================

/**
 * Returns OpenAI-compatible tool definitions for all built-in filesystem tools.
 * These are injected alongside MCP tools in the chat handler.
 */
export function getBuiltinToolDefinitions(_projectId: string): MCPToolDefinition[] {
  // Tool definitions are static — projectId is accepted for future per-project tool filtering
  return TOOL_DEFINITIONS
}

/**
 * Execute a built-in filesystem tool by name.
 * Routes to the appropriate tool implementation and enforces path security.
 *
 * @param toolName — Tool name (e.g., 'cortex_read_file')
 * @param argsJson — Raw JSON string from LLM tool_calls
 * @param projectId — Project ID for repo path resolution
 * @returns Object with content string and isError flag
 */
export async function executeBuiltinTool(
  toolName: string,
  argsJson: string,
  projectId: string
): Promise<{ content: string; isError: boolean }> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson)
  } catch {
    return { content: `Error parsing tool arguments: invalid JSON`, isError: true }
  }

  let repoPaths: string[]
  try {
    repoPaths = getRepoPaths(projectId)
  } catch (err) {
    return { content: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }

  switch (toolName) {
    case 'cortex_read_file':
      return toolReadFile(repoPaths, args as { path: string })

    case 'cortex_write_file':
      return toolWriteFile(repoPaths, args as { path: string; content: string })

    case 'cortex_edit_file':
      return toolEditFile(repoPaths, args as { path: string; old_string: string; new_string: string })

    case 'cortex_list_directory':
      return toolListDirectory(repoPaths, args as { path?: string })

    default:
      return { content: `Unknown builtin tool: ${toolName}`, isError: true }
  }
}
