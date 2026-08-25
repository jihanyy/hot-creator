import type { VideoPromptDetails } from '../types/workflow'

export async function copyPromptToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function formatVideoPrompt(prompt: VideoPromptDetails) {
  return [
    `场景描述：${prompt.sceneDescription}`,
    `人物动作：${prompt.characterAction}`,
    `镜头运动：${prompt.cameraMovement}`,
    `视频风格：${prompt.videoStyle}`,
    `时间节奏：${prompt.timing}`,
    `完整 Prompt：${prompt.fullPrompt}`,
  ].join('\n')
}
