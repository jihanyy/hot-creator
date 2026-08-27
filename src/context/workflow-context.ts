import { createContext, useContext } from 'react'
import type {
  CreativeSelection,
  Creative,
  Hotspot,
  HotspotPageSnapshot,
  Interest,
  Prompt,
  Script,
  Storyboard,
  VideoConfig,
  WorkflowState,
  WorkflowStepId,
} from '../types/workflow'

export interface WorkflowContextValue {
  state: WorkflowState
  setInterests: (interests: Interest[]) => void
  refreshHotspots: () => void
  updateHotspotPage: (page: HotspotPageSnapshot) => void
  selectHotspot: (hotspot: Hotspot) => void
  updateCreatives: (creatives: Creative[]) => void
  selectCreative: (selection: CreativeSelection) => void
  updateScript: (script: Script) => void
  confirmScript: (script: Script) => void
  updateVideoConfig: (config: VideoConfig) => void
  confirmVideoConfig: (config: VideoConfig) => void
  updateStoryboards: (storyboards: Storyboard[]) => void
  confirmStoryboards: (storyboards: Storyboard[]) => void
  updatePrompts: (prompts: Prompt[]) => void
  goToStep: (step: WorkflowStepId) => void
  restoreWorkflow: (state: WorkflowState) => void
  resetWorkflow: () => void
}

export const WorkflowContext = createContext<WorkflowContextValue | null>(null)

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (!context) {
    throw new Error('useWorkflow 必须在 WorkflowProvider 内使用')
  }
  return context
}
