import type { Script, Storyboard, VideoConfig } from '../types/workflow'

const VISUAL_TEMPLATES = [
  '老板或店员进入真实经营现场，先用一个明确动作建立拍摄主题。',
  '近景拍摄双手、工具、产品或服务步骤，让操作细节清楚可见。',
  '固定机位记录完整执行过程，保留真实环境和现场声音。',
  '使用前后对比呈现操作结果，两侧构图和光线保持一致。',
  '特写标准、记录、价格说明或交付细节，为口播提供可验证画面。',
  '从顾客第一视角进入体验流程，跟随店员动作观察关键步骤。',
  '中景拍摄老板解释经营选择，背景保留门店、产品或服务现场。',
  '镜头拉远展示完整业务场景，让人物、动作与交付结果同时入画。',
  '回到核心产品或服务成果，用稳定镜头承接结尾口播。',
  '人物直视镜头完成收尾，并用现场细节保留自然的行动引导。',
]

function parseNumber(value: string, fallback: number) {
  const matched = value.match(/\d+/)
  return matched ? Number(matched[0]) : fallback
}

function clip(value: string, limit = 90) {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`
}

export function createFallbackStoryboards(
  script: Script,
  videoConfig: VideoConfig,
  batchIndex: number,
): Storyboard[] {
  const shotCount = Math.min(10, Math.max(3, parseNumber(videoConfig.shotCount, 7)))
  const totalDuration = parseNumber(videoConfig.duration, 45)
  const shotDuration = Math.max(3, Math.round(totalDuration / shotCount))
  const bodySegments = script.body
    .split(/\n+|(?<=[。！？])/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  const narrationSegments = [script.hook, ...bodySegments, script.ending]

  return Array.from({ length: shotCount }, (_, index) => {
    const isFirst = index === 0
    const isLast = index === shotCount - 1
    const templateIndex = (index + batchIndex * 2) % VISUAL_TEMPLATES.length
    const narration = isFirst
      ? script.hook
      : isLast
        ? script.ending
        : narrationSegments[Math.min(index, narrationSegments.length - 2)] ?? script.body
    const movement =
      batchIndex % 2 === 0
        ? index % 2 === 0
          ? '缓慢推进，主体动作自然，结尾轻微停顿。'
          : '手持跟拍后稳定落镜，动作与旁白关键词同步。'
        : index % 2 === 0
          ? '低机位横移，利用现场前景完成自然转场。'
          : '固定机位起镜，随后快速推近关键动作或人物表情。'
    const visual = VISUAL_TEMPLATES[templateIndex]

    return {
      id: `storyboard-${batchIndex}-${index + 1}`,
      shotNumber: index + 1,
      duration: `${shotDuration}秒`,
      visualDescription: `${visual} 画面对应脚本内容“${clip(narration)}”，采用${videoConfig.ratio}构图。`,
      narration,
      shootingAdvice: `${movement} 表演和操作保持生活化，整体呈现${videoConfig.style}质感。`,
      imagePrompt: `${videoConfig.ratio}，${videoConfig.style}，真实商家短视频分镜静帧，${visual}，自然光影，高细节，无文字水印。`,
      videoPrompt: `${shotDuration}秒单镜头，${movement} 按照旁白“${clip(narration, 60)}”呈现对应动作，主体连续，首尾帧稳定。`,
    }
  })
}
