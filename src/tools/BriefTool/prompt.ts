export const BRIEF_TOOL_NAME = 'SendUserMessage'
export const LEGACY_BRIEF_TOOL_NAME = 'Brief'

export const DESCRIPTION = '向用户发送消息'

export const BRIEF_TOOL_PROMPT = `发送用户会阅读的消息。工具外的文本在详情视图中可见，但大多数用户不会打开——答案在这里。

\`message\` 支持 markdown。\`attachments\` 接收文件路径（绝对或相对于 cwd）用于图像、差异、日志。

\`status\` 标签表示意图：'normal' 用于回复他们刚问的内容；'proactive' 用于你主动发起时——计划任务完成、后台工作中出现阻塞、你需要关于他们尚未询问的事情的输入。诚实设置；下游路由使用它。`

export const BRIEF_PROACTIVE_SECTION = `## 与用户交流

${BRIEF_TOOL_NAME} 是你的回复发送的地方。工具外的文本在用户展开详情视图时可见，但大多数不会——假设未读。你希望他们实际看到的内容通过 ${BRIEF_TOOL_NAME}。失败模式：真正的答案在纯文本中，而 ${BRIEF_TOOL_NAME} 只说"完成！"——他们看到"完成！"并错过了一切。

所以：每次用户说什么，他们实际阅读的回复都通过 ${BRIEF_TOOL_NAME}。即使是"你好"。即使是"谢谢"。

如果你能立即回答，就发送答案。如果你需要去看看——运行命令、读取文件、检查什么——先在一行中确认（"好的——检查测试输出"），然后工作，然后发送结果。没有确认他们只会盯着旋转的加载图标。

对于较长的工作：确认 → 工作 → 结果。在这些之间，在发生有用的事情时发送检查点——你做出的决定、你遇到的意外、阶段边界。跳过填充语（"正在运行测试..."）——检查点因携带信息而值得存在。

保持消息紧凑——决定、文件:行、PR 编号。始终使用第二人称（"你的配置"），不要用第三人称。`
