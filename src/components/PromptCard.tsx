import { useState } from 'react'
import { copyPromptToClipboard, formatVideoPrompt } from '../utils/prompt'
import type { Prompt } from '../types/workflow'

interface PromptCardProps {
  prompt: Prompt
}

function PromptCard({ prompt }: PromptCardProps) {
  const [copiedType, setCopiedType] = useState<'image' | 'video'>()

  const copyPrompt = async (type: 'image' | 'video') => {
    const content = type === 'image' ? prompt.imagePrompt : formatVideoPrompt(prompt.videoPrompt)
    await copyPromptToClipboard(content)
    setCopiedType(type)
    window.setTimeout(() => setCopiedType(undefined), 1600)
  }

  return (
    <article className="prompt-card">
      <div className="prompt-shot-number">
        <span>镜头编号</span>
        <strong>{String(prompt.shotNumber).padStart(2, '0')}</strong>
      </div>

      <div className="prompt-card-content">
        <section className="image-prompt-section">
          <div className="prompt-section-heading">
            <div>
              <span className="prompt-type-icon" aria-hidden="true">图</span>
              <div>
                <span>IMAGE GENERATION</span>
                <h3>图片生成 Prompt</h3>
              </div>
            </div>
            <button type="button" onClick={() => void copyPrompt('image')}>
              {copiedType === 'image' ? '✓ 已复制' : '复制图片Prompt'}
            </button>
          </div>
          <div className="prompt-code-block">{prompt.imagePrompt}</div>
        </section>

        <section className="video-prompt-section">
          <div className="prompt-section-heading">
            <div>
              <span className="prompt-type-icon video" aria-hidden="true">视</span>
              <div>
                <span>VIDEO GENERATION</span>
                <h3>视频生成 Prompt</h3>
              </div>
            </div>
            <button type="button" onClick={() => void copyPrompt('video')}>
              {copiedType === 'video' ? '✓ 已复制' : '复制视频Prompt'}
            </button>
          </div>

          <dl className="video-prompt-fields">
            <div><dt>场景描述</dt><dd>{prompt.videoPrompt.sceneDescription}</dd></div>
            <div><dt>人物动作</dt><dd>{prompt.videoPrompt.characterAction}</dd></div>
            <div><dt>镜头运动</dt><dd>{prompt.videoPrompt.cameraMovement}</dd></div>
            <div><dt>视频风格</dt><dd>{prompt.videoPrompt.videoStyle}</dd></div>
            <div><dt>时间节奏</dt><dd>{prompt.videoPrompt.timing}</dd></div>
          </dl>

          <div className="prompt-full-output">
            <span>完整 Prompt</span>
            <p>{prompt.videoPrompt.fullPrompt}</p>
          </div>
        </section>
      </div>
    </article>
  )
}

export default PromptCard
