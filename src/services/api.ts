import {
  applyHotspotReasons,
  rankHotspots,
  selectHotspotCandidates,
} from './hotspot-ranking'
import type { HotspotAssessment, HotspotReason } from './hotspot-ranking'
import {
  getAIRequestHeaders,
  getUserAIConfig,
} from './ai-config'
import { createPublishTimeRecommendation } from './publish-time'
import type {
  Creative,
  CreativeSelection,
  Hotspot,
  HotspotPlatform,
  Interest,
  Prompt,
  Script,
  Storyboard,
  VideoConfig,
} from '../types/workflow'

const HOTSPOT_REQUEST_TIMEOUT = 15_000
const HOTSPOT_AI_REQUEST_TIMEOUT = 180_000
const HOTSPOT_AI_CANDIDATE_LIMIT = 21
export const HOTSPOT_RELEVANCE_THRESHOLD = 20
const HOTSPOT_RANKING_CACHE_TTL = 5 * 60 * 1000
const AI_REQUEST_TIMEOUT = 180_000
const HOTSPOT_API_PATH = '/api/hotspots'
export const HOTSPOT_DATA_ERROR_MESSAGE = '热点数据获取失败，请前往热点信息页面查看热点后重试。'
export const HOTSPOT_AI_ERROR_MESSAGE = 'AI筛选暂时失败，请稍后重试。'
export const HOTSPOT_EMPTY_MESSAGE = '暂时没有找到与当前领域足够相关的热点，可以换一批或调整关注领域。'
export const HOTSPOT_NO_MORE_MESSAGE = '暂时没有更多符合条件的热点。'
export const AI_ERROR_MESSAGE = 'AI服务暂时不可用，请稍后重试'
const HOTSPOT_PLATFORMS: HotspotPlatform[] = [
  '微博',
  '抖音',
  '小红书',
  '百度',
  '腾讯',
  '头条',
  '全网',
]
const HOTSPOT_PLATFORM_SET = new Set<HotspotPlatform>(HOTSPOT_PLATFORMS)
const HOTSPOT_BATCH_SIZE = HOTSPOT_PLATFORMS.length

let pendingHotspotRequest: Promise<Hotspot[]> | null = null
const pendingAIRequests = new Map<string, Promise<unknown>>()
let hotspotRankingCache: {
  key: string
  expiresAt: number
  data: Hotspot[]
} | null = null
const hotspotReasonCache = new Map<string, { expiresAt: number; data: Hotspot[] }>()

export class AIRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AIRequestError'
    this.status = status
    this.code = code
  }
}

export function getAIErrorMessage(error: unknown): string {
  return error instanceof AIRequestError && error.message.trim()
    ? error.message
    : AI_ERROR_MESSAGE
}

