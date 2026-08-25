import { useState } from 'react'
import AIStatusNotice from './AIStatusNotice'
import ChatBox from './ChatBox'
import PromptCard from './PromptCard'
import { generatePrompt, getAIErrorMessage } from '../services/api'
import { copyPromptToClipboard, formatVideoPrompt } from '../utils/prompt'
import type {
  AIRequestStatus,
  Prompt,
  Storyboard,
  VideoConfig,
} from '../types/workflow'

interface PromptGeneratorProps {
  storyboards: Storyboard[]
  initialPrompts: Prompt[]
  videoConfig: VideoConfig
  initialStatus: AIRequestStatus
  initialError: string | null
  onBack: () => void
  onPromptsChange: (prompts: Prompt[]) => void
}

function PromptGenerator({
  storyboards,
  initialPrompts,
  videoConfig,
  initialStatus,
  initialError,
  onBack,
  onPromptsChange,
}: PromptGeneratorProps) {
  const prompts: Prompt[] = initialPrompts
  const [copiedAll, setCopiedAll] = useState<'image' | 'video'>()
  const [isLoading, setIsLoading] = useState(false)
  const [localStatus, setLocalStatus] = useState<AIRequestStatus | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const status = localStatus ?? initialStatus
  const error = localError ?? initialError

  const copyAllPrompts = async (type: 'image' | 'video') => {
    const content = prompts
      .map((prompt) =>
        type === 'image'
          ? `镜头 ${String(prompt.shotNumber).padStart(2, '0')}\n${prompt.imagePrompt}`
          : `镜头 ${String(prompt.shotNumber).padStart(2, '0')}\n${formatVideoPrompt(prompt.videoPrompt)}`,
      )
      .join('\n\n--------------------\n\n')
    await copyPromptToClipboard(content)
    setCopiedAll(type)
    window.setTimeout(() => setCopiedAll(undefined), 1600)
  }

  const revisePrompts = async (instruction: string) => {
    if (isLoading) return 'Prompt 生成中，请稍后再试。'
    setIsLoading(true)
    setLocalStatus('loading')
    setLocalError(null)
    try {
      const updatedPrompts = await generatePrompt(
        storyboards,
        videoConfig,
        instruction,
        prompts,
      )
      onPromptsChange(updatedPrompts)
      setLocalStatus('success')
      return `已根据“${instruction}”更新全部镜头 Prompt。`
    } catch (requestError) {
      setLocalError(getAIErrorMessage(requestError))
      setLocalStatus('error')
      throw requestError
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="prompt-screen" aria-labelledby="prompt-page-title">
      <div className="prompt-page-header">
        <div>
          <div className="step-badge">STEP 7 · Prompt</div>
          <h2 id="prompt-page-title">AI 生成 Prompt</h2>
          <p className="step-description">将根据确认后的分镜生成图片与视频 Prompt，成功后可逐条或整批复制。</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          返回分镜
        </button>
      </div>

      <AIStatusNotice
        status={status}
        loadingMessage="AI 正在生成 Prompt…"
        errorMessage={error}
      />

      <div className="prompt-toolbar">
        <div>
          <span className="section-number">01</span>
          <div><strong>Prompt 列表</strong><span>共 {prompts.length} 个镜头</span></div>
        </div>
        <div className="copy-all-actions">
          <button type="button" disabled={prompts.length === 0} onClick={() => void copyAllPrompts('image')}>
            {copiedAll === 'image' ? '✓ 已复制全部图片Prompt' : '全部复制图片Prompt'}
          </button>
          <button type="button" disabled={prompts.length === 0} onClick={() => void copyAllPrompts('video')}>
            {copiedAll === 'video' ? '✓ 已复制全部视频Prompt' : '全部复制视频Prompt'}
          </button>
        </div>
      </div>

      <div className="prompt-list">
        {prompts.map((prompt) => <PromptCard prompt={prompt} key={prompt.id} />)}
      </div>

      <ChatBox
        contextTitle="全部镜头 Prompt"
        heading="用自然语言优化 Prompt"
        sectionNumber="02"
        introMessage="你可以继续调整生成方向，AI 会统一更新所有镜头的图片与视频 Prompt。"
        suggestions={['更真实', '更电影感', '适合真人拍摄', '适合AI视频生成']}
        onMessage={revisePrompts}
        inputLabel="输入 Prompt 修改要求"
        placeholder="例如：更电影感…"
        disabled={status === 'loading' || isLoading}
      />
    </section>
  )
}

export default PromptGenerator
