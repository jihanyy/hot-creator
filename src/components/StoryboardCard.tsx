import type { Storyboard } from '../types/workflow'

interface StoryboardCardProps {
  storyboard: Storyboard
}

function StoryboardCard({ storyboard }: StoryboardCardProps) {
  return (
    <article className="storyboard-card">
      <div className="storyboard-shot-column">
        <span>镜头编号</span>
        <strong>{String(storyboard.shotNumber).padStart(2, '0')}</strong>
        <div className="storyboard-duration">
          <span aria-hidden="true">时</span>
          {storyboard.duration}
        </div>
      </div>

      <div className="storyboard-details">
        <section className="storyboard-main-visual">
          <span className="storyboard-field-label">画面描述</span>
          <p>{storyboard.visualDescription}</p>
        </section>

        <div className="storyboard-info-grid">
          <section>
            <span className="storyboard-field-label">旁白</span>
            <p>{storyboard.narration}</p>
          </section>
          <section>
            <span className="storyboard-field-label">拍摄建议</span>
            <p>{storyboard.shootingAdvice}</p>
          </section>
        </div>

        <section className="storyboard-prompts">
          <div className="storyboard-prompt-heading">
            <span aria-hidden="true">✦</span>
            <strong>生成提示词</strong>
          </div>
          <div>
            <span className="storyboard-field-label">图片生成方向</span>
            <p>{storyboard.imagePrompt}</p>
          </div>
          <div>
            <span className="storyboard-field-label">视频生成方向</span>
            <p>{storyboard.videoPrompt}</p>
          </div>
        </section>
      </div>
    </article>
  )
}

export default StoryboardCard
