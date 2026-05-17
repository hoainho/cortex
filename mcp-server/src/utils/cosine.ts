/**
 * Cosine similarity for Float32Array embeddings.
 * Cortex stores embeddings as BLOBs in SQLite (Float32Array, 1024-dim Voyage AI).
 */

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function bufferToFloat32Array(buf: Buffer): Float32Array {
  // Buffer may not be aligned to 4-byte boundary, so copy to aligned ArrayBuffer
  const ab = new ArrayBuffer(buf.byteLength)
  const view = new Uint8Array(ab)
  for (let i = 0; i < buf.byteLength; i++) {
    view[i] = buf[i]
  }
  return new Float32Array(ab)
}
