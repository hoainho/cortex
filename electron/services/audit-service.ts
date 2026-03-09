/**
 * Audit Service — Logs all significant user actions
 *
 * Every action (project create/delete, repo import, chat query, settings change)
 * is logged to audit_logs table for security and traceability.
 */

import { getDb } from './db'

export type AuditEventType =
  | 'project.create'
  | 'project.delete'
  | 'project.rename'
  | 'repo.import'
  | 'repo.sync'
  | 'repo.delete'
  | 'chat.query'
  | 'settings.update'
  | 'settings.test_proxy'
  | 'brain.search'
  | 'brain.analyze'
  | 'brain.export'
  | 'brain.import'
  | 'system.startup'
  | 'system.shutdown'
  | 'system.crash'
  | 'security.prompt_injection'
  | 'updater.check'
  | 'atlassian.import'
  | 'atlassian.sync'
  | 'atlassian.delete'

export interface AuditEntry {
  id: number
  event_type: string
  project_id: string | null
  user_action: string | null
  details: string | null
  created_at: number
}

export function logEvent(
  eventType: AuditEventType,
  projectId?: string | null,
  userAction?: string | null,
  details?: string | null
): void {
  try {
    const db = getDb()
    db.prepare(
      'INSERT INTO audit_logs (event_type, project_id, user_action, details) VALUES (?, ?, ?, ?)'
    ).run(eventType, projectId || null, userAction || null, details || null)
  } catch (err) {
    // Audit logging should never crash the app
    console.error('[Audit] Failed to log event:', err)
  }
}

export function getAuditLog(projectId?: string, limit: number = 100): AuditEntry[] {
  const db = getDb()
  if (projectId) {
    return db
      .prepare(
        'SELECT * FROM audit_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(projectId, limit) as AuditEntry[]
  }
  return db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as AuditEntry[]
}
