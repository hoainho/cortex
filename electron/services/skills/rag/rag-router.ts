/**
 * RAG Router — Selects best RAG strategy for a query
 */
import { hybridSearch } from '../../vector-search'
import { graphSearch } from './graphrag-skill'
import { reciprocalRankFusion, generateQueryVariants } from './rag-fusion-skill'

type RAGStrategy = 'hybrid' | 'graphrag' | 'fusion' | 'contextual'

export function routeRAGQuery(projectId: string, query: string): { strategy: RAGStrategy, confidence: number, reason: string } {
  const lower = query.toLowerCase()

  // Graph keywords
  if (/\b(calls|imports|depends|inherits|uses|connected|relationship|graph)\b/.test(lower)) {
    return { strategy: 'graphrag', confidence: 0.8, reason: 'Query contains relationship keywords' }
  }

  // Complex queries benefit from fusion
  if (query.split(' ').length > 12 || /\b(comprehensive|thorough|detailed|all|everything)\b/.test(lower)) {
    return { strategy: 'fusion', confidence: 0.7, reason: 'Complex query benefits from multi-angle search' }
  }

  // Code understanding queries
  if (/\b(how does|explain|understand|architecture|pattern)\b/.test(lower)) {
    return { strategy: 'contextual', confidence: 0.6, reason: 'Code understanding query benefits from file context' }
  }

  return { strategy: 'hybrid', confidence: 0.5, reason: 'Default hybrid search' }
}

export async function executeRAGPipeline(projectId: string, query: string, strategy?: RAGStrategy): Promise<string> {
  const route = strategy ? { strategy, confidence: 1, reason: 'manual' } : routeRAGQuery(projectId, query)

  try {
    switch (route.strategy) {
      case 'graphrag':
        return await graphSearch(projectId, query, 10) || 'No graph results found.'

      case 'fusion': {
        const variants = generateQueryVariants(query, 3)
        const resultSets = await Promise.all(variants.map(q => hybridSearch(projectId, q, 10)))
        const fused = reciprocalRankFusion(resultSets)
        return fused.slice(0, 10).map(r => `${r.relativePath}: ${r.content.slice(0, 300)}`).join('\n\n') || 'No results.'
      }

      case 'contextual':
      case 'hybrid':
      default: {
        const results = await hybridSearch(projectId, query, 10)
        return results.map(r => `${r.relativePath}: ${r.content.slice(0, 300)}`).join('\n\n') || 'No results.'
      }
    }
  } catch (err) {
    console.error(`[RAGRouter] ${route.strategy} failed, falling back to hybrid:`, err)
    const results = await hybridSearch(projectId, query, 10)
    return results.map(r => `${r.relativePath}: ${r.content.slice(0, 300)}`).join('\n\n') || 'No results.'
  }
}