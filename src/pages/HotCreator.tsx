import { useEffect, useRef, useState } from 'react'
import CreativeSuggestions from '../components/CreativeSuggestions'
import HistorySidebar from '../components/HistorySidebar'
import HotspotList from '../components/HotspotList'
import InterestSelector from '../components/InterestSelector'
import PromptGenerator from '../components/PromptGenerator'
import ScriptGenerator from '../components/ScriptGenerator'
import StoryboardGenerator from '../components/StoryboardGenerator'
import ThemeToggle from '../components/ThemeToggle'
import VideoConfig from '../components/VideoConfig'
import WorkflowSteps from '../components/WorkflowSteps'
import type { WorkflowStep } from '../components/WorkflowSteps'
import { useWorkflow } from '../context/workflow-context'
import {
  createHistorySessionId,
  deleteCreationHistory,
  getCreationHistory,
  isCompleteCreationWorkflow,
  listCreationHistory,
  saveCreationHistory,
} from '../services/creationHistory'
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
    updateHotspotPage,
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
    restoreWorkflow,
    resetWorkflow,
  } = useWorkflow()

  const creativeSelection = state.creativeSelection
  const historySessionId = useRef(createHistorySessionId())
  const [histories, setHistories] = useState(listCreationHistory)

  useEffect(() => {
    if (!isCompleteCreationWorkflow(state)) return

    saveCreationHistory(historySessionId.current, state)
    const refreshHistoryId = window.setTimeout(() => {
      setHistories(listCreationHistory())
    }, 0)

    return () => window.clearTimeout(refreshHistoryId)
  }, [state])

  const startNewCreation = () => {
    historySessionId.current = createHistorySessionId()
    resetWorkflow()
  }

  const restoreHistory = (id: string) => {
    const history = getCreationHistory(id)
    if (!history) {
      setHistories(listCreationHistory())
      return
    }

    historySessionId.current = history.id
    restoreWorkflow(history.workflow)
  }

  const removeHistory = (id: string) => {
    if (!window.confirm('确定删除这条历史记录吗？')) return

    if (historySessionId.current === id) {
      historySessionId.current = createHistorySessionId()
    }
    setHistories(deleteCreationHistory(id))
  }

  return (
    <div className="hot-creator-page">
      <main className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <h1>祥子绘境</h1>
            <div className="agent-status">
              <span className="status-dot" aria-hidden="true" />
              热点AI创作
            </div>
          </div>

          <WorkflowSteps
            steps={workflowSteps}
            activeStepId={state.activeStep}
            completedStepIds={completedSteps[state.activeStep]}
          />

          <div className="workspace-header-actions">
            <ThemeToggle />
            <button className="new-task-button" type="button" onClick={startNewCreation}>
              ＋ 新建创作
            </button>
          </div>
        </header>

        <div className="workspace-body">
          <HistorySidebar
            histories={histories}
            onRestore={restoreHistory}
            onDelete={removeHistory}
          />

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
                initialHotspotPage={state.hotspotPage}
                selectedHotspot={state.hotspot ?? undefined}
                onBack={() => goToStep('field')}
                onRefresh={refreshHotspots}
                onHotspotPageChange={updateHotspotPage}
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
        </div>
      </main>
    </div>
  )
}

export default HotCreator
