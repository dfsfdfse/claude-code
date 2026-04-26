import { BROWSER_TOOLS } from '@ant/claude-for-chrome-mcp'
import { BASE_CHROME_PROMPT } from '../../utils/claudeInChrome/prompt.js'
import { shouldAutoEnableClaudeInChrome } from '../../utils/claudeInChrome/setup.js'
import { registerBundledSkill } from '../bundledSkills.js'

const CLAUDE_IN_CHROME_MCP_TOOLS = BROWSER_TOOLS.map(
  tool => `mcp__claude-in-chrome__${tool.name}`,
)

const SKILL_ACTIVATION_MESSAGE = `
技能已激活，你现在可以使用 Chrome 浏览器自动化工具。通过 mcp__claude-in-chrome__* 工具与网页交互。

重要：首先调用 mcp__claude-in-chrome__tabs_context_mcp 获取用户当前浏览器标签页的信息。
`

export function registerClaudeInChromeSkill(): void {
  registerBundledSkill({
    name: 'claude-in-chrome',
    description:
      '自动化 Chrome 浏览器与网页交互 - 点击元素、填写表单、截图、读取控制台日志、导航网站。在现有 Chrome 会话中以新标签页打开网页。使用前需在扩展程序中配置站点级权限。',
    whenToUse:
      '当用户需要与网页交互、自动化浏览器任务、截图、读取控制台日志或执行任何浏览器操作时使用。在使用任何 mcp__claude-in-chrome__* 工具之前必须激活此技能。',
    allowedTools: CLAUDE_IN_CHROME_MCP_TOOLS,
    userInvocable: true,
    isEnabled: () => shouldAutoEnableClaudeInChrome(),
    async getPromptForCommand(args) {
      let prompt = `${BASE_CHROME_PROMPT}\n${SKILL_ACTIVATION_MESSAGE}`
      if (args) {
        prompt += `\n## Task\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
