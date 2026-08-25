import { useEffect, useRef, useState } from 'react'
import AIStatusNotice from './AIStatusNotice'
import ChatBox from './ChatBox'
import ScriptCard from './ScriptCard'
import { generateScript, getAIErrorMessage } from '../services/api'
import type { AIRequestStatus, CreativeSelection, Script } from '../types/workflow'

interface ScriptGeneratorProps {
  creativeSelection: CreativeSelection
  currentScript: Script | null
  onBack: () => void
  onScriptChange: (script: Script) => void
  onConfirm: (script: Script) => void
}

function ScriptGenerator({
  creativeSelection,
  currentScript,
  onBack,
  onScriptChange,
  onConfirm,
}: ScriptGeneratorProps) {
  const { hotspot } = creativeSelection
  const [scripts, setScripts] = useState<Script[]>(() => currentScript ? [currentScript] : [])
  const [scriptIndex, setScriptIndex] = useState(0)
  const [isRevised, setIsRevised] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [status, setStatus] = useState<AIRequestStatus>(currentScript ? 'success' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (currentScript) return
    let isCurrent = true
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    void generateScript(creativeSelection)
      .then((generatedScripts) => {
        if (
          !isCurrent ||
          requestId.current !== currentRequestId ||
          generatedScripts.length === 0
        ) return
        setScripts(generatedScripts)
        setScriptIndex(0)
        onScriptChange(generatedScripts[0])
        setStatus('success')
      })
      .catch((requestError: unknown) => {
        if (isCurrent && requestId.current === currentRequestId) {
          setError(getAIErrorMessage(requestError))
          setStatus('error')
        }
      })
    return () => {
      isCurrent = false
      if (requestId.current === currentRequestId) requestId.current += 1
    }
  }, [creativeSelection, currentScript, onScriptChange])

  const changeScript = () => {
    if (!currentScript || status === 'loading') return
    const nextIndex = scripts.length === 0 ? 0 : (scriptIndex + 1) % scripts.length
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setIsConfirmed(false)
    setStatus('loading')
    setError(null)

    void generateScript(
      creativeSelection,
      '换一个不同的脚本方向，避免重复当前叙事。',
      currentScript,
    ).then((generatedScripts) => {
      if (requestId.current !== currentRequestId) return
      const generatedScript = generatedScripts[0]
      if (generatedScript) {
        setScriptIndex(nextIndex)
        setScripts((current) => current.length === 0
          ? [generatedScript]
          : current.map((item, index) => index === nextIndex ? generatedScript : item))
        onScriptChange(generatedScript)
        setIsRevised(false)
        setStatus('success')
      }
    }).catch((requestError: unknown) => {
      if (requestId.current === currentRequestId) {
        setError(getAIErrorMessage(requestError))
        setStatus('error')
      }
    })
  }

  const reviseScript = async (instruction: string) => {
    if (!currentScript) return '脚本生成中，请稍后再试。'
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setStatus('loading')
    setError(null)
    try {
      const generatedScripts = await generateScript(
        creativeSelection,
        instruction,
        currentScript,
      )
      if (requestId.current !== currentRequestId) {
        throw new Error('检测到更新的脚本修改请求，已忽略较早返回的结果。')
      }
      const revisedScript = generatedScripts[0]
      if (!revisedScript) throw new Error('脚本修改接口未返回可用结果')
      setScripts((current) => current.map((item, index) =>
        index === scriptIndex ? revisedScript : item,
      ))
      onScriptChange(revisedScript)
      setIsRevised(true)
      setIsConfirmed(false)
      setStatus('success')
      return `已根据“${instruction}”生成修改版脚本，修改结果已同步到上方脚本卡片。`
    } catch (requestError) {
      setError(getAIErrorMessage(requestError))
      setStatus('error')
      throw requestError
    }
  }

  const confirmScript = () => {
    if (!currentScript) return
    setIsConfirmed(true)
    onConfirm(currentScript)
  }

  return (
    <section className="script-screen" aria-labelledby="script-screen-title">
      <div className="script-page-header">
        <div>
          <div className="step-badge">STEP 4 · 脚本生成</div>
          <h2 id="script-screen-title">短视频脚本生成</h2>
          <p className="step-description">将根据当前热点、创意方向和视频风格生成完整脚本。</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          返回创意建议
        </button>
      </div>

      <AIStatusNotice
        status={status}
        loadingMessage="AI 正在生成脚本…"
        errorMessage={error}
      />

      <div className="script-context" aria-label="当前脚本使用信息">
        <div>
          <span>当前热点</span>
          <strong>{hotspot.title}</strong>
        </div>
        <div>
          <span>创意方向</span>
          <strong>{creativeSelection.idea.title}</strong>
        </div>
        <div>
          <span>视频风格</span>
          <strong>{creativeSelection.videoStyle}</strong>
        </div>
      </div>

      {currentScript && <ScriptCard script={currentScript} revised={isRevised} />}

      {currentScript && <div className="script-actions">
        <button className="script-change-action" type="button" disabled={status === 'loading'} onClick={changeScript}>
          <span aria-hidden="true">↻</span>
          换一个脚本
        </button>
        <button
          className={`script-confirm-action${isConfirmed ? ' is-confirmed' : ''}`}
          type="button"
          disabled={status === 'loading'}
          onClick={confirmScript}
        >
          {isConfirmed ? '✓ 已确定这个脚本' : '确定这个脚本'}
        </button>
      </div>}

      {isConfirmed && (
        <div className="script-confirmed-notice" role="status">
          <span aria-hidden="true">✓</span>
          脚本已确认，后续可进入视频参数设置。
        </div>
      )}

      {currentScript && <ChatBox
        contextTitle={currentScript.title}
        suggestions={['开头更炸裂', '改成30秒', '不要广告感', '增加反转', '更像真人口播']}
        onMessage={reviseScript}
        disabled={status === 'loading'}
      />}
    </section>
  )
}

export default ScriptGenerator
