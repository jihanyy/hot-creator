import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

interface ChatEntry {
  id: number
  role: 'assistant' | 'user'
  content: string
}

interface ChatBoxProps {
  contextTitle: string
  suggestions?: string[]
  onMessage: (message: string) => string | Promise<string>
  heading?: string
  introMessage?: string
  sectionNumber?: string
  inputLabel?: string
  placeholder?: string
  disabled?: boolean
}

function ChatBox({
  contextTitle,
  suggestions = [],
  onMessage,
  heading = '继续告诉 AI 你的想法',
  introMessage,
  sectionNumber = '04',
  inputLabel = '输入调整要求',
  placeholder = '输入你的要求，不限于上方选项…',
  disabled = false,
}: ChatBoxProps) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: 1,
      role: 'assistant',
      content:
        introMessage ??
        `你还可以继续调整「${contextTitle}」。直接输入你的想法，我会根据要求重新处理。`,
    },
  ])

  const sendMessage = async () => {
    const content = draft.trim()
    if (!content || isSending || disabled) return
    const userEntryId = Date.now()

    setEntries((current) => [
      ...current,
      { id: userEntryId, role: 'user', content },
    ])
    setDraft('')
    setIsSending(true)

    try {
      const assistantReply = await onMessage(content)
      if (!assistantReply.trim()) {
        throw new Error('AI 修改未返回可用结果')
      }
      setEntries((current) => [
        ...current,
        {
          id: userEntryId + 1,
          role: 'assistant',
          content: assistantReply,
        },
      ])
    } catch {
      setEntries((current) => [
        ...current,
        {
          id: userEntryId + 1,
          role: 'assistant',
          content: '暂时无法完成调整，请稍后再试。',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendMessage()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <section className="creative-chat" aria-labelledby="creative-chat-title">
      <div className="creative-chat-header">
        <div>
          <span className="section-number">{sectionNumber}</span>
          <h2 id="creative-chat-title">{heading}</h2>
        </div>
        <span className="ai-dialog-label">AI 对话</span>
      </div>

      <div className="creative-chat-messages" aria-live="polite">
        {entries.map((entry) => (
          <div className={`creative-chat-message is-${entry.role}`} key={entry.id}>
            {entry.role === 'assistant' && (
              <span className="mini-agent-avatar" aria-hidden="true">
                ✦
              </span>
            )}
            <p>{entry.content}</p>
          </div>
        ))}
      </div>

      <div className="chat-suggestions" aria-label="输入示例">
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} disabled={disabled || isSending} onClick={() => setDraft(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>

      <form className="creative-chat-form" onSubmit={handleSubmit}>
        <textarea
          aria-label={inputLabel}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" disabled={!draft.trim() || isSending || disabled} aria-label="发送创意要求">
          ↑
        </button>
      </form>
      <p className="chat-input-hint">可自由描述需求 · Enter 发送 · Shift + Enter 换行</p>
    </section>
  )
}

export default ChatBox
