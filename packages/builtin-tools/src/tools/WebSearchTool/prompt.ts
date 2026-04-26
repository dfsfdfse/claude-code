import { getLocalMonthYear } from 'src/constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- 允许 Claude 搜索网络并使用搜索结果来丰富回答
- 提供当前事件和最新数据的最新信息
- 以搜索结果块的形式返回搜索结果信息，包括链接为 markdown 超链接
- 使用此工具访问超出 Claude 知识截止日期的信息
- 搜索在单个 API 调用中自动执行

关键要求 - 您必须遵守：
  - 回答用户问题后，您必须在回复末尾包含"来源："部分
  - 在来源部分，将搜索结果中的所有相关 URL 列为 markdown 超链接：[标题](URL)
  - 这是强制性的 - 切勿跳过在回复中包含来源
  - 示例格式：

    [您的回答]

    来源：
    - [来源标题 1](https://example.com/1)
    - [来源标题 2](https://example.com/2)

使用说明：
  - 支持域名过滤以包含或阻止特定网站
  - 网络搜索仅在美国可用

重要 - 在搜索查询中使用正确的年份：
  - 当前月份是 ${currentMonthYear}。搜索最新信息、文档或当前事件时，您必须使用该年份。
  - 示例：如果用户询问"最新 React 文档"，请使用当前年份搜索"React 文档"，而不是去年
`
}
