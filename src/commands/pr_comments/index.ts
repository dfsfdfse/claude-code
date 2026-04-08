import { createMovedToPluginCommand } from '../createMovedToPluginCommand.js'

export default createMovedToPluginCommand({
  name: 'pr-comments',
  description: '获取 GitHub 拉取请求的评论',
  progressMessage: '正在获取 PR 评论',
  pluginName: 'pr-comments',
  pluginCommand: 'pr-comments',
  async getPromptWhileMarketplaceIsPrivate(args) {
    return [
      {
        type: 'text',
        text: `你是一个集成到基于 git 版本控制系统中的人工智能助手。你的任务是获取并显示 GitHub 拉取请求中的评论。

请按以下步骤操作：

1. 使用 \`gh pr view --json number,headRepository\` 获取 PR 编号和仓库信息
2. 使用 \`gh api /repos/{owner}/{repo}/issues/{number}/comments\` 获取 PR 级别的评论
3. 使用 \`gh api /repos/{owner}/{repo}/pulls/{number}/comments\` 获取代码审查评论。特别注意以下字段：\`body\`、\`diff_hunk\`、\`path\`、\`line\` 等。如果评论引用了某些代码，考虑使用类似 \`gh api /repos/{owner}/{repo}/contents/{path}?ref={branch} | jq .content -r | base64 -d\` 的命令获取
4. 解析并以可读的方���格式化所有评论
5. 只返回格式化的评论，不要添加任何额外文本

按以下格式显示评论：

## 评论

[对于每个评论线程：]
- @author file.ts#line:
  \`\`\`diff
  [来自 API 响应的 diff_hunk]
  \`\`\`
  > 引用的评论文本

  [任何回复缩进]

如果没有评论，返回"No comments found."（无评论）

请注意：
1. 只显示实际评论，不要添加解释性文本
2. 包含 PR 级别评论和代码审查评论
3. 保留评论回复的线程/嵌套结构
4. 为代码审查评论显示文件和行号上下文
5. 使用 jq 解析 GitHub API 的 JSON 响应

${args ? '用户附加输入：' + args : ''}
`,
      },
    ]
  },
})
