import { useEffect, useRef, useState } from 'react'
import AIStatusNotice from './AIStatusNotice'
import ChatBox from './ChatBox'
import CreativeCard from './CreativeCard'
import {
  generateCreative,
  getAIErrorMessage,
  getPublishTimeRecommendation,
} from '../services/api'
import { VIDEO_STYLES } from '../types/workflow'
import type {
  AIRequestStatus,
  Creative,
  CreativeSelection,
  Hotspot,
  Interest,
  PresetVideoStyle,
} from '../types/workflow'

interface CreativeSuggestionsProps {
  hotspot: Hotspot
  interests: Interest[]
  initialIdeas?: Creative[]
  initialVideoStyle?: string
  onBack: () => void
  onIdeasChange: (ideas: Creative[]) => void
  onSelectCreative: (selection: CreativeSelection) => void
}

function CreativeSuggestions({
  hotspot,
  interests,
  initialIdeas,
  initialVideoStyle,
  onBack,
  onIdeasChange,
  onSelectCreative,
}: CreativeSuggestionsProps) {
  const initialPresetStyle = VIDEO_STYLES.find((style) => style === initialVideoStyle)
  const initialCustomStyle = initialVideoStyle && !initialPresetStyle ? initialVideoStyle : ''
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>()
  const [selectedStyle, setSelectedStyle] = useState<PresetVideoStyle>(
    initialPresetStyle ?? '听AI推荐',
  )
  const [customStyle, setCustomStyle] = useState(initialCustomStyle)
  const [isCustomStyle, setIsCustomStyle] = useState(Boolean(initialCustomStyle))
  const [ideas, setIdeas] = useState<Creative[]>(initialIdeas ?? [])
  const [status, setStatus] = useState<AIRequestStatus>(
    initialIdeas?.length ? 'success' : 'loading',
  )
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const initialIdeasRef = useRef(initialIdeas)
  const customStyleInputRef = useRef<HTMLInputElement>(null)

  const publishTimeRecommendation = getPublishTimeRecommendation(hotspot)
  const industry = hotspot.matchedInterest ?? interests[0]?.name ?? '所选行业'
  const scriptStyle = isCustomStyle ? customStyle.trim() : selectedStyle

  useEffect(() => {
    if (isCustomStyle) customStyleInputRef.current?.focus()
  }, [isCustomStyle])

  useEffect(() => {
    if (batchIndex === 0 && initialIdeasRef.current?.length) return
    let isCurrent = true
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    void generateCreative(hotspot, interests, batchIndex)
      .then((generatedIdeas) => {
        if (isCurrent && requestId.current === currentRequestId) {
          setIdeas(generatedIdeas)
          onIdeasChange(generatedIdeas)
          setStatus('success')
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent && requestId.current === currentRequestId) {
          setIdeas([])
          setError(getAIErrorMessage(requestError))
          setStatus('error')
        }
      })
    return () => {
      isCurrent = false
    }
  }, [batchIndex, hotspot, interests, onIdeasChange])

  const refreshIdeas = () => {
    setIdeas([])
    onIdeasChange([])
    setStatus('loading')
    setError(null)
    setBatchIndex((current) => current + 1)
    setSelectedIdeaId(undefined)
  }

  const reviseIdeas = async (instruction: string) => {
    const currentRequestId = requestId.current + 1
    requestId.current = currentRequestId
    setStatus('loading')
    setError(null)
    try {
      const generatedIdeas = await generateCreative(
        hotspot,
        interests,
        batchIndex,
        instruction,
        ideas,
      )
      if (requestId.current !== currentRequestId) {
        throw new Error('较早的创意请求已被新的请求取代')
      }
      setIdeas(generatedIdeas)
      onIdeasChange(generatedIdeas)
      setSelectedIdeaId(undefined)
      setStatus('success')
      return `已根据“${instruction}”重新生成创意方案。`
    } catch (requestError) {
      setError(getAIErrorMessage(requestError))
      setStatus('error')
      throw requestError
    }
  }

  return (
    <section className="creative-screen" aria-labelledby="creative-screen-title">
      <div className="creative-page-header">
        <div>
          <div className="step-badge">STEP 3 · 创意建议</div>
          <h2 id="creative-screen-title">短视频内容创意建议</h2>
          <p className="step-description">围绕已选热点生成多个可执行的短视频内容方案。</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          返回热点列表
        </button>
      </div>

      <div className="selected-hotspot-context">
        <span>当前热点</span>
        <strong>{hotspot.title}</strong>
        <p>{hotspot.summary}</p>
      </div>

      <div className="creative-section-heading">
        <div>
          <span className="section-number">01</span>
          <h2>创意方案</h2>
        </div>
        <button className="refresh-action" type="button" disabled={status === 'loading'} onClick={refreshIdeas}>
          <span aria-hidden="true">↻</span>
          换一批
        </button>
      </div>

      <AIStatusNotice
        status={status}
        loadingMessage="AI 正在生成创意方案…"
        errorMessage={error}
      />

      <div className="creative-grid">
        {ideas.map((idea, index) => (
          <CreativeCard
            idea={idea}
            index={index}
            key={idea.id}
            selected={idea.id === selectedIdeaId}
            onSelect={(selectedIdea) => {
              if (!scriptStyle) {
                customStyleInputRef.current?.focus()
                return
              }
              setSelectedIdeaId(selectedIdea.id)
              onSelectCreative({
                hotspot,
                industry,
                idea: selectedIdea,
                videoStyle: scriptStyle,
              })
            }}
          />
        ))}
      </div>

      <section className="creative-panel" aria-labelledby="video-style-title">
        <div className="creative-section-heading compact">
          <div>
            <span className="section-number">02</span>
            <h2 id="video-style-title">脚本生成风格</h2>
          </div>
          <p>选择后将用于下一步脚本生成，不会调整当前创意方案</p>
        </div>
        <div className={`video-style-options${isCustomStyle ? ' has-custom-input' : ''}`}>
          {VIDEO_STYLES.map((style) => (
            <button
              className={!isCustomStyle && selectedStyle === style ? 'is-selected' : ''}
              type="button"
              key={style}
              aria-pressed={!isCustomStyle && selectedStyle === style}
              onClick={() => {
                setSelectedStyle(style)
                setIsCustomStyle(false)
              }}
            >
              {style === '听AI推荐' && <span aria-hidden="true">✦</span>}
              {style}
            </button>
          ))}
          {isCustomStyle ? (
            <input
              ref={customStyleInputRef}
              className="custom-script-style-input"
              aria-label="自定义脚本风格"
              placeholder="输入自定义风格"
              value={customStyle}
              onChange={(event) => setCustomStyle(event.target.value)}
              onBlur={() => {
                const value = customStyle.trim()
                if (value) {
                  setCustomStyle(value)
                } else {
                  setIsCustomStyle(false)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  setCustomStyle('')
                  setIsCustomStyle(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              aria-pressed={false}
              onClick={() => setIsCustomStyle(true)}
            >
              自定义
            </button>
          )}
        </div>
      </section>

      <section className="publish-time-panel" aria-labelledby="publish-time-title">
        <div className="publish-time-copy">
          <div className="publish-time-heading">
            <span className="section-number">03</span>
            <h2 id="publish-time-title">推荐发布时间</h2>
          </div>
          <p>建议发布时间</p>
          <strong>{publishTimeRecommendation.time}</strong>
        </div>
        <div className="publish-reason">
          <span>推荐原因</span>
          <p>{publishTimeRecommendation.reason}</p>
        </div>
      </section>

      <ChatBox
        contextTitle={hotspot.title}
        heading="调整创意方向"
        introMessage="可以补充你的创作要求，AI 会根据你的想法重新调整创意方案。"
        inputLabel="输入希望调整的创意方向"
        placeholder="输入你希望调整的创意方向，例如：换一个角度、更适合老板账号、更有冲突感"
        suggestions={['换一个角度', '更适合老板账号', '更有冲突感']}
        onMessage={reviseIdeas}
        disabled={status === 'loading'}
      />
    </section>
  )
}

export default CreativeSuggestions
