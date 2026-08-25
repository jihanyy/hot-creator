import { useState } from 'react'
import AIStatusNotice from './AIStatusNotice'
import ChatBox from './ChatBox'
import {
  generateVideoConfig,
  getAIErrorMessage,
  getEmptyVideoConfig,
} from '../services/api'
import type {
  AIRequestStatus,
  Script,
  VideoConfig as VideoConfigState,
} from '../types/workflow'

const emptyVideoConfig = getEmptyVideoConfig()

type ConfigKey = 'ratio' | 'duration' | 'style' | 'shotCount'

interface ConfigOptionGroup {
  key: ConfigKey
  index: string
  title: string
  options: string[]
}

const configGroups: ConfigOptionGroup[] = [
  {
    key: 'ratio',
    index: '01',
    title: '视频比例',
    options: ['9:16 竖屏', '16:9 横屏', '1:1 方形', '听AI推荐'],
  },
  {
    key: 'duration',
    index: '02',
    title: '视频时长',
    options: ['15秒', '30秒', '60秒', '90秒以上', '听AI推荐'],
  },
  {
    key: 'style',
    index: '03',
    title: '视频风格',
    options: ['幽默', '正经', '抽象', '怪诞', '听AI推荐'],
  },
  {
    key: 'shotCount',
    index: '04',
    title: '分镜数量',
    options: ['5个镜头', '8个镜头', '10个镜头', '听AI推荐'],
  },
]

interface VideoConfigProps {
  script: Script
  initialConfig?: VideoConfigState
  onBack: () => void
  onConfigChange: (config: VideoConfigState) => void
  onConfirm: (config: VideoConfigState) => void
}

