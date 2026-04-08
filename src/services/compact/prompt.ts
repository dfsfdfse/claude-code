import { feature } from 'bun:bundle'
import type { PartialCompactDirection } from '../../types/message.js'

// Dead code elimination: conditional import for proactive mode
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? (require('../../proactive/index.js') as typeof import('../../proactive/index.js'))
    : null
/* eslint-enable @typescript-eslint/no-require-imports */

// 强制不使用工具的前言。缓存共享分支会继承父级的完整工具集
// (用于缓存键匹配)，在 Sonnet 4.6+ 自适应思维模型上，模型有时会尝试
// 调用工具，而较弱的后提示无法阻止。由于 maxTurns: 1，被拒绝的工具调用
// 意味着无文本输出 → 退回到流式后备方案 (4.6 上为 2.79% vs 4.5 上为 0.01%)。
// 将此放在最前面并明确说明拒绝后果，可防止浪费回合。
const NO_TOOLS_PREAMBLE = `重要：仅回复文本。禁止调用任何工具。

- 禁止使用 Read、Bash、Grep、Glob、Edit、Write 或任何其他工具。
- 你在上述对话中已经拥有所需的所有上下文。
- 工具调用将被拒绝且会浪费你唯一的机会 — 你将无法完成任务。
- 你的全部回复必须是纯文本：先 <analysis> 区块，后 <summary> 区块。

`

// 两个变体：BASE 范围是"对话"，PARTIAL 范围是"最近消息"。
// <analysis> 区块是草稿区，formatCompactSummary() 在摘要进入上下文前会将其删除。
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `在提供最终摘要前，将分析内容包裹在 <analysis> 标签中以整理思路，确保涵盖所有必要要点。在分析过程中：

1. 按时间顺序分析对话的每个部分。对于每个部分，详尽地识别：
   - 用户的明确请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 详细信息，如：
     - 文件名
     - 完整代码片段
     - 函数签名
     - 文件编辑
   - 遇到的错误及修复方法
   - 特别注意用户给出的具体反馈，尤其是当用户告诉你以不同方式做事时。
2. 仔细检查技术准确性和完整性，全面处理每个必需元素。`

const DETAILED_ANALYSIS_INSTRUCTION_PARTIAL = `在提供最终摘要前，将分析内容包裹在 <analysis> 标签中以整理思路，确保涵盖所有必要要点。在分析过程中：

1. 按时间顺序分析最近的消息。对于每个部分，详尽地识别：
   - 用户的明确请求和意图
   - 你处理用户请求的方法
   - 关键决策、技术概念和代码模式
   - 详细信息，如：
     - 文件名
     - 完整代码片段
     - 函数签名
     - 文件编辑
   - 遇到的错误及修复方法
   - 特别注意用户给出的具体反馈，尤其是当用户告诉你以不同方式做事时。
2. 仔细检查技术准确性和完整性，全面处理每个必需元素。`

