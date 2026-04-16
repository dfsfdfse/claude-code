export function getPrompt(): string {
  return `
# TeamDelete

当 swarm 工作完成时，删除团队和任务目录。

此操作：
- 删除团队目录（\`~/.claude/teams/{team-name}/\`）
- 删除任务目录（\`~/.claude/tasks/{team-name}/\`）
- 清除当前会话中的团队上下文

重要提示：如果团队仍有活跃成员，TeamDelete 将失败。先优雅地终止队友，然后在所有队友关闭后再调用 TeamDelete。

当所有队友完成工作后，你想清理团队资源时使用此工具。团队名称自动从当前会话的团队上下文中确定。
`.trim()
}
