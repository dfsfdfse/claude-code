import { feature } from 'bun:bundle'
import { getInvokedSkillsForAgent } from '../../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import { queryModelWithoutStreaming } from '../../services/api/claude.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { createAbortController } from '../abortController.js'
import { count } from '../array.js'
import { getCwd } from '../cwd.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import {
  createUserMessage,
  extractTag,
  extractTextContent,
} from '../messages.js'
import { getSmallFastModel } from '../model/model.js'
import { jsonParse } from '../slowOperations.js'
import { asSystemPrompt } from '../systemPromptType.js'
import {
  type ApiQueryHookConfig,
  createApiQueryHook,
} from './apiQueryHookHelper.js'
import { registerPostSamplingHook } from './postSamplingHooks.js'

const TURN_BATCH_SIZE = 5

export type SkillUpdate = {
  section: string
  change: string
  reason: string
}

function formatRecentMessages(messages: Message[]): string {
  return messages
    .filter(m => m.type === 'user' || m.type === 'assistant')
    .map(m => {
      const role = m.type === 'user' ? 'User' : 'Assistant'
      const content = m.message.content
      if (typeof content === 'string')
        return `${role}: ${content.slice(0, 500)}`
      const text = content
        .filter(
          (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
        )
        .map(b => b.text)
        .join('\n')
      return `${role}: ${text.slice(0, 500)}`
    })
    .join('\n\n')
}

function findProjectSkill() {
  const skills = getInvokedSkillsForAgent(null)
  for (const [, info] of skills) {
    if (info.skillPath.startsWith('projectSettings:')) {
      return info
    }
  }
  return undefined
}

function createSkillImprovementHook() {
  let lastAnalyzedCount = 0
  let lastAnalyzedIndex = 0

  const config: ApiQueryHookConfig<SkillUpdate[]> = {
    name: 'skill_improvement',

    async shouldRun(context) {
      if (context.querySource !== 'repl_main_thread') {
        return false
      }

      if (!findProjectSkill()) {
        return false
      }

      // Only run every TURN_BATCH_SIZE user messages
      const userCount = count(context.messages, m => m.type === 'user')
      if (userCount - lastAnalyzedCount < TURN_BATCH_SIZE) {
        return false
      }

      lastAnalyzedCount = userCount
      return true
    },

    buildMessages(context) {
      const projectSkill = findProjectSkill()!
      // Only analyze messages since the last check — the skill definition
      // provides enough context for the classifier to understand corrections
      const newMessages = context.messages.slice(lastAnalyzedIndex)
      lastAnalyzedIndex = context.messages.length

      return [
        createUserMessage({
          content: `你正在分析一段用户执行技能（可复用流程）的对话。
你的任务：判断用户最近的消息中，是否包含应当被永久加入该技能定义的偏好、请求或修正，以便今后运行时自动记住。

<skill_definition>
${projectSkill.content}
</skill_definition>

<recent_messages>
${formatRecentMessages(newMessages)}
</recent_messages>

请关注：
- 涉及添加、变更、删除步骤的请求，如：“能不能也问我X”、“请再做Y”、“不要做Z”
- 关于步骤如何执行的偏好，例如：“问我能量水平”、“记录下时间”、“用随意的语气”
- 修正和订正的话，如：“不，应该做X”、“务必使用Y”、“一定要……”

忽略：
- 一次性的临时对话、闲聊等无法泛化的内容
- 技能中已实现的内容

输出格式：在<updates>标签内输出JSON数组。每一项形如：{"section": "修改或添加的是哪一步/部分，如'new step'", "change": "具体增加/修改内容", "reason": "触发这项变更的用户消息"}
如果没有应当更新的内容，就输出 <updates>[]</updates>。`,
        }),
      ]
    },

    systemPrompt:
      '你会在技能执行过程中自动检测用户的偏好和过程改进建议。用户任何需要记住到下次的请求，都应被标记出来。',
 

    useTools: false,

    parseResponse(content) {
      const updatesStr = extractTag(content, 'updates')
      if (!updatesStr) {
        return []
      }
      try {
        return jsonParse(updatesStr) as SkillUpdate[]
      } catch {
        return []
      }
    },

    logResult(result, context) {
      if (result.type === 'success' && result.result.length > 0) {
        const projectSkill = findProjectSkill()
        const skillName = projectSkill?.skillName ?? 'unknown'

        logEvent('tengu_skill_improvement_detected', {
          updateCount: result.result
            .length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          uuid: result.uuid as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          // _PROTO_skill_name routes to the privileged skill_name BQ column.
          _PROTO_skill_name:
            skillName as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        })

        context.toolUseContext.setAppState(prev => ({
          ...prev,
          skillImprovement: {
            suggestion: { skillName, updates: result.result },
          },
        }))
      }
    },

    getModel: getSmallFastModel,
  }

  return createApiQueryHook(config)
}

export function initSkillImprovement(): void {
  if (
    feature('SKILL_IMPROVEMENT') &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_copper_panda', false)
  ) {
    registerPostSamplingHook(createSkillImprovementHook())
  }
}

/**
 * 通过调用辅助渠道 LLM 重写技能文件来应用技能改进。
 * 触发后不管——不会阻塞主对话。
 */
export async function applySkillImprovement(
  skillName: string,
  updates: SkillUpdate[],
): Promise<void> {
  if (!skillName) return

  const { join } = await import('path')
  const fs = await import('fs/promises')

  // Skills live at .claude/skills/<name>/SKILL.md relative to CWD
  const filePath = join(getCwd(), '.claude', 'skills', skillName, 'SKILL.md')

  let currentContent: string
  try {
    currentContent = await fs.readFile(filePath, 'utf-8')
  } catch {
    logError(
      new Error(`读取待改进技能文件失败: ${filePath}`),
 
    )
    return
  }

  const updateList = updates.map(u => `- ${u.section}: ${u.change}`).join('\n')

  const response = await queryModelWithoutStreaming({
    messages: [
      createUserMessage({
        content: `你正在编辑一个技能定义文件。请将以下改进应用到该技能上。

<current_skill_file>
${currentContent}
</current_skill_file>

<improvements>
${updateList}
</improvements>

要求：
- 将改进内容自然地融合到现有结构中
- 完全保留 frontmatter（即 --- 包裹的部分）原样不动
- 保持整体格式和风格一致
- 除非改进明确要求替换，否则不要删除已有内容
- 输出完整更新后的文件，放在 <updated_file> 标签内`,
      }),
    ],
    systemPrompt: asSystemPrompt([
      '你负责编辑技能定义文件，将用户的偏好融入其中。只输出已更新的文件内容。',
    ]),
    thinkingConfig: { type: 'disabled' as const },
    tools: [],
    signal: createAbortController().signal,
    options: {
      getToolPermissionContext: async () => getEmptyToolPermissionContext(),
      model: getSmallFastModel(),
      toolChoice: undefined,
      isNonInteractiveSession: false,
      hasAppendSystemPrompt: false,
      temperatureOverride: 0,
      agents: [],
      querySource: 'skill_improvement_apply',
      mcpTools: [],
    },
  })

  const responseText = extractTextContent(Array.isArray(response.message.content) ? response.message.content : []).trim()

  const updatedContent = extractTag(responseText, 'updated_file')
  if (!updatedContent) {
    logError(
      new Error('技能改进应用失败: 响应中没有 <updated_file> 标签'),
    )
    return
  }

  try {
    await fs.writeFile(filePath, updatedContent, 'utf-8')
  } catch (e) {
    logError(toError(e))
  }
}
