import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import { DEFAULT_CRON_JITTER_CONFIG } from '../../utils/cronTasks.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const KAIROS_CRON_REFRESH_MS = 5 * 60 * 1000

export const DEFAULT_MAX_AGE_DAYS =
  DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24 * 60 * 60 * 1000)

/**
 * cron 调度系统的统一门控。结合构建时的
 * `feature('AGENT_TRIGGERS')` 标志（死代码消除）和运行时的
 * 5 分钟刷新窗口内的 `tengu_kairos_cron` GrowthBook 门控。
 *
 * AGENT_TRIGGERS 可以独立于 KAIROS 发货——cron 模块
 * graph (cronScheduler/cronTasks/cronTasksLock/cron.ts + 三个工具 +
 * /loop skill) 对 src/assistant/ 没有零导入，也没有 feature('KAIROS')
 * 调用。REPL.tsx kairosEnabled 读取是安全的：
 * kairosEnabled 无条件地在 AppStateStore 中默认为 false，所以
 * 当 KAIROS 关闭时调度器只是得到 assistantMode: false。
 *
 * 从 Tool.isEnabled()（延迟，后初始化）和 useEffect 内部调用/
 * 命令式设置，从不在模块范围内——所以磁盘缓存有机会填充。
 *
 * 默认为 `true`——/loop 已 GA（已在 changelog 中宣布）。GrowthBook
 * 对 Bedrock/Vertex/Foundry 和设置了 DISABLE_TELEMETRY /
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 的用户禁用；`false` 默认值会
 * 为这些用户破坏 /loop（GH #31759）。GB 门控现在纯粹作为
 * 舰队范围的 kill switch——将其翻转为 `false` 在下一次 isKilled 轮询
 * 时停止已运行的调度器，而不仅仅是新的。
 *
 * `CLAUDE_CODE_DISABLE_CRON` 是一个本地覆盖，优先级高于 GB。
 */
export function isKairosCronEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CRON)
}

/**
 * 磁盘持久化（持久）cron 任务的 kill switch。比
 * {@link isKairosCronEnabled} 更窄——关闭此开关强制 call() 站点
 * 的 `durable: false`，使会话唯一的 cron（内存中，GA）不受影响。
 *
 * 默认为 `true`，以便 Bedrock/Vertex/Foundry 和 DISABLE_TELEMETRY 用户获得
 * 持久 cron。不咨询 CLAUDE_CODE_DISABLE_CRON（那通过 isKairosCronEnabled
 * 杀死整个调度器）。
 */
export function isDurableCronEnabled(): boolean {
  return getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_kairos_cron_durable',
    true,
    KAIROS_CRON_REFRESH_MS,
  )
}

export const CRON_CREATE_TOOL_NAME = 'CronCreate'
export const CRON_DELETE_TOOL_NAME = 'CronDelete'
export const CRON_LIST_TOOL_NAME = 'CronList'

export function buildCronCreateDescription(durableEnabled: boolean): string {
  return durableEnabled
    ? '计划一个提示词在将来时间运行——可以是 cron 计划上的循环运行，也可以是特定时间的一次性运行。传递 durable: true 持久化到 .claude/scheduled_tasks.json；否则仅会话内。'
    : '计划一个提示词在将来时间运行——可以是 cron 计划上的循环运行，也可以是特定时间的一次性运行，仅限本次 Claude 会话。'
}

