import type { Prompt, Storyboard } from '../types/workflow'

export function createFallbackPrompts(storyboards: Storyboard[]): Prompt[] {
  return storyboards.map((storyboard) => {
    const characterAction =
      storyboard.shootingAdvice
        .split(/[。；]/)
        .find((sentence) => /人物|主体|动作|操作|店员|老板|顾客/.test(sentence)) ??
      `主体按照分镜旁白“${storyboard.narration}”完成一个清楚、连续的动作。`
    const fullPrompt = `${storyboard.duration}，${storyboard.visualDescription} ${characterAction} ${storyboard.shootingAdvice} ${storyboard.videoPrompt} 动作连续，画面稳定，节奏与旁白同步。`

    return {
      id: `prompt-${storyboard.id}`,
      shotNumber: storyboard.shotNumber,
      imagePrompt: `${storyboard.imagePrompt} 主体明确，构图完整，光影自然，保持分镜设定，避免文字、标识与畸形肢体。`,
      videoPrompt: {
        sceneDescription: storyboard.visualDescription,
        characterAction,
        cameraMovement: storyboard.shootingAdvice,
        videoStyle: '保持该分镜的场景、构图、光线、色彩和人物设定一致。',
        timing: `${storyboard.duration}，按照分镜旁白和动作顺序推进，末尾稳定停留便于转场。`,
        fullPrompt,
      },
    }
  })
}
