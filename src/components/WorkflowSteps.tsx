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
    <section className="workflow-stepper" aria-label="热点创作工作流">
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
    </section>
  )
}

export default WorkflowSteps
