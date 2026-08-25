export interface WorkflowStep {
  id: string
  label: string
}

interface WorkflowStepsProps {
  steps: WorkflowStep[]
  activeStepId: string
  completedStepIds?: string[]
}

function WorkflowSteps({
  steps,
  activeStepId,
  completedStepIds = [],
}: WorkflowStepsProps) {
  return (
    <aside className="workflow-sidebar" aria-label="热点创作工作流">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          H
        </span>
        <div className="brand-copy">
          <strong>Hot Creator</strong>
          <span>热点内容工作台</span>
        </div>
      </div>

      <p className="workflow-heading">创作工作流</p>
      <nav aria-label="创作步骤">
        <ol className="workflow-list">
          {steps.map((step, index) => {
            const isActive = step.id === activeStepId
            const isCompleted = completedStepIds.includes(step.id)

            return (
              <li
                className={`workflow-step${isActive ? ' is-active' : ''}${
                  isCompleted ? ' is-completed' : ''
                }`}
                key={step.id}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="step-check" aria-hidden="true">
                  {isCompleted ? '✓' : index + 1}
                </span>
                <span>{step.label}</span>
              </li>
            )
          })}
        </ol>
      </nav>
    </aside>
  )
}

export default WorkflowSteps
