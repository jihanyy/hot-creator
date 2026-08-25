import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Interest } from '../types/workflow'

const interestOptions = [
  { id: '餐饮', icon: '餐' },
  { id: '酒店民宿', icon: '宿' },
  { id: '电商零售', icon: '商' },
  { id: '教育', icon: '学' },
  { id: '美妆', icon: '美' },
  { id: '宠物娱乐', icon: '宠' },
  { id: '自媒体', icon: '创' },
  { id: '其他', icon: '＋' },
] as const

interface InterestSelectorProps {
  initialInterests?: Interest[]
  onStartFiltering: (interests: Interest[]) => void
}

function InterestSelector({ initialInterests = [], onStartFiltering }: InterestSelectorProps) {
  const initialCustomInterest = initialInterests.find((interest) => interest.isCustom)?.name ?? ''
  const [selectedOptions, setSelectedOptions] = useState<string[]>([
    ...initialInterests.filter((interest) => !interest.isCustom).map((interest) => interest.name),
    ...(initialCustomInterest ? ['其他'] : []),
  ])
  const [customInterest, setCustomInterest] = useState(initialCustomInterest)

  const isOtherSelected = selectedOptions.includes('其他')
  const finalInterests = useMemo<Interest[]>(() => {
    const standardInterests = selectedOptions
      .filter((option) => option !== '其他')
      .map((name) => ({ id: name, name }))
    const customValue = customInterest.trim()
    return customValue && isOtherSelected
      ? [...standardInterests, { id: `custom:${customValue}`, name: customValue, isCustom: true }]
      : standardInterests
  }, [customInterest, isOtherSelected, selectedOptions])

  const handleToggle = (option: string) => {
    setSelectedOptions((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (finalInterests.length > 0) {
      onStartFiltering(finalInterests)
    }
  }

  const interestNames = finalInterests.map((interest) => interest.name)

  return (
    <section className="interest-screen" aria-labelledby="interest-title">
      <div className="step-badge">STEP 1 · 关注领域</div>
      <h2 id="interest-title">请选择你关注的领域，根据领域筛选热点</h2>
      <p className="step-description">可以选择多个领域，我们会优先推荐与你最相关、创作价值更高的热点。</p>

      <form className="interest-form" onSubmit={handleSubmit}>
        <div className="interest-grid" aria-label="关注领域，可多选">
          {interestOptions.map((option) => {
            const isSelected = selectedOptions.includes(option.id)

            return (
              <button
                className={`interest-option${isSelected ? ' is-selected' : ''}`}
                type="button"
                key={option.id}
                aria-pressed={isSelected}
                onClick={() => handleToggle(option.id)}
              >
                <span className="interest-icon" aria-hidden="true">{option.icon}</span>
                <span>{option.id}</span>
                <span className="interest-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>

        {isOtherSelected && (
          <div className="custom-interest-field">
            <label htmlFor="custom-interest">输入其他关注领域</label>
            <input
              id="custom-interest"
              type="text"
              value={customInterest}
              placeholder="例如：城市文旅、健身、数码科技"
              maxLength={24}
              autoFocus
              onChange={(event) => setCustomInterest(event.target.value)}
            />
            <span>{customInterest.length}/24</span>
          </div>
        )}

        <div className="selection-summary" aria-live="polite">
          {interestNames.length > 0
            ? `已选择 ${interestNames.length} 个领域：${interestNames.join('、')}`
            : '请至少选择一个关注领域'}
        </div>

        <button className="primary-action" type="submit" disabled={finalInterests.length === 0}>
          开始筛选热点
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  )
}

export default InterestSelector
