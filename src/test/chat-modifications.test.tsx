import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreativeSuggestions from '../components/CreativeSuggestions'
import PromptGenerator from '../components/PromptGenerator'
import StoryboardGenerator from '../components/StoryboardGenerator'
import VideoConfig from '../components/VideoConfig'
import { WorkflowProvider } from '../context/WorkflowContext'
import { useWorkflow } from '../context/workflow-context'
import type {
  Creative,
  CreativeSelection,
  Hotspot,
  Prompt,
  Script,
  Storyboard,
  VideoConfig as VideoConfigState,
} from '../types/workflow'

const hotspot: Hotspot = {
  title: '酒店订单收入讨论',
  summary: '消费者关注价格、平台费用和服务价值。',
  platform: '微博',
  rank: 1,
  hotScore: 900_000,
  matchedInterest: '酒店民宿',
}

const interests = [{ id: 'hotel', name: '酒店民宿' }]

const creativeSelection: CreativeSelection = {
  hotspot,
  industry: '酒店民宿',
  idea: {
    id: 'idea-cost',
    title: '把一笔订单拆成可见成本',
    description: '用具体道具展示价格和服务交付。',
  },
  videoStyle: '抽象创意',
}

const script: Script = {
  id: 'script-1',
  title: '一笔订单怎么拆',
  hook: '订单总价不等于商家收入。',
  body: '逐项展示清洁、布草、人力和入住服务。',
  ending: '把价格和交付放在一起看。',
}

const initialConfig: VideoConfigState = {
  ratio: '9:16 竖屏',
  duration: '30秒',
  style: '真实纪实',
  shotCount: '5个镜头',
  source: 'manual',
}

const initialStoryboards: Storyboard[] = [{
  id: 'shot-1',
  shotNumber: 1,
  duration: '3秒',
  visualDescription: '老板展示订单明细。',
  narration: '这是顾客支付的总价。',
  shootingAdvice: '竖屏近景。',
  imagePrompt: '真实民宿前台与订单。',
  videoPrompt: '老板指向订单费用项。',
}]

const initialPrompts: Prompt[] = [{
  id: 'prompt-1',
  shotNumber: 1,
  imagePrompt: '真实民宿前台，老板手持订单。',
  videoPrompt: {
    sceneDescription: '民宿前台。',
    characterAction: '老板展示订单。',
    cameraMovement: '缓慢推近。',
    videoStyle: '真实纪实。',
    timing: '0-3秒。',
    fullPrompt: '民宿前台近景，老板展示订单，镜头缓慢推近。',
  },
}]

function sendChat(label: string, instruction = '更幽默') {
  fireEvent.change(screen.getByLabelText(label), { target: { value: instruction } })
  fireEvent.click(screen.getByRole('button', { name: '发送创意要求' }))
}

function CreativeHarness() {
  const { state, updateCreatives } = useWorkflow()
  return (
    <>
      <CreativeSuggestions
        hotspot={hotspot}
        interests={interests}
        initialIdeas={state.creatives}
        onBack={vi.fn()}
        onIdeasChange={updateCreatives}
        onSelectCreative={vi.fn()}
      />
      <output data-testid="creative-context">{JSON.stringify(state.creatives)}</output>
    </>
  )
}

function VideoConfigHarness() {
  const { state, updateVideoConfig } = useWorkflow()
  return (
    <>
      <VideoConfig
        script={script}
        initialConfig={state.videoConfig ?? initialConfig}
        onBack={vi.fn()}
        onConfigChange={updateVideoConfig}
        onConfirm={vi.fn()}
      />
      <output data-testid="video-context">{JSON.stringify(state.videoConfig)}</output>
    </>
  )
}

function StoryboardHarness() {
  const { state, updateStoryboards } = useWorkflow()
  return (
    <>
      <StoryboardGenerator
        creativeSelection={creativeSelection}
        script={script}
        videoConfig={initialConfig}
        initialStoryboards={state.storyboards.length ? state.storyboards : initialStoryboards}
        onBack={vi.fn()}
        onStoryboardsChange={updateStoryboards}
        onConfirm={vi.fn()}
      />
      <output data-testid="storyboard-context">{JSON.stringify(state.storyboards)}</output>
    </>
  )
}

function PromptHarness() {
  const { state, updatePrompts } = useWorkflow()
  return (
    <>
      <PromptGenerator
        storyboards={initialStoryboards}
        initialPrompts={state.prompts.length ? state.prompts : initialPrompts}
        videoConfig={initialConfig}
        initialStatus="success"
        initialError={null}
        onBack={vi.fn()}
        onPromptsChange={updatePrompts}
      />
      <output data-testid="prompt-context">{JSON.stringify(state.prompts)}</output>
    </>
  )
}

