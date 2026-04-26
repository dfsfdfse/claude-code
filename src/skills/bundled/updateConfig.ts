import { toJSONSchema } from 'zod/v4'
import { SettingsSchema } from '../../utils/settings/types.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { registerBundledSkill } from '../bundledSkills.js'

/**
 * 从 settings Zod schema 生成 JSON Schema。
 * 确保技能提示词与实际类型保持同步。
 */
function generateSettingsSchema(): string {
  const jsonSchema = toJSONSchema(SettingsSchema(), { io: 'input' })
  return jsonStringify(jsonSchema, null, 2)
}

const SETTINGS_EXAMPLES_DOCS = `## 设置文件位置

根据作用域选择合适的文件：

| 文件 | 作用域 | Git | 用途 |
|------|-------|-----|---------|
| \`~/.claude/settings.json\` | 全局 | N/A | 所有项目的个人偏好设置 |
| \`.claude/settings.json\` | 项目 | 提交 | 团队范围的 hooks、权限、插件 |
| \`.claude/settings.local.json\` | 项目 | Gitignore | 本项目的个人覆盖设置 |

设置加载顺序：用户 → 项目 → 本地（后加载的覆盖先前的）。

## 设置 Schema 参考

### 权限
\`\`\`json
{
  "permissions": {
    "allow": ["Bash(npm:*)", "Edit(.claude)", "Read"],
    "deny": ["Bash(rm -rf:*)"],
    "ask": ["Write(/etc/*)"],
    "defaultMode": "default" | "plan" | "acceptEdits" | "dontAsk",
    "additionalDirectories": ["/extra/dir"]
  }
}
\`\`\`

**权限规则语法：**
- 精确匹配：\`"Bash(npm run test)"\`
- 前缀通配符：\`"Bash(git:*)"\` - 匹配 \`git status\`、\`git commit\` 等
- 仅工具名：\`"Read"\` - 允许所有 Read 操作

### 环境变量
\`\`\`json
{
  "env": {
    "DEBUG": "true",
    "MY_API_KEY": "value"
  }
}
\`\`\`

### 模型与 Agent
\`\`\`json
{
  "model": "sonnet",  // 或 "opus"、"haiku"、完整模型 ID
  "agent": "agent-name",
  "alwaysThinkingEnabled": true
}
\`\`\`

### 署名（提交与 PR）
\`\`\`json
{
  "attribution": {
    "commit": "自定义提交尾部文本",
    "pr": "自定义 PR 描述文本"
  }
}
\`\`\`
将 \`commit\` 或 \`pr\` 设为空字符串 \`""\` 可隐藏该署名。

### MCP 服务器管理
\`\`\`json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["server1", "server2"],
  "disabledMcpjsonServers": ["blocked-server"]
}
\`\`\`

### 插件
\`\`\`json
{
  "enabledPlugins": {
    "formatter@anthropic-tools": true
  }
}
\`\`\`
插件语法：\`plugin-name@source\`，source 可为 \`claude-code-marketplace\`、\`claude-plugins-official\` 或 \`builtin\`。

### 其他设置
- \`language\`：首选响应语言（如 "chinese"）
- \`cleanupPeriodDays\`：保留对话记录的天数（默认 30；0 表示完全禁用持久化）
- \`respectGitignore\`：是否遵循 .gitignore（默认 true）
- \`spinnerTipsEnabled\`：在 spinner 中显示提示
- \`spinnerVerbs\`：自定义 spinner 动词（\`{ "mode": "append" | "replace", "verbs": [...] }\`）
- \`spinnerTipsOverride\`：覆盖 spinner 提示（\`{ "excludeDefault": true, "tips": ["自定义提示"] }\`）
- \`syntaxHighlightingDisabled\`：禁用 diff 高亮
`

// 注意：我们为常见模式保留手写示例，因为它们比自动生成的 schema 文档
// 更具可操作性。生成的 schema 列表提供完整性，而示例提供清晰度。

