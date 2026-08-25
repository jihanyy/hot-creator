export interface UserAIConfig {
  apiKey: string
  baseUrl: string
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null
    if (url.search || url.hash || url.username || url.password) return null
    return value.replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function getUserAIConfig(): UserAIConfig | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const apiKey = params.get('apiKey')?.trim() ?? ''
  const rawBaseUrl = params.get('baseUrl')?.trim() ?? ''
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : null

  if (!apiKey || !baseUrl) return null
  return { apiKey, baseUrl }
}

export function getAIRequestHeaders(config: UserAIConfig | null): Record<string, string> {
  if (!config) return {}

  return {
    'X-HotCreator-AI-Key': config.apiKey,
    'X-HotCreator-AI-Base-Url': config.baseUrl,
  }
}
