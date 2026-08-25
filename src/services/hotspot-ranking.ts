import type { Hotspot, Interest } from '../types/workflow'

export interface HotspotAssessment {
  index: number
  relevance: number
  businessValue: number
  creativeValue: number
}

export interface HotspotReason {
  index: number
  reason: string
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  电商零售: [
    '商品', '消费趋势', '消费', '电商平台', '电商', '平台', '品牌营销', '品牌',
    '营销', '新消费', '购物行为', '购物', '价格变化', '价格', '零售', '促销',
  ],
  餐饮: [
    '餐厅', '食品', '菜品', '餐饮消费', '餐饮', '门店经营', '门店', '餐饮趋势',
    '菜单', '咖啡店', '饭店', '外卖', '晚餐',
  ],
  酒店民宿: [
    '酒店', '住宿', '旅游', '出行消费', '出行', '民宿', '旅行', '客房', '度假',
  ],
  教育: [
    '教育政策', '教育', '学校', '学习', '考试', '家长', '学生', '教师', '高考',
    '中考', '课程', '古诗词',
  ],
  美妆: [
    '美妆品牌', '美妆', '护肤', '化妆', '美容消费', '美容', '彩妆', '皮肤', '香水',
  ],
  宠物娱乐: [
    '宠物', '娱乐', '影视', '游戏', 'IP', '电影', '电视剧', '综艺', '明星', '歌曲',
    '艺术家',
  ],
  自媒体: [
    '内容平台', '内容', '创作者', '流量趋势', '流量', '短视频', '直播', '账号',
    '自媒体', '拍摄', '镜头', 'AI',
  ],
}

const BUSINESS_KEYWORDS = [
  '消费', '商品', '价格', '品牌', '营销', '平台', '市场', '门店', '经营', '购物',
  '旅游', '酒店', '餐饮', '教育', '美妆', '宠物', '游戏', '流量', '用户', '趋势',
]

const CREATIVE_KEYWORDS = [
  '趋势', '变化', '讨论', '热议', '争议', '反转', '故事', '体验', '实测', '对比',
  '攻略', '分享', '现象', '走热', '记录', '方法', '原因', '影响',
]

const PLATFORMS_WITHOUT_HOT_SCORE = new Set<Hotspot['platform']>(['腾讯'])
const BUSINESS_VALUE_WEIGHT = 0.3
const CREATIVE_VALUE_WEIGHT = 0.7

interface LocalScores {
  relevance: number
  businessValue: number
  creativeValue: number
  matchedInterest: string
  matchedKeywords: string[]
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function getText(hotspot: Hotspot): string {
  return `${hotspot.title} ${hotspot.summary}`.toLocaleLowerCase('zh-CN')
}

function countMatches(text: string, keywords: string[]): string[] {
  return [...new Set(keywords.filter((keyword) => text.includes(keyword.toLocaleLowerCase('zh-CN'))))]
}

function getInterestKeywords(interest: Interest): string[] {
  const configuredKeywords = DOMAIN_KEYWORDS[interest.name]
  if (configuredKeywords) return configuredKeywords
  const customKeywords = interest.name.split(/[\s,，、/]+/).filter(Boolean)
  return customKeywords.length > 0 ? customKeywords : [interest.name]
}

function getLocalScores(hotspot: Hotspot, interests: Interest[]): LocalScores {
  const text = getText(hotspot)
  let matchedInterest = interests[0]?.name ?? '所选领域'
  let matchedKeywords: string[] = []
  let relevance = 0.08

  for (const interest of interests) {
    const matches = countMatches(text, getInterestKeywords(interest))
    const nameMatched = text.includes(interest.name.toLocaleLowerCase('zh-CN'))
    const matchCount = matches.length + (nameMatched ? 1 : 0)
    const nextRelevance = matchCount >= 3 ? 0.96 : matchCount === 2 ? 0.84 : matchCount === 1 ? 0.68 : 0.08

    if (nextRelevance > relevance || matches.length > matchedKeywords.length) {
      relevance = nextRelevance
      matchedInterest = interest.name
      matchedKeywords = matches
    }
  }

  const businessMatches = countMatches(text, BUSINESS_KEYWORDS).length
  const creativeMatches = countMatches(text, CREATIVE_KEYWORDS).length
  const businessValue = clamp(0.35 + businessMatches * 0.1)
  const shortVideoValue = clamp(0.42 + creativeMatches * 0.09 + (hotspot.summary.length >= 30 ? 0.06 : 0))

  return {
    relevance,
    businessValue,
    creativeValue: clamp(shortVideoValue * 0.7 + businessValue * 0.3),
    matchedInterest,
    matchedKeywords,
  }
}

function getHeatScore(hotspot: Hotspot, maximumHeat: number): number {
  if (maximumHeat <= 0) return 0
  return clamp(Math.log1p(hotspot.hotScore) / Math.log1p(maximumHeat))
}

function normalizeHotspotTitle(title: string): string {
  const normalized = title
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[\p{P}\p{Z}\s]+/gu, '')

  return normalized || title.trim().toLocaleLowerCase('zh-CN')
}

function hasUsableHotScore(hotspot: Hotspot): boolean {
  return Number.isFinite(hotspot.hotScore) && hotspot.hotScore > 0
}

function hasKnownHotScore(hotspot: Hotspot): boolean {
  return hasUsableHotScore(hotspot) || !PLATFORMS_WITHOUT_HOT_SCORE.has(hotspot.platform)
}

function getMetadataCompleteness(hotspot: Hotspot): number {
  const summary = hotspot.summary.trim()
  return (summary ? 1_000 : 0) + Math.min(summary.length, 999)
}

