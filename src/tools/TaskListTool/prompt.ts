import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'

export const DESCRIPTION = '列出任务列表中的所有任务'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- 在向队友分配任务之前，查看有哪些可用任务
`
    : ''

  const idDescription = isAgentSwarmsEnabled()
    ? '- **id**: 任务标识符（与 TaskGet、TaskUpdate 配合使用）'
    : '- **id**: 任务标识符（与 TaskGet、TaskUpdate 配合使用）'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## 团队协作工作流程

作为团队成员时：
1. 完成当前任务后，调用 TaskList 查找可用的工作
2. 查找状态为 'pending'、无负责人且 blockedBy 为空的任务
3. **多个任务可用时，优先按 ID 顺序选择**（ID 最小的优先），因为较早的任务通常为后续任务奠定基础
4. 使用 TaskUpdate 认领可用任务（将 \`owner\` 设置为你的名字），或等待组长分配
5. 如果被阻塞，专注于解除阻塞或通知团队负责人
`
    : ''

  return `使用此工具列出任务列表中的所有任务。

## 何时使用此工具

- 查看有哪些可用的任务（状态：'pending'，无负责人，未被阻塞）
- 检查项目的整体进度
- 查找被阻塞且需要解决依赖关系的任务
${teammateUseCase}- 完成一个任务后，查看新解锁的工作或认领下一个可用任务
- **多个任务可用时，优先按 ID 顺序处理**（ID 最小的优先），因为较早的任务通常为后续任务奠定基础

## 输出

返回每个任务的摘要：
${idDescription}
- **subject**: 任务简要描述
- **status**: 'pending'、'in_progress' 或 'completed'
- **owner**: 如果已分配则显示代理 ID，空则表示可用
- **blockedBy**: 必须先解决的任务 ID 列表（有 blockedBy 的任务在依赖解决前无法被认领）

使用 TaskGet 并指定任务 ID 可查看完整详情，包括描述和评论。
${teammateWorkflow}`
}
