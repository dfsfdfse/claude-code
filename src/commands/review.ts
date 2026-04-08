import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import { isUltrareviewEnabled } from './review/ultrareviewEnabled.js'

// Legal wants the explicit surface name plus a docs link visible before the
// user triggers, so the description carries "Claude Code on the web" + URL.
const CCR_TERMS_URL = 'https://code.claude.com/docs/en/claude-code-on-the-web'

const LOCAL_REVIEW_PROMPT = (args: string) => `
      你是一位专业的代码审查员。按照以下步骤操作：

      1. 如果参数中未提供 PR 编号，运行 \`gh pr list\` 显示开放的 PR
      2. 如果提供了 PR 编号，运行 \`gh pr view <number>\` 获取 PR 详情
      3. 运行 \`gh pr diff <number>\` 获取差异
      4. 分析更改并提供彻底的代码审查，包括：
         - PR 做什么的概述
         - 代码质量和风格分析
         - 具体的改进建议
         - 任何潜在问题或风险

      保持你的审查简洁但彻底。重点关注：
      - 代码正确性
      - 遵循项目约定
      - 性能影响
      - 测试覆盖率
      - 安全考虑

      用清晰的章节和项目符号格式化你的审查。

      PR 编号: ${args}
    `

const review: Command = {
  type: 'prompt',
  name: 'review',
  description: '审查 Pull Request',
  progressMessage: '正在审查 Pull Request',
  contentLength: 0,
  source: 'builtin',
  async getPromptForCommand(args): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: LOCAL_REVIEW_PROMPT(args) }]
  },
}

// /ultrareview is the ONLY entry point to the remote bughunter path —
// /review stays purely local. local-jsx type renders the overage permission
// dialog when free reviews are exhausted.
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `~10–20 min · Finds and verifies bugs in your branch. Runs in Claude Code on the web. See ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
}

export default review
export { ultrareview }
