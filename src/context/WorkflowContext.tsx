import { useCallback, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  generatePrompt,
  getAIErrorMessage,
} from '../services/api'
import { WorkflowContext } from './workflow-context'
import type { WorkflowContextValue } from './workflow-context'
import type {
  CreativeSelection,
  Creative,
  Hotspot,
  Interest,
  Prompt,
  Script,
  Storyboard,
  VideoConfig,
  WorkflowState,
  WorkflowStepId,
} from '../types/workflow'

const initialWorkflowState: WorkflowState = {
  activeStep: 'field',
  interests: [],
  hotspotBatchIndex: 0,
  hotspot: null,
  creatives: [],
  creativeSelection: null,
  script: null,
  videoConfig: null,
  storyboards: [],
  prompts: [],
  promptStatus: 'idle',
  promptError: null,
}

type WorkflowAction =
  | { type: 'SET_INTERESTS'; payload: Interest[] }
  | { type: 'REFRESH_HOTSPOTS'; payload: number }
  | { type: 'SET_HOTSPOT'; payload: Hotspot }
  | { type: 'UPDATE_CREATIVES'; payload: Creative[] }
  | { type: 'SET_CREATIVE'; payload: CreativeSelection }
  | { type: 'UPDATE_SCRIPT'; payload: Script }
  | { type: 'SET_SCRIPT'; payload: Script }
  | { type: 'SET_VIDEO_CONFIG'; payload: VideoConfig }
  | { type: 'UPDATE_VIDEO_CONFIG'; payload: VideoConfig }
  | { type: 'UPDATE_STORYBOARDS'; payload: Storyboard[] }
  | { type: 'SET_STORYBOARDS'; payload: { storyboards: Storyboard[]; prompts: Prompt[] } }
  | { type: 'SET_PROMPTS'; payload: Prompt[] }
  | { type: 'SET_PROMPT_ERROR'; payload: string }
  | { type: 'GO_TO_STEP'; payload: WorkflowStepId }
  | { type: 'RESET' }

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'SET_INTERESTS':
      return {
        ...initialWorkflowState,
        activeStep: 'hotspot',
        interests: action.payload,
      }
    case 'SET_HOTSPOT':
      return {
        ...state,
        activeStep: 'ideas',
        hotspot: action.payload,
        creatives: [],
        creativeSelection: null,
        script: null,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'REFRESH_HOTSPOTS':
      return {
        ...state,
        activeStep: 'hotspot',
        hotspotBatchIndex: action.payload,
        hotspot: null,
        creatives: [],
        creativeSelection: null,
        script: null,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'UPDATE_CREATIVES':
      return {
        ...state,
        creatives: action.payload,
        creativeSelection: null,
        script: null,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'SET_CREATIVE':
      return {
        ...state,
        activeStep: 'script',
        hotspot: action.payload.hotspot,
        creativeSelection: action.payload,
        script: null,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'SET_SCRIPT':
      return {
        ...state,
        activeStep: 'video',
        script: action.payload,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'UPDATE_SCRIPT':
      return {
        ...state,
        script: action.payload,
        videoConfig: null,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'SET_VIDEO_CONFIG':
      return {
        ...state,
        activeStep: 'storyboard',
        videoConfig: action.payload,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'UPDATE_VIDEO_CONFIG':
      return {
        ...state,
        videoConfig: action.payload,
        storyboards: [],
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'UPDATE_STORYBOARDS':
      return {
        ...state,
        storyboards: action.payload,
        prompts: [],
        promptStatus: 'idle',
        promptError: null,
      }
    case 'SET_STORYBOARDS':
      return {
        ...state,
        activeStep: 'prompt',
        storyboards: action.payload.storyboards,
        prompts: action.payload.prompts,
        promptStatus: 'loading',
        promptError: null,
      }
    case 'SET_PROMPTS':
      return {
        ...state,
        prompts: action.payload,
        promptStatus: 'success',
        promptError: null,
      }
    case 'SET_PROMPT_ERROR':
      return {
        ...state,
        prompts: [],
        promptStatus: 'error',
        promptError: action.payload,
      }
    case 'GO_TO_STEP':
      return { ...state, activeStep: action.payload }
    case 'RESET':
      return initialWorkflowState
  }
}

interface WorkflowProviderProps {
  children: ReactNode
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState)
  const promptGenerationId = useRef(0)

  const invalidatePromptGeneration = () => {
    promptGenerationId.current += 1
  }

  const updateScript = useCallback((script: Script) => {
    promptGenerationId.current += 1
    dispatch({ type: 'UPDATE_SCRIPT', payload: script })
  }, [])

  const updateCreatives = useCallback((creatives: Creative[]) => {
    promptGenerationId.current += 1
    dispatch({ type: 'UPDATE_CREATIVES', payload: creatives })
  }, [])

  const updateVideoConfig = useCallback((config: VideoConfig) => {
    promptGenerationId.current += 1
    dispatch({ type: 'UPDATE_VIDEO_CONFIG', payload: config })
  }, [])

  const updateStoryboards = useCallback((storyboards: Storyboard[]) => {
    promptGenerationId.current += 1
    dispatch({ type: 'UPDATE_STORYBOARDS', payload: storyboards })
  }, [])

  const value: WorkflowContextValue = {
    state,
    setInterests: (interests) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_INTERESTS', payload: interests })
    },
    refreshHotspots: () => {
      invalidatePromptGeneration()
      dispatch({
        type: 'REFRESH_HOTSPOTS',
        payload: state.hotspotBatchIndex + 1,
      })
    },
    selectHotspot: (hotspot) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_HOTSPOT', payload: hotspot })
    },
    updateCreatives,
    selectCreative: (selection) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_CREATIVE', payload: selection })
    },
    updateScript,
    confirmScript: (script) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_SCRIPT', payload: script })
    },
    updateVideoConfig,
    confirmVideoConfig: (config) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_VIDEO_CONFIG', payload: config })
    },
    updateStoryboards,
    confirmStoryboards: (storyboards) => {
      if (!state.videoConfig) return
      const generationId = promptGenerationId.current + 1
      promptGenerationId.current = generationId
      dispatch({
        type: 'SET_STORYBOARDS',
        payload: {
          storyboards,
          prompts: [],
        },
      })
      void generatePrompt(storyboards, state.videoConfig)
        .then((prompts) => {
          if (promptGenerationId.current === generationId) {
            dispatch({ type: 'SET_PROMPTS', payload: prompts })
          }
        })
        .catch((error: unknown) => {
          if (promptGenerationId.current === generationId) {
            dispatch({ type: 'SET_PROMPT_ERROR', payload: getAIErrorMessage(error) })
          }
        })
    },
    updatePrompts: (prompts) => {
      invalidatePromptGeneration()
      dispatch({ type: 'SET_PROMPTS', payload: prompts })
    },
    goToStep: (step) => dispatch({ type: 'GO_TO_STEP', payload: step }),
    resetWorkflow: () => {
      invalidatePromptGeneration()
      dispatch({ type: 'RESET' })
    },
  }

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}
