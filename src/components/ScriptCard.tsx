import type { Script } from '../types/workflow'

interface ScriptCardProps {
  script: Script
  revised?: boolean
}

function ScriptCard({ script, revised = false }: ScriptCardProps) {
  return (
    <article className={`script-card${revised ? ' is-revised' : ''}`}>
      <div className="script-card-header">
        <span>短视频脚本</span>
        {revised && <strong>已按意见修改</strong>}
      </div>

      <section className="script-title-block">
        <span>标题</span>
        <h3>{script.title}</h3>
      </section>

      <div className="script-content-blocks">
        <section className="script-block hook-block">
          <div className="script-block-label">
            <span aria-hidden="true">3s</span>
            <strong>开头 Hook（前3秒）</strong>
          </div>
          <p>{script.hook}</p>
        </section>

        <section className="script-block body-block">
          <div className="script-block-label">
            <span aria-hidden="true">文</span>
            <strong>正文</strong>
          </div>
          <p>{script.body}</p>
        </section>

        <section className="script-block ending-block">
          <div className="script-block-label">
            <span aria-hidden="true">尾</span>
            <strong>结尾</strong>
          </div>
          <p>{script.ending}</p>
        </section>
      </div>
    </article>
  )
}

export default ScriptCard
