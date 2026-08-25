import { useEffect, useRef, useState } from 'react'
import AIStatusNotice from './AIStatusNotice'
import ChatBox from './ChatBox'
import StoryboardCard from './StoryboardCard'
import { generateStoryboard, getAIErrorMessage } from '../services/api'
import type {
  AIRequestStatus,
  CreativeSelection,
  Script,
  Storyboard,
  VideoConfig,
} from '../types/workflow'

interface StoryboardGeneratorProps {
  creativeSelection: CreativeSelection
  script: Script
  videoConfig: VideoConfig
  initialStoryboards?: Storyboard[]
  onBack: () => void
  onStoryboardsChange: (storyboards: Storyboard[]) => void
  onConfirm: (storyboards: Storyboard[]) => void
}

function StoryboardGenerator({
  creativeSelection,
  script,
  videoConfig,
  initialStoryboards,
  onBack,
  onStoryboardsChange,
  onConfirm,
}: StoryboardGeneratorProps) {
  const { hotspot } = creativeSelection
  const [batchIndex, setBatchIndex] = useState(0)
  const [storyboards, setStoryboards] = useState<Storyboard[]>(
    initialStoryboards ?? [],
  )
  const [confirmed, setConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(!initialStoryboards?.length)
  const [status, setStatus] = useState<AIRequestStatus>(
    initialStoryboards?.length ? 'success' : 'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const initialStoryboardsRef = useRef(initialStoryboards)

  useEffect(() => {
    if (initialStoryboardsRef.current?.length) return
    let isCurrent = true
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    void generateStoryboard(script, videoConfig, 0)
      .then((generatedStoryboards) => {
        if (isCurrent && requestId.current === currentRequestId) {
          setStoryboards(generatedStoryboards)
          onStoryboardsChange(generatedStoryboards)
          setStatus('success')
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent && requestId.current === currentRequestId) {
          setStoryboards([])
          setError(getAIErrorMessage(requestError))
          setStatus('error')
        }
      })
      .finally(() => {
        if (isCurrent && requestId.current === currentRequestId) setIsLoading(false)
      })
    return () => {
      isCurrent = false
      if (requestId.current === currentRequestId) requestId.current += 1
    }
  }, [onStoryboardsChange, script, videoConfig])

  const refreshStoryboards = () => {
    if (isLoading) return
    const nextBatch = batchIndex + 1
    setBatchIndex(nextBatch)
    setStoryboards([])
    onStoryboardsChange([])
    setConfirmed(false)
    setIsLoading(true)
    setStatus('loading')
    setError(null)
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    void generateStoryboard(
      script,
      videoConfig,
      nextBatch,
      '换一批分镜，使用不同的画面调度和运镜方案。',
      storyboards,
    ).then((generatedStoryboards) => {
      if (requestId.current !== currentRequestId) return
      setStoryboards(generatedStoryboards)
      onStoryboardsChange(generatedStoryboards)
      setStatus('success')
    }).catch((requestError: unknown) => {
      if (requestId.current !== currentRequestId) return
      setStoryboards([])
      setError(getAIErrorMessage(requestError))
      setStatus('error')
    }).finally(() => {
      if (requestId.current === currentRequestId) setIsLoading(false)
    })
  }

  const reviseStoryboards = async (instruction: string) => {
    if (isLoading) return '分镜生成中，请稍后再试。'
    setIsLoading(true)
    setStatus('loading')
    setError(null)
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    try {
      const generatedStoryboards = await generateStoryboard(
        script,
        videoConfig,
        batchIndex,
        instruction,
        storyboards,
      )
      if (requestId.current !== currentRequestId) {
        throw new Error('较早的分镜修改请求已被新的请求取代')
      }
      setStoryboards(generatedStoryboards)
      onStoryboardsChange(generatedStoryboards)
      setConfirmed(false)
      setStatus('success')
      return `已根据“${instruction}”更新分镜列表，修改结果已同步到上方。`
    } catch (requestError) {
      setError(getAIErrorMessage(requestError))
      setStatus('error')
      throw requestError
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="storyboard-screen" aria-labelledby="storyboard-title">
      <div className="storyboard-page-header">
        <div>
          <div className="step-badge">STEP 6 · 分镜</div>
          <h2 id="storyboard-title">视频分镜生成</h2>
          <p className="step-description">根据已确认的热点、创意、脚本和视频参数生成可执行分镜。</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          返回视频参数
        </button>
      </div>

      <AIStatusNotice
        status={status}
        loadingMessage="AI 正在生成分镜…"
        errorMessage={error}
      />

      <div className="storyboard-context">
        <div><span>热点</span><strong>{hotspot.title}</strong></div>
        <div><span>创意</span><strong>{creativeSelection.idea.title}</strong></div>
        <div><span>脚本</span><strong>{script.title}</strong></div>
        <div><span>视频参数</span><strong>{videoConfig.ratio} · {videoConfig.duration} · {videoConfig.style} · {videoConfig.shotCount}</strong></div>
      </div>

      <div className="storyboard-list-heading">
        <div>
          <span className="section-number">01</span>
          <h3>分镜列表</h3>
          <span className="storyboard-count">共 {storyboards.length} 个镜头</span>
        </div>
        <span>第 {batchIndex + 1} 批分镜</span>
      </div>

      <div className="storyboard-list">
        {storyboards.map((storyboard) => (
          <StoryboardCard storyboard={storyboard} key={storyboard.id} />
        ))}
      </div>

      <div className="storyboard-actions">
        <button className="storyboard-refresh-action" type="button" disabled={isLoading} onClick={refreshStoryboards}>
          <span aria-hidden="true">↻</span>
          换一批分镜
        </button>
        <button
          className={`storyboard-confirm-action${confirmed ? ' is-confirmed' : ''}`}
          type="button"
          disabled={storyboards.length === 0 || isLoading}
          onClick={() => {
            if (storyboards.length === 0) return
            setConfirmed(true)
            onConfirm(storyboards)
          }}
        >
          {confirmed ? '✓ 分镜已确认' : '确认分镜'}
        </button>
      </div>

      {confirmed && (
        <div className="storyboard-confirmed-notice" role="status">
          <span aria-hidden="true">✓</span>
          分镜已确认。本阶段到此完成，不会进入 Prompt 页面。
        </div>
      )}

      <ChatBox
        contextTitle="视频分镜"
        heading="用自然语言修改分镜"
        sectionNumber="02"
        introMessage="你可以继续提出分镜修改意见，AI 会直接更新上方分镜列表。"
        suggestions={['增加一个反转镜头', '减少镜头数量', '更电影化', '更适合AI视频生成']}
        onMessage={reviseStoryboards}
        inputLabel="输入分镜修改要求"
        placeholder="例如：增加一个反转镜头…"
        disabled={isLoading}
      />
    </section>
  )
}

export default StoryboardGenerator
