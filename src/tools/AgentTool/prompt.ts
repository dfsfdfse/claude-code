import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getSubscriptionType } from '../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import { isTeammate } from '../../utils/teammate.js'
import { isInProcessTeammate } from '../../utils/teammateContext.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../SendMessageTool/constants.js'
import { AGENT_TOOL_NAME } from './constants.js'
import { isForkSubagentEnabled } from './forkSubagent.js'
import type { AgentDefinition } from './loadAgentsDir.js'

function getToolsDescription(agent: AgentDefinition): string {
  const { tools, disallowedTools } = agent
  const hasAllowlist = tools && tools.length > 0
  const hasDenylist = disallowedTools && disallowedTools.length > 0

  if (hasAllowlist && hasDenylist) {
    // 两者都定义：按拒绝列表过滤允许列表以匹配运行时行为
    const denySet = new Set(disallowedTools)
    const effectiveTools = tools.filter(t => !denySet.has(t))
    if (effectiveTools.length === 0) {
      return '无'
    }
    return effectiveTools.join(', ')
  } else if (hasAllowlist) {
    // 仅允许列表：显示可用的特定工具
    return tools.join(', ')
  } else if (hasDenylist) {
    // 仅拒绝列表：显示"除 X、Y、Z 外的所有工具"
    return `除 ${disallowedTools.join(', ')} 外的所有工具`
  }
  // 无限制
  return '所有工具'
}

/**
 * 格式化单个代理行，用于 agent_listing_delta 附件消息：
 * `- type: whenToUse (Tools: ...)`。
 */
export function formatAgentLine(agent: AgentDefinition): string {
  const toolsDescription = getToolsDescription(agent)
  return `- ${agent.agentType}: ${agent.whenToUse} (工具: ${toolsDescription})`
}

/**
 * 是否应将代理列表作为附件消息注入，而非嵌入在工具描述中。
 * 当为 true 时，getPrompt() 返回静态描述，attachments.ts 发送
 * agent_listing_delta 附件。
 *
 * 动态代理列表约占 fleet cache_creation token 的 10.2%：MCP 异步
 * 连接、/reload-plugins 或权限模式变更会修改列表 →
 * 描述变更 → 完整的工具 schema 缓存失效。
 *
 * 测试时可使用 CLAUDE_CODE_AGENT_LIST_IN_MESSAGES=true/false 覆盖。
 */
export function shouldInjectAgentListInMessages(): boolean {
  if (isEnvTruthy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES)) return true
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_AGENT_LIST_IN_MESSAGES))
    return false
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_agent_list_attach', false)
}

