import { registerBundledSkill } from '../bundledSkills.js'

// Prompt text contains `ps` commands as instructions for Claude to run,
// not commands this file executes.
// eslint-disable-next-line custom-rules/no-direct-ps-commands
const STUCK_PROMPT = `# /stuck — 诊断 Claude Code 会话冻结/卡顿

用户认为此机器上的另一个 Claude Code 会话已冻结、卡住或非常慢。调查并发布报告到 #claude-code-feedback。

## 查找内容

扫描其他 Claude Code 进程（排除当前进程 — PID 在 \`process.pid\` 中，但对于 shell 命令只需排除你看到运行此提示词的 PID）。进程名通常是 \`claude\`（安装版）或 \`cli\`（原生开发构建）。

卡住会话的迹象：
- **高 CPU（≥90%）持续** — 可能是无限循环。采样两次，间隔 1-2 秒，确认不是瞬时峰值。
- **进程状态 \`D\`（不可中断睡眠）** — 通常是 I/O 挂起。\`ps\` 输出中的 \`state\` 列；第一个字符有效（忽略 \`+\`、\`s\`、\`<\` 等修饰符）。
- **进程状态 \`T\`（已停止）** — 用户可能误按了 Ctrl+Z。
- **进程状态 \`Z\`（僵尸）** — 父进程未回收。
- **非常高 RSS（≥4GB）** — 可能内存泄漏导致会话缓慢。
- **卡住的子进程** — 挂起的 \`git\`、\`node\` 或 shell 子进程可能冻结父进程。检查每个会话的 \`pgrep -lP <pid>\`。

## 调查步骤

1. **列出所有 Claude Code 进程**（macOS/Linux）：
   \`\`\`
   ps -axo pid=,pcpu=,rss=,etime=,state=,comm=,command= | grep -E '(claude|cli)' | grep -v grep
   \`\`\`
   过滤到 \`comm\` 为 \`claude\` 或（\`cli\` 且命令路径包含 "claude"）的行。

2. **对于可疑进程**，收集更多上下文：
   - 子进程：\`pgrep -lP <pid>\`
   - 如果 CPU 高：1-2 秒后再采样确认持续
   - 如果子进程看起来挂起（如某个 git 命令），用 \`ps -p <child_pid> -o command=\` 记录其完整命令行
   - 如果能推断会话 ID，检查会话调试日志：\`~/.claude/debug/<session-id>.txt\`（最后几百行通常显示挂起前在做什么）

3. **考虑对真正冻结的进程进行堆栈转储**（高级，可选）：
   - macOS：\`sample <pid> 3\` 获取 3 秒原生堆栈采样
   - 这个很大 — 仅在进程明显挂起且你想知道原因时获取

## 报告

**仅在确实发现问题时才发布到 Slack。** 如果每个会话看起来都健康，直接告诉用户 — 不要向频道发布正常通知。

如果发现卡住/慢的会话，发布到 **#claude-code-feedback**（频道 ID：\`C07VBSHV7EV\`）。使用 Slack MCP 工具。通过 ToolSearch 查找 \`slack_send_message\`（如果尚未加载）。

**使用两条消息结构** 保持频道可扫描：

1. **顶层消息** — 一行简短：主机名、Claude Code 版本和简洁症状（如"会话 PID 12345 CPU 持续 100% 10 分钟"或"git 子进程在 D 状态挂起"）。无代码块，无详情。
2. **线程回复** — 完整诊断转储。将顶层消息的 \`ts\` 作为 \`thread_ts\` 传递。包括：
   - PID、CPU%、RSS、状态、运行时间、命令行、子进程
   - 你对可能问题的诊断
   - 如果捕获了相关调试日志尾部或 \`sample\` 输出

如果 Slack MCP 不可用，将报告格式化为用户可复制粘贴到 #claude-code-feedback 的消息（并让他们知道自己线程化详情）。

## 注意
- 不要终止或向任何进程发送信号 — 这只是诊断。
- 如果用户提供了参数（如特定 PID 或症状），首先关注那里。
`

export function registerStuckSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  registerBundledSkill({
    name: 'stuck',
    description:
      '【仅限 ANT】调查此机器上冻结/卡住/缓慢的 Claude Code 会话，并将诊断报告发布到 #claude-code-feedback。',
    userInvocable: true,
    async getPromptForCommand(args) {
      let prompt = STUCK_PROMPT
      if (args) {
        prompt += `\n## 用户提供的上下文\n\n${args}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
