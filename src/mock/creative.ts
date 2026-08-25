import type { Creative, Hotspot, Interest } from '../types/workflow'

interface HotspotInsight {
  coreConflict: string
  consumerConcern: string
  businessImpact: string
  industryAngles: [string, string, string]
}

function inferHotspotInsight(hotspot: Hotspot, industry: string): HotspotInsight {
  const text = `${hotspot.title} ${hotspot.summary}`

  if (
    /(酒店|民宿|住宿|订单)/.test(text) &&
    /(收入|金额|结算|佣金|抽成|成本|价格|收费|到手|利润|账单|平台)/.test(text)
  ) {
    return {
      coreConflict: '消费者支付价格、平台费用与商家实际收入之间的信息差',
      consumerConcern: '价格是否透明、实际服务是否匹配支付金额',
      businessImpact: '经营成本和服务价值难以被顾客看见',
      industryAngles: ['民宿经营成本', '订单价格构成', '服务价值与真实经营情况'],
    }
  }

  if (/称重|重量|缺斤少两|计量/.test(text)) {
    return {
      coreConflict: '商品标示标准与顾客实际拿到的数量是否一致',
      consumerConcern: '计量、价格与交易透明度',
      businessImpact: '计量证据会直接影响购买信任和复购意愿',
      industryAngles: [`${industry}计量标准`, '价格与规格说明', '顾客现场验证'],
    }
  }

  if (/涨价|降价|促销|价格|收费|账单/.test(text)) {
    return {
      coreConflict: '商家定价依据与消费者感知价值之间存在信息差',
      consumerConcern: '消费决策与价格公平',
      businessImpact: '价格解释是否清楚会影响咨询、下单和品牌信任',
      industryAngles: [`${industry}价格构成`, '产品或服务价值', '真实经营成本'],
    }
  }

  if (/食品|食材|安全|质量|卫生|成分/.test(text)) {
    return {
      coreConflict: '商家宣称的质量标准与消费者能够验证的证据不对称',
      consumerConcern: '产品质量与安全感',
      businessImpact: '可验证的产品证据会影响顾客选择和购买信任',
      industryAngles: [`${industry}产品标准`, '原料与制作过程', '顾客可验证证据'],
    }
  }

  if (/投诉|服务|回应|售后|承诺|退款/.test(text)) {
    return {
      coreConflict: '消费者期待的服务承诺与实际履约体验不一致',
      consumerConcern: '服务承诺与问题处理',
      businessImpact: '履约过程和处理方式会影响品牌信任与复购',
      industryAngles: [`${industry}服务流程`, '承诺兑现证据', '问题处理现场'],
    }
  }

  return {
    coreConflict: '消费者期待与商家真实经营信息之间存在认知差距',
    consumerConcern: '用户信任与行业透明度',
    businessImpact: '经营证据能否被看见会影响顾客选择与转化',
    industryAngles: [`${industry}经营现场`, '产品或服务标准', '顾客决策证据'],
  }
}

export function createFallbackCreatives(
  hotspot: Hotspot,
  interests: Interest[],
  batchIndex = 0,
): Creative[] {
  const industry = hotspot.matchedInterest ?? interests[0]?.name ?? '你的行业'
  const insight = inferHotspotInsight(hotspot, industry)
  const isSelfMedia = industry === '自媒体' || interests.some((item) => item.name === '自媒体')
  const [firstAngle, secondAngle, thirdAngle] = insight.industryAngles

  const industryBatches: Creative[][] = [
    [
      {
        id: `industry-conflict-${batchIndex}`,
        title: `我们把${firstAngle}直接拍给顾客看`,
        description: `现场拍摄${firstAngle}的真实操作，展示${secondAngle}及执行记录，回应“${insight.coreConflict}”，让顾客理解${insight.consumerConcern}并建立购买信任。`,
      },
      {
        id: `industry-value-${batchIndex}`,
        title: `顾客付的钱，在我们店能看到什么`,
        description: `拍摄一笔真实业务从准备到交付的过程，公开展示${secondAngle}和${thirdAngle}；解释${insight.businessImpact}，让服务价值可见并促进咨询或下单。`,
      },
      {
        id: `industry-reality-${batchIndex}`,
        title: `老板公开一次真实经营全过程`,
        description: `由老板现场记录${industry}完成一单业务的全过程，展示${firstAngle}、${thirdAngle}和关键取舍；用真实经营证据缩小“${insight.coreConflict}”，提升顾客信任与到店意愿。`,
      },
    ],
    [
      {
        id: `industry-cost-${batchIndex}`,
        title: `一单生意背后，老板实际要做多少事`,
        description: `跟拍一单${industry}业务的准备与交付，展示${firstAngle}和${thirdAngle}；让顾客看见${insight.businessImpact}，理解服务价值并增强选择信任。`,
      },
      {
        id: `industry-price-${batchIndex}`,
        title: `我们为什么这样定价，现场拆给你看`,
        description: `现场拍摄产品或服务的形成过程，对比展示${secondAngle}与实际交付内容；围绕“${insight.consumerConcern}”解释定价依据，促进咨询和下单转化。`,
      },
      {
        id: `industry-customer-${batchIndex}`,
        title: `请顾客现场验一次我们的服务`,
        description: `现场拍摄顾客参与验证${thirdAngle}的完整过程，展示关键标准和真实反馈；用可参与的证据回应“${insight.coreConflict}”，建立信任并促进到店或复购。`,
      },
    ],
  ]

  const selfMediaBatches: Creative[][] = [
    [
      {
        id: `media-conflict-${batchIndex}`,
        title: `你真正介意的，可能不是表面问题`,
        description: `从“${insight.coreConflict}”切入，拆解${insight.consumerConcern}如何影响判断，并用通用案例展示可重复使用的消费决策方法。`,
      },
      {
        id: `media-business-${batchIndex}`,
        title: '一笔消费里，哪些信息最容易被忽略',
        description: `展示普通用户核验价格、承诺与交付证据的方法，并分析“${insight.businessImpact}”如何改变商家和消费者的选择。`,
      },
      {
        id: `media-evidence-${batchIndex}`,
        title: '把账算清楚后，你可能会换个判断',
        description: `用信息对比和情景演示呈现${insight.consumerConcern}，解释商业链路中的信息差如何形成，让观众获得可迁移的判断框架。`,
      },
    ],
  ]

  const batches = isSelfMedia ? selfMediaBatches : industryBatches
  return batches[((batchIndex % batches.length) + batches.length) % batches.length]
    .map((item) => ({ ...item }))
}
