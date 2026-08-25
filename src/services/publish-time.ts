import type { Hotspot } from '../types/workflow'

export interface PublishTimeRecommendation {
  time: string
  reason: string
}

const URGENT_KEYWORDS = [
  '刚刚', '突发', '官宣', '发布', '上线', '调整', '涨价', '降价', '新规', '通知',
  '热搜', '争议', '回应', '首发', '开幕', '今日', '今天',
]

const DOMAIN_KEYWORDS: Array<[string, string[]]> = [
  ['电商零售', ['电商', '商品', '消费', '购物', '零售', '价格', '品牌', '促销']],
  ['餐饮', ['餐饮', '餐厅', '食品', '菜品', '门店', '外卖', '菜单']],
  ['酒店民宿', ['酒店', '住宿', '旅游', '出行', '民宿', '旅行']],
  ['教育', ['教育', '学校', '学习', '考试', '家长', '学生', '课程']],
  ['美妆', ['美妆', '护肤', '化妆', '美容', '香水']],
  ['宠物娱乐', ['宠物', '娱乐', '影视', '电影', '游戏', 'IP', '明星']],
  ['自媒体', ['内容平台', '创作者', '流量', '短视频', '直播', '账号']],
]

const PLATFORM_HABITS: Record<Hotspot['platform'], string> = {
  微博: '微博话题传播和衰减都较快，首轮讨论窗口更重要',
  抖音: '抖音用户在午间和晚间更集中消费短视频',
  小红书: '小红书用户晚间更常进行搜索、收藏和消费决策',
  百度: '搜索型用户通常在午休和晚间主动查找解释性内容',
  腾讯: '社交资讯用户在通勤后和晚间更容易参与讨论',
  头条: '资讯用户在早间、午间和晚间都有明显阅读窗口',
  全网: '全网话题需要兼顾热点时效与晚间内容消费高峰',
  用户输入: '该热点由用户直接指定，建议结合内容本身的时效安排创作',
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase('zh-CN')))
}

function inferDomain(hotspot: Hotspot, text: string): string {
  if (hotspot.matchedInterest) return hotspot.matchedInterest
  return DOMAIN_KEYWORDS.find(([, keywords]) => includesAny(text, keywords))?.[0] ?? '综合内容'
}

function inferContentType(text: string): string {
  if (includesAny(text, ['政策', '新规', '通知', '规定', '条例'])) return '政策解读型内容'
  if (includesAny(text, ['价格', '消费', '购物', '商品', '品牌', '促销'])) return '消费决策型内容'
  if (includesAny(text, ['测评', '实测', '实验', '对比', '挑战'])) return '测试对比型内容'
  if (includesAny(text, ['攻略', '方法', '清单', '知识', '科普', '解析'])) return '攻略科普型内容'
  if (includesAny(text, ['争议', '回应', '热议', '情绪', '观点'])) return '观点讨论型内容'
  if (includesAny(text, ['故事', '人物', '经历', '生活'])) return '故事共鸣型内容'
  return '高时效讨论型内容'
}

export function createPublishTimeRecommendation(
  hotspot: Hotspot,
): PublishTimeRecommendation {
  const text = `${hotspot.title} ${hotspot.summary}`.toLocaleLowerCase('zh-CN')
  const domain = inferDomain(hotspot, text)
  const contentType = inferContentType(text)
  const platformHabit = PLATFORM_HABITS[hotspot.platform]
  const isUrgent = hotspot.rank <= 3 || includesAny(text, URGENT_KEYWORDS)

  if (isUrgent) {
    return {
      time: '趁热点窗口：今天 2 小时内',
      reason: `该热点排名靠前或包含即时变化，时效衰减快；${platformHabit}。建议先发布核心观点抢占首轮讨论，再根据反馈补充后续内容。`,
    }
  }

  if (domain === '酒店民宿') {
    return {
      time: '本周四–周五 18:00–21:00',
      reason: `该热点属于${contentType}，住宿与出行用户通常在周末前集中规划；${platformHabit}，此时发布更容易获得收藏和决策转化。`,
    }
  }

  if (domain === '教育') {
    return {
      time: '明天 07:00–08:30 或 20:00–22:00',
      reason: `该热点属于${contentType}，家长、学生和教育从业者更常在上学前或晚间完整阅读；${platformHabit}，这两个时段更适合解释和讨论。`,
    }
  }

  if (domain === '餐饮') {
    return {
      time: '今天 11:00–13:00 或 17:00–19:30',
      reason: `该热点属于${contentType}，临近午餐和晚餐时用户对菜品、门店与消费内容的需求更强；${platformHabit}，餐前发布更容易促成互动和到店决策。`,
    }
  }

  if (domain === '电商零售' || domain === '美妆') {
    return {
      time: '今天 19:00–22:00',
      reason: `该热点属于${contentType}，晚间是用户比较商品、查看评价和形成购买决策的集中时段；${platformHabit}，此时发布更利于收藏、评论和转化。`,
    }
  }

  if (domain === '宠物娱乐') {
    return {
      time: '今天 19:30–23:00',
      reason: `该热点属于${contentType}，娱乐和陪伴型内容在晚间休闲时段更容易被完整观看和分享；${platformHabit}，适合在讨论活跃前上线。`,
    }
  }

  if (domain === '自媒体') {
    return {
      time: '明天 12:00–13:30 或 20:00–22:00',
      reason: `该热点属于${contentType}，创作者通常在午休和晚间关注平台变化及运营方法；${platformHabit}，这两个窗口更容易形成收藏和同行讨论。`,
    }
  }

  if (contentType === '攻略科普型内容' || contentType === '测试对比型内容') {
    return {
      time: '明天 12:00–13:30',
      reason: `该热点适合制作${contentType}，需要给用户留出完整理解和收藏的时间；${platformHabit}，午休窗口更适合消费高信息密度内容。`,
    }
  }

  return {
    time: '本周 18:30–21:30',
    reason: `该热点属于${contentType}，没有必须即时发布的信号；${platformHabit}，安排在本周晚间可以兼顾内容完成度和用户活跃度。`,
  }
}
