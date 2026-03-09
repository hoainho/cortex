import { randomUUID } from 'crypto'
import { getProxyUrl, getProxyKey } from '../settings-service'
import type { AgentOutput, KnowledgeCrystal, CrystalType } from '../agents/types'

const EXTRACTION_MODEL = 'gemini-2.5-flash-lite'

const EXTRACTION_PROMPT = `You are a Knowledge Extractor. Analyze the user query and agent responses below, then extract reusable knowledge crystals.

Extract these types:
- "decision": Architectural or design decisions with rationale
- "pattern": Reusable code patterns discovered
- "insight": Deep understanding about codebase or technology
- "error_fix": Error diagnosis and fix procedures
- "code_pattern": Specific code idioms or conventions
- "concept": Technical concepts explained
- "architecture": System design insights
- "preference": User preferences for style/tools

Return a JSON array:
[{"crystalType":"...","content":"...","summary":"one-line","confidence":0.0-1.0,"domain":"frontend|backend|database|devops|architecture|general","tags":["tag1","tag2"]}]

Rules:
- Only genuinely useful, reusable knowledge
- Skip trivial or query-specific information
- If nothing worth crystallizing, return []`

export async function extractCrystals(
  projectId: string,
  query: string,
  agentOutputs: AgentOutput[],
  responseId?: string
): Promise<KnowledgeCrystal[]> {
  const completedOutputs = agentOutputs.filter(o => o.status === 'completed')
  if (completedOutputs.length === 0) return []

  const agentSummary = completedOutputs
    .map(o => `[${o.role}]: ${o.content.slice(0, 1500)}`)
    .join('\n\n---\n\n')

  const userMessage = `USER QUERY: ${query}\n\nAGENT RESPONSES:\n${agentSummary}`

  try {
    const response = await fetch(`${getProxyUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getProxyKey()}`
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: userMessage }
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: 1536
      })
    })

    if (!response.ok) {
      console.error(`[CrystalExtractor] LLM error ${response.status}`)
      return []
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const content = data.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      crystalType: string
      content: string
      summary: string
      confidence: number
      domain: string
      tags: string[]
    }>

    if (!Array.isArray(parsed)) return []

    const validTypes: CrystalType[] = ['decision', 'pattern', 'insight', 'error_fix', 'code_pattern', 'concept', 'architecture', 'preference']
    const now = Date.now()

    const crystals: KnowledgeCrystal[] = parsed
      .filter(c => c.crystalType && c.content && c.summary && typeof c.confidence === 'number')
      .filter(c => validTypes.includes(c.crystalType as CrystalType))
      .map(c => ({
        id: randomUUID(),
        projectId,
        sourceResponseId: responseId,
        sourceAgent: undefined,
        crystalType: c.crystalType as CrystalType,
        content: c.content,
        summary: c.summary,
        confidence: Math.max(0, Math.min(1, c.confidence)),
        domain: c.domain || undefined,
        tags: Array.isArray(c.tags) ? c.tags : [],
        embedding: null,
        relatedCrystals: [],
        archivalMemoryId: undefined,
        graphNodeIds: [],
        accessCount: 0,
        reinforcementCount: 1,
        createdAt: now,
        lastReinforcedAt: now
      }))

    console.log(`[CrystalExtractor] Extracted ${crystals.length} crystals from ${completedOutputs.length} agent outputs`)
    return crystals
  } catch (err) {
    console.error('[CrystalExtractor] Extraction failed:', err)
    return []
  }
}
