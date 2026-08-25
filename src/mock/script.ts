import type { CreativeSelection, Hotspot, Script } from '../types/workflow'

interface FallbackScriptContext {
  industry: string
  ideaTitle: string
  focus: string
  businessItems: string
  customerResult: string
}

const INDUSTRY_DETAILS: Record<string, Pick<FallbackScriptContext, 'businessItems' | 'customerResult'>> = {
  酒店民宿: {
    businessItems: '房费、平台费用、清洁、布草、人力和入住服务',
    customerResult: '一晚住宿、客房状态和完整服务体验',
  },
  餐饮: {
    businessItems: '食材、损耗、人工、制作和门店服务',
    customerResult: '菜品分量、出品质量和用餐体验',
  },
  电商零售: {
    businessItems: '商品成本、包装、平台费用、仓储和售后',
    customerResult: '商品品质、交付效率和售后保障',
  },
  教育: {
    businessItems: '课程准备、师资、教研、服务和学习反馈',
    customerResult: '课程体验、学习过程和阶段反馈',
  },
  美妆: {
    businessItems: '产品成分、用量、服务步骤、工具和售后',
    customerResult: '产品效果、服务体验和使用保障',
  },
  宠物娱乐: {
    businessItems: '产品、场地、人员、服务步骤和安全保障',
    customerResult: '实际体验、服务结果和安全感受',
  },
}

function createContext(hotspot: Hotspot, selection: CreativeSelection): FallbackScriptContext {
  const industry = hotspot.matchedInterest ?? '当前行业'
  const ideaText = `${selection.idea.title} ${selection.idea.description}`
  const details = INDUSTRY_DETAILS[industry] ?? {
    businessItems: '产品、人工、工具、服务步骤和交付成本',
    customerResult: '实际产品、服务过程和交付结果',
  }
  const focus = /经营成本|收入|结算|平台费用|到手/.test(ideaText)
    ? `一单业务中的${details.businessItems}如何对应商家实际收入`
    : /付的钱|价格|收费|金额|价值/.test(ideaText)
      ? `顾客支付的价格如何对应${details.customerResult}`
      : /称重|重量|计量|规格/.test(ideaText)
        ? '标示规格、现场计量和最终交付是否一致'
        : /食品|食材|成分|质量|安全|卫生/.test(ideaText)
          ? '产品标准、实际操作和质量记录能否相互印证'
          : /服务|售后|承诺|退款|履约/.test(ideaText)
            ? '服务承诺、实际履约和问题处理是否一致'
            : `商家说明的标准能否在${details.customerResult}中被验证`

  return {
    industry,
    ideaTitle: selection.idea.title,
    focus,
    ...details,
  }
}

function createAbstractScripts(context: FallbackScriptContext): Script[] {
  return [
    {
      id: 'script-abstract-cards',
      title: context.ideaTitle,
      hook: '如果一笔订单能被摆在桌上，它绝对不只是一张付款截图。',
      body: `桌上第一张卡片写着顾客支付，后面的卡片依次是${context.businessItems}。每拿走一张，剩下的才是商家真正能够支配的部分。\n\n这些卡片不是为了诉苦，而是把“${context.focus}”变成看得见的关系。顾客得到的是${context.customerResult}，商家要做的是让每一项投入都有对应的交付。`,
      ending: '当每一笔钱都有去处，价格和服务才真正站在同一张桌上。',
    },
    {
      id: 'script-abstract-personification',
      title: '让一张订单自己开口，它会说什么',
      hook: '今天这张订单不谈总价，它要逐项介绍自己的去向。',
      body: `“我是订单金额，但我不是商家收入。”旁边的${context.businessItems}依次出现，各自拿走属于自己的那一部分。\n\n最后留下的数字与${context.customerResult}同时出现：价格不是一个孤立标签，而是一组投入和结果的总和。看清这层关系，才能讨论什么叫合理、什么叫值得。`,
      ending: '别让一个总价替所有细节说话，把订单拆开，答案会更具体。',
    },
    {
      id: 'script-abstract-experiment',
      title: '遮住总价，只看交付，你会怎么选',
      hook: '先不看价格，只看两组真实交付，你能猜出它们的差别吗？',
      body: `一边只有结果，另一边同时呈现${context.businessItems}和${context.customerResult}。先让顾客根据实际内容做选择，再揭开对应价格。\n\n这个小实验验证的不是谁更贵，而是“${context.focus}”有没有被说清楚。价格可以不同，但交付依据必须能够被看见和比较。`,
      ending: '真正影响选择的，不只是数字大小，而是数字背后有没有具体内容。',
    },
  ]
}

