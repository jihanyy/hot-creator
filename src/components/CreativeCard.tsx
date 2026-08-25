import type { Creative } from '../types/workflow'

interface CreativeCardProps {
  idea: Creative
  index: number
  selected?: boolean
  onSelect: (idea: Creative) => void
}

function CreativeCard({ idea, index, selected = false, onSelect }: CreativeCardProps) {
  return (
    <article className={`creative-card${selected ? ' is-selected' : ''}`}>
      <div className="creative-card-index">方案 {index + 1}</div>
      <h3>{idea.title}</h3>
      <p>{idea.description}</p>
      <button
        className={`creative-select-action${selected ? ' is-selected' : ''}`}
        type="button"
        onClick={() => onSelect(idea)}
      >
        {selected ? '✓ 已选择这个创意' : '选择这个创意'}
      </button>
    </article>
  )
}

export default CreativeCard
