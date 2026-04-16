import {
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  isKairosCronEnabled,
} from '@claude-code-best/builtin-tools/tools/ScheduleCronTool/prompt.js'
import { registerBundledSkill } from '../bundledSkills.js'

export function registerCronListSkill(): void {
  registerBundledSkill({
    name: 'cron-list',
    description: '列出此会话中的所有计划任务',
    whenToUse:
      '当用户想查看计划/重复任务、检查活动的 cron 任务或审查当前循环的任务时使用。',
    userInvocable: true,
    isEnabled: isKairosCronEnabled,
    async getPromptForCommand() {
      return [
        {
          type: 'text',
          text: `调用 ${CRON_LIST_TOOL_NAME} 列出所有计划的 cron 任务。以表格形式显示结果，列为：ID、调度时间、提示词、是否重复、是否持久化。如果没有任务，说"没有计划任务"。`,
        },
      ]
    },
  })
}

export function registerCronDeleteSkill(): void {
  registerBundledSkill({
    name: 'cron-delete',
    description: '按 ID 取消计划的 cron 任务',
    whenToUse:
      '当用户想取消、停止或移除计划/重复任务或 cron 任务时使用。',
    argumentHint: '<任务ID>',
    userInvocable: true,
    isEnabled: isKairosCronEnabled,
    async getPromptForCommand(args) {
      const id = args.trim()
      if (!id) {
        return [
          {
            type: 'text',
            text: `用法：/cron-delete <任务ID>\n\n请提供要取消的任务 ID。使用 /cron-list 查看活动任务及其 ID。`,
          },
        ]
      }
      return [
        {
          type: 'text',
          text: `调用 ${CRON_DELETE_TOOL_NAME}，参数 id "${id}"，以取消该计划任务。向用户确认结果。`,
        },
      ]
    },
  })
}
