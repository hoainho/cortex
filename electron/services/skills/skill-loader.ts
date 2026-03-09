/**
 * Skill Loader — Static skill registration for bundled Electron builds.
 *
 * electron-vite bundles the main process into a single file, so filesystem
 * discovery via __dirname is impossible. All skills are imported explicitly.
 */

import type { CortexSkill } from './types'
import { registerSkill } from './skill-registry'

// Builtin
import { createChatSkill } from './builtin/chat-skill'
import { createRagSkill } from './builtin/rag-skill'
import { createCodeAnalysisSkill } from './builtin/code-analysis-skill'
import { createMemorySkill } from './builtin/memory-skill'
import { createTestGeneratorSkill } from './builtin/test-generator-skill'
import { createDiffReviewSkill } from './builtin/diff-review-skill'
import { createDependencyAuditSkill } from './builtin/dependency-audit-skill'
import { createApiContractSkill } from './builtin/api-contract-skill'

// RAG
import { createGraphRAGSkill } from './rag/graphrag-skill'
import { createRAGFusionSkill } from './rag/rag-fusion-skill'
import { createCrossRepoSearchSkill } from './rag/cross-repo-search-skill'

// Reasoning
import { createReActSkill } from './reasoning/react-skill'
import { createPlanExecuteSkill } from './reasoning/plan-execute-skill'
import { createReflexionSkill } from './reasoning/reflexion-skill'
import { createMigrationPlannerSkill } from './reasoning/migration-planner-skill'

// Agent
import { createPerformanceProfilerSkill } from './agent/performance-profiler-skill'

// Learning
import { createDocumentationSyncSkill } from './learning/documentation-sync-skill'
import { createSmartTrainerSkill } from './learning/smart-trainer-skill'
import { createPreferenceLearnerSkill } from './learning/preference-learner-skill'

// New RAG
import { createSelfRagSkill } from './rag/self-rag-skill'
import { createCragSkill } from './rag/crag-skill'
import { createHydeSkill } from './rag/hyde-skill'

// Efficiency
import { createSemanticCacheSkill } from './efficiency/semantic-cache-skill'
import { createModelRouterSkill } from './efficiency/model-router-skill'

// Memory
import { createSessionMemorySkill } from './memory/session-memory-skill'

// New Builtin
import { createPrReviewSkill } from './builtin/pr-review-skill'
import { createCodeQualitySkill } from './builtin/code-quality-skill'

// MCP (playwright requires runtime config — register separately if needed)
import { createPlaywrightSkill } from './mcp/playwright-adapter'

function getAllSkillFactories(): Array<() => CortexSkill> {
  return [
    createChatSkill,
    createRagSkill,
    createCodeAnalysisSkill,
    createMemorySkill,
    createTestGeneratorSkill,
    createDiffReviewSkill,
    createDependencyAuditSkill,
    createApiContractSkill,
    createGraphRAGSkill,
    createRAGFusionSkill,
    createCrossRepoSearchSkill,
    createReActSkill,
    createPlanExecuteSkill,
    createReflexionSkill,
    createMigrationPlannerSkill,
    createPerformanceProfilerSkill,
    createDocumentationSyncSkill,
    createSmartTrainerSkill,
    createPreferenceLearnerSkill,
    createSelfRagSkill,
    createCragSkill,
    createHydeSkill,
    createSemanticCacheSkill,
    createModelRouterSkill,
    createSessionMemorySkill,
    createPrReviewSkill,
    createCodeQualitySkill,
    createPlaywrightSkill
  ]
}

export async function loadAndRegisterAll(): Promise<number> {
  const factories = getAllSkillFactories()
  let registered = 0

  for (const factory of factories) {
    try {
      const skill = factory()
      const success = await registerSkill(skill)
      if (success) {
        registered++
        console.log(`[SkillLoader] Registered: ${skill.name} v${skill.version}`)
      }
    } catch (err) {
      console.error(`[SkillLoader] Failed to create/register skill from ${factory.name}:`, err)
    }
  }

  console.log(`[SkillLoader] Registered ${registered}/${factories.length} skills`)
  return registered
}