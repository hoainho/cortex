/**
 * Validator — Input validation and prompt sanitization
 *
 * Validates user inputs and detects prompt injection attempts.
 */

export function validateProjectName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Tên dự án không được để trống' }
  }
  if (name.length > 100) {
    return { valid: false, error: 'Tên dự án không quá 100 ký tự' }
  }
  if (/[<>:"\/\\|?*]/.test(name)) {
    return { valid: false, error: 'Tên dự án chứa ký tự không hợp lệ' }
  }
  return { valid: true }
}

export function validateGithubUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL không được để trống' }
  }
  const githubPattern = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/
  if (!githubPattern.test(url)) {
    return { valid: false, error: 'URL phải là repository GitHub hợp lệ (https://github.com/owner/repo)' }
  }
  return { valid: true }
}

export function validateGithubToken(token: string): { valid: boolean; error?: string } {
  if (!token || token.trim().length === 0) {
    return { valid: false, error: 'Token không được để trống' }
  }
  // GitHub tokens start with ghp_, gho_, ghu_, ghs_, ghr_
  if (!/^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)/.test(token) && token.length < 20) {
    return { valid: false, error: 'Token GitHub không hợp lệ' }
  }
  return { valid: true }
}

// Prompt injection detection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /###\s*SYSTEM/i,
  /override\s+system/i,
  /forget\s+(all\s+)?instructions/i,
  /act\s+as\s+(if\s+)?you\s+(are|were)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /reveal\s+(your\s+)?system\s+prompt/i,
  /show\s+(your\s+)?instructions/i,
  /what\s+are\s+your\s+instructions/i,
  /output\s+(your\s+)?system/i,
  /repeat\s+(your\s+)?system/i,
  /print\s+(your\s+)?prompt/i
]

export function sanitizePrompt(input: string): { sanitized: string; suspicious: boolean; threats: string[] } {
  const threats: string[] = []

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(pattern.source)
    }
  }

  let sanitized = input

  // Remove common injection wrappers
  sanitized = sanitized.replace(/```system[\s\S]*?```/gi, '[REMOVED]')
  sanitized = sanitized.replace(/\[SYSTEM\][\s\S]*?\[\/SYSTEM\]/gi, '[REMOVED]')
  sanitized = sanitized.replace(/<<SYS>>[\s\S]*?<<\/SYS>>/gi, '[REMOVED]')

  return {
    sanitized,
    suspicious: threats.length > 0,
    threats
  }
}
