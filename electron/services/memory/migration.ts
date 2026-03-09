/**
 * Migration — Migrate existing data to new memory system
 * Converts conversations/messages to recall_memory
 * Converts positive feedback to archival_memory
 */

import { getDb } from '../db'
import { randomUUID } from 'crypto'
import { initMemorySchema, migrationStatusQueries, recallMemoryQueries, archivalMemoryQueries } from './memory-db'

interface MigrationResult {
  recallMigrated: number
  archivalMigrated: number
  errors: string[]
}

export function getMigrationStatus(projectId: string): {
  migrated: boolean
  migratedAt: number | null
  recallCount: number
  archivalCount: number
} {
  try {
    const db = getDb()
    const row = migrationStatusQueries.get(db).get(projectId) as {
      project_id: string
      migrated_at: number
      recall_count: number
      archival_count: number
    } | undefined

    if (!row) {
      return { migrated: false, migratedAt: null, recallCount: 0, archivalCount: 0 }
    }

    return {
      migrated: true,
      migratedAt: row.migrated_at,
      recallCount: row.recall_count,
      archivalCount: row.archival_count
    }
  } catch (err) {
    console.error('[Migration] Status check failed:', err)
    return { migrated: false, migratedAt: null, recallCount: 0, archivalCount: 0 }
  }
}

export function migrateFromConversations(projectId: string): { migrated: number, errors: string[] } {
  const db = getDb()
  const errors: string[] = []
  let migrated = 0

  try {
    // Get all messages for this project's conversations
    const messages = db.prepare(`
      SELECT m.id, m.conversation_id, m.role, m.content, m.created_at
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.project_id = ?
      ORDER BY m.created_at ASC
    `).all(projectId) as Array<{
      id: string
      conversation_id: string
      role: string
      content: string
      created_at: number
    }>

    const insertRecall = recallMemoryQueries.insert(db)

    const transaction = db.transaction(() => {
      for (const msg of messages) {
        try {
          const id = randomUUID()
          insertRecall.run(
            id,
            projectId,
            msg.conversation_id,
            msg.role,
            msg.content,
            null, // embedding will be generated later
          )
          migrated++
        } catch (err) {
          errors.push(`Message ${msg.id}: ${String(err)}`)
        }
      }
    })

    transaction()
  } catch (err) {
    errors.push(`Conversation migration failed: ${String(err)}`)
  }

  return { migrated, errors }
}

export function migrateFeedbackToArchival(projectId: string): { migrated: number, errors: string[] } {
  const db = getDb()
  const errors: string[] = []
  let migrated = 0

  try {
    // Get positive feedback signals
    const signals = db.prepare(`
      SELECT fs.query, fs.chunk_ids, fs.signal_type, fs.created_at,
             m.content as answer_content
      FROM feedback_signals fs
      LEFT JOIN messages m ON fs.message_id = m.id
      WHERE fs.project_id = ?
      AND fs.signal_type IN ('thumbs_up', 'copy', 'no_follow_up')
      ORDER BY fs.created_at ASC
    `).all(projectId) as Array<{
      query: string
      chunk_ids: string
      signal_type: string
      created_at: number
      answer_content: string | null
    }>

    const insertArchival = archivalMemoryQueries.insert(db)

    const transaction = db.transaction(() => {
      for (const signal of signals) {
        try {
          const content = signal.answer_content
            ? `Q: ${signal.query}\nA: ${signal.answer_content.slice(0, 500)}`
            : `Useful query: ${signal.query}`

          const metadata = JSON.stringify({
            source: 'feedback_migration',
            type: 'insight',
            signal_type: signal.signal_type,
            tags: ['migrated', 'feedback']
          })

          insertArchival.run(
            randomUUID(),
            projectId,
            content,
            null, // embedding generated later
            metadata
          )
          migrated++
        } catch (err) {
          errors.push(`Feedback signal: ${String(err)}`)
        }
      }
    })

    transaction()
  } catch (err) {
    errors.push(`Feedback migration failed: ${String(err)}`)
  }

  return { migrated, errors }
}

export function runMigration(projectId: string): MigrationResult {
  // Initialize schema first
  initMemorySchema()

  // Check if already migrated
  const status = getMigrationStatus(projectId)
  if (status.migrated) {
    console.log(`[Migration] Project ${projectId} already migrated at ${new Date(status.migratedAt!).toISOString()}`)
    return {
      recallMigrated: status.recallCount,
      archivalMigrated: status.archivalCount,
      errors: []
    }
  }

  console.log(`[Migration] Starting migration for project ${projectId}`)

  // Migrate conversations to recall memory
  const recallResult = migrateFromConversations(projectId)
  console.log(`[Migration] Recall: ${recallResult.migrated} messages migrated`)

  // Migrate feedback to archival memory
  const archivalResult = migrateFeedbackToArchival(projectId)
  console.log(`[Migration] Archival: ${archivalResult.migrated} entries migrated`)

  // Record migration status
  try {
    const db = getDb()
    migrationStatusQueries.upsert(db).run(
      projectId,
      recallResult.migrated,
      archivalResult.migrated
    )
  } catch (err) {
    console.error('[Migration] Failed to record status:', err)
  }

  const allErrors = [...recallResult.errors, ...archivalResult.errors]
  if (allErrors.length > 0) {
    console.warn(`[Migration] Completed with ${allErrors.length} errors:`, allErrors.slice(0, 5))
  }

  return {
    recallMigrated: recallResult.migrated,
    archivalMigrated: archivalResult.migrated,
    errors: allErrors
  }
}