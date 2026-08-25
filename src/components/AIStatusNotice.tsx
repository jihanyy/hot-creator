import type { AIRequestStatus } from '../types/workflow'

interface AIStatusNoticeProps {
  status: AIRequestStatus
  loadingMessage: string
  errorMessage?: string | null
}

function AIStatusNotice({ status, loadingMessage, errorMessage }: AIStatusNoticeProps) {
  if (status === 'loading') {
    return (
      <div className="ai-request-state is-loading" role="status" aria-live="polite">
        {loadingMessage}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="ai-request-state is-error" role="alert">
        {errorMessage || 'AI服务暂时不可用，请稍后重试'}
      </div>
    )
  }

  return null
}

export default AIStatusNotice
