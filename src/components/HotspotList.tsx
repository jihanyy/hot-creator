import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import HotspotCard from './HotspotCard'
import {
  getHotspots,
  HOTSPOT_AI_ERROR_MESSAGE,
  HOTSPOT_DATA_ERROR_MESSAGE,
  HOTSPOT_EMPTY_MESSAGE,
  HOTSPOT_NO_MORE_MESSAGE,
} from '../services/api'
import type { AIRequestStatus } from '../types/workflow'
import type { Hotspot, Interest } from '../types/workflow'

interface HotspotListProps {
  interests: Interest[]
  batchIndex: number
  selectedHotspot?: Hotspot
  onBack: () => void
  onRefresh: () => void
  onSelect: (hotspot: Hotspot) => void
}

function HotspotList({
  interests,
  batchIndex,
  selectedHotspot,
  onBack,
  onRefresh,
  onSelect,
}: HotspotListProps) {
  const recommendationRequestController = useRef<AbortController | null>(null)
  const [manualHotspotTitle, setManualHotspotTitle] = useState('')
  const [manualHotspotSummary, setManualHotspotSummary] = useState('')
  const requestKey = `${batchIndex}:${interests.map((interest) => interest.id).join(',')}`
  const [hotspotResult, setHotspotResult] = useState<{
    requestKey: string
    hotspots: Hotspot[]
    error: string | null
    status: AIRequestStatus
  } | null>(null)
  const hotspots =
    hotspotResult?.requestKey === requestKey
      ? hotspotResult.hotspots
      : []
  const isLoading = hotspotResult?.requestKey !== requestKey
  const error = hotspotResult?.requestKey === requestKey
    ? hotspotResult.error
    : null

  useEffect(() => {
    let isCurrent = true
    const controller = new AbortController()
    recommendationRequestController.current = controller

    void getHotspots(interests, batchIndex, controller.signal)
      .then((nextHotspots) => {
        if (isCurrent) {
          setHotspotResult({
            requestKey,
            hotspots: nextHotspots,
            error: null,
            status: 'success',
          })
        }
      })
      .catch((requestError: unknown) => {
        if (!isCurrent) return
        if (controller.signal.aborted) {
          console.warn('[Step2] 推荐请求被取消，跳过错误状态')
          return
        }
        console.error('[Step2] getHotspots 流程失败', requestError)
        const message = requestError instanceof Error && requestError.message === HOTSPOT_DATA_ERROR_MESSAGE
          ? HOTSPOT_DATA_ERROR_MESSAGE
          : HOTSPOT_AI_ERROR_MESSAGE
        setHotspotResult({
          requestKey,
          hotspots: [],
          error: message,
          status: 'error',
        })
      })

    return () => {
      isCurrent = false
      controller.abort()
      if (recommendationRequestController.current === controller) {
        recommendationRequestController.current = null
      }
    }
  }, [batchIndex, interests, requestKey])

  const useManualHotspot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = manualHotspotTitle.trim()
    const summary = manualHotspotSummary.trim()
    if (!title) return

    recommendationRequestController.current?.abort()
    onSelect({
      title,
      summary,
      platform: '用户输入',
      rank: 1,
      hotScore: 0,
    })
  }

  const selectedKey = selectedHotspot
    ? `${selectedHotspot.platform}:${selectedHotspot.rank}:${selectedHotspot.title}`
    : undefined
  const selectedHotspotInBatch = hotspots.find(
    (hotspot) => `${hotspot.platform}:${hotspot.rank}:${hotspot.title}` === selectedKey,
  )

  return (
    <section className="hotspot-screen" aria-labelledby="hotspot-list-title">
      <div className="hotspot-list-header">
        <div>
          <div className="step-badge">STEP 2 · 热点筛选</div>
          <h2 id="hotspot-list-title">为你推荐的热点</h2>
          <p className="step-description">
            将根据 <strong>{interests.map((interest) => interest.name).join('、')}</strong>{' '}
            进行领域匹配和创作价值筛选。
          </p>
        </div>
        <div className="list-actions">
          <button className="secondary-action" type="button" onClick={onBack}>
            重新选择领域
          </button>
          <button className="refresh-action" type="button" onClick={onRefresh}>
            <span aria-hidden="true">↻</span>
            换一批
          </button>
        </div>
      </div>

      <form className="manual-hotspot-form" onSubmit={useManualHotspot}>
        <strong className="manual-hotspot-title">已有热点？直接创作</strong>
        <div className="manual-hotspot-field manual-hotspot-title-field">
          <label className="manual-hotspot-field-label" htmlFor="manual-hotspot-title">
            热点标题
          </label>
          <input
            id="manual-hotspot-title"
            type="text"
            value={manualHotspotTitle}
            onChange={(event) => setManualHotspotTitle(event.target.value)}
            placeholder="输入你想创作的热点"
          />
        </div>
        <div className="manual-hotspot-field manual-hotspot-summary-field">
          <label className="manual-hotspot-field-label" htmlFor="manual-hotspot-summary">
            希望创作的内容
          </label>
          <input
            id="manual-hotspot-summary"
            type="text"
            value={manualHotspotSummary}
            onChange={(event) => setManualHotspotSummary(event.target.value)}
            placeholder="输入你希望创作的内容"
          />
        </div>
        <button
          className="secondary-action"
          type="submit"
          disabled={!manualHotspotTitle.trim()}
        >
          使用这个热点
        </button>
      </form>

      <div
        className="batch-note"
        role={error ? 'alert' : !isLoading && hotspots.length === 0 ? 'status' : undefined}
      >
        {isLoading
          ? `第 ${batchIndex + 1} 批 · AI 正在筛选热点…`
          : error ?? (hotspots.length === 0
              ? batchIndex > 0 ? HOTSPOT_NO_MORE_MESSAGE : HOTSPOT_EMPTY_MESSAGE
              : `第 ${batchIndex + 1} 批 · 共 ${hotspots.length} 个推荐热点`)}
      </div>

      <div className="hotspot-list">
        {hotspots.map((hotspot) => (
          <HotspotCard
            hotspot={hotspot}
            key={`${hotspot.platform}:${hotspot.rank}:${hotspot.title}`}
            selected={`${hotspot.platform}:${hotspot.rank}:${hotspot.title}` === selectedKey}
            onSelect={onSelect}
          />
        ))}
      </div>

      {selectedHotspotInBatch && (
        <div className="selected-hotspot-notice" role="status">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>热点已选择</strong>
            <p>{selectedHotspotInBatch.title}</p>
          </div>
        </div>
      )}
    </section>
  )
}

export default HotspotList
