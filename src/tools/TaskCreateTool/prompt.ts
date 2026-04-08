import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = '在任务列表中创建新任务'

export function getPrompt(): string {
  const teammateContext = isAgentSwarmsEnabled()
    ? '，并可能被分配给队友'
    : ''

  const teammateTips = isAgentSwarmsEnabled()
    ? `- 在描述中包含足够的细节，以便其他 agent 能够理解并完成任务
- 新任务创建时状态为 "pending" 且无负责人 - 使用 TaskUpdate 的 \`owner\` 参数来分配任务
`
    : ''

  return `使用此工具为当前编码会话创建结构化任务列表。这有助于您跟踪进度、整理复杂任务，并向用户展示工作条理性。
它还能帮助用户了解任务进度以及整体请求的完成情况。

## 何时使用此工具

在以下场景中主动使用此工具：

- 复杂的多步骤任务 - 当任务需要 3 个或更多不同的步骤或操作时
- 非平凡且复杂的任务 - 需要仔细规划或多个操作的任务${teammateContext}
- 计划模式 - 使用计划模式时，创建任务列表来跟踪工作
- 用户明确请求待办列表 - 当用户直接要求您使用待办列表时
- 用户提供多个任务 - 当用户提供要完成的事项列表时（编号或逗号分隔）
- 收到新指令后 - 立即将用户需求捕获为任务
- 开始处理任务时 - 在开始工作之前将其标记为 in_progress
- 完成一个任务后 - 将其标记为已完成，并添加在实现过程中发现的新后续任务

## 何时不使用此工具

以下情况跳过使用此工具：
- 只有单个简单的任务
- 任务微不足道，追踪它没有组织上的好处
- 任务可以在少于 3 个简单步骤内完成
- 任务纯粹是对话性的或信息性的

请注意，如果只有一个简单的任务，不应该使用此工具。在这种情况下，直接完成任务会更好。

## 任务字段

- **subject（主题）**：简短、可操作的名词形式标题（例如："修复登录流程中的身份验证 bug"）
- **description（描述）**：需要完成的内容
- **activeForm（可选）**：任务处于 in_progress 状态时，旋转动画中显示的现在进行时形式（例如："正在修复身份验证 bug"）。如果省略，旋转动画会显示 subject。

所有任务的初始状态都是 \`pending\`。

## 提示

- 创建任务时使用清晰、具体描述结果的主题
- 创建任务后，如果需要，使用 TaskUpdate 设置依赖关系（blocks/blockedBy）
${teammateTips}- 先检查 TaskList 以避免创建重复任务
`
}