describe('所有聊天修改链路', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Step3 发送当前完整创意并同步更新 Context 和页面', async () => {
    const initialIdeas: Creative[] = [1, 2, 3].map((index) => ({
      id: `idea-${index}`,
      title: `当前创意 ${index}`,
      description: `当前可拍方案 ${index}`,
    }))
    const revisedIdeas: Creative[] = [1, 2, 3].map((index) => ({
      id: `funny-idea-${index}`,
      title: `幽默经营现场 ${index}`,
      description: `用角色反差展示服务价值 ${index}`,
    }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(initialIdeas), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(revisedIdeas), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkflowProvider><CreativeHarness /></WorkflowProvider>)
    await waitFor(() => expect(screen.getByText(initialIdeas[0].title)).toBeTruthy())
    expect(screen.getByRole('heading', { name: '调整创意方向' })).toBeTruthy()
    expect(screen.getByText('可以补充你的创作要求，AI 会根据你的想法重新调整创意方案。')).toBeTruthy()
    expect(screen.getByPlaceholderText(
      '输入你希望调整的创意方向，例如：换一个角度、更适合老板账号、更有冲突感',
    )).toBeTruthy()
    sendChat('输入希望调整的创意方向')

    await waitFor(() => expect(screen.getByText(revisedIdeas[0].title)).toBeTruthy())
    expect(JSON.parse(screen.getByTestId('creative-context').textContent ?? '[]'))
      .toEqual(revisedIdeas)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(requestBody.instruction).toBe('更幽默')
    expect(requestBody.currentCreatives).toEqual(initialIdeas)
    expect(requestBody).not.toHaveProperty('style')
    expect(requestBody).not.toHaveProperty('videoStyle')
    expect(screen.getByText(/重新生成创意方案/)).toBeTruthy()
  })

  it('Step5 发送完整脚本和当前参数并同步更新 Context 和页面', async () => {
    const revisedConfig: VideoConfigState = {
      ratio: '9:16 竖屏',
      duration: '35秒',
      style: '幽默角色反差',
      shotCount: '6个镜头',
      source: 'chat',
      instruction: '更幽默',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(revisedConfig), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkflowProvider><VideoConfigHarness /></WorkflowProvider>)
    sendChat('输入视频参数调整要求')

    await waitFor(() => expect(screen.getAllByText('幽默角色反差').length).toBeGreaterThan(0))
    expect(JSON.parse(screen.getByTestId('video-context').textContent ?? '{}'))
      .toEqual(revisedConfig)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody.script).toEqual(script)
    expect(requestBody.currentConfig).toEqual(initialConfig)
    expect(screen.getByText(/更新视频配置/)).toBeTruthy()
  })

  it('Step6 发送完整当前分镜并同步更新 Context 和页面', async () => {
    const revisedStoryboards: Storyboard[] = [{
      ...initialStoryboards[0],
      id: 'shot-funny-1',
      visualDescription: '老板拿出五个费用盒子，结果清洁盒子先抢镜。',
      narration: '房费还没坐稳，五项成本已经开始排队了。',
      videoPrompt: '老板与五个拟人化费用盒子幽默互动。',
    }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(revisedStoryboards), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkflowProvider><StoryboardHarness /></WorkflowProvider>)
    sendChat('输入分镜修改要求')

    await waitFor(() => expect(screen.getByText(revisedStoryboards[0].narration)).toBeTruthy())
    expect(JSON.parse(screen.getByTestId('storyboard-context').textContent ?? '[]'))
      .toEqual(revisedStoryboards)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody.script).toEqual(script)
    expect(requestBody.currentStoryboards).toEqual(initialStoryboards)
    expect(screen.getByText(/修改结果已同步到上方/)).toBeTruthy()
  })

  it('Step7 发送完整分镜和当前 Prompt 并同步更新 Context 和页面', async () => {
    const revisedPrompts: Prompt[] = [{
      ...initialPrompts[0],
      id: 'prompt-funny-1',
      imagePrompt: '民宿前台，五个拟人化费用盒子排队，轻喜剧构图。',
      videoPrompt: {
        ...initialPrompts[0].videoPrompt,
        characterAction: '老板追着一个逃跑的清洁费盒子。',
        fullPrompt: '民宿前台轻喜剧，老板与拟人化费用盒子互动，节奏明快。',
      },
    }]
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(revisedPrompts), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkflowProvider><PromptHarness /></WorkflowProvider>)
    sendChat('输入 Prompt 修改要求')

    await waitFor(() => expect(screen.getByText(revisedPrompts[0].imagePrompt)).toBeTruthy())
    expect(JSON.parse(screen.getByTestId('prompt-context').textContent ?? '[]'))
      .toEqual(revisedPrompts)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody.storyboards).toEqual(initialStoryboards)
    expect(requestBody.currentPrompts).toEqual(initialPrompts)
    expect(screen.getByText(/更新全部镜头 Prompt/)).toBeTruthy()
  })
})
