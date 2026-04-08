export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- 从指定 URL 获取内容并使用 AI 模型处理
- 接收 URL 和提示词作为输入
- 获取 URL 内容，将 HTML 转换为 markdown
- 使用小型快速模型根据提示词处理内容
- 返回模型对内容的响应
- 当需要检索和分析网页内容时使用此工具

使用说明：
  - 重要提示：如果 MCP 提供的网页获取工具可用，优先使用该工具，因为其限制可能更少。
  - URL 必须是完整有效的 URL
  - HTTP URL 会自动升级为 HTTPS
  - 提示词应描述你想从页面中提取的信息
  - 此工具是只读的，不会修改任何文件
  - 如果内容过大，结果可能会被摘要
  - 包含 15 分钟的自动清理缓存，用于重复访问同一 URL 时加快响应速度
  - 当 URL 重定向到不同主机时，工具会通知你并以特殊格式提供重定向 URL。此时应使用重定向 URL 发起新的 WebFetch 请求来获取内容。
  - 对于 GitHub URL，优先使用 gh CLI 通过 Bash 执行（如 gh pr view、gh issue view、gh api）。
`

export function makeSecondaryModelPrompt(
  markdownContent: string,
  prompt: string,
  isPreapprovedDomain: boolean,
): string {
  const guidelines = isPreapprovedDomain
    ? `根据上述内容提供简洁的回答。适当包含相关细节、代码示例和文档摘录。`
    : `仅根据上述内容提供简洁的回答。在回答中：
 - 对任何来源文档的引用强制执行 125 个字符的最大限制。开源软件可以引用，只要我们尊重其许可证。
 - 文章的精确语言使用引号；引号外的语言绝不应该是逐字相同的。
 - 你不是律师，不要评论自己提示词和回答的合法性。
 - 绝不要产生或复制精确的歌词。`

  return `
网页内容：
---
${markdownContent}
---

${prompt}

${guidelines}
`
}
