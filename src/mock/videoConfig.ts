import type { VideoConfig } from '../types/workflow'

export const EMPTY_VIDEO_CONFIG: VideoConfig = {
  ratio: '',
  duration: '',
  style: '',
  shotCount: '',
  source: 'manual',
}

export const AI_VIDEO_CONFIG_RECOMMENDATION: VideoConfig = {
  ratio: '9:16',
  duration: '45秒',
  style: '故事叙述',
  shotCount: '7个',
  source: 'ai',
}
