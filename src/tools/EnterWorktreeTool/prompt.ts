export function getEnterWorktreeToolPrompt(): string {
  return `仅当用户明确要求在 worktree 中工作时使用此工具。此工具创建一个隔离的 git worktree，并将当前会话切换到其中。

## 何时使用

- 用户明确提到 "worktree" 时（例如，"启动 worktree"、"在 worktree 中工作"、"创建 worktree"、"使用 worktree"）

## 何时不使用

- 用户要求创建分支、切换分支或在不同的分支上工作——改用 git 命令
- 用户要求修复 bug 或处理功能——除非他们特别提到 worktree，否则使用正常的 git 工作流程
- 除非用户明确提到 "worktree"，否则不要使用此工具

## 要求

- 必须在 git 仓库中，或者在 settings.json 中配置了 WorktreeCreate/WorktreeRemove 钩子
- 不能已经在 worktree 中

## 行为

- 在 git 仓库中：在 \`.claude/worktrees/\` 内创建一个新的 git worktree，基于 HEAD 创建新分支
- 在 git 仓库外：委托给 WorktreeCreate/WorktreeRemove 钩子以实现 VCS 无关的隔离
- 将会话的工作目录切换到新的 worktree
- 使用 ExitWorktree 离开 worktree（保留或删除）。在会话退出时，如果仍在 worktree 中，将提示用户保留或删除

## 参数

- \`name\`（可选）：worktree 的名称。如果未提供，将生成一个随机名称。
`
}