function createOpinionScripts(context: FallbackScriptContext): Script[] {
  return [
    {
      id: 'script-opinion-conflict',
      title: context.ideaTitle,
      hook: '顾客付了钱却看不见钱花在哪，商家再努力解释也很难被相信。',
      body: `我的观点很明确：价格可以有差异，但“${context.focus}”不能含糊。\n\n顾客有权知道自己会得到${context.customerResult}，商家也应该把${context.businessItems}讲具体。不是让任何一方委屈，而是让支付、投入和交付处在同一套事实里。`,
      ending: '先把账和服务说清楚，再谈价格值不值得。',
    },
    {
      id: 'script-opinion-customer',
      title: '顾客质疑价格，真的是只想要便宜吗',
      hook: '很多顾客问价格，不是因为付不起，而是怕付得不明白。',
      body: `站在顾客一边，我希望先看到${context.customerResult}；站在商家一边，我也知道${context.businessItems}不会凭空消失。\n\n真正的矛盾不是谁占了便宜，而是“${context.focus}”缺少共同证据。把能够核对的信息放出来，双方才有机会讨论价值，而不是互相猜测。`,
      ending: '尊重顾客的疑问，也尊重商家的真实投入，这才是公平沟通。',
    },
    {
      id: 'script-opinion-owner',
      title: '老板最怕的，不是顾客问价格',
      hook: '我不怕你问贵不贵，我怕我说了半天，你还是看不见我们做了什么。',
      body: `作为${context.industry}经营者，我愿意逐项说明${context.businessItems}，也愿意让顾客核对${context.customerResult}。\n\n我的立场是：商家不能只讲辛苦，顾客也不该只能猜测。围绕“${context.focus}”，我们能做的就是拿出具体内容，让选择建立在事实而不是情绪上。`,
      ending: '价格需要解释，价值更需要被交付。',
    },
  ]
}

function createProfessionalScripts(context: FallbackScriptContext): Script[] {
  return [
    {
      id: 'script-analysis-breakdown',
      title: context.ideaTitle,
      hook: '一笔订单拆成三层，才能看清价格、成本和交付的关系。',
      body: `第一层是顾客支付，第二层是${context.businessItems}，第三层是顾客最终得到的${context.customerResult}。\n\n判断“${context.focus}”，不能只比较第一层的总价，还要核对第二层是否真实发生、第三层是否完整交付。三层能够对应，价格才有解释基础。`,
      ending: '比较价格之前，先把投入项和交付项放进同一张清单。',
    },
    {
      id: 'script-analysis-comparison',
      title: '同样的价格，为什么交付可能完全不同',
      hook: '总价相同，不代表成本结构和最终体验相同。',
      body: `把两种方案放在一起比较：分别记录${context.businessItems}，再核对${context.customerResult}。\n\n如果只看金额，会忽略服务范围和执行标准；如果只听说明，又缺少结果验证。围绕“${context.focus}”，有效比较必须同时包含价格项、投入项和交付项。`,
      ending: '数据不只是总价，一个完整决策至少需要三组信息。',
    },
    {
      id: 'script-analysis-checklist',
      title: '下单前，用这三步判断值不值得',
      hook: '不靠感觉判断价格，只需要核对三个问题。',
      body: `第一，费用包含哪些具体项目；第二，${context.businessItems}中哪些能够现场确认；第三，最终的${context.customerResult}如何验收。\n\n这三步分别对应说明、执行和结果，也正好回答“${context.focus}”。缺少任何一步，都容易让价格和体验出现认知差距。`,
      ending: '把这三个问题问清楚，再做选择会更稳妥。',
    },
  ]
}

function createStoryScripts(context: FallbackScriptContext): Script[] {
  return [
    {
      id: 'script-story-customer',
      title: context.ideaTitle,
      hook: '昨晚，一位顾客拿着订单问我：这笔钱，你们真正能收到多少？',
      body: `我没有急着回答数字，而是带他看了${context.businessItems}。他原本只看到付款总额，走完整个过程后，才把这些投入和${context.customerResult}联系起来。\n\n顾客最后说，他并不是要求所有价格都一样，只是希望“${context.focus}”能够讲明白。那一刻我才意识到，解释不该从辩解开始，而应该从现场开始。`,
      ending: '那晚之后，我们决定让每一位顾客都能先看到服务，再判断价格。',
    },
    {
      id: 'script-story-owner',
      title: '老板算完一单账后，沉默了十秒',
      hook: '订单显示已经成交，但老板把每一项支出写完后，表情变了。',
      body: `纸上依次出现${context.businessItems}，最后才轮到实际收入。老板没有抱怨，而是转身检查顾客得到的${context.customerResult}有没有少一项。\n\n他明白，“${context.focus}”只有两边一起说才完整：既不能把成本当借口，也不能让交付只停留在承诺里。`,
      ending: '一单生意真正结束，不是收到钱，而是投入和交付都对得上。',
    },
    {
      id: 'script-story-turn',
      title: '她本来准备取消订单，最后却留下了',
      hook: '顾客看到价格后转身要走，店员只说了一句：先看完再决定。',
      body: `店员没有继续推销，而是让她依次确认${context.businessItems}和${context.customerResult}。最初的质疑慢慢变成具体问题，双方把每一项都核对清楚。\n\n她留下不是因为被说服，而是因为“${context.focus}”终于有了能够验证的答案。`,
      ending: '好的转化不是把人劝回来，而是让人看明白后自己做决定。',
    },
  ]
}

