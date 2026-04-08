import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'

function getEnvVarForProvider(provider: string): string {
  switch (provider) {
    case 'bedrock':
      return 'CLAUDE_CODE_USE_BEDROCK'
    case 'vertex':
      return 'CLAUDE_CODE_USE_VERTEX'
    case 'foundry':
      return 'CLAUDE_CODE_USE_FOUNDRY'
    case 'gemini':
      return 'CLAUDE_CODE_USE_GEMINI'
    case 'grok':
      return 'CLAUDE_CODE_USE_GROK'
    default:
      throw new Error(`未知提供者: ${provider}`)
  }
}

// Get merged env: process.env + settings.env (from userSettings)
function getMergedEnv(): Record<string, string> {
  const settings = getSettings_DEPRECATED()
  const merged = { ...process.env }
  if (settings?.env) {
    Object.assign(merged, settings.env)
  }
  return merged
}

const call: LocalCommandCall = async (args, context) => {
  const arg = args.trim().toLowerCase()

  // No argument: show current provider
  if (!arg) {
    const current = getAPIProvider()
    return { type: 'text', value: `当前 API 提供者: ${current}` }
  }

  // unset - clear settings, fallback to env vars
  if (arg === 'unset') {
    updateSettingsForSource('userSettings', { modelType: undefined })
    // Also clear all provider-specific env vars to prevent conflicts
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    return {
      type: 'text',
      value: 'API 提供者已清除 (将使用环境变量)。',
    }
  }

  // Validate provider
  const validProviders = [
    'anthropic',
    'openai',
    'gemini',
    'grok',
    'bedrock',
    'vertex',
    'foundry',
  ]
  if (!validProviders.includes(arg)) {
    return {
      type: 'text',
      value: `无效提供者: ${arg}\n有效: ${validProviders.join(', ')}`,
    }
  }

  // Check env vars when switching to openai (including settings.env)
  if (arg === 'openai') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!mergedEnv.OPENAI_API_KEY
    const hasUrl = !!mergedEnv.OPENAI_BASE_URL
    if (!hasKey || !hasUrl) {
      updateSettingsForSource('userSettings', { modelType: 'openai' })
      const missing = []
      if (!hasKey) missing.push('OPENAI_API_KEY')
      if (!hasUrl) missing.push('OPENAI_BASE_URL')
      return {
        type: 'text',
        value: `已切换到 OpenAI 提供者。\n警告: 缺少环境变量: ${missing.join(', ')}\n通过 /login 配置或手动设置。`,
      }
    }
  }

  // Check env vars when switching to grok (including settings.env)
  if (arg === 'grok') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!(mergedEnv.GROK_API_KEY || mergedEnv.XAI_API_KEY)
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'grok' })
      return {
        type: 'text',
        value: `已切换到 Grok 提供者。\n警告: 缺少环境变量: GROK_API_KEY (或 XAI_API_KEY)\n通过 settings.json env 配置或手动设置。`,
      }
    }
  }

  // Check env vars when switching to gemini (including settings.env)
  if (arg === 'gemini') {
    const mergedEnv = getMergedEnv()
    const hasKey = !!mergedEnv.GEMINI_API_KEY
    // GEMINI_BASE_URL is optional (has default)
    if (!hasKey) {
      updateSettingsForSource('userSettings', { modelType: 'gemini' })
      return {
        type: 'text',
        value: `已切换到 Gemini 提供者。\n警告: 缺少环境变量: GEMINI_API_KEY\n通过 /login 配置或手动设置。`,
      }
    }
  }

  // Handle different provider types
  // - 'anthropic', 'openai', 'gemini' are stored in settings.json (persistent)
  // - 'bedrock', 'vertex', 'foundry' are env-only (do NOT touch settings.json)
  if (arg === 'anthropic' || arg === 'openai' || arg === 'gemini' || arg === 'grok') {
    // Clear any cloud provider env vars to avoid conflicts
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    // Update settings.json
    updateSettingsForSource('userSettings', { modelType: arg })
    // Ensure settings.env gets applied to process.env
    applyConfigEnvironmentVariables()
    return { type: 'text', value: `API 提供者已设置为 ${arg}。` }
  } else {
    // Cloud providers: set env vars only, do NOT touch settings.json
    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    process.env[getEnvVarForProvider(arg)] = '1'
    // Do not modify settings.json - cloud providers controlled solely by env vars
    applyConfigEnvironmentVariables()
    return {
      type: 'text',
      value: `API 提供者已设置为 ${arg} (通过环境变量)。`,
    }
  }
}

const provider = {
  type: 'local',
  name: 'provider',
  description:
    '切换 API 提供者 (anthropic/openai/gemini/grok/bedrock/vertex/foundry)',
  aliases: ['api'],
  argumentHint: '[anthropic|openai|gemini|grok|bedrock|vertex|foundry|unset]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default provider
