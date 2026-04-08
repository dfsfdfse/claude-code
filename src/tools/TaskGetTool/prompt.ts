export const DESCRIPTION = '从任务列表中通过 ID 获取任务'

export const PROMPT = `使用此工具通过 ID 从任务列表中检索任务。

## 何时使用此工具

- 在开始任务工作之前需要完整的描述和上下文时
- 理解任务依赖关系（它阻止了什么，什么阻止了它）
- 被分配任务后，获取完整的需求

## 输出

返回完整任务详情：
- **subject**：任务标题
- **description**：详细需求和上下文
- **status**：'pending'、'in_progress' 或 'completed'
- **blocks**：等待此任务完成的其它任务
- **blockedBy**：必须先完成才能开始此任务的任务

## 提示

- 获取任务后，在开始工作前验证其 blockedBy 列表是否为空。
- 使用 TaskList 以摘要形式查看所有任务。
`
