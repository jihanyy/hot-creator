import CreativeSuggestions from '../components/CreativeSuggestions'
import HotspotList from '../components/HotspotList'
import InterestSelector from '../components/InterestSelector'
import PromptGenerator from '../components/PromptGenerator'
import ScriptGenerator from '../components/ScriptGenerator'
import StoryboardGenerator from '../components/StoryboardGenerator'
import VideoConfig from '../components/VideoConfig'
import WorkflowSteps from '../components/WorkflowSteps'
import type { WorkflowStep } from '../components/WorkflowSteps'
import { useWorkflow } from '../context/workflow-context'
import type { WorkflowStepId } from '../types/workflow'

const workflowSteps: WorkflowStep[] = [
  { id: 'field', label: '选择关注领域' },
  { id: 'hotspot', label: '热点筛选' },
  { id: 'ideas', label: '创意建议' },
  { id: 'script', label: '脚本生成' },
  { id: 'video', label: '视频参数' },
  { id: 'storyboard', label: '分镜' },
  { id: 'prompt', label: '提示词' },
]

const completedSteps: Record<WorkflowStepId, string[]> = {
  field: [],
  hotspot: ['field'],
  ideas: ['field', 'hotspot'],
  script: ['field', 'hotspot', 'ideas'],
  video: ['field', 'hotspot', 'ideas', 'script'],
  storyboard: ['field', 'hotspot', 'ideas', 'script', 'video'],
  prompt: ['field', 'hotspot', 'ideas', 'script', 'video', 'storyboard'],
}

function HotCreator() {
  const {
    state,
    setInterests,
    refreshHotspots,
    selectHotspot,
    updateCreatives,
    selectCreative,
    updateScript,
    confirmScript,
    updateVideoConfig,
    confirmVideoConfig,
    updateStoryboards,
    confirmStoryboards,
    updatePrompts,
    goToStep,
    resetWorkflow,
  } = useWorkflow()

  const creativeSelection = state.creativeSelection

  return (
    <div className="hot-creator-page">
      <WorkflowSteps
        steps={workflowSteps}
        activeStepId={state.activeStep}
        completedStepIds={completedSteps[state.activeStep]}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <h1>热点创作 AI Agent</h1>
            <div className="agent-status">
              <span className="status-dot" aria-hidden="true" />
              AI 服务模式
            </div>
          </div>
          <button className="new-task-button" type="button" onClick={resetWorkflow}>
            ＋ 新建创作
          </button>
        </header>

        <div className="step-content">
          {state.activeStep === 'field' ? (
            <InterestSelector
              initialInterests={state.interests}
              onStartFiltering={setInterests}
            />
          ) : state.activeStep === 'hotspot' ? (
            <HotspotList
              interests={state.interests}
              batchIndex={state.hotspotBatchIndex}
              selectedHotspot={state.hotspot ?? undefined}
              onBack={() => goToStep('field')}
              onRefresh={refreshHotspots}
              onSelect={selectHotspot}
            />
          ) : state.activeStep === 'ideas' && state.hotspot ? (
            <CreativeSuggestions
              hotspot={state.hotspot}
              interests={state.interests}
              initialIdeas={state.creatives}
              initialVideoStyle={state.creativeSelection?.videoStyle}
              onBack={() => goToStep('hotspot')}
              onIdeasChange={updateCreatives}
              onSelectCreative={selectCreative}
            />
          ) : state.activeStep === 'script' && creativeSelection ? (
            <ScriptGenerator
              creativeSelection={creativeSelection}
              currentScript={state.script}
              onBack={() => goToStep('ideas')}
              onScriptChange={updateScript}
              onConfirm={confirmScript}
            />
          ) : state.activeStep === 'video' && state.script ? (
            <VideoConfig
              script={state.script}
              initialConfig={state.videoConfig ?? undefined}
              onBack={() => goToStep('script')}
              onConfigChange={updateVideoConfig}
              onConfirm={confirmVideoConfig}
            />
          ) : state.activeStep === 'storyboard' &&
            creativeSelection &&
            state.script &&
            state.videoConfig ? (
            <StoryboardGenerator
              creativeSelection={creativeSelection}
              script={state.script}
              videoConfig={state.videoConfig}
              initialStoryboards={state.storyboards.length > 0 ? state.storyboards : undefined}
              onBack={() => goToStep('video')}
              onStoryboardsChange={updateStoryboards}
              onConfirm={confirmStoryboards}
            />
          ) : state.activeStep === 'prompt' &&
            state.storyboards.length > 0 &&
            state.videoConfig ? (
            <PromptGenerator
              storyboards={state.storyboards}
              initialPrompts={state.prompts}
              videoConfig={state.videoConfig}
              initialStatus={state.promptStatus}
              initialError={state.promptError}
              onBack={() => goToStep('storyboard')}
              onPromptsChange={updatePrompts}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default HotCreator