const HOOKS_DOCS = `## Hooks 配置

Hooks 在 Claude Code 生命周期的特定点运行命令。

### Hook 结构
\`\`\`json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "ToolName|OtherTool",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here",
            "timeout": 60,
            "statusMessage": "Running..."
          }
        ]
      }
    ]
  }
}
\`\`\`

### Hook 事件

| 事件 | Matcher | 用途 |
|-------|---------|---------|
| PermissionRequest | 工具名 | 在权限提示前运行 |
| PreToolUse | 工具名 | 在工具使用前运行，可阻止 |
| PostToolUse | 工具名 | 工具成功执行后运行 |
| PostToolUseFailure | 工具名 | 工具失败后运行 |
| Notification | 通知类型 | 收到通知时运行 |
| Stop | - | Claude 停止时运行（包括 clear、resume、compact） |
| PreCompact | "manual"/"auto" | 压缩前 |
| PostCompact | "manual"/"auto" | 压缩后（接收摘要） |
| UserPromptSubmit | - | 用户提交时 |
| SessionStart | - | 会话开始时 |

**常用工具 matchers：** \`Bash\`、\`Write\`、\`Edit\`、\`Read\`、\`Glob\`、\`Grep\`

### Hook 类型

**1. Command Hook** - 运行 shell 命令：
\`\`\`json
{ "type": "command", "command": "prettier --write $FILE", "timeout": 30 }
\`\`\`

**2. Prompt Hook** - 使用 LLM 评估条件：
\`\`\`json
{ "type": "prompt", "prompt": "Is this safe? $ARGUMENTS" }
\`\`\`
仅适用于工具事件：PreToolUse、PostToolUse、PermissionRequest。

**3. Agent Hook** - 运行带工具的 agent：
\`\`\`json
{ "type": "agent", "prompt": "Verify tests pass: $ARGUMENTS" }
\`\`\`
仅适用于工具事件：PreToolUse、PostToolUse、PermissionRequest。

### Hook 输入（stdin JSON）
\`\`\`json
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/file.txt", "content": "..." },
  "tool_response": { "success": true }  // 仅 PostToolUse
}
\`\`\`

### Hook JSON 输出

Hooks 可以返回 JSON 来控制行为：

\`\`\`json
{
  "systemMessage": "Warning shown to user in UI",
  "continue": false,
  "stopReason": "Message shown when blocking",
  "suppressOutput": false,
  "decision": "block",
  "reason": "Explanation for decision",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Context injected back to model"
  }
}
\`\`\`

**字段：**
- \`systemMessage\` - 向用户显示消息（所有 hooks）
- \`continue\` - 设为 \`false\` 可阻止/停止（默认 true）
- \`stopReason\` - \`continue\` 为 false 时显示的消息
- \`suppressOutput\` - 从对话记录中隐藏 stdout（默认 false）
- \`decision\` - PostToolUse/Stop/UserPromptSubmit hooks 的 "block"（PreToolUse 已弃用，改用 hookSpecificOutput.permissionDecision）
- \`reason\` - 决策说明
- \`hookSpecificOutput\` - 事件特定输出（必须包含 \`hookEventName\`）：
  - \`additionalContext\` - 注入模型上下文的文本
  - \`permissionDecision\` - "allow"、"deny" 或 "ask"（仅 PreToolUse）
  - \`permissionDecisionReason\` - 权限决策原因（仅 PreToolUse）
  - \`updatedInput\` - 修改后的工具输入（仅 PreToolUse）

### 常见模式

**写入后自动格式化：**
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; prettier --write \\"$f\\"; } 2>/dev/null || true"
      }]
    }]
  }
}
\`\`\`

**记录所有 bash 命令：**
\`\`\`json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.command' >> ~/.claude/bash-log.txt"
      }]
    }]
  }
}
\`\`\`

**向用户显示消息的停止钩子：**

命令必须输出包含 \`systemMessage\` 字段的 JSON：
\`\`\`bash
# 示例命令输出：{"systemMessage": "会话完成！"}
echo '{"systemMessage": "Session complete!"}'
\`\`\`

**代码变更后运行测试：**
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path // .tool_response.filePath' | grep -E '\\\\.(ts|js)$' && npm test || true"
      }]
    }]
  }
}
\`\`\`
`