function createHumorousScripts(context: FallbackScriptContext): Script[] {
  return [
    {
      id: 'script-humor-disappearing-money',
      title: context.ideaTitle,
      hook: '订单到账三秒钟，老板的钱开始排队离家出走。',
      body: `${context.businessItems}一个接一个来报到，刚才还完整的金额很快只剩最后一小块。老板抱紧计算器，顾客抱紧订单，两个人同时问：钱到底去哪了？\n\n答案就在${context.customerResult}里。把“${context.focus}”对清楚，这场追钱游戏才不会只剩误会。`,
      ending: '钱没有消失，它只是换成了你能体验到的每个细节。',
    },
    {
      id: 'script-humor-two-roles',
      title: '当老板和顾客互换计算器',
      hook: '顾客算总价，老板算成本，两台计算器差点当场吵起来。',
      body: `顾客按下的是付款金额，老板依次输入${context.businessItems}。两个人交换位置后，再一起检查${context.customerResult}。\n\n原来真正需要对齐的不是谁按得更快，而是“${context.focus}”有没有共同标准。`,
      ending: '计算器不会吵架，信息不完整的人才会。',
    },
    {
      id: 'script-humor-interview',
      title: '采访一笔订单：你为什么总被误会',
      hook: '订单本人回应：我真的不等于老板最后收到的钱。',
      body: `订单请出${context.businessItems}作为证人，再把${context.customerResult}放到镜头前逐项核对。\n\n它委屈地说，大家总只记得最上面的金额，却忘了“${context.focus}”需要完整链路才能说明。`,
      ending: '下次看到总价，别忘了给订单一个解释自己的机会。',
    },
  ]
}

export function createFallbackScripts(
  hotspot: Hotspot,
  creativeSelection: CreativeSelection,
): Script[] {
  const context = createContext(hotspot, creativeSelection)
  switch (creativeSelection.videoStyle) {
    case '抽象创意':
      return createAbstractScripts(context)
    case '情绪观点':
      return createOpinionScripts(context)
    case '故事讲述':
      return createStoryScripts(context)
    case '幽默':
      return createHumorousScripts(context)
    case '专业分析':
    case '听AI推荐':
    default:
      return createProfessionalScripts(context)
  }
}

export function reviseFallbackScript(currentScript: Script, instruction: string): Script {
  const titleBase = currentScript.title.replace(/[：:｜|].*$/, '').trim()
  const coreSentences = currentScript.body
    .split(/(?<=[。！？])/)
    .filter(Boolean)
    .slice(0, 2)
    .join('')
  const revised = {
    ...currentScript,
    id: `${currentScript.id}-fallback-revised-${Date.now()}`,
    title: `${titleBase}，换个角度拍清楚`,
    hook: `先别急着下结论，换个角度看：${currentScript.hook}`,
    body: `${currentScript.body}\n\n这一次从顾客能够直接确认的细节切入，把关键动作、实际结果和选择依据放在同一条叙事线上。`,
    ending: '具体内容已经摆在眼前，最后的判断交给你自己。',
  }

  if (/AI\s*生成|AI\s*视频|适合\s*AI|生成的视频/.test(instruction)) {
    revised.title = `${titleBase}，拆成三个看得见的瞬间`
    revised.hook = '只用三个画面，把原本复杂的信息讲清楚。'
    revised.body = `第一个画面只保留一个明确主体，让观众马上知道我们在说什么。${coreSentences}\n\n第二个画面用一个连续动作呈现关键变化，不堆文字，也不同时切换多个场景。第三个画面停在真实结果上，让前后关系能够只靠画面被理解。`
    revised.ending = '三个画面，一条清楚的变化线，结果由你亲眼确认。'
  }
  if (/开头|Hook|炸裂|冲突/.test(instruction)) {
    revised.hook = `先停一下：${currentScript.hook}`
  }
  if (/30\s*秒|缩短|精简/.test(instruction)) {
    const sentences = currentScript.body.split(/(?<=[。！？])/).filter(Boolean)
    revised.body = sentences.slice(0, Math.max(2, Math.ceil(sentences.length / 2))).join('')
  }
  if (/不要广告|弱化广告|更自然/.test(instruction)) {
    revised.ending = '信息都摆在这里，怎么判断，交给你自己。'
  }
  if (/反转/.test(instruction)) {
    revised.ending = '最后才发现，真正需要重新判断的不是价格，而是我们原先忽略的交付细节。'
  }

  return revised
}
