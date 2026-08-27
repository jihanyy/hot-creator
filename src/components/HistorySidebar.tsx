import { useState } from 'react'
import type { CreationHistoryRecord } from '../services/creationHistory'

interface HistorySidebarProps {
  histories: CreationHistoryRecord[]
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}

function formatHistoryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function HistorySidebar({ histories, onRestore, onDelete }: HistorySidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 900,
  )

  return (
    <aside
      className={`history-sidebar${isCollapsed ? ' is-collapsed' : ''}`}
      aria-label={isCollapsed ? '历史记录' : undefined}
      aria-labelledby={isCollapsed ? undefined : 'history-heading'}
    >
      {isCollapsed ? (
        <button
          className="history-toggle history-toggle-expand"
          type="button"
          aria-expanded="false"
          aria-label="展开历史记录"
          title="展开历史记录"
          onClick={() => setIsCollapsed(false)}
        >
          <span className="history-toggle-icon" aria-hidden="true" />
        </button>
      ) : (
        <>
          <header className="history-sidebar-header">
            <h2 id="history-heading">历史记录</h2>
            <button
              className="history-toggle history-toggle-collapse"
              type="button"
              aria-expanded="true"
              aria-label="收起历史记录"
              title="收起历史记录"
              onClick={() => setIsCollapsed(true)}
            >
              <span className="history-toggle-icon" aria-hidden="true" />
            </button>
          </header>

          <div className="history-scroll-region">
            {histories.length === 0 ? (
              <div className="history-empty">
                <p>暂无历史记录</p>
                <span>完成一次创作后会显示在这里</span>
              </div>
            ) : (
              <ol className="history-list">
                {histories.map((history) => (
                  <li className="history-item" key={history.id}>
                    <button
                      className="history-item-open"
                      type="button"
                      aria-label={`恢复历史记录：${history.title}`}
                      onClick={() => onRestore(history.id)}
                    >
                      <span className="history-item-title">{history.title}</span>
                      <time className="history-item-time" dateTime={history.updatedAt}>
                        {formatHistoryTime(history.updatedAt)}
                      </time>
                    </button>
                    <button
                      className="history-item-delete"
                      type="button"
                      aria-label={`删除历史记录：${history.title}`}
                      title="删除历史记录"
                      onClick={() => onDelete(history.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </aside>
  )
}

export default HistorySidebar