const HOOK_VERIFICATION_FLOW = `## 构建 Hook（含验证）

给定事件、matcher、目标文件和期望行为，遵循以下流程。每一步捕获不同类型的失败——一个静默无操作的 hook 比没有 hook 更糟。

1. **去重检查。** 读取目标文件。如果同一 event+matcher 上已存在 hook，显示现有命令并询问：保留、替换还是并列添加。

2. **为本项目构建命令——不要假设。** Hook 从 stdin 接收 JSON。构建命令时需：
   - 安全提取任何所需 payload——使用 \`jq -r\` 导入带引号的变量或 \`{ read -r f; ... "$f"; }\`，不要用无引号的 \`| xargs\`（按空格分割）
   - 按本项目运行方式调用底层工具（npx/bunx/yarn/pnpm？Makefile target？全局安装？）
   - 跳过工具不处理的输入（格式化工具通常有 \`--ignore-unknown\`；没有则按扩展名保护）
   - 暂时保持 RAW——不加 \`|| true\`，不抑制 stderr。管道测试通过后再包装。

3. **管道测试原始命令。** 合成 hook 将接收的 stdin payload 并直接管道：
   - \`Pre|PostToolUse\` on \`Write|Edit\`：\`echo '{"tool_name":"Edit","tool_input":{"file_path":"<本仓库的真实文件>"}}' | <cmd>\`
   - \`Pre|PostToolUse\` on \`Bash\`：\`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | <cmd>\`
   - \`Stop\`/\`UserPromptSubmit\`/\`SessionStart\`：大多数命令不读 stdin，所以 \`echo '{}' | <cmd>\` 足够

   检查退出码和副作用（文件是否实际格式化、测试是否实际运行）。如果失败会得到真实错误——修复（包管理器错误？工具未安装？jq 路径错误？）并重新测试。一旦成功，用 \`2>/dev/null || true\` 包装（除非用户需要阻塞检查）。

4. **写入 JSON。** 合并到目标文件（schema 结构见上方"Hook Structure"部分）。如果首次创建 \`.claude/settings.local.json\`，将其加入 .gitignore——Write 工具不会自动 gitignore。

5. **一次性验证语法 + schema：**

   \`jq -e '.hooks.<event>[] | select(.matcher == "<matcher>") | .hooks[] | select(.type == "command") | .command' <target-file>\`

   Exit 0 + 打印你的命令 = 正确。Exit 4 = matcher 不匹配。Exit 5 = JSON 格式错误或嵌套错误。损坏的 settings.json 会静默禁用该文件的所有设置——也要修复任何已存在的格式错误。

6. **证明 hook 能触发** —— 仅适用于你能通过工具触发的 \`Pre|PostToolUse\` matcher（通过 Edit 触发 \`Write|Edit\`，通过 Bash 触发 \`Bash\`）。\`Stop\`/\`UserPromptSubmit\`/\`SessionStart\` 在本轮外触发——跳到第 7 步。

   对于 \`PostToolUse\`/\`Write|Edit\` 上的 **formatter**：通过 Edit 引入可检测的违规（两个连续空行、缩进错误、缺少分号——该格式化工具能修正的问题；不是行尾空格，Edit 会在写入前去除）。重新读取，确认 hook **修复**了它。对于**其他情况**：在 settings.json 的命令前临时加前缀 \`echo "$(date) hook fired" >> /tmp/claude-hook-check.txt; \`，触发匹配的 tool（\`Write|Edit\` 用 Edit，\`Bash\` 用无害的 \`true\`），读取 sentinel 文件。

   **始终清理**——无论验证通过还是失败，都恢复违规、删除 sentinel 前缀。

   **如果验证失败但管道测试和 \`jq -e\` 都通过**：settings watcher 未监视 \`.claude/\`——它只监视会话启动时有 settings 文件的目录。hook 写入正确。告诉用户打开一次 \`/hooks\`（重新加载配置）或重启——你自己做不到；\`/hooks\` 是用户 UI 菜单，打开它会结束本轮。

7. **交接。** 告诉用户 hook 已生效（或根据 watcher 警告需要 \`/hooks\`/重启）。指引他们使用 \`/hooks\` 稍后查看、编辑或禁用。UI 仅在 hook 错误或慢时显示"Ran N hooks"——静默成功按设计不可见。
`

