import { isPlanModeInterviewPhaseEnabled } from '../../utils/planModeV2.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../AskUserQuestionTool/prompt.js'

const WHAT_HAPPENS_SECTION = `## 计划模式中会发生什么

在计划模式中，你将：
1. 使用 Glob、Grep 和 Read 工具深入探索代码库
2. 理解现有的模式和架构
3. 设计一个实施方案
4. 向用户展示计划以获得批准
5. 如果需要澄清方法，使用 ${ASK_USER_QUESTION_TOOL_NAME}
6. 准备好实施时，使用 ExitPlanMode 退出计划模式

`

function getEnterPlanModeToolPromptExternal(): string {
  // 当面试阶段启用时，省略"What Happens"部分 —
  // 详细的工作流程说明通过 plan_mode 附件（messages.ts）到达。
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `当你要开始一个非平凡的实施任务时，主动使用此工具。在编写代码之前获得用户对你方法的签名可以防止浪费精力并确保对齐。此工具将你转换到计划模式，在那里你可以探索代码库并设计实施方案供用户批准。

## 何时使用此工具

对于实施任务，除非它们很简单，否则优先使用 EnterPlanMode。当以下任一条件适用时使用它：

1. **新功能实现**：添加有意义的新功能
   - 示例："添加注销按钮" - 应该放在哪里？点击时会发生什么？
   - 示例："添加表单验证" - 什么规则？什么错误消息？

2. **多种有效方法**：任务可以用几种不同的方式解决
   - 示例："为 API 添加缓存" - 可以使用 Redis、内存、文件等。
   - 示例："提高性能" - 许多优化策略是可能的

3. **代码修改**：影响现有行为或结构的更改
   - 示例："更新登录流程" - 具体应该更改什么？
   - 示例："重构此组件" - 目标架构是什么？

4. **架构决策**：任务需要在模式或技术之间进行选择
   - 示例："添加实时更新" - WebSockets vs SSE vs 轮询
   - 示例："实现状态管理" - Redux vs Context vs 自定义解决方案

5. **多文件更改**：任务可能涉及超过 2-3 个文件
   - 示例："重构认证系统"
   - 示例："添加新的 API 端点及其测试"

6. **需求不明确**：在理解完整范围之前需要探索
   - 示例："让应用更快" - 需要分析并识别瓶颈
   - 示例："修复结账中的 bug" - 需要调查根本原因

7. **用户偏好很重要**：实施方案可能有多种合理方向
   - 如果你会使用 ${ASK_USER_QUESTION_TOOL_NAME} 来澄清方法，请改用 EnterPlanMode
   - 计划模式让你先探索，然后用上下文呈现选项

## 何时不使用此工具

对于简单任务跳过 EnterPlanMode：
- 单行或少量行修复（拼写错误、明显的 bug、小调整）
- 添加需求明确单一的函数
- 用户给出了非常具体、详细说明的任务
- 纯研究/探索任务（改用 Agent 工具的探索代理）

${whatHappens}## 示例

### 好 - 使用 EnterPlanMode：
用户："为应用添加用户认证"
- 需要架构决策（会话 vs JWT、在哪里存储令牌、中间件结构）

用户："优化数据库查询"
- 多种可能的方法，需要先分析，影响重大

用户："实现深色模式"
- 关于主题系统的架构决策，影响许多组件

用户："在用户资料页面添加删除按钮"
- 看起来简单但涉及：放在哪里、确认对话框、API 调用、错误处理、状态更新

用户："更新 API 中的错误处理"
- 影响多个文件，用户应该批准该方法

### 坏 - 不要使用 EnterPlanMode：
用户："修复 README 中的拼写错误"
- 直接了当，不需要计划

用户："添加 console.log 来调试这个函数"
- 简单、明显的实现

用户："哪些文件处理路由？"
- 研究任务，不是实施计划

## 重要说明

- 此工具需要用户批准 - 他们必须同意进入计划模式
- 如果不确定是否使用它，请倾向于计划 - 在开始之前获得对齐比返工要好
- 用户感谢在对他们代码库进行重大更改之前被咨询
`
}

function getEnterPlanModeToolPromptAnt(): string {
  // 当面试阶段启用时，省略"What Happens"部分 —
  // 详细的工作流程说明通过 plan_mode 附件（messages.ts）到达。
  const whatHappens = isPlanModeInterviewPhaseEnabled()
    ? ''
    : WHAT_HAPPENS_SECTION

  return `当任务对于正确的方法存在真正的模糊性，在编码之前获得用户输入可以防止重大返工时使用此工具。此工具将你转换到计划模式，在那里你可以探索代码库并设计实施方案供用户批准。

## 何时使用此工具

当实施方案真正不明确时，计划模式很有价值。在以下情况使用它：

1. **重大架构模糊性**：存在多种合理的方法，选择会显著影响代码库
   - 示例："为 API 添加缓存" - Redis vs 内存 vs 文件
   - 示例："添加实时更新" - WebSockets vs SSE vs 轮询

2. **需求不明确**：你需要探索和澄清才能取得进展
   - 示例："让应用更快" - 需要分析并识别瓶颈
   - 示例："重构此模块" - 需要理解目标架构应该是什么

3. **高影响重构**：任务将显著重构现有代码，先获得认同可以降低风险
   - 示例："重新设计认证系统"
   - 示例："从一个状态管理方法迁移到另一个"

## 何时不使用此工具

当你可以合理地推断出正确方法时跳过计划模式：
- 即使涉及多个文件，任务也很直接
- 用户的请求足够具体，实施路径清晰
- 你正在添加具有明显实现模式的功能（例如，添加按钮，遵循现有约定的新端点）
- 修复 bug，一旦你理解 bug，修复方法就很清楚
- 研究/探索任务（改用 Agent 工具）
- 用户说类似"我们能做 X 吗"或"让我们做 X"——直接开始

如有疑问，倾向于开始工作并使用 ${ASK_USER_QUESTION_TOOL_NAME} 提问具体问题，而不是进入完整的计划阶段。

${whatHappens}## 示例

### 好 - 使用 EnterPlanMode：
用户："为应用添加用户认证"
- 真正模糊：会话 vs JWT、在哪里存储令牌、中间件结构

用户："重新设计数据管道"
- 主要重构，错误的方法会浪费大量精力

### 坏 - 不要使用 EnterPlanMode：
用户："在用户资料页面添加删除按钮"
- 实施路径清晰；直接做

用户："我们能做搜索功能吗？"
- 用户想要开始，不是计划

用户："更新 API 中的错误处理"
- 开始工作；如有需要提出具体问题

用户："修复 README 中的拼写错误"
- 直接了当，不需要计划

## 重要说明

- 此工具需要用户批准 - 他们必须同意进入计划模式
`
}

export function getEnterPlanModeToolPrompt(): string {
  return process.env.USER_TYPE === 'ant'
    ? getEnterPlanModeToolPromptAnt()
    : getEnterPlanModeToolPromptExternal()
}
