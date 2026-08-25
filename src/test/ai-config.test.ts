import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAIRequestHeaders,
  getUserAIConfig,
} from '../services/ai-config'
import { generateCreative } from '../services/api'

const initialUrl = window.location.href

afterEach(() => {
  window.history.replaceState({}, '', initialUrl)
  vi.unstubAllGlobals()
})

describe('URL AI configuration', () => {
  it('returns no request configuration when URL parameters are absent', () => {
    window.history.replaceState({}, '', '/?step=2')

    const config = getUserAIConfig()

    expect(config).toBeNull()
    expect(getAIRequestHeaders(config)).toEqual({})
  })

  it('reads both parameters and creates request headers', () => {
    window.history.replaceState(
      {},
      '',
      '/?apiKey=test-key&baseUrl=https%3A%2F%2Fai.example.test%2Fv1%2F',
    )

    const config = getUserAIConfig()

    expect(config).toEqual({
      apiKey: 'test-key',
      baseUrl: 'https://ai.example.test/v1',
    })
    expect(getAIRequestHeaders(config)).toEqual({
      'X-HotCreator-AI-Key': 'test-key',
      'X-HotCreator-AI-Base-Url': 'https://ai.example.test/v1',
    })
  })

  it('ignores a baseUrl with a query string or non-http protocol', () => {
    for (const baseUrl of [
      'https%3A%2F%2Fai.example.test%2Fv1%3Ftenant%3Duser',
      'javascript%3Aalert(1)',
    ]) {
      window.history.replaceState({}, '', `/?apiKey=test-key&baseUrl=${baseUrl}`)
      expect(getUserAIConfig()).toBeNull()
    }
  })

  it('adds user headers through the unified AI request without changing the body', async () => {
    const hotspot = {
      title: 'test hotspot',
      summary: 'test summary',
      platform: '微博' as const,
      rank: 1,
      hotScore: 100,
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ id: 'creative-1', title: 'title', description: 'description' }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(
      {},
      '',
      '/?apiKey=test-key&baseUrl=https%3A%2F%2Fai.example.test%2Fv1',
    )

    await generateCreative(hotspot, [{ id: 'interest-1', name: 'test interest' }])

    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-HotCreator-AI-Key': 'test-key',
      'X-HotCreator-AI-Base-Url': 'https://ai.example.test/v1',
    })
    expect(JSON.parse(String(request.body))).toEqual({
      hotspot,
      interests: ['test interest'],
      batchIndex: 0,
    })
  })
})
