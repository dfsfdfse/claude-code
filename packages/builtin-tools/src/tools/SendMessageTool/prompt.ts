import { feature } from 'bun:bundle'

export const DESCRIPTION = '向另一个代理发送消息'

export function getPrompt(): string {
  const udsRow = feature('UDS_INBOX')
    ? `\n| \`"uds:/path/to.sock"\` | 本地 Claude 会话的 socket（同一机器；使用 \`ListPeers\`） |
|| \`"bridge:session_..."\` | 远程控制对等会话（跨机器；使用 \`ListPeers\`） |`
    : ''
  const udsSection = feature('UDS_INBOX')
    ? `\n\n## 跨会话

使用 \`ListPeers\` 发现目标，然后：

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "check if tests pass over there"}
{"to": "bridge:session_01AbCd...", "message": "what branch are you on?"}
\`\`\`

列出的对等方是活跃的，会处理你的消息——没有"忙"状态；消息排队并在接收者的下一个工具轮次中处理。你的消息到达时包装为 \`<cross-session-message from="...">\`。要回复传入消息，将其 \`from\` 属性复制为你的 \`to\`。`
    : ''
  return `
# SendMessage

向另一个代理发送消息。

\`\`\`json
{"to": "researcher", "summary": "assign task 1", "message": "start on task #1"}
\`\`\`

|| \`to\` | |
||---|---|
|| \`"researcher"\` | 按姓名指定队友 |
|| \`"*"\` | 广播给所有队友 — 成本高昂（与团队规模成线性关系），仅在每个人真正需要时使用 |${udsRow}

你的纯文本输出对其他代理不可见——要进行通信，必须调用此工具。队友的消息会自动传递；你不需要检查收件箱。按姓名引用队友，绝不要用 UUID。转发时不要引用原始消息——它已经呈现给用户了。${udsSection}

## 协议响应（遗留）

如果你收到带有 \`type: "shutdown_request"\` 或 \`type: "plan_approval_request"\` 的 JSON 消息，用匹配的 \`_response\` 类型响应——回显 \`request_id\`，设置 \`approve\` 为 true/false：

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "add error handling"}}
\`\`\`

批准关闭会终止你的进程。拒绝计划会将队友送回修改。除非被要求，否则不要发起 \`shutdown_request\`。不要发送结构化 JSON 状态消息——使用 TaskUpdate。
`.trim()
}