function getHotspotPage(hotspots: Hotspot[], batchIndex: number): Hotspot[] {
  const start = Math.max(0, Math.trunc(batchIndex)) * HOTSPOT_BATCH_SIZE
  return hotspots.slice(start, start + HOTSPOT_BATCH_SIZE).map((hotspot) => ({ ...hotspot }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHotspotPlatform(value: unknown): value is HotspotPlatform {
  return typeof value === 'string' && HOTSPOT_PLATFORM_SET.has(value as HotspotPlatform)
}

function hasStringFields(record: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof record[field] === 'string' && record[field].trim() !== '')
}

function parseCreativeResponse(payload: unknown): Creative[] {
  if (!Array.isArray(payload)) throw new Error('Creative API returned a non-array response')
  const creatives = payload.filter(
    (item): item is Creative =>
      isRecord(item) && hasStringFields(item, ['id', 'title', 'description']),
  )
  if (creatives.length === 0) throw new Error('Creative API returned no usable data')
  return creatives
}

function parseScriptResponse(payload: unknown): Script[] {
  if (!Array.isArray(payload)) throw new Error('Script API returned a non-array response')
  const scripts = payload.flatMap((item): Script[] => {
    if (!isRecord(item) || !hasStringFields(item, ['id', 'title', 'hook', 'body', 'ending'])) {
      return []
    }
    return [{
      id: item.id as string,
      title: item.title as string,
      hook: item.hook as string,
      body: item.body as string,
      ending: item.ending as string,
    }]
  })
  if (scripts.length === 0) throw new Error('Script API returned no usable data')
  return scripts
}

function parseStoryboardResponse(payload: unknown): Storyboard[] {
  if (!Array.isArray(payload)) throw new Error('Storyboard API returned a non-array response')
  const storyboards = payload.filter(
    (item): item is Storyboard =>
      isRecord(item) &&
      typeof item.shotNumber === 'number' &&
      Number.isFinite(item.shotNumber) &&
      hasStringFields(item, [
        'id',
        'duration',
        'visualDescription',
        'narration',
        'shootingAdvice',
        'imagePrompt',
        'videoPrompt',
      ]),
  )
  if (storyboards.length === 0) throw new Error('Storyboard API returned no usable data')
  return storyboards
}

function parsePromptResponse(payload: unknown): Prompt[] {
  if (!Array.isArray(payload)) throw new Error('Prompt API returned a non-array response')
  const prompts = payload.filter((item): item is Prompt => {
    if (
      !isRecord(item) ||
      typeof item.shotNumber !== 'number' ||
      !Number.isFinite(item.shotNumber) ||
      !hasStringFields(item, ['id', 'imagePrompt']) ||
      !isRecord(item.videoPrompt)
    ) {
      return false
    }

    return hasStringFields(item.videoPrompt, [
      'sceneDescription',
      'characterAction',
      'cameraMovement',
      'videoStyle',
      'timing',
      'fullPrompt',
    ])
  })
  if (prompts.length === 0) throw new Error('Prompt API returned no usable data')
  return prompts
}

function parseVideoConfigResponse(payload: unknown): VideoConfig {
  if (
    !isRecord(payload) ||
    !hasStringFields(payload, ['ratio', 'duration', 'style', 'shotCount', 'source']) ||
    !['ai', 'chat'].includes(payload.source as string)
  ) {
    throw new Error('Video config API returned no usable data')
  }

  return {
    ratio: payload.ratio as string,
    duration: payload.duration as string,
    style: payload.style as string,
    shotCount: payload.shotCount as string,
    source: payload.source as 'ai' | 'chat',
    instruction: typeof payload.instruction === 'string' ? payload.instruction : undefined,
  }
}

function parseHotspotAssessmentResponse(payload: unknown): HotspotAssessment[] {
  if (!Array.isArray(payload)) throw new Error('Hotspot ranking API returned a non-array response')

  const normalizeScore = (value: unknown): number | null => {
    if (value === null || typeof value === 'boolean') return null
    const candidate = typeof value === 'string'
      ? value.trim().replace(/%$/, '').trim()
      : value
    if (candidate === '') return null
    const score = typeof candidate === 'number' ? candidate : Number(candidate)
    if (!Number.isFinite(score) || score < 0 || score > 100) return null
    return Math.round(score)
  }

  const assessments = payload.map((item): HotspotAssessment => {
    if (!isRecord(item) || typeof item.index !== 'number' || !Number.isInteger(item.index)) {
      throw new Error('Hotspot ranking API returned an invalid index')
    }
    const relevance = normalizeScore(
      item.relevance ?? item.relevance_score ?? item.relevanceScore,
    )
    const businessValue = normalizeScore(item.businessValue)
    const creativeValue = normalizeScore(item.creativeValue)
    if (relevance === null || businessValue === null || creativeValue === null) {
      throw new Error('Hotspot ranking API returned an invalid score')
    }
    return { index: item.index, relevance, businessValue, creativeValue }
  })

  return assessments
}

function parseHotspotReasonResponse(payload: unknown): HotspotReason[] {
  if (!Array.isArray(payload)) throw new Error('Hotspot reason API returned a non-array response')

  const reasons = payload.filter(
    (item): item is HotspotReason =>
      isRecord(item) &&
      typeof item.index === 'number' &&
      Number.isInteger(item.index) &&
      typeof item.reason === 'string' &&
      item.reason.trim() !== '',
  )
  return reasons
}

async function requestAI<T>(
  path: string,
  body: Record<string, unknown>,
  parse: (payload: unknown) => T,
  timeoutMs = AI_REQUEST_TIMEOUT,
  externalSignal?: AbortSignal,
): Promise<T> {
  const serializedBody = JSON.stringify(body)
  const aiConfig = getUserAIConfig()
  const requestKey = aiConfig || externalSignal ? null : `${path}:${serializedBody}`
  const pendingRequest = requestKey ? pendingAIRequests.get(requestKey) : undefined
  if (pendingRequest) return pendingRequest as Promise<T>

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const abortRequest = () => controller.abort()
  if (externalSignal?.aborted) {
    controller.abort()
  } else {
    externalSignal?.addEventListener('abort', abortRequest, { once: true })
  }

  const request = (async () => {
    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getAIRequestHeaders(aiConfig),
      }
      const response = await fetch(path, {
        method: 'POST',
        headers,
        body: serializedBody,
        signal: controller.signal,
      })

      if (!response.ok) {
        let message = AI_ERROR_MESSAGE
        let code: string | undefined
        try {
          const errorPayload: unknown = await response.json()
          if (isRecord(errorPayload)) {
            const detail = errorPayload.detail
            if (isRecord(detail)) {
              if (typeof detail.message === 'string' && detail.message.trim()) message = detail.message
              if (typeof detail.code === 'string') code = detail.code
            } else if (typeof detail === 'string' && detail.trim()) {
              message = detail
            }
          }
        } catch {
          // Keep the safe public error message when the backend response is not JSON.
        }
        if (response.status === 503) message = AI_ERROR_MESSAGE
        throw new AIRequestError(message, response.status, code)
      }
      const payload: unknown = await response.json()
      if (path === '/api/ai/hotspot-ranking' || path === '/api/ai/hotspot-reasons') {
        console.info('[Step2][AI评分] 原始返回：', payload)
      }
      try {
        return parse(payload)
      } catch (error) {
        throw new AIRequestError('AI 未返回可用结果，请重试。', 502, 'invalid_response', { cause: error })
      }
    } catch (error) {
      if (error instanceof AIRequestError) throw error
      const isTimeout = error instanceof DOMException && error.name === 'AbortError'
      throw new AIRequestError(
        isTimeout ? 'AI 服务响应超时，请稍后重试。' : AI_ERROR_MESSAGE,
        isTimeout ? 504 : 0,
        isTimeout ? 'timeout' : 'network_error',
        { cause: error },
      )
    }
  })().finally(() => {
    globalThis.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortRequest)
    if (requestKey) pendingAIRequests.delete(requestKey)
  })

  if (requestKey) pendingAIRequests.set(requestKey, request)
  return request
}

