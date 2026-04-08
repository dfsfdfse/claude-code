import { EXIT_PLAN_MODE_TOOL_NAME } from '../ExitPlanModeTool/constants.js'

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export const ASK_USER_QUESTION_TOOL_CHIP_WIDTH = 12

export const DESCRIPTION =
  '向用户提出多项选择题以收集信息、澄清歧义、理解偏好、做出决定或提供选择。'

export const PREVIEW_FEATURE_PROMPT = {
  markdown: `
预览功能：
在呈现用户需要直观比较的具体内容时，对选项使用可选的 \`preview\` 字段：
- UI 布局或组件的 ASCII 模拟
- 显示不同实现的代码片段
- 图表变体
- 配置示例

预览内容以等宽字体框中的 markdown 渲染。支持多行文本和换行符。当任何选项有预览时，UI 切换为并排布局，左侧显示垂直选项列表，右侧显示预览。对于标签和描述足够的简单偏好问题不要使用预览。注意：预览仅支持单选问题（不是 multiSelect）。
`,
  html: `
预览功能：
在呈现用户需要直观比较的具体内容时，对选项使用可选的 \`preview\` 字段：
- UI 布局或组件的 HTML 模拟
- 格式化代码片段显示不同实现
- 可视化比较或图表

预览内容必须是自包含的 HTML 片段（无 <html>/<body> 包装器，无 <script> 或 <style> 标签——改用内联 style 属性）。对于标签和描述足够的简单偏好问题不要使用预览。注意：预览仅支持单选问题（不是 multiSelect）。
`,
} as const

export const ASK_USER_QUESTION_TOOL_PROMPT = `在执行过程中需要向用户提问时使用此工具。这允许你：
1. 收集用户偏好或需求
2. 澄清模糊的指令
3. 在工作时获取实施方案的决定
4. 向用户提供关于采取什么方向的选择。

使用说明：
- 用户始终能够选择"其他"来提供自定义文本输入
- 使用 multiSelect: true 允许为一个问题选择多个答案
- 如果你推荐特定选项，将其作为列表中的第一个选项，并在标签末尾添加"（推荐）"

计划模式说明：在计划模式中，在确定计划之前使用此工具来澄清需求或选择方法。不要使用此工具询问"我的计划准备好了吗？"或"我应该继续吗？"——使用 ${EXIT_PLAN_MODE_TOOL_NAME} 来获得计划批准。重要提示：不要在问题中引用"计划"（例如，"你对计划有什么反馈吗？"，"计划看起来好吗？"），因为在调用 ${EXIT_PLAN_MODE_TOOL_NAME} 之前用户在 UI 中看不到计划。如果你需要计划批准，改用 ${EXIT_PLAN_MODE_TOOL_NAME}。
`