const BASE_COMPACT_PROMPT = `你的任务是创建一个详细的会话摘要，密切关注用户的明确请求和你之前的操作。
此摘要应详尽地记录技术细节、代码模式和架构决策，这些对继续开发工作至关重要而不会丢失上下文。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细记录用户的所有明确请求和意图
2. 关键技术概念：列出所有重要的技术概念、技术和框架。
3. 文件和代码段：列举具体被查看、修改或创建的文件和代码段。特别注意最近的消息，包含完整的代码片段，并说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出你遇到的所有错误及其修复方法。特别注意用户给出的具体反馈，尤其是当用户告诉你以不同方式做事时。
5. 问题解决：记录已解决的问题和任何正在进行的故障排除工作。
6. 所有用户消息：列出所有非工具结果的用户消息。这些对理解用户反馈和意图变化至关重要。
7. 待处理任务：概述你被明确要求处理的任何待处理任务。
8. 当前工作：详细描述在此摘要请求之前正在处理的内容，特别注意双方最近的消息。在适用时包含文件名和代码片段。
9. 可选的下一步：列出与你最近工作相关的下一步。注意：确保此步骤与用户最近的明确请求以及你在此摘要请求之前正在处理的任务直接一致。如果你的最后一项任务已完成，只有在明确符合用户请求的情况下才列出下一步。不要在未经用户确认的情况下开始处理无关的请求或非常旧的已完成请求。
                      如果有下一步，引用最近对话中的直接引文，精确展示你正在处理的任务以及进展到哪里。这应该是原文引用以确保任务解释没有偏差。

以下是一个输出结构示例：

<example>
<analysis>
[你的思维过程，确保所有要点都被全面准确地涵盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]
   - [...]

3. 文件和代码段：
   - [文件名 1]
      - [说明此文件为何重要]
      - [说明对此文件的更改（如有）]
      - [重要代码片段]
   - [文件名 2]
      - [重要代码片段]
   - [...]

4. 错误和修复：
    - [错误 1 的详细描述]：
      - [你如何修复此错误]
      - [用户对错误的反馈（如有）]
    - [...]

5. 问题解决：
   [已解决的问题和正在进行的故障排除描述]

6. 所有用户消息：
    - [详细的非工具用户消息]
    - [...]

7. 待处理任务：
   - [任务 1]
   - [任务 2]
   - [...]

8. 当前工作：
   [当前工作的精确描述]

9. 可选的下一步：
   [要采取的可选下一步]

</summary>
</example>

请根据现有对话提供摘要，遵循此结构并确保回复的准确性和全面性。

所包含的上下文中可能提供了额外的摘要说明。如果有，请记住在创建上述摘要时遵循这些说明。例如：
<example>
## 压缩指令
总结对话时专注于 TypeScript 代码更改，同时记住你犯的错误以及如何修复它们。
</example>

<example>
# 摘要指令
使用压缩时 - 请专注于测试输出和代码更改。包含文件读取的原文。
</example>
`

const PARTIAL_COMPACT_PROMPT = `你的任务是创建最近部分会话的详细摘要 — 即接在之前保留上下文之后的消息。早期消息保持原样，不需要总结。摘要只专注于最近消息中讨论、学习和完成的内容。

${DETAILED_ANALYSIS_INSTRUCTION_PARTIAL}

你的摘要应包含以下部分：

1. 主要请求和意图：记录最近消息中用户的明确请求和意图
2. 关键技术概念：列出最近讨论的重要技术概念、技术和框架。
3. 文件和代码段：列举具体被查看、修改或创建的文件和代码段。在适用时包含完整的代码片段，并说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误及其修复方法。
5. 问题解决：记录已解决的问题和任何正在进行的故障排除工作。
6. 所有用户消息：列出最近部分所有非工具结果的用户消息。
7. 待处理任务：概述最近消息中的待处理任务。
8. 当前工作：精确描述在此摘要请求之前正在处理的内容。
9. 可选的下一步：列出与最近工作相关的下一步。引用最近对话中的直接引文。

以下是一个输出结构示例：

<example>
<analysis>
[你的思维过程，确保所有要点都被全面准确地涵盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码段：
   - [文件名 1]
      - [说明此文件为何重要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]：
      - [如何修复]

5. 问题解决：
   [描述]

6. 所有用户消息：
    - [详细的非工具用户消息]

7. 待处理任务：
   - [任务 1]

8. 当前工作：
   [当前工作的精确描述]

9. 可选的下一步：
   [要采取的可选下一步]

</summary>
</example>

请仅根据最近的消息（在保留的早期上下文之后）提供摘要，遵循此结构并确保回复的准确性和全面性。
`