function parseHotspotResponse(payload: unknown): Hotspot[] {
  if (!Array.isArray(payload)) throw new Error('Hotspot API returned a non-array response')

  const hotspots = payload.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.title !== 'string' ||
      typeof item.summary !== 'string' ||
      !isHotspotPlatform(item.platform) ||
      typeof item.rank !== 'number' ||
      !Number.isFinite(item.rank) ||
      typeof item.hotScore !== 'number' ||
      !Number.isFinite(item.hotScore)
    ) {
      return []
    }

    return [
      {
        title: item.title,
        summary: item.summary,
        platform: item.platform,
        rank: item.rank,
        hotScore: item.hotScore,
      },
    ]
  })

  if (hotspots.length === 0) throw new Error('Hotspot API returned no usable data')
  return hotspots
}

async function requestBackendHotspots(signal: AbortSignal): Promise<Hotspot[]> {
  const response = await fetch(HOTSPOT_API_PATH, {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Hotspot API request failed with HTTP ${response.status}`)
  }

  return parseHotspotResponse(await response.json())
}

async function loadBackendHotspots(): Promise<Hotspot[]> {
  if (pendingHotspotRequest) return pendingHotspotRequest

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), HOTSPOT_REQUEST_TIMEOUT)

  pendingHotspotRequest = requestBackendHotspots(controller.signal)
    .finally(() => {
      globalThis.clearTimeout(timeoutId)
      pendingHotspotRequest = null
    })

  return pendingHotspotRequest
}

export async function getHotspots(
  interests: Interest[] = [],
  batchIndex = 0,
  signal?: AbortSignal,
): Promise<Hotspot[]> {
  let liveHotspots: Hotspot[]
  try {
    liveHotspots = await loadBackendHotspots()
  } catch (error) {
    console.error('[Step2][HotData数据] 真实热点获取失败。', error)
    throw new Error(HOTSPOT_DATA_ERROR_MESSAGE, { cause: error })
  }

  if (signal?.aborted) {
    throw new DOMException('Hotspot recommendation request was aborted', 'AbortError')
  }

  console.log('[Step2] /api/hotspots 解析成功，热点数量：', liveHotspots.length)
  console.info('[Step2][HotData数据] 热点数量：', liveHotspots.length)
  const interestKey = interests.map((interest) => interest.name).sort().join('|')
  const sourceKey = liveHotspots
    .map((hotspot) => `${hotspot.title}:${hotspot.hotScore}`)
    .join('|')
  const cacheKey = `${interestKey}:${sourceKey}`
  const candidates = selectHotspotCandidates(
    liveHotspots,
    interests,
    HOTSPOT_AI_CANDIDATE_LIMIT,
  )
  console.info('[Step2][过滤前] 候选热点数量：', candidates.length)

  let rankedHotspots: Hotspot[]
  if (hotspotRankingCache?.key === cacheKey && hotspotRankingCache.expiresAt > Date.now()) {
    console.log('[Step2] 使用 hotspot-ranking 缓存，热点数量：', hotspotRankingCache.data.length)
    rankedHotspots = hotspotRankingCache.data
  } else {
    console.log('准备调用 hotspot-ranking', '发送热点数量：', candidates.length)
    const assessments = await requestAI(
      '/api/ai/hotspot-ranking',
      {
        interests: interests.map((interest) => interest.name),
        hotspots: candidates,
      },
      parseHotspotAssessmentResponse,
      HOTSPOT_AI_REQUEST_TIMEOUT,
      signal,
    )
    const assessedHotspots = rankHotspots(candidates, interests, assessments)
    rankedHotspots = assessedHotspots.filter(
      (hotspot) => (hotspot.relevanceScore ?? 0) >= HOTSPOT_RELEVANCE_THRESHOLD,
    )
    console.info('[Step2][过滤后] 热点数量：', rankedHotspots.length)
    console.table(
      assessedHotspots.map((hotspot) => ({
        title: hotspot.title,
        relevanceScore: hotspot.relevanceScore,
        businessValue: hotspot.businessValueScore,
        creativeValue: hotspot.creativeValueScore,
        finalScore: hotspot.recommendationIndex,
        是否通过过滤:
          (hotspot.relevanceScore ?? 0) >= HOTSPOT_RELEVANCE_THRESHOLD ? '是' : '否',
      })),
    )
    hotspotRankingCache = {
      key: cacheKey,
      expiresAt: Date.now() + HOTSPOT_RANKING_CACHE_TTL,
      data: rankedHotspots,
    }
  }

  const page = getHotspotPage(rankedHotspots, batchIndex)
  console.info('[Step2][前端展示] 当前分页热点数量：', page.length)
  if (page.length === 0) return page

  const reasonKey = `${cacheKey}:${page
    .map((hotspot) => `${hotspot.title}:${hotspot.recommendationIndex}`)
    .join('|')}`
  const cachedReasons = hotspotReasonCache.get(reasonKey)
  if (cachedReasons && cachedReasons.expiresAt > Date.now()) {
    return cachedReasons.data.map((hotspot) => ({ ...hotspot }))
  }

  let reasons: HotspotReason[]
  try {
    reasons = await requestAI(
      '/api/ai/hotspot-reasons',
      {
        interests: interests.map((interest) => interest.name),
        hotspots: page.map((hotspot, index) => ({
          index,
          title: hotspot.title,
          summary: hotspot.summary,
          relevance: hotspot.relevanceScore ?? 0,
          businessValue: hotspot.businessValueScore ?? 0,
          creativeValue: hotspot.creativeValueScore ?? 0,
          finalScore: hotspot.recommendationIndex ?? 0,
        })),
      },
      parseHotspotReasonResponse,
      HOTSPOT_AI_REQUEST_TIMEOUT,
      signal,
    )
  } catch (error) {
    console.warn('[Step2][推荐原因] 请求失败，保留已筛选热点', error)
    return page
  }
  const explainedPage = applyHotspotReasons(page, interests, reasons)
  hotspotReasonCache.set(reasonKey, {
    expiresAt: Date.now() + HOTSPOT_RANKING_CACHE_TTL,
    data: explainedPage,
  })
  return explainedPage
}

export async function generateCreative(
  hotspot: Hotspot,
  interests: Interest[],
  batchIndex = 0,
  instruction?: string,
  currentCreatives?: Creative[],
): Promise<Creative[]> {
  const generatedCreatives = await requestAI(
    '/api/ai/creative',
    {
      hotspot,
      interests: interests.map((interest) => interest.name),
      batchIndex,
      instruction,
      currentCreatives,
    },
    parseCreativeResponse,
  )
  if (instruction && currentCreatives) {
    const contentSignature = (creatives: Creative[]) => JSON.stringify(
      creatives
        .map(({ title, description }) => ({ title: title.trim(), description: description.trim() }))
        .sort((left, right) => left.title.localeCompare(right.title)),
    )
    if (contentSignature(generatedCreatives) === contentSignature(currentCreatives)) {
      throw new AIRequestError('AI 未修改创意方案，请重试。', 502, 'unchanged_response')
    }
  }
  return generatedCreatives
}

export function getPublishTimeRecommendation(hotspot: Hotspot) {
  return createPublishTimeRecommendation(hotspot)
}

export function getEmptyVideoConfig(): VideoConfig {
  return {
    ratio: '',
    duration: '',
    style: '',
    shotCount: '',
    source: 'manual',
  }
}

export async function generateVideoConfig(
  script: Script,
  instruction?: string,
  currentConfig?: VideoConfig,
): Promise<VideoConfig> {
  const generatedConfig = await requestAI(
    '/api/ai/video-config',
    {
      script,
      instruction,
      currentConfig,
    },
    parseVideoConfigResponse,
  )
  if (
    instruction &&
    currentConfig &&
    ['ratio', 'duration', 'style', 'shotCount'].every(
      (field) => generatedConfig[field as keyof VideoConfig] === currentConfig[field as keyof VideoConfig],
    )
  ) {
    throw new AIRequestError('AI 未修改视频参数，请重试。', 502, 'unchanged_response')
  }
  return generatedConfig
}

export async function generateScript(
  creativeSelection: CreativeSelection,
  instruction?: string,
  currentScript?: Script,
): Promise<Script[]> {
  const { hotspot, industry, idea: creativeIdea, videoStyle } = creativeSelection
  const generatedScripts = await requestAI(
    '/api/ai/script',
    {
      hotspot,
      industry,
      creativeIdea,
      videoStyle,
      instruction,
      currentScript,
    },
    parseScriptResponse,
  )
  if (currentScript && instruction) {
    const modifiedScript = generatedScripts[0]
    const fields: Array<keyof Pick<Script, 'title' | 'hook' | 'body' | 'ending'>> = [
      'title',
      'hook',
      'body',
      'ending',
    ]
    if (
      !modifiedScript ||
      fields.some((field) => modifiedScript[field].trim() === currentScript[field].trim())
    ) {
      throw new AIRequestError('AI 未返回完整修改结果，请重试。', 502, 'invalid_response')
    }
  }
  return generatedScripts
}

export async function generateStoryboard(
  script: Script,
  videoConfig: VideoConfig,
  batchIndex = 0,
  instruction?: string,
  currentStoryboards?: Storyboard[],
): Promise<Storyboard[]> {
  const generatedStoryboards = await requestAI(
    '/api/ai/storyboard',
    {
      script,
      videoConfig: {
        ratio: videoConfig.ratio,
        duration: videoConfig.duration,
        style: videoConfig.style,
        shotCount: videoConfig.shotCount,
      },
      batchIndex,
      instruction,
      currentStoryboards,
    },
    parseStoryboardResponse,
  )
  if (instruction && currentStoryboards) {
    const contentSignature = (items: Storyboard[]) => JSON.stringify(items.map((item) => [
      item.shotNumber,
      item.duration,
      item.visualDescription,
      item.narration,
      item.shootingAdvice,
      item.imagePrompt,
      item.videoPrompt,
    ]))
    if (contentSignature(generatedStoryboards) === contentSignature(currentStoryboards)) {
      throw new AIRequestError('AI 未修改分镜内容，请重试。', 502, 'unchanged_response')
    }
  }
  return generatedStoryboards
}

export async function generatePrompt(
  storyboards: Storyboard[],
  _videoConfig: VideoConfig,
  instruction?: string,
  currentPrompts?: Prompt[],
): Promise<Prompt[]> {
  const generatedPrompts = await requestAI(
    '/api/ai/prompt',
    {
      storyboards,
      instruction,
      currentPrompts,
    },
    parsePromptResponse,
  )
  if (instruction && currentPrompts) {
    const contentSignature = (items: Prompt[]) => JSON.stringify(items.map((item) => [
      item.shotNumber,
      item.imagePrompt,
      item.videoPrompt.sceneDescription,
      item.videoPrompt.characterAction,
      item.videoPrompt.cameraMovement,
      item.videoPrompt.videoStyle,
      item.videoPrompt.timing,
      item.videoPrompt.fullPrompt,
    ]))
    if (contentSignature(generatedPrompts) === contentSignature(currentPrompts)) {
      throw new AIRequestError('AI 未修改 Prompt 内容，请重试。', 502, 'unchanged_response')
    }
  }
  return generatedPrompts
}
