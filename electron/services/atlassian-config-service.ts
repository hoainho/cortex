/**
 * Atlassian Config Service — Per-project Atlassian configuration
 *
 * Each project can have its own Jira/Confluence site URL, email, and API token.
 * API tokens are encrypted using Electron's safeStorage.
 */

import { safeStorage } from 'electron'
import { getDb, atlassianConfigQueries, type DbProjectAtlassianConfig } from './db'
import { randomUUID } from 'crypto'

export interface ProjectAtlassianConfig {
  siteUrl: string
  email: string
  apiToken: string
}

export function getProjectAtlassianConfig(projectId: string): ProjectAtlassianConfig | null {
  const db = getDb()
  const row = atlassianConfigQueries.getByProject(db).get(projectId) as DbProjectAtlassianConfig | undefined
  if (!row) return null

  let apiToken: string
  try {
    if (safeStorage.isEncryptionAvailable()) {
      apiToken = safeStorage.decryptString(Buffer.from(row.api_token_encrypted, 'base64'))
    } else {
      apiToken = row.api_token_encrypted
    }
  } catch {
    return null
  }

  return {
    siteUrl: row.site_url,
    email: row.email,
    apiToken
  }
}

export function setProjectAtlassianConfig(
  projectId: string,
  siteUrl: string,
  email: string,
  apiToken: string
): void {
  const db = getDb()

  let encryptedToken: string
  if (safeStorage.isEncryptionAvailable()) {
    encryptedToken = safeStorage.encryptString(apiToken).toString('base64')
  } else {
    encryptedToken = apiToken
  }

  const id = randomUUID()
  atlassianConfigQueries.upsert(db).run(id, projectId, siteUrl, email, encryptedToken, Date.now())
}

export function clearProjectAtlassianConfig(projectId: string): void {
  const db = getDb()
  atlassianConfigQueries.deleteByProject(db).run(projectId)
}

export function hasProjectAtlassianConfig(projectId: string): boolean {
  const db = getDb()
  const row = atlassianConfigQueries.getByProject(db).get(projectId) as DbProjectAtlassianConfig | undefined
  return !!row
}