function getStableHotspotKey(hotspot: Hotspot): string {
  return `${hotspot.platform}:${hotspot.rank}:${hotspot.hotScore}:${hotspot.summary}`
}

function shouldPreferHotspot(candidate: Hotspot, current: Hotspot): boolean {
  const heatDifference = Number(hasUsableHotScore(candidate)) - Number(hasUsableHotScore(current))
  if (heatDifference !== 0) return heatDifference > 0

  const metadataDifference = getMetadataCompleteness(candidate) - getMetadataCompleteness(current)
  if (metadataDifference !== 0) return metadataDifference > 0

  return getStableHotspotKey(candidate).localeCompare(getStableHotspotKey(current), 'zh-CN') < 0
}

function deduplicateHotspots(hotspots: Hotspot[]): Hotspot[] {
  const hotspotByTitle = new Map<string, Hotspot>()

  for (const hotspot of hotspots) {
    const titleKey = normalizeHotspotTitle(hotspot.title)
    const current = hotspotByTitle.get(titleKey)
    if (!current || shouldPreferHotspot(hotspot, current)) {
      hotspotByTitle.set(titleKey, hotspot)
    }
  }

  return [...hotspotByTitle.values()]
}

export function selectHotspotCandidates(
  hotspots: Hotspot[],
  interests: Interest[],
  limit: number,
): Hotspot[] {
  const deduplicatedHotspots = deduplicateHotspots(hotspots)
  const maximumHeat = Math.max(1, ...deduplicatedHotspots.map((hotspot) => hotspot.hotScore))

  return deduplicatedHotspots
    .map((hotspot) => {
      const local = getLocalScores(hotspot, interests)
      const heat = getHeatScore(hotspot, maximumHeat)
      const candidateScore = local.relevance * 0.72 + local.creativeValue * 0.18 + heat * 0.1
      return { hotspot, candidateScore }
    })
    .sort((left, right) => right.candidateScore - left.candidateScore)
    .slice(0, limit)
    .map(({ hotspot }) => hotspot)
}

export function rankHotspots(
  hotspots: Hotspot[],
  interests: Interest[],
  assessments: HotspotAssessment[] = [],
): Hotspot[] {
  const maximumHeat = Math.max(1, ...hotspots.map((hotspot) => hotspot.hotScore))
  const assessmentByIndex = new Map(assessments.map((assessment) => [assessment.index, assessment]))
  const assessedHotspots = hotspots
    .map((hotspot, index) => ({ hotspot, index }))
    .filter(({ index }) => assessmentByIndex.has(index))

  return assessedHotspots
    .map(({ hotspot, index }) => {
      const local = getLocalScores(hotspot, interests)
      const assessment = assessmentByIndex.get(index)
      const relevance = assessment ? clamp(assessment.relevance / 100) : local.relevance
      const businessValue = assessment
        ? clamp(assessment.businessValue / 100)
        : local.businessValue
      const creativeValue = assessment
        ? clamp(assessment.creativeValue / 100)
        : local.creativeValue
      const heat = getHeatScore(hotspot, maximumHeat)
      const contentValue = businessValue * BUSINESS_VALUE_WEIGHT + creativeValue * CREATIVE_VALUE_WEIGHT
      const recommendationIndex = Math.round(
        100 * relevance * contentValue * (hasKnownHotScore(hotspot) ? heat : 1),
      )
      const matchDescription = local.matchedKeywords.length > 0
        ? `涉及${local.matchedKeywords.slice(0, 3).join('、')}`
        : '未发现直接领域要素'
      const domainReason = relevance >= 0.2
        ? `适合“${local.matchedInterest}”创作：热点${matchDescription}，可围绕该领域的消费需求、经营变化或用户行为展开短视频。`
        : `与“${local.matchedInterest}”领域相关性较低：${matchDescription}，不建议仅因热度跟进。`

      return {
        ...hotspot,
        recommendationIndex,
        relevanceScore: Math.round(relevance * 100),
        businessValueScore: Math.round(businessValue * 100),
        creativeValueScore: Math.round(creativeValue * 100),
        matchedInterest: local.matchedInterest,
        recommendationReasons: [
          domainReason,
          `商业价值 ${Math.round(businessValue * 100)} 分，可用于分析消费需求、经营机会或品牌沟通价值。`,
          `短视频创作价值 ${Math.round(creativeValue * 100)} 分，结合当前热度形成综合推荐指数 ${recommendationIndex}。`,
        ],
      }
    })
    .sort((left, right) =>
      (right.recommendationIndex ?? 0) - (left.recommendationIndex ?? 0) ||
      (right.businessValueScore ?? 0) - (left.businessValueScore ?? 0) ||
      right.hotScore - left.hotScore,
    )
}

export function applyHotspotReasons(
  hotspots: Hotspot[],
  interests: Interest[],
  reasons: HotspotReason[],
): Hotspot[] {
  const reasonByIndex = new Map(reasons.map((reason) => [reason.index, reason.reason.trim()]))
  const selectedDomainLabel = interests.map((interest) => interest.name).join('、') || '所选领域'

  return hotspots.map((hotspot, index) => {
    const reason = reasonByIndex.get(index)
    if (!reason) return hotspot

    const domainReason = (hotspot.relevanceScore ?? 0) >= 20
      ? `适合“${selectedDomainLabel}”创作：${reason}`
      : `与“${selectedDomainLabel}”领域相关性较低：${reason}`
    const existingReasons = hotspot.recommendationReasons ?? []

    return {
      ...hotspot,
      recommendationReasons: [domainReason, ...existingReasons.slice(1)],
    }
  })
}
