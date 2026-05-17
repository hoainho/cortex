export interface DbProject {
  id: string
  name: string
  brain_name: string
  created_at: number
  updated_at: number
  auto_scan_enabled?: number
}

export interface DbRepository {
  id: string
  project_id: string
  source_type: 'local' | 'github' | 'jira' | 'confluence'
  source_path: string
  branch: string
  active_branch: string
  last_indexed_sha: string | null
  last_indexed_at: number | null
  status: 'pending' | 'indexing' | 'ready' | 'error'
  error_message: string | null
  total_files: number
  total_chunks: number
  created_at: number
}

export interface DbChunk {
  id: string
  project_id: string
  repo_id: string
  file_path: string
  relative_path: string
  language: string
  chunk_type: string
  name: string | null
  content: string
  line_start: number
  line_end: number
  token_estimate: number
  dependencies: string
  exports: string
  metadata: string
  embedding: Buffer | null
  branch: string
  created_at: number
}

export interface CoreMemoryRow {
  id: string
  project_id: string
  section: string
  content: string
  updated_at: number
}

export interface ArchivalMemoryRow {
  id: string
  project_id: string
  content: string
  embedding: Buffer | null
  metadata: string
  created_at: number
  accessed_at: number
  access_count: number
  relevance_score: number
}

export interface RecallMemoryRow {
  id: string
  project_id: string
  conversation_id: string
  role: string
  content: string
  embedding: Buffer | null
  timestamp: number
}

export interface GraphNodeRow {
  id: string
  project_id: string
  type: string
  name: string
  file_path: string | null
  start_line: number | null
  end_line: number | null
  content_hash: string | null
  embedding: Buffer | null
  metadata: string | null
}

export interface GraphEdgeRow {
  id: string
  project_id: string
  source_id: string
  target_id: string
  type: string
  weight: number
  metadata: string | null
}
