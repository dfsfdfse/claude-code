import { formatTotalCost } from '../../cost-tracker.js'
import { currentLimits } from '../../services/claudeAiLimits.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

export const call: LocalCommandCall = async () => {
  if (isClaudeAISubscriber()) {
    let value: string

    if (currentLimits.isUsingOverage) {
      value =
        '你当前正在使用你的超额来支持你的 Claude Code 使用。我们将自动切换回你的订阅速率限制当它们重置'
    } else {
      value =
        '你当前正在使用你的订阅来支持你的 Claude Code 使用'
    }

    if (process.env.USER_TYPE === 'ant') {
      value += `\n\n[仅内部功能] 显示成本:\n ${formatTotalCost()}`
    }
    return { type: 'text', value }
  }
  return { type: 'text', value: formatTotalCost() }
}
