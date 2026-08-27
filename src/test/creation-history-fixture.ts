import type { WorkflowState } from '../types/workflow'

export function createCompleteWorkflowState(
  hotspotTitle = '酒店订单收入讨论',
): WorkflowState {
  const interests = [{ id: 'hotel', name: '酒店民宿' }]
  const hotspot = {
    title: hotspotTitle,
    summary: '消费者关注价格、平台费用和服务价值。',
    platform: '微博' as const,
    rank: 1,
    hotScore: 900_000,
    matchedInterest: '酒店民宿',
  }

  return {
    activeStep: 'prompt',
    interests,
    hotspotBatchIndex: 0,
    hotspotPage: {
      interests,
      hotspotBatchIndex: 0,
      hotspots: [
        hotspot,
        {
          title: '民宿服务价值讨论',
          summary: '用户关注住宿体验与服务交付。',
          platform: '小红书',
          rank: 2,
          hotScore: 720_000,
          recommendationIndex: 82,
          relevanceScore: 90,
          businessValueScore: 78,
          creativeValueScore: 85,
          matchedInterest: '酒店民宿',
          recommendationReasons: ['适合酒店民宿领域创作。'],
        },
      ],
    },
    hotspot,
    creatives: [
      {
        id: 'idea-cost',
        title: '把一笔订单拆成可见成本',
        description: '用具体道具展示价格和服务交付。',
      },
    ],
    creativeSelection: {
      hotspot,
      industry: '酒店民宿',
      idea: {
        id: 'idea-cost',
        title: '把一笔订单拆成可见成本',
        description: '用具体道具展示价格和服务交付。',
      },
      videoStyle: '真实纪实',
    },
    script: {
      id: 'script-1',
      title: '一笔订单怎么拆',
      hook: '订单总价不等于商家收入。',
      body: '逐项展示清洁、布草、人力和入住服务。',
      ending: '把价格和交付放在一起看。',
    },
    videoConfig: {
      ratio: '9:16 竖屏',
      duration: '30秒',
      style: '真实纪实',
      shotCount: '1个镜头',
      source: 'manual',
    },
    storyboards: [
      {
        id: 'shot-1',
        shotNumber: 1,
        duration: '3秒',
        visualDescription: '老板展示订单明细。',
        narration: '这是顾客支付的总价。',
        shootingAdvice: '竖屏近景。',
        imagePrompt: '真实民宿前台与订单。',
        videoPrompt: '老板指向订单费用项。',
      },
    ],
    prompts: [
      {
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
      },
    ],
    promptStatus: 'success',
    promptError: null,
  }
}
