import type { Hotspot } from '../types/workflow'

interface HotspotCardProps {
  hotspot: Hotspot
  selected?: boolean
  onSelect: (hotspot: Hotspot) => void
}

function HotspotCard({ hotspot, selected = false, onSelect }: HotspotCardProps) {
  const recommendationIndex = hotspot.recommendationIndex ?? 0
  const recommendationReasons = hotspot.recommendationReasons ?? []

  return (
    <article className={`hotspot-card${selected ? ' is-selected' : ''}`}>
      <div className="hotspot-card-main">
        <div className="hotspot-card-heading">
          <span className="hotspot-label">推荐热点</span>
          <div className="recommendation-score" aria-label={`推荐指数 ${recommendationIndex}`}>
            <span>推荐指数</span>
            <strong>{recommendationIndex}</strong>
          </div>
        </div>

        <h3>{hotspot.title}</h3>
        <p className="hotspot-summary">{hotspot.summary}</p>

        <div className="score-track" aria-hidden="true">
          <span style={{ width: `${recommendationIndex}%` }} />
        </div>
      </div>

      {recommendationReasons.length > 0 && <div className="recommendation-reasons">
        <h4>详细推荐原因</h4>
        <ul>
          {recommendationReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>}

      <button
        className={`hotspot-action${selected ? ' is-selected' : ''}`}
        type="button"
        onClick={() => onSelect(hotspot)}
      >
        {selected ? '✓ 已选择' : '选择这个热点'}
      </button>
    </article>
  )
}

export default HotspotCard
