import type { BoulderState, LoopEvent, LoopEventListener } from './types'

const boulders = new Map<string, BoulderState>()
const listeners = new Set<LoopEventListener>()

function emit(event: LoopEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
    }
  }
}

export function saveBoulder(boulder: BoulderState): void {
  boulders.set(boulder.loopId, { ...boulder, updatedAt: Date.now() })
  emit({ type: 'boulder:saved', boulder: { ...boulder } })
}

export function getBoulder(loopId: string): BoulderState | undefined {
  const b = boulders.get(loopId)
  return b ? { ...b } : undefined
}

export function getBoulderBySession(sessionId: string): BoulderState | undefined {
  for (const boulder of boulders.values()) {
    if (boulder.sessionId === sessionId) return { ...boulder }
  }
  return undefined
}

export function getBoulderByProject(projectId: string): BoulderState[] {
  return Array.from(boulders.values())
    .filter(b => b.projectId === projectId)
    .map(b => ({ ...b }))
}

export function updateBoulderCheckpoint(
  loopId: string,
  checkpoint: Record<string, unknown>
): boolean {
  const boulder = boulders.get(loopId)
  if (!boulder) return false
  boulder.checkpoint = { ...boulder.checkpoint, ...checkpoint }
  boulder.updatedAt = Date.now()
  return true
}

export function addModifiedFile(loopId: string, filePath: string): boolean {
  const boulder = boulders.get(loopId)
  if (!boulder) return false
  if (!boulder.filesModified.includes(filePath)) {
    boulder.filesModified.push(filePath)
    boulder.updatedAt = Date.now()
  }
  return true
}

export function updateTodoSnapshot(
  loopId: string,
  todos: Array<{ content: string; status: string; priority: string }>
): boolean {
  const boulder = boulders.get(loopId)
  if (!boulder) return false
  boulder.todoSnapshot = todos.map(t => ({ ...t }))
  boulder.updatedAt = Date.now()
  return true
}

export function restoreBoulder(loopId: string): BoulderState | undefined {
  const boulder = boulders.get(loopId)
  if (!boulder) return undefined
  emit({ type: 'boulder:restored', boulder: { ...boulder } })
  return { ...boulder }
}

export function deleteBoulder(loopId: string): boolean {
  return boulders.delete(loopId)
}

export function getAllBoulders(): BoulderState[] {
  return Array.from(boulders.values()).map(b => ({ ...b }))
}

export function onBoulderEvent(listener: LoopEventListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function resetBoulderState(): void {
  boulders.clear()
  listeners.clear()
}
