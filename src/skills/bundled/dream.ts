// 手动 /dream 技能 — 交互式运行记忆整合提示词。
// 从 KAIROS 功能门控中提取，只要启用了自动记忆功能即可无条件使用。

import { getAutoMemPath, isAutoMemoryEnabled } from '../../memdir/paths.js'
import { buildConsolidationPrompt } from '../../services/autoDream/consolidationPrompt.js'
import { recordConsolidation } from '../../services/autoDream/consolidationLock.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getProjectDir } from '../../utils/sessionStorage.js'
import { registerBundledSkill } from '../bundledSkills.js'

const DREAM_PROMPT_PREFIX = `# Dream: 记忆整合（手动运行）

你正在执行一次手动 dream — 对你的记忆文件进行回顾性整理。与自动后台 dream 不同，本次运行拥有完整的工具权限，且用户正在观看。将最近学到的内容整合为持久、有条理的记忆，以便未来的会话能够快速定位。

`

export function registerDreamSkill(): void {
  registerBundledSkill({
    name: 'dream',
    description:
      '手动触发记忆整合 — 审查、整理和清理你的自动记忆文件。',
    whenToUse:
      '当用户说 /dream 或希望手动整合记忆、整理记忆文件或清理过时条目时使用。',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    async getPromptForCommand(args) {
      const memoryRoot = getAutoMemPath()
      const transcriptDir = getProjectDir(getOriginalCwd())

      // 乐观地标记整合锁定（与 KAIROS 路径相同）。
      await recordConsolidation()

      const basePrompt = buildConsolidationPrompt(memoryRoot, transcriptDir, '')
      let prompt = DREAM_PROMPT_PREFIX + basePrompt

      if (args) {
        prompt += `\n\n## 用户提供的额外上下文\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
