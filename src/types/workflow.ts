export type WorkflowStepId =
  | 'field'
  | 'hotspot'
  | 'ideas'
  | 'script'
  | 'video'
  | 'storyboard'
  | 'prompt'

export type AIRequestStatus = 'idle' | 'loading' | 'success' | 'error'

export interface Interest {
  id: string
  name: string
  isCustom?: boolean
}

export type HotspotPlatform =
  | '微博'
  | '抖音'
  | '小红书'
  | '百度'
  | '腾讯'
  | '头条'
  | '全网'
  | '用户输入'

export interface Hotspot {
  title: string
  summary: string
  platform: HotspotPlatform
  rank: number
  hotScore: number
  recommendationIndex?: number
  relevanceScore?: number
  businessValueScore?: number
  creativeValueScore?: number
  matchedInterest?: string
  recommendationReasons?: string[]
}

export interface Creative {
  id: string
  title: string
  description: string
}

export const VIDEO_STYLES = [
  '专业分析',
  '轻松幽默',
  '故事叙述',
  '情绪观点',
  '知识科普',
  '反转剧情',
  '听AI推荐',
] as const

export type PresetVideoStyle = (typeof VIDEO_STYLES)[number]
export type VideoStyle = string

export interface CreativeSelection {
  hotspot: Hotspot
  industry: string
  idea: Creative
  videoStyle: VideoStyle
}

export interface Script {
  id: string
  title: string
  hook: string
  body: string
  ending: string
}

export interface VideoConfig {
  ratio: string
  duration: string
  style: string
  shotCount: string
  source: 'manual' | 'ai' | 'chat'
  instruction?: string
}

export interface Storyboard {
  id: string
  shotNumber: number
  duration: string
  visualDescription: string
  narration: string
  shootingAdvice: string
  imagePrompt: string
  videoPrompt: string
}

export interface VideoPromptDetails {
  sceneDescription: string
  characterAction: string
  cameraMovement: string
  videoStyle: string
  timing: string
  fullPrompt: string
}

export interface Prompt {
  id: string
  shotNumber: number
  imagePrompt: string
  videoPrompt: VideoPromptDetails
}

export interface WorkflowState {
  activeStep: WorkflowStepId
  interests: Interest[]
  hotspotBatchIndex: number
  hotspot: Hotspot | null
  creatives: Creative[]
  creativeSelection: CreativeSelection | null
  script: Script | null
  videoConfig: VideoConfig | null
  storyboards: Storyboard[]
  prompts: Prompt[]
  promptStatus: AIRequestStatus
  promptError: string | null
}
