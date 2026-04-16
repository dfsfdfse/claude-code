import { open, stat } from 'fs/promises'
import { CLAUDE_CODE_GUIDE_AGENT_TYPE } from '@claude-code-best/builtin-tools/tools/AgentTool/built-in/claudeCodeGuideAgent.js'
import { getSettingsFilePathForSource } from 'src/utils/settings/settings.js'
import { enableDebugLogging, getDebugLogPath } from '../../utils/debug.js'
import { errorMessage, isENOENT } from '../../utils/errors.js'
import { formatFileSize } from '../../utils/format.js'
import { registerBundledSkill } from '../bundledSkills.js'

const DEFAULT_DEBUG_LINES_READ = 20
const TAIL_READ_BYTES = 64 * 1024

export function registerDebugSkill(): void {
  registerBundledSkill({
    name: 'debug',
    description:
      process.env.USER_TYPE === 'ant'
        ? '通过读取会话调试日志调试当前 Claude Code 会话。包括所有事件日志'
        : '为此会话启用调试日志并帮助诊断问题',
    allowedTools: ['Read', 'Grep', 'Glob'],
    argumentHint: '[问题描述]',
    // disableModelInvocation so that the user has to explicitly request it in
    // interactive mode and so the description does not take up context.
    disableModelInvocation: true,
    userInvocable: true,
    async getPromptForCommand(args) {
      // Non-ants don't write debug logs by default — turn logging on now so
      // subsequent activity in this session is captured.
      const wasAlreadyLogging = enableDebugLogging()
      const debugLogPath = getDebugLogPath()

      let logInfo: string
      try {
        // Tail the log without reading the whole thing - debug logs grow
        // unbounded in long sessions and reading them in full spikes RSS.
        const stats = await stat(debugLogPath)
        const readSize = Math.min(stats.size, TAIL_READ_BYTES)
        const startOffset = stats.size - readSize
        const fd = await open(debugLogPath, 'r')
        try {
          const { buffer, bytesRead } = await fd.read({
            buffer: Buffer.alloc(readSize),
            position: startOffset,
          })
          const tail = buffer
            .toString('utf-8', 0, bytesRead)
            .split('\n')
            .slice(-DEFAULT_DEBUG_LINES_READ)
            .join('\n')
          logInfo = `Log size: ${formatFileSize(stats.size)}\n\n### Last ${DEFAULT_DEBUG_LINES_READ} lines\n\n\`\`\`\n${tail}\n\`\`\``
        } finally {
          await fd.close()
        }
      } catch (e) {
        logInfo = isENOENT(e)
          ? '暂无调试日志 — 刚刚启用日志记录。'
          : `读取最后 ${DEFAULT_DEBUG_LINES_READ} 行调试日志失败: ${errorMessage(e)}`
      }

      const justEnabledSection = wasAlreadyLogging
        ? ''
        : `
## 刚刚启用的调试日志

此会话的调试日志在此次 /debug 调用前是关闭的。之前的内容未被捕获。

告诉用户调试日志现已激活在 \`${debugLogPath}\`，请他们复现问题，然后重新读取日志。如果他们无法复现，也可以使用 \`claude --debug\` 重启以捕获启动时的日志。
`

      const prompt = `# 调试技能

帮助用户调试当前 Claude Code 会话中遇到的问题。
${justEnabledSection}
## 会话调试日志

当前会话的调试日志位于：\`${debugLogPath}\`

${logInfo}

如需额外上下文，在整个文件中搜索 [ERROR] 和 [WARN] 行。

## 问题描述

${args || '用户未描述具体问题。读取调试日志并总结任何错误、警告或值得关注的问题。'}

## 设置

记住设置文件位置：
* 用户 - ${getSettingsFilePathForSource('userSettings')}
* 项目 - ${getSettingsFilePathForSource('projectSettings')}
* 本地 - ${getSettingsFilePathForSource('localSettings')}

## 说明

1. 审查用户的问题描述
2. 最后 ${DEFAULT_DEBUG_LINES_READ} 行显示调试文件格式。在文件中查找 [ERROR] 和 [WARN] 条目、堆栈跟踪和失败模式
3. 考虑启动 ${CLAUDE_CODE_GUIDE_AGENT_TYPE} 子智能体以了解相关 Claude Code 功能
4. 用通俗易懂的语言解释你发现了什么
5. 提出具体的修复建议或后续步骤
`
      return [{ type: 'text', text: prompt }]
    },
  })
}