function VideoConfig({
  script,
  initialConfig,
  onBack,
  onConfigChange,
  onConfirm,
}: VideoConfigProps) {
  const [config, setConfig] = useState<VideoConfigState>(initialConfig ?? emptyVideoConfig)
  const [showAiRecommendation, setShowAiRecommendation] = useState(false)
  const [aiAdopted, setAiAdopted] = useState(false)
  const [aiRecommendation, setAiRecommendation] = useState<VideoConfigState | null>(null)
  const [aiStatus, setAiStatus] = useState<AIRequestStatus>('idle')
  const [aiError, setAiError] = useState<string | null>(null)

  const loadAiRecommendation = async () => {
    if (aiStatus === 'loading') return
    setAiStatus('loading')
    setAiError(null)
    try {
      const recommendation = await generateVideoConfig(script)
      setAiRecommendation(recommendation)
      setAiStatus('success')
    } catch (requestError) {
      setAiRecommendation(null)
      setAiError(getAIErrorMessage(requestError))
      setAiStatus('error')
    }
  }

  const chooseOption = (key: ConfigKey, value: string) => {
    const updatedConfig: VideoConfigState = {
      ...config,
      [key]: value,
      source: 'manual',
      instruction: undefined,
    }
    setConfig(updatedConfig)
    onConfigChange(updatedConfig)
    setAiAdopted(false)
    if (value === '听AI推荐') {
      setShowAiRecommendation(true)
      if (!aiRecommendation) void loadAiRecommendation()
    }
  }

  const adoptAiRecommendation = () => {
    if (!aiRecommendation || aiStatus !== 'success') return
    setConfig(aiRecommendation)
    onConfigChange(aiRecommendation)
    setAiAdopted(true)
    setShowAiRecommendation(true)
  }

  const resetConfig = () => {
    setConfig(emptyVideoConfig)
    onConfigChange(emptyVideoConfig)
    setShowAiRecommendation(false)
    setAiAdopted(false)
    setAiRecommendation(null)
    setAiStatus('idle')
    setAiError(null)
  }

  const applyChatInstruction = async (instruction: string) => {
    setAiStatus('loading')
    setAiError(null)
    try {
      const updatedConfig = await generateVideoConfig(script, instruction, config)
      setConfig(updatedConfig)
      onConfigChange(updatedConfig)
      setAiRecommendation(null)
      setShowAiRecommendation(false)
      setAiAdopted(false)
      setAiStatus('success')
      return `已根据“${instruction}”更新视频配置。`
    } catch (requestError) {
      setAiError(getAIErrorMessage(requestError))
      setAiStatus('error')
      throw requestError
    }
  }

  const displayValue = (value: string) => value || '未选择'
  const isComplete = [config.ratio, config.duration, config.style, config.shotCount].every(
    (value) => value && value !== '听AI推荐',
  )

  return (
    <section className="video-config-screen" aria-labelledby="video-config-title">
      <div className="video-config-header">
        <div>
          <div className="step-badge">STEP 5 · 视频参数</div>
          <h2 id="video-config-title">视频参数设置</h2>
          <p className="step-description">选择基础参数，或直接用自然语言告诉 AI 你想要的视频效果。</p>
        </div>
        <button className="secondary-action" type="button" onClick={onBack}>
          返回脚本
        </button>
      </div>

      <div className="video-config-context">
        <span>当前脚本</span>
        <strong>{script.title}</strong>
        <p>本阶段只设置视频参数，不会生成分镜。</p>
      </div>

      <div className="config-groups">
        {configGroups.map((group) => (
          <section className="config-group" key={group.key} aria-labelledby={`config-${group.key}`}>
            <div className="config-group-heading">
              <span className="section-number">{group.index}</span>
              <h3 id={`config-${group.key}`}>{group.title}</h3>
            </div>
            <div className="config-options">
              {group.options.map((option) => (
                <button
                  className={config[group.key] === option ? 'is-selected' : ''}
                  type="button"
                  key={option}
                  aria-pressed={config[group.key] === option}
                  onClick={() => chooseOption(group.key, option)}
                >
                  {option === '听AI推荐' && <span aria-hidden="true">✦</span>}
                  {option}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {showAiRecommendation && (
        <section className={`ai-config-recommendation${aiAdopted ? ' is-adopted' : ''}`}>
          <div className="ai-recommendation-heading">
            <div className="ai-recommendation-icon" aria-hidden="true">
              ✦
            </div>
            <div>
              <span>智能推荐</span>
              <h3>推荐方案</h3>
            </div>
          </div>
          <AIStatusNotice
            status={aiStatus}
            loadingMessage="AI 正在推荐视频参数…"
            errorMessage={aiError}
          />
          {aiRecommendation && <div className="ai-recommendation-values">
            <div><span>比例</span><strong>{aiRecommendation.ratio}</strong></div>
            <div><span>时长</span><strong>{aiRecommendation.duration}</strong></div>
            <div><span>风格</span><strong>{aiRecommendation.style}</strong></div>
            <div><span>分镜</span><strong>{aiRecommendation.shotCount}</strong></div>
          </div>}
          <div className="ai-recommendation-actions">
            <button
              type="button"
              className="adopt-ai-action"
              disabled={aiStatus === 'loading'}
              onClick={aiStatus === 'error' || aiStatus === 'idle'
                ? () => void loadAiRecommendation()
                : adoptAiRecommendation}
            >
              {aiStatus === 'error'
                ? '重新获取AI推荐'
                : aiAdopted
                  ? '✓ 已采用AI推荐'
                  : '采用AI推荐'}
            </button>
            <button type="button" className="reset-config-action" onClick={resetConfig}>
              重新选择
            </button>
          </div>
        </section>
      )}

      {!showAiRecommendation && (
        <AIStatusNotice
          status={aiStatus}
          loadingMessage="AI 正在更新视频参数…"
          errorMessage={aiError}
        />
      )}

      <section className="current-config-summary" aria-labelledby="current-config-title">
        <div className="current-config-heading">
          <div>
            <span className="section-number">✓</span>
            <h3 id="current-config-title">当前配置</h3>
          </div>
          <span className={`config-source is-${config.source}`}>
            {config.source === 'ai' ? 'AI 推荐' : config.source === 'chat' ? '聊天覆盖' : '手动选择'}
          </span>
        </div>
        <div className="current-config-values">
          <div><span>比例</span><strong>{displayValue(config.ratio)}</strong></div>
          <div><span>时长</span><strong>{displayValue(config.duration)}</strong></div>
          <div><span>风格</span><strong>{displayValue(config.style)}</strong></div>
          <div><span>分镜</span><strong>{displayValue(config.shotCount)}</strong></div>
        </div>
        {config.instruction && <p>已按输入覆盖：“{config.instruction}”</p>}
      </section>

      <button
        className="confirm-video-config-action"
        type="button"
        disabled={!isComplete}
        onClick={() => onConfirm(config)}
      >
        确认参数并生成分镜
        <span aria-hidden="true">→</span>
      </button>

      <ChatBox
        contextTitle="视频参数"
        heading="用自然语言调整参数"
        sectionNumber="05"
        introMessage="按钮只是快捷选择。你可以直接描述想要的视频效果，我会解析并覆盖当前配置。"
        suggestions={['做一个60秒电影感视频', '改成16:9横屏', '控制在8个镜头', '风格再怪诞一点']}
        onMessage={applyChatInstruction}
        disabled={aiStatus === 'loading'}
        inputLabel="输入视频参数调整要求"
        placeholder="例如：做一个60秒电影感视频…"
      />
    </section>
  )
}

export default VideoConfig