export function buildCronCreatePrompt(durableEnabled: boolean): string {
  const durabilitySection = durableEnabled
    ? `## 持久性

默认情况下（durable: false）任务只存在于本次 Claude 会话中——不写入磁盘，当 Claude 退出时任务消失。传递 durable: true 写入 .claude/scheduled_tasks.json 以便任务在重启后存活。只有当用户明确要求任务持久（"每天继续做这个"、"永久设置这个"）时才使用 durable: true。大多数"5 分钟后提醒我"/"一小时后检查"的请求应该保持会话内。`
    : `## 会话内

任务只存在于本次 Claude 会话中——不写入磁盘，当 Claude 退出时任务消失。`

  const durableRuntimeNote = durableEnabled
    ? '持久任务持久化到 .claude/scheduled_tasks.json 并在会话重启后存活——下次启动时它们会自动恢复。在 REPL 关闭时错过的一次性持久任务会被浮出以便追赶。会话内任务随进程终止。'
    : ''

  return `计划一个提示词在将来时间入队。使用于循环计划和一次性提醒。

使用用户本地时区的标准 5 字段 cron：分钟 小时 日-of-month 月 日-of-week。"0 9 * * *" 表示当地时间上午 9 点——无需时区转换。

## 一次性任务（recurring: false）

对于"在 X 提醒我"或"在 <时间>，做 Y"的请求——触发一次后自动删除。
将分钟/小时/日-of-month/月固定到特定值：
  "今天下午 2:30 提醒我检查部署" → cron: "30 14 <今天_dom> <今天_month> *", recurring: false
  "明天早上运行冒烟测试" → cron: "57 8 <明天_dom> <明天_month> *", recurring: false

## 循环任务（recurring: true，默认为此）

对于"每 N 分钟"/"每小时"/"工作日上午 9 点"的请求：
  "*/5 * * * *"（每 5 分钟），"0 * * * *"（每小时），"0 9 * * 1-5"（工作日上午 9 点当地时间）

## 避免 :00 和 :30 分钟刻度（当任务允许时）

每个要求"上午 9 点"的用户都得到 \`0 9\`，每个要求"每小时"的用户都得到 \`0 *\`——这意味着来自全球的请求同时到达 API。当用户的请求是近似的时候，选择不是 0 或 30 的分钟：
  "每天早上大约 9 点" → "57 8 * * *" 或 "3 9 * * *"（不是 "0 9 * * *"）
  "每小时" → "7 * * * *"（不是 "0 * * * *"）
  "大约一小时后提醒我..." → 选择你落在的任何分钟，不要四舍五入

只有当用户指定那个确切时间并明确表示时就使用分钟 0 或 30（"在 9:00 整"、"在半点"、"与会议协调"）。如有疑问，提前或推后几分钟——用户不会注意到，但舰队会。

${durabilitySection}

## 运行行为

任务只在 REPL 空闲时触发（非查询中）。${durableRuntimeNote}调度器在你选择的基础上添加小的确定性抖动：循环任务最多延迟其周期的 10%（最多 15 分钟）；落在 :00 或 :30 的一次性任务最多提前 90 秒。选择非整点分钟仍然是更大的杠杆。

循环任务在 ${DEFAULT_MAX_AGE_DAYS} 天后自动过期——它们触发最后一次，然后被删除。这限制了会话生命周期。在安排循环任务时告诉用户 ${DEFAULT_MAX_AGE_DAYS} 天限制。

返回一个你可以传递给 ${CRON_DELETE_TOOL_NAME} 的任务 ID。`
}

export const CRON_DELETE_DESCRIPTION = '通过 ID 取消计划的 cron 任务'
export function buildCronDeletePrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `取消之前用 ${CRON_CREATE_TOOL_NAME} 计划的 cron 任务。从 .claude/scheduled_tasks.json（持久任务）或内存会话存储（会话内任务）中移除。`
    : `取消之前用 ${CRON_CREATE_TOOL_NAME} 计划的 cron 任务。从内存会话存储中移除。`
}

export const CRON_LIST_DESCRIPTION = '列出计划的 cron 任务'
export function buildCronListPrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `列出通过 ${CRON_CREATE_TOOL_NAME} 计划的所有 cron 任务，包括持久任务（.claude/scheduled_tasks.json）和会话内任务。`
    : `列出本次会话中通过 ${CRON_CREATE_TOOL_NAME} 计划的所有 cron 任务。`
}