export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // 当 Agent(x,y) 限制可生成的代理类型时，按允许类型过滤代理
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // Fork 子代理功能：启用时，插入"何时使用 fork"部分
  // (fork 语义、指令式提示词) 并切换为 fork 感知的示例。
  const forkEnabled = isForkSubagentEnabled()

  const whenToForkSection = forkEnabled
    ? `

## 何时使用 fork

当中间工具输出不值得保留在你的上下文中时，fork 自身（省略 \`subagent_type\`）。判断标准是定性的——"我是否需要再次使用这个输出"——而非任务大小。
- **研究**：fork 开放式问题。如果研究可以分解为独立问题，在一个消息中并行启动多个 fork。相比新建子代理，fork 更有优势——它继承上下文并共享你的缓存。
- **实现**：优先 fork 需要多次编辑的实现工作。实现前先做研究。

Fork 很廉价，因为它们共享你的提示缓存。不要在 fork 上设置 \`model\`——不同的模型无法复用父级的缓存。传递一个简短的 \`name\`（一到两个词，小写），这样用户可以在团队面板中看到 fork 并在运行中引导它。

**不要偷看。** 工具结果包含 \`output_file\` 路径——除非用户明确要求检查进度，否则不要读取或追踪它。你会收到完成通知；信任它。在转录过程中读取会将 fork 的工具噪音拉入你的上下文，这就违背了 fork 的目的。

**不要竞速。** 启动后，你对 fork 的发现一无所知。永远不要以任何格式伪造或预测 fork 结果——无论是散文、摘要还是结构化输出。通知作为用户角色消息在后续轮次到达；它永远不是你自行编写的内容。如果用户在通知到达前提出后续问题，告知他们 fork 仍在运行——给出状态，而非猜测。

**编写 fork 提示词。** 由于 fork 继承你的上下文，提示词是*指令性的*——要做什么，而非情况是什么。要明确范围：什么包含在内，什么排除在外，其他代理在处理什么。不要重新解释背景。
`
    : ''

  const writingThePromptSection = `

## 编写提示词

${forkEnabled ? '启动新代理时（带 \`subagent_type\`），它从零上下文开始。' : ''}像对待一位刚走进房间的聪明同事一样向代理简报——它没看过这个对话，不知道你尝试过什么，不理解为什么这个任务重要。
- 解释你要完成什么以及为什么。
- 描述你已经学到或排除的内容。
- 提供足够的周围问题背景，让代理能够做出判断而非仅遵循狭窄的指令。
- 如果你需要简短回复，明确说明（"200 字以内报告"）。
- 查询：直接给出确切命令。调查：直接给出问题——当前提错误时，预设步骤会成为死重。

${forkEnabled ? '对于新代理，要简洁' : '简洁'}的命令式提示词会产生肤浅、通用的工作。

**永远不要委托理解。** 不要写"根据你的发现，修复 bug"或"根据研究，实现它"。这些短语将综合工作推给代理而非自己完成。写出能证明你已理解的提示词：包含文件路径、行号、具体要改什么。
`

  const forkExamples = `用法示例：

<example>
user: "在这个分支发货前还剩什么？"
assistant: <thinking>Fork 这个——这是个调查问题。我想要待办清单，而非 git 输出进我的上下文。</thinking>
${AGENT_TOOL_NAME}({
  name: "ship-audit",
  description: "分支发货就绪审计",
  prompt: "审计这个分支发货前还剩什么。检查：未提交变更、主分支前是否有提交、是否存在测试、GrowthBook 开关是否连接、CI 相关文件是否变更。报告待办清单——完成 vs. 缺失。200 字以内。"
})
assistant: 发货就绪审计运行中。
<commentary>
回合在此结束。协调者此时对发现一无所知。后续是单独的回合——通知从外部作为用户消息到达。这不是协调者编写的。
</commentary>
[后续回合 —— 通知作为用户消息到达]
assistant: 审计回来了。三个阻塞项：新提示词路径无测试、GrowthBook 开关连接了但不在 build_flags.yaml 中、一个未提交文件。
</example>

<example>
user: "那么开关连接上了吗"
<commentary>
用户中途询问。审计 fork 正是为了回答这个而启动的，它还没有返回。协调者没有这个答案。给出状态，而非伪造的结果。
</commentary>
assistant: 还在等待审计——那是它正在检查的项目之一。应该很快就会到达。
</example>

<example>
user: "你能对这次迁移是否安全获取第二意见吗？"
assistant: <thinking>我会询问代码审查代理——它不会看到我的分析，所以能给出独立判断。</thinking>
<commentary>
指定了 subagent_type，所以代理从全新开始。它需要在提示词中获得完整上下文。简报说明要评估什么以及为什么。
</commentary>
${AGENT_TOOL_NAME}({
  name: "migration-review",
  description: "独立迁移审查",
  subagent_type: "code-reviewer",
  prompt: "审查 0042_user_schema.sql 迁移的安全性。背景：我们要向一个 5000 万行的表添加 NOT NULL 列。现有行获得回填默认值。我想要对回填方法在并发写入下是否安全获取第二意见——我已经检查了锁定行为，但需要独立验证。报告：是否安全，如果不安全，具体会出什么错？"
})
</example>
`

  const currentExamples = `用法示例：

<example_agent_descriptions>
"test-runner": 在写完代码后使用此代理运行测试
"greeting-responder": 使用此代理用友好的笑话回应用户问候
</example_agent_descriptions>

<example>
user: "请写一个检查数字是否为质数的函数"
assistant: 我将使用 ${FILE_WRITE_TOOL_NAME} 工具来编写以下代码：
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
由于写了大量代码且任务完成，现在使用 test-runner 代理来运行测试
</commentary>
assistant: 使用 ${AGENT_TOOL_NAME} 工具启动 test-runner 代理
</example>

<example>
user: "你好"
<commentary>
由于用户在问候，使用 greeting-responder 代理用友好的笑话回应
</commentary>
assistant: "我将使用 ${AGENT_TOOL_NAME} 工具启动 greeting-responder 代理"
</example>
`

  // 当开关开启时，代理列表位于 agent_listing_delta
  // 附件（见 attachments.ts）中，而非内联在此。这使得
  // 工具描述在 MCP/插件/权限变更时保持静态，
  // 从而避免每次代理加载时工具块提示缓存失效。
  const listViaAttachment = shouldInjectAgentListInMessages()

  const agentListSection = listViaAttachment
    ? `可用的代理类型列在会话中的 <system-reminder> 消息中。`
    : `可用的代理类型及其可访问的工具：
${effectiveAgents.map(agent => formatAgentLine(agent)).join('\n')}`

  // 协调者和非协调者模式共用的核心提示词
  const shared = `启动新代理来自动处理复杂的多步骤任务。

${AGENT_TOOL_NAME} 工具启动专门的代理（子进程）来自动处理复杂任务。每种代理类型都有特定的能力和可用的工具。

${agentListSection}

${
    forkEnabled
      ? `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 使用专门代理，或省略它来 fork 自身——fork 继承你的完整对话上下文。`
      : `使用 ${AGENT_TOOL_NAME} 工具时，指定 subagent_type 参数来选择要使用的代理类型。如果省略，则使用通用代理。`
  }`

  // 协调者模式获取精简的提示词——协调者的系统提示词
  // 已涵盖使用说明、示例和何时不使用指南。
  if (isCoordinator) {
    return shared
  }

  // Ant-native 构建将 find/grep 别名为嵌入式 bfs/ugrep，
  // 并移除专用的 Glob/Grep 工具，所以通过 Bash 指向 find。
  const embedded = hasEmbeddedSearchTools()
  const fileSearchHint = embedded
    ? '通过 Bash 工具使用 `find`'
    : `使用 ${GLOB_TOOL_NAME} 工具`
  // "class Foo" 示例是关于内容搜索。非嵌入式保留 Glob
  // （原始意图：找到包含的文件）。嵌入式使用 grep 因为
  // find -name 不查看文件内容。
  const contentSearchHint = embedded
    ? '通过 Bash 工具使用 `grep`'
    : `使用 ${GLOB_TOOL_NAME} 工具`
  const whenNotToUseSection = forkEnabled
    ? ''
    : `
何时不使用 ${AGENT_TOOL_NAME} 工具：
- 如果你想读取特定文件路径，使用 ${FILE_READ_TOOL_NAME} 工具或 ${fileSearchHint}，比使用 ${AGENT_TOOL_NAME} 工具更快找到匹配
- 如果你要搜索特定类定义如 "class Foo"，使用 ${contentSearchHint}，比使用 ${AGENT_TOOL_NAME} 工具更快找到匹配
- 如果你要在特定文件或 2-3 个文件中搜索代码，使用 ${FILE_READ_TOOL_NAME} 工具，比使用 ${AGENT_TOOL_NAME} 工具更快找到匹配
- 其他与上述代理描述无关的任务
`

  // 当通过附件列出时，"启动多个代理"说明在
  // 附件消息中（在那里有订阅条件）。当内联时，保留
  // 现有的每次调用 getSubscriptionType() 检查。
  const concurrencyNote =
    !listViaAttachment && getSubscriptionType() !== 'pro'
      ? `
- 尽可能并行启动多个代理以最大化性能；为此，在单条消息中使用多个工具调用`
      : ''

  // 非协调者获取包含所有部分的完整提示词
  return `${shared}
${whenNotToUseSection}

使用说明：
- 始终包含简短描述（3-5 个词）概括代理将做什么${concurrencyNote}
- 当代理完成时，它会向你返回一条消息。代理返回的结果不会对用户可见。要向用户展示结果，你应该发送一条文本消息，简明扼要地总结结果。${
    // eslint-disable-next-line custom-rules/no-process-env-top-level
    !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) &&
    !isInProcessTeammate() &&
    !forkEnabled
      ? `
