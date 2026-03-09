/**
 * Vector search tests — focuses on the cosine similarity math
 * and buffer conversion logic since hybridSearch requires a live DB.
 *
 * We replicate the internal pure functions here for direct testing.
 */

// Replica of the internal cosineSimilarity function
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

// Replica of the internal bufferToFloatArray function
function bufferToFloatArray(buffer: Buffer): number[] {
  if (!buffer || buffer.length === 0) return []
  const float32 = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  )
  return Array.from(float32)
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4, 5]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 for different length vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0)
  })

  it('returns high similarity for similar vectors', () => {
    const a = [1, 2, 3, 4, 5]
    const b = [1.1, 2.1, 3.1, 4.1, 5.1]
    const score = cosineSimilarity(a, b)
    expect(score).toBeGreaterThan(0.99)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('returns moderate similarity for somewhat similar vectors', () => {
    const a = [1, 0, 1, 0]
    const b = [1, 1, 0, 0]
    const score = cosineSimilarity(a, b)
    expect(score).toBeGreaterThan(0.3)
    expect(score).toBeLessThan(0.8)
  })

  it('is symmetric', () => {
    const a = [1, 3, 5, 7]
    const b = [2, 4, 6, 8]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10)
  })

  it('handles single-element vectors', () => {
    expect(cosineSimilarity([5], [5])).toBeCloseTo(1, 5)
    expect(cosineSimilarity([5], [-5])).toBeCloseTo(-1, 5)
  })

  it('handles large dimension vectors', () => {
    const dim = 1536 // same as text-embedding-3-small
    const a = Array.from({ length: dim }, () => Math.random())
    const b = Array.from({ length: dim }, () => Math.random())
    const score = cosineSimilarity(a, b)
    expect(score).toBeGreaterThan(-1)
    expect(score).toBeLessThan(1)
  })
})

describe('bufferToFloatArray', () => {
  it('converts Float32Array buffer to number array', () => {
    const floats = new Float32Array([1.5, 2.5, 3.5])
    const buf = Buffer.from(floats.buffer)
    const result = bufferToFloatArray(buf)
    expect(result).toHaveLength(3)
    expect(result[0]).toBeCloseTo(1.5)
    expect(result[1]).toBeCloseTo(2.5)
    expect(result[2]).toBeCloseTo(3.5)
  })

  it('returns empty array for null buffer', () => {
    expect(bufferToFloatArray(null as unknown as Buffer)).toEqual([])
  })

  it('returns empty array for empty buffer', () => {
    expect(bufferToFloatArray(Buffer.alloc(0))).toEqual([])
  })

  it('handles single float', () => {
    const floats = new Float32Array([42.0])
    const buf = Buffer.from(floats.buffer)
    const result = bufferToFloatArray(buf)
    expect(result).toHaveLength(1)
    expect(result[0]).toBeCloseTo(42.0)
  })

  it('preserves precision for typical embedding values', () => {
    const values = [0.0234, -0.0567, 0.1234, -0.9876]
    const floats = new Float32Array(values)
    const buf = Buffer.from(floats.buffer)
    const result = bufferToFloatArray(buf)
    for (let i = 0; i < values.length; i++) {
      expect(result[i]).toBeCloseTo(values[i], 3)
    }
  })

  it('round-trips through Float32Array correctly', () => {
    const original = [0.1, 0.2, 0.3, 0.4, 0.5]
    const floats = new Float32Array(original)
    const buf = Buffer.from(floats.buffer)
    const result = bufferToFloatArray(buf)
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBeCloseTo(original[i], 5)
    }
  })
})
