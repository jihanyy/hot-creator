import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreativeSuggestions from '../components/CreativeSuggestions'
import PromptGenerator from '../components/PromptGenerator'
import ScriptGenerator from '../components/ScriptGenerator'
import StoryboardGenerator from '../components/StoryboardGenerator'
import VideoConfig from '../components/VideoConfig'
import type {
  CreativeSelection,
  Hotspot,
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
const creativeSelection: CreativeSelection = {
  hotspot,
  industry: '酒店民宿',
  idea: {
    id: 'idea-1',
    title: '我们把经营成本拍给顾客看',
    description: '展示订单价格、成本和服务交付。',
  },
  videoStyle: '专业分析',
}
const script: Script = {
  id: 'script-1',
  title: '一笔订单怎么拆',
  hook: '总价不等于商家收入。',
  body: '逐项展示经营成本和服务交付。',
  ending: '让价格与服务一一对应。',
}
const videoConfig: VideoConfigState = {
  ratio: '9:16 竖屏',
  duration: '30秒',
  style: '真实纪实',
  shotCount: '5个镜头',
  source: 'manual',
}
const storyboards: Storyboard[] = [{
  id: 'shot-1',
  shotNumber: 1,
  duration: '3秒',
  visualDescription: '老板展示订单。',
  narration: '总价不等于商家收入。',
  shootingAdvice: '竖屏近景。',
  imagePrompt: '真实门店订单画面。',
  videoPrompt: '老板展示订单明细。',
}]

function failedAIResponse() {
  return new Response(
    JSON.stringify({
      detail: {
        status: 'error',
        code: 'rate_limited',
        message: 'AI 服务暂时不可用，请稍后重试',
      },
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('AI 失败页面状态', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('Step3 失败时显示 error，不显示创意或成功回复', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failedAIResponse()))
    render(
      <CreativeSuggestions
        hotspot={hotspot}
        interests={[{ id: 'hotel', name: '酒店民宿' }]}
        onBack={vi.fn()}
        onIdeasChange={vi.fn()}
        onSelectCreative={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI服务暂时不可用，请稍后重试'))
    expect(screen.queryByRole('button', { name: '选择这个创意' })).toBeNull()
    expect(screen.queryByText(/已根据.*重新生成/)).toBeNull()
  })

  it('Step4 失败时不显示脚本卡片和成功按钮', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failedAIResponse()))
    render(
      <ScriptGenerator
        creativeSelection={creativeSelection}
        currentScript={null}
        onBack={vi.fn()}
        onScriptChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI服务暂时不可用，请稍后重试'))
    expect(screen.queryByText('确定这个脚本')).toBeNull()
    expect(screen.queryByText('✓ 已确定这个脚本')).toBeNull()
  })

  it('Step5 AI 推荐失败时不显示固定参数或采用成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failedAIResponse()))
    render(
      <VideoConfig
        script={script}
        onBack={vi.fn()}
        onConfigChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /听AI推荐/ })[0])
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI服务暂时不可用，请稍后重试'))
    expect(screen.queryByText('✓ 已采用AI推荐')).toBeNull()
    expect(screen.queryByText('45秒')).toBeNull()
    expect(screen.getByRole('button', { name: '重新获取AI推荐' })).toBeTruthy()
  })

  it('Step6 失败时不显示分镜和确认成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => failedAIResponse()))
    render(
      <StoryboardGenerator
        creativeSelection={creativeSelection}
        script={script}
        videoConfig={videoConfig}
        onBack={vi.fn()}
        onStoryboardsChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI服务暂时不可用，请稍后重试'))
    expect(screen.queryByText('分镜已确认')).toBeNull()
    expect(screen.getByText('共 0 个镜头')).toBeTruthy()
  })

  it('Step7 失败时显示 error，不显示 Prompt 成功内容', () => {
    render(
      <PromptGenerator
        storyboards={storyboards}
        initialPrompts={[]}
        videoConfig={videoConfig}
        initialStatus="error"
        initialError="AI服务暂时不可用，请稍后重试"
        onBack={vi.fn()}
        onPromptsChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('AI服务暂时不可用，请稍后重试')
    expect(screen.getByText('共 0 个镜头')).toBeTruthy()
    expect(screen.queryByText(/已根据.*更新全部镜头/)).toBeNull()
  })
})
