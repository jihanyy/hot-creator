import type { WorkflowState, WorkflowStepId } from '../types/workflow'

export const CREATION_HISTORY_STORAGE_KEY = 'hot-creator.creation-history.v1'
export const MAX_CREATION_HISTORY = 40

export interface CreationHistoryRecord {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  workflow: WorkflowState
}

interface CreationHistoryEnvelope {
  version: 1
  records: CreationHistoryRecord[]
}

const workflowStepIds = new Set<WorkflowStepId>([
  'field',
  'hotspot',
  'ideas',
  'script',
  'video',
  'storyboard',
  'prompt',
])

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWorkflowState(value: unknown): value is WorkflowState {
  if (!isObject(value)) return false

  return (
    typeof value.activeStep === 'string' &&
    workflowStepIds.has(value.activeStep as WorkflowStepId) &&
    Array.isArray(value.interests) &&
    typeof value.hotspotBatchIndex === 'number' &&
    (
      value.hotspotPage === undefined ||
      value.hotspotPage === null ||
      (
        isObject(value.hotspotPage) &&
        Array.isArray(value.hotspotPage.interests) &&
        typeof value.hotspotPage.hotspotBatchIndex === 'number' &&
        Array.isArray(value.hotspotPage.hotspots)
      )
    ) &&
    Array.isArray(value.creatives) &&
    Array.isArray(value.storyboards) &&
    Array.isArray(value.prompts) &&
    typeof value.promptStatus === 'string' &&
    (value.promptError === null || typeof value.promptError === 'string')
  )
}

function isCreationHistoryRecord(value: unknown): value is CreationHistoryRecord {
  if (!isObject(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.title === 'string' &&
    isWorkflowState(value.workflow)
  )
}

function sortNewestFirst(records: CreationHistoryRecord[]) {
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function readStoredRecords(): CreationHistoryRecord[] {
  const storage = getLocalStorage()
  if (!storage) return []

  try {
    const serialized = storage.getItem(CREATION_HISTORY_STORAGE_KEY)
    if (!serialized) return []

    const parsed: unknown = JSON.parse(serialized)
    if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.records)) {
      return []
    }

    return sortNewestFirst(parsed.records.filter(isCreationHistoryRecord))
  } catch {
    return []
  }
}

function writeStoredRecords(records: CreationHistoryRecord[]) {
  const storage = getLocalStorage()
  if (!storage) return

  const envelope: CreationHistoryEnvelope = {
    version: 1,
    records,
  }

  try {
    storage.setItem(CREATION_HISTORY_STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Storage can be unavailable or full. History must never break the workflow.
  }
}

function cloneWorkflow(workflow: WorkflowState): WorkflowState {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowState
}

export function createHistorySessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `creation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getCreationHistoryTitle(workflow: WorkflowState) {
  return workflow.hotspot?.title.trim() || '未命名创作'
}

export function isCompleteCreationWorkflow(workflow: WorkflowState) {
  return Boolean(
    workflow.activeStep === 'prompt' &&
      workflow.interests.length > 0 &&
      workflow.hotspot &&
      workflow.creativeSelection &&
      workflow.script &&
      workflow.videoConfig &&
      workflow.storyboards.length > 0 &&
      workflow.prompts.length > 0 &&
      workflow.promptStatus === 'success',
  )
}

export function listCreationHistory() {
  return readStoredRecords()
}

export function getCreationHistory(id: string) {
  return readStoredRecords().find((record) => record.id === id) ?? null
}

export function saveCreationHistory(id: string, workflow: WorkflowState) {
  const records = readStoredRecords()
  const existing = records.find((record) => record.id === id)
  const title = getCreationHistoryTitle(workflow)
  const snapshot = cloneWorkflow(workflow)

  if (
    existing &&
    existing.title === title &&
    JSON.stringify(existing.workflow) === JSON.stringify(snapshot)
  ) {
    return existing
  }

  const timestamp = new Date().toISOString()
  const savedRecord: CreationHistoryRecord = {
    id,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    title,
    workflow: snapshot,
  }

  const nextRecords = sortNewestFirst([
    savedRecord,
    ...records.filter((record) => record.id !== id),
  ]).slice(0, MAX_CREATION_HISTORY)
  writeStoredRecords(nextRecords)

  return savedRecord
}

export function deleteCreationHistory(id: string) {
  const nextRecords = readStoredRecords().filter((record) => record.id !== id)
  writeStoredRecords(nextRecords)
  return nextRecords
}