// 'up_to': 模型只看到摘要的前缀（缓存命中）。摘要将
// 位于保留的最近消息之前，因此是"继续工作的上下文"部分。
const PARTIAL_COMPACT_UP_TO_PROMPT = `你的任务是创建此会话的详细摘要。此摘要将放在继续会话的开头；在你的摘要之后将跟随构建此上下文的新消息（你在此处看不到它们）。请全面总结，以便阅读你摘要的人然后阅读较新的消息时能够完全理解发生的事情并继续工作。

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

你的摘要应包含以下部分：

1. 主要请求和意图：详细记录用户的明确请求和意图
2. 关键技术概念：列出讨论的重要技术概念、技术和框架。
3. 文件和代码段：列举具体被查看、修改或创建的文件和代码段。在适用时包含完整的代码片段，并说明为什么此文件读取或编辑很重要。
4. 错误和修复：列出遇到的错误及其修复方法。
5. 问题解决：记录已解决的问题和任何正在进行的故障排除工作。
6. 所有用户消息：列出所有非工具结果的用户消息。
7. 待处理任务：概述待处理任务。
8. 已完成工作：描述此部分结束时完成的工作。
9. 继续工作的上下文：总结理解后续消息并继续工作所需的任何上下文、决策或状态。

以下是一个输出结构示例：

<example>
<analysis>
[你的思维过程，确保所有要点都被全面准确地涵盖]
</analysis>

<summary>
1. 主要请求和意图：
   [详细描述]

2. 关键技术概念：
   - [概念 1]
   - [概念 2]

3. 文件和代码段：
   - [文件名 1]
      - [说明此文件为何重要]
      - [重要代码片段]

4. 错误和修复：
    - [错误描述]：
      - [如何修复]

5. 问题解决：
   [描述]

6. 所有用户消息：
    - [详细的非工具用户消息]

7. 待处理任务：
   - [任务 1]

8. 已完成工作：
   [完成的工作描述]

9. 继续工作的上下文：
   [继续工作所需的关键上下文、决策或状态]

</summary>
</example>

请遵循此结构提供摘要，确保回复的准确性和全面性。
`

const NO_TOOLS_TRAILER =
  '\n\n提醒：禁止调用任何工具。仅回复纯文本 — ' +
  '先 <analysis> 区块，后 <summary> 区块。' +
  '工具调用将被拒绝，你将无法完成任务。'

export function getPartialCompactPrompt(
  customInstructions?: string,
  direction: PartialCompactDirection = 'from',
): string {
  const template =
    direction === 'up_to'
      ? PARTIAL_COMPACT_UP_TO_PROMPT
      : PARTIAL_COMPACT_PROMPT
  let prompt = NO_TOOLS_PREAMBLE + template

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加说明：\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\n附加说明：\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

  return prompt
}

/**
 * 通过剥离 <analysis> 草稿区和将 <summary> XML 标签替换为可读的章节标题来格式化压缩摘要。
 * @param summary 可能包含 <analysis> 和 <summary> XML 标签的原始摘要字符串
 * @returns 已格式化摘要，分析部分被剥离，摘要标签被标题替换
 */
export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary

  // 剥离分析部分 — 它是一个草稿区，可提高摘要质量，
  // 但一旦摘要写完就没有信息价值了。
  formattedSummary = formattedSummary.replace(
    /<analysis>[\s\S]*?<\/analysis>/,
    '',
  )

  // 提取并格式化摘要部分
  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    const content = summaryMatch[1] || ''
    formattedSummary = formattedSummary.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `摘要：\n${content.trim()}`,
    )
  }

  // 清理章节之间的多余空白
  formattedSummary = formattedSummary.replace(/\n\n+/g, '\n\n')

  return formattedSummary.trim()
}

export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
  transcriptPath?: string,
  recentMessagesPreserved?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary)

  let baseSummary = `此会话是从之前耗尽上下文的对话继续的。以下摘要涵盖会话的早期部分。

${formattedSummary}`

  if (transcriptPath) {
    baseSummary += `\n\n如果你需要压缩前的具体细节（如精确的代码片段、错误消息或生成的内容），请阅读完整转录：${transcriptPath}`
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\n最近的消息被完整保留。`
  }

  if (suppressFollowUpQuestions) {
    let continuation = `${baseSummary}
从上次中断的地方继续对话，不要向用户询问任何进一步的问题。直接恢复 — 不要确认摘要，不要概述发生了什么，不要以"我将继续"或类似内容作为开头。就像从未中断一样继续执行最后一项任务。`

    if (
      (feature('PROACTIVE') || feature('KAIROS')) &&
      proactiveModule?.isProactiveActive()
    ) {
      continuation += `

你正在自主/主动模式下运行。这不是首次唤醒 — 在压缩之前你已经在自主工作了。继续你的工作循环：基于上述摘要从上次中断的地方继续。不要向用户打招呼或询问要做什么工作。`
    }

    return continuation
  }

  return baseSummary
}
