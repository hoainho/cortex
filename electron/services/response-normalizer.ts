const CODE_HARD_PATTERN = /^(import |export |const |let |var |async |await |function |class |return |if \(|for \(|while \(|switch \(|#!\/|<\?php|package |use strict|def |print\(|echo |SELECT |INSERT |UPDATE |DELETE |FROM |WHERE )/m
const TREE_CHARS_PATTERN = /[├└│─┌┐┘┤┬┴┼]/

function scoreBlock(text: string): number {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) return 0

  const chars = text.replace(/\s/g, '')
  const totalChars = chars.length || 1
  const alphaCount = (text.match(/[a-zA-ZÀ-ỹ\u00C0-\u024F\u1E00-\u1EFF]/g) ?? []).length
  const specialCount = (text.match(/[{}[\]()=><|&^%$#*;]/g) ?? []).length
  const words: string[] = text.match(/[a-zA-ZÀ-ỹ\u00C0-\u024F]+/g) ?? []
  const avgWordLen = words.length ? words.reduce((s: number, w: string) => s + w.length, 0) / words.length : 0
  const sentencePunct = (text.match(/[.!?]/g) ?? []).length / (words.length || 1)
  const lineLengths = lines.map(l => l.length)
  const avgLen = lineLengths.reduce((s, n) => s + n, 0) / lineLengths.length
  const variance = lineLengths.reduce((s, n) => s + Math.abs(n - avgLen), 0) / lineLengths.length
  const hasSentences = lines.filter(l => /[.!?]\s*$/.test(l.trim()) && l.trim().length > 20).length >= 2

  const scores = [
    (alphaCount / totalChars) > 0.72 ? 1 : (alphaCount / totalChars) > 0.60 ? 0.5 : 0,
    (specialCount / totalChars) < 0.04 ? 1 : (specialCount / totalChars) < 0.08 ? 0.5 : 0,
    avgWordLen < 6 ? 1 : avgWordLen < 8 ? 0.5 : 0,
    variance > 12 ? 1 : variance > 6 ? 0.5 : 0,
    sentencePunct > 0.05 ? 1 : sentencePunct > 0.02 ? 0.5 : 0,
    hasSentences ? 1 : 0,
  ]

  return scores.reduce((s, n) => s + n, 0) / scores.length
}

const MARKDOWN_STRUCTURAL = /^(#{1,6}\s|```|~~~|---|\*\*\*|___|\|.*\|)/m

function isProseBlock(body: string): boolean {
  const text = body.trim()
  if (!text) return false
  if (TREE_CHARS_PATTERN.test(text)) return false
  if (CODE_HARD_PATTERN.test(text)) return false
  if (MARKDOWN_STRUCTURAL.test(text)) return false
  return scoreBlock(text) >= 0.55
}

export function normalizeResponseFences(content: string): string {
  return content.replace(/^```[ \t]*\r?\n([\s\S]*?)^```/gm, (match, body: string) => {
    if (isProseBlock(body)) {
      return '```text\n' + body + '```'
    }
    return match
  })
}