const UPDATE_CONFIG_PROMPT = `# 更新配置技能

通过更新 settings.json 文件修改 Claude Code 配置。

## 何时需要 Hooks（而非记忆）

如果用户想要自动响应 EVENT，需要在 settings.json 中配置 **hook**。记忆/偏好无法触发自动化操作。

**这些需要 hooks：**
- "压缩前问我保留什么" → PreCompact hook
- "写入文件后运行 prettier" → PostToolUse hook，matcher 为 Write|Edit
- "运行 bash 命令时记录它们" → PreToolUse hook，matcher 为 Bash
- "代码变更后始终运行测试" → PostToolUse hook

**Hook 事件：** PreToolUse、PostToolUse、PreCompact、PostCompact、Stop、Notification、SessionStart

## 重要：写入前必读

**修改前始终读取现有 settings 文件。** 将新设置与现有设置合并——不要替换整个文件。

## 重要：歧义时使用 AskUserQuestion

当用户请求模糊时，使用 AskUserQuestion 澄清：
- 修改哪个 settings 文件（用户/项目/本地）
- 是添加到现有数组还是替换它们
- 多个选项时的具体值

## 决策：Config 工具 vs 直接编辑

**对这些简单设置使用 Config 工具：**
- \`theme\`、\`editorMode\`、\`verbose\`、\`model\`
- \`language\`、\`alwaysThinkingEnabled\`
- \`permissions.defaultMode\`

**直接编辑 settings.json 用于：**
- Hooks（PreToolUse、PostToolUse 等）
- 复杂权限规则（allow/deny 数组）
- 环境变量
- MCP 服务器配置
- 插件配置

## 工作流

1. **澄清意图** - 询问请求是否模糊
2. **读取现有文件** - 对目标 settings 文件使用 Read 工具
3. **谨慎合并** - 保留现有设置，尤其是数组
4. **编辑文件** - 使用 Edit 工具（如果文件不存在，先让用户创建）
5. **确认** - 告诉用户做了什么更改

## 合并数组（重要！）

添加到权限数组或 hook 数组时，**与现有合并**，不要替换：

**错误**（替换现有权限）：
\`\`\`json
{ "permissions": { "allow": ["Bash(npm:*)"] } }
\`\`\`

**正确**（保留现有 + 添加新的）：
\`\`\`json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",      // 现有的
      "Edit(.claude)",    // 现有的
      "Bash(npm:*)"       // 新增的
    ]
  }
}
\`\`\`

${SETTINGS_EXAMPLES_DOCS}

${HOOKS_DOCS}

${HOOK_VERIFICATION_FLOW}

## 示例工作流

### 添加 Hook

用户："Claude 写入后格式化代码"

1. **澄清**：哪个格式化工具？（prettier、gofmt 等）
2. **读取**：\`.claude/settings.json\`（如果不存在则创建）
3. **合并**：添加到现有 hooks，不要替换
4. **结果**：
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; prettier --write \\"$f\\"; } 2>/dev/null || true"
      }]
    }]
  }
}
\`\`\`

### 添加权限

用户："允许 npm 命令不提示"

1. **读取**：现有权限
2. **合并**：将 \`Bash(npm:*)\` 添加到 allow 数组
3. **结果**：与现有 allow 合并

### 环境变量

用户："设置 DEBUG=true"

1. **决定**：用户设置（全局）还是项目设置？
2. **读取**：目标文件
3. **合并**：添加到 env 对象
\`\`\`json
{ "env": { "DEBUG": "true" } }
\`\`\`

## 常见错误避免

1. **替换而非合并** - 始终保留现有设置
2. **错误文件** - 范围���明确时询问用户
3. **无效 JSON** - 更改后验证语法
4. **忘记先读取** - 写入前始终读取

## Hook 故障排查

如果 hook 未运行：
1. **检查 settings 文件** - 读取 ~/.claude/settings.json 或 .claude/settings.json
2. **验证 JSON 语法** - 无效 JSON 会静默失败
3. **检查 matcher** - 是否匹配工具名？（如 "Bash"、"Write"、"Edit"）
4. **检查 hook 类型** - 是 "command"、"prompt" 还是 "agent"？
5. **测试命令** - 手动运行 hook 命令看是否有效
6. **使用 --debug** - 运行 \`claude --debug\` 查看 hook 执行日志
`

export function registerUpdateConfigSkill(): void {
  registerBundledSkill({
    name: 'update-config',
    description:
      '通过 settings.json 配置 Claude Code。自动化行为（"从现在起当 X 时"、"每次 X 时"、"无论何时 X"、"X 之前/之后"）需要在 settings.json 中配置 hooks——由 harness 执行而非 Claude，因此记忆/偏好无法满足。也用于：权限（"允许 X"、"添加权限"、"移动权限到"）、环境变量（"设置 X=Y"）、hook 故障排查或 settings.json/settings.local.json 文件的任何更改。示例："允许 npm 命令"、"添加 bq 权限到全局设置"、"移动权限到用户设置"、"设置 DEBUG=true"、"当 claude 停止时显示 X"。对于 theme/model 等简单设置，使用 Config 工具。',
    allowedTools: ['Read'],
    userInvocable: true,
    async getPromptForCommand(args) {
      if (args.startsWith('[hooks-only]')) {
        const req = args.slice('[hooks-only]'.length).trim()
        let prompt = HOOKS_DOCS + '\n\n' + HOOK_VERIFICATION_FLOW
        if (req) {
          prompt += `\n\n## 任务\n\n${req}`
        }
        return [{ type: 'text', text: prompt }]
      }

      // 动态生成 schema 以与类型保持同步
      const jsonSchema = generateSettingsSchema()

      let prompt = UPDATE_CONFIG_PROMPT
      prompt += `\n\n## 完整 Settings JSON Schema\n\n\`\`\`json\n${jsonSchema}\n\`\`\``

      if (args) {
        prompt += `\n\n## 用户请求\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
