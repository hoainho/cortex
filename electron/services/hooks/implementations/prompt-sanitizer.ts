import type { HookDefinition, HookContext, HookResult } from '../types'

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\bDAN\b.*mode/i,
  /pretend\s+you\s+are/i,
  /forget\s+(all\s+)?your\s+(instructions|rules)/i,
  /override\s+(your\s+)?(system|instructions)/i,
  /jailbreak/i
]

export const promptSanitizerHook: HookDefinition = {
  id: 'prompt-sanitizer',
  name: 'Prompt Sanitizer',
  description: 'Detects and flags prompt injection attempts',
  trigger: 'before:chat',
  priority: 'critical',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.query) return {}
    const threats: string[] = []
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(context.query)) {
        threats.push(pattern.source)
      }
    }
    if (threats.length > 0) {
      return {
        modified: true,
        data: {
          metadata: {
            ...context.metadata,
            injectionDetected: true,
            threatCount: threats.length
          }
        },
        message: `Detected ${threats.length} potential injection pattern(s)`
      }
    }
    return {}
  }
}
