import { registerAgents } from './agent-orchestrator'
import { reviewAgent } from './specialized/review-agent'
import { securityAgent } from './specialized/security-agent'
import { performanceAgent } from './specialized/performance-agent'
import { implementationAgent } from './specialized/implementation-agent'
import { writerAgent } from './specialized/writer-agent'
import { formatterAgent } from './specialized/formatter-agent'
import { feedbackAgent } from './specialized/feedback-agent'
import { knowledgeCrystallizerAgent } from './specialized/knowledge-crystallizer-agent'
import { sisyphusAgent } from './specialized/sisyphus-agent'
import { hephaestusAgent } from './specialized/hephaestus-agent'
import { prometheusAgent } from './specialized/prometheus-agent'
import { atlasAgent } from './specialized/atlas-agent'

export function loadAndRegisterAllAgents(): void {
  const agents = [
    reviewAgent,
    securityAgent,
    performanceAgent,
    implementationAgent,
    writerAgent,
    formatterAgent,
    feedbackAgent,
    knowledgeCrystallizerAgent,
    sisyphusAgent,
    hephaestusAgent,
    prometheusAgent,
    atlasAgent,
  ]
  registerAgents(agents)
  console.log(`[AgentLoader] Registered ${agents.length} specialized agents`)
}
