import { feature } from 'bun:bundle'
import { getRemoteControlAtStartup } from '../../utils/config.js'
import {
  EDITOR_MODES,
  NOTIFICATION_CHANNELS,
  TEAMMATE_MODES,
} from '../../utils/configConstants.js'
import { getModelOptions } from '../../utils/model/modelOptions.js'
import { validateModel } from '../../utils/model/validateModel.js'
import { THEME_NAMES, THEME_SETTINGS } from '../../utils/theme.js'

/** 可同步以立即生效 UI 变更的 AppState 键 */
type SyncableAppStateKey = 'verbose' | 'mainLoopModel' | 'thinkingEnabled'

type SettingConfig = {
  source: 'global' | 'settings'
  type: 'boolean' | 'string'
  description: string
  path?: string[]
  options?: readonly string[]
  getOptions?: () => string[]
  appStateKey?: SyncableAppStateKey
  /** 写入/设置值时调用的异步校验 */
  validateOnWrite?: (v: unknown) => Promise<{ valid: boolean; error?: string }>
  /** 读取/获取值时用于显示的格式化 */
  formatOnRead?: (v: unknown) => unknown
}

export const SUPPORTED_SETTINGS: Record<string, SettingConfig> = {
  theme: {
    source: 'global',
    type: 'string',
    description: '界面配色主题',
    options: feature('AUTO_THEME') ? THEME_SETTINGS : THEME_NAMES,
  },
  editorMode: {
    source: 'global',
    type: 'string',
    description: '快捷键绑定模式',
    options: EDITOR_MODES,
  },
  verbose: {
    source: 'global',
    type: 'boolean',
    description: '显示详细调试输出',
    appStateKey: 'verbose',
  },
  preferredNotifChannel: {
    source: 'global',
    type: 'string',
    description: '首选通知渠道',
    options: NOTIFICATION_CHANNELS,
  },
  autoCompactEnabled: {
    source: 'global',
    type: 'boolean',
    description: '上下文满时自动压缩',
  },
  autoMemoryEnabled: {
    source: 'settings',
    type: 'boolean',
    description: '启用自动记忆',
  },
  autoDreamEnabled: {
    source: 'settings',
    type: 'boolean',
    description: '启用后台记忆整理',
  },
  fileCheckpointingEnabled: {
    source: 'global',
    type: 'boolean',
    description: '启用文件检查点以支持代码回退',
  },
  showTurnDuration: {
    source: 'global',
    type: 'boolean',
    description: '回复后显示轮次耗时（如"耗时 1分6秒"）',
  },
  terminalProgressBarEnabled: {
    source: 'global',
    type: 'boolean',
    description: '在支持的终端中显示 OSC 9;4 进度指示器',
  },
  todoFeatureEnabled: {
    source: 'global',
    type: 'boolean',
    description: '启用待办/任务追踪',
  },
  model: {
    source: 'settings',
    type: 'string',
    description: '覆盖默认模型',
    appStateKey: 'mainLoopModel',
    getOptions: () => {
      try {
        return getModelOptions()
          .filter(o => o.value !== null)
          .map(o => o.value as string)
      } catch {
        return ['sonnet', 'opus', 'haiku']
      }
    },
    validateOnWrite: v => validateModel(String(v)),
    formatOnRead: v => (v === null ? 'default' : v),
  },
  alwaysThinkingEnabled: {
    source: 'settings',
    type: 'boolean',
    description: '启用扩展思考（设为 false 禁用）',
    appStateKey: 'thinkingEnabled',
  },
  'permissions.defaultMode': {
    source: 'settings',
    type: 'string',
    description: '工具使用的默认权限模式',
    options: feature('TRANSCRIPT_CLASSIFIER')
      ? ['default', 'plan', 'acceptEdits', 'dontAsk', 'auto']
      : ['default', 'plan', 'acceptEdits', 'dontAsk'],
  },
  language: {
    source: 'settings',
    type: 'string',
    description: 'Claude 回复和语音输入的首选语言（如 "japanese"、"spanish"）',
  },
  teammateMode: {
    source: 'global',
    type: 'string',
    description:
      '队友生成方式："tmux" 传统 tmux 模式，"in-process" 同进程模式，"auto" 自动选择',
    options: TEAMMATE_MODES,
  },
  ...(process.env.USER_TYPE === 'ant'
    ? {
        classifierPermissionsEnabled: {
          source: 'settings' as const,
          type: 'boolean' as const,
          description: '启用基于 AI 的 Bash(prompt:...) 权限规则分类',
        },
      }
    : {}),
  ...(feature('VOICE_MODE')
    ? {
        voiceEnabled: {
          source: 'settings' as const,
          type: 'boolean' as const,
          description: '启用语音输入（按住说话）',
        },
      }
    : {}),
  ...(feature('BRIDGE_MODE')
    ? {
        remoteControlAtStartup: {
          source: 'global' as const,
          type: 'boolean' as const,
          description: '为所有会话启用远程控制（true | false | default）',
          formatOnRead: () => getRemoteControlAtStartup(),
        },
      }
    : {}),
  ...(feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
    ? {
        taskCompleteNotifEnabled: {
          source: 'global' as const,
          type: 'boolean' as const,
          description: 'Claude 完成任务后空闲时推送通知到手机（需要远程控制）',
        },
        inputNeededNotifEnabled: {
          source: 'global' as const,
          type: 'boolean' as const,
          description: '权限提示或问题等待时推送通知到手机（需要远程控制）',
        },
        agentPushNotifEnabled: {
          source: 'global' as const,
          type: 'boolean' as const,
          description: '允许 Claude 在适当时推送通知到手机（需要远程控制）',
        },
      }
    : {}),
}

export function isSupported(key: string): boolean {
  return key in SUPPORTED_SETTINGS
}

export function getConfig(key: string): SettingConfig | undefined {
  return SUPPORTED_SETTINGS[key]
}

export function getAllKeys(): string[] {
  return Object.keys(SUPPORTED_SETTINGS)
}

export function getOptionsForSetting(key: string): string[] | undefined {
  const config = SUPPORTED_SETTINGS[key]
  if (!config) return undefined
  if (config.options) return [...config.options]
  if (config.getOptions) return config.getOptions()
  return undefined
}

export function getPath(key: string): string[] {
  const config = SUPPORTED_SETTINGS[key]
  return config?.path ?? key.split('.')
}