- 你可以选择使用 run_in_background 参数在后台运行代理。当代理在后台运行时，完成时会自动通知你——不要睡眠、轮询或主动检查其进度。继续其他工作或回应用户。`
      : ''
  }
- 要继续之前生成的代理，使用 ${SEND_MESSAGE_TOOL_NAME} 工具并将代理的 ID 或名称作为 \`to\` 字段。代理会保留完整上下文继续运行。${forkEnabled ? '每次带 subagent_type 的新 Agent 调用都从零开始——提供完整的任务描述。' : '每次 Agent 调用都从零开始——提供完整的任务描述。'}
- 代理的输出通常应被信任
- 明确告诉代理你期望它写代码还是仅做研究（搜索、文件读取、网络获取等）${forkEnabled ? '' : "，因为它不知道用户的意图"}
- 如果代理描述中提到应该主动使用，那么你应该尝试在用户询问之前主动使用它。自行判断。
- 如果用户指定要你"并行"运行代理，你必须发送单条消息，包含多个 ${AGENT_TOOL_NAME} 工具调用内容块。例如，如果你需要并行启动构建验证代理和测试运行代理，发送包含两个工具调用的单条消息。
- 你可以选择设置 \`isolation: "worktree"\` 在临时 git worktree 中运行代理，获得仓库的隔离副本。如果代理没有做出更改，worktree 会自动清理；如果做出更改，结果中会返回 worktree 路径和分支。${
    process.env.USER_TYPE === 'ant'
      ? `\n- 你可以设置 \`isolation: "remote"\` 在远程 CCR 环境中运行代理。这是一个后台任务；完成后会通知你。用于需要全新沙箱的长时运行任务。`
      : ''
  }${
    isInProcessTeammate()
      ? `
- 在此上下文中，run_in_background、name、team_name 和 mode 参数不可用。仅支持同步子代理。`
      : isTeammate()
        ? `
- 在此上下文中，name、team_name 和 mode 参数不可用——队友无法生成其他队友。省略它们以生成子代理。`
        : ''
  }${whenToForkSection}${writingThePromptSection}

${forkEnabled ? forkExamples : currentExamples}`
}
