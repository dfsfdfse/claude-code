import { DEFAULT_BINDINGS } from '../../keybindings/defaultBindings.js'
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js'
import {
  MACOS_RESERVED,
  NON_REBINDABLE,
  TERMINAL_RESERVED,
} from '../../keybindings/reservedShortcuts.js'
import type { KeybindingsSchemaType } from '../../keybindings/schema.js'
import {
  KEYBINDING_ACTIONS,
  KEYBINDING_CONTEXT_DESCRIPTIONS,
  KEYBINDING_CONTEXTS,
} from '../../keybindings/schema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { registerBundledSkill } from '../bundledSkills.js'

/**
 * Build a markdown table of all contexts.
 */
function generateContextsTable(): string {
  return markdownTable(
    ['Context', 'Description'],
    KEYBINDING_CONTEXTS.map(ctx => [
      `\`${ctx}\``,
      KEYBINDING_CONTEXT_DESCRIPTIONS[ctx],
    ]),
  )
}

/**
 * Build a markdown table of all actions with their default bindings and context.
 */
function generateActionsTable(): string {
  // Build a lookup: action -> { keys, context }
  const actionInfo: Record<string, { keys: string[]; context: string }> = {}
  for (const block of DEFAULT_BINDINGS) {
    for (const [key, action] of Object.entries(block.bindings)) {
      if (action) {
        if (!actionInfo[action as string]) {
          actionInfo[action as string] = { keys: [], context: block.context }
        }
        actionInfo[action as string].keys.push(key)
      }
    }
  }

  return markdownTable(
    ['Action', 'Default Key(s)', 'Context'],
    KEYBINDING_ACTIONS.map(action => {
      const info = actionInfo[action]
      const keys = info ? info.keys.map(k => `\`${k}\``).join(', ') : '(none)'
      const context = info ? info.context : inferContextFromAction(action)
      return [`\`${action}\``, keys, context]
    }),
  )
}

/**
 * Infer context from action prefix when not in DEFAULT_BINDINGS.
 */
function inferContextFromAction(action: string): string {
  const prefix = action.split(':')[0]
  const prefixToContext: Record<string, string> = {
    app: 'Global',
    history: 'Global or Chat',
    chat: 'Chat',
    autocomplete: 'Autocomplete',
    confirm: 'Confirmation',
    tabs: 'Tabs',
    transcript: 'Transcript',
    historySearch: 'HistorySearch',
    task: 'Task',
    theme: 'ThemePicker',
    help: 'Help',
    attachments: 'Attachments',
    footer: 'Footer',
    messageSelector: 'MessageSelector',
    diff: 'DiffDialog',
    modelPicker: 'ModelPicker',
    select: 'Select',
    permission: 'Confirmation',
  }
  return prefixToContext[prefix ?? ''] ?? 'Unknown'
}

/**
 * Build a list of reserved shortcuts.
 */
function generateReservedShortcuts(): string {
  const lines: string[] = []

  lines.push('### 不可重新绑定（错误）')
  for (const s of NON_REBINDABLE) {
    lines.push(`- \`${s.key}\` — ${s.reason}`)
  }

  lines.push('')
  lines.push('###   Terminal 保留（错误/警告）')
  for (const s of TERMINAL_RESERVED) {
    lines.push(
      `- \`${s.key}\` — ${s.reason} (${s.severity === 'error' ? '将不起作用' : '可能冲突'})`,
    )
  }

  lines.push('')
  lines.push('### macOS 保留（错误）')
  for (const s of MACOS_RESERVED) {
    lines.push(`- \`${s.key}\` — ${s.reason}`)
  }

  return lines.join('\n')
}

const FILE_FORMAT_EXAMPLE: KeybindingsSchemaType = {
  $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
  $docs: 'https://code.claude.com/docs/en/keybindings',
  bindings: [
    {
      context: 'Chat',
      bindings: {
        'ctrl+e': 'chat:externalEditor',
      },
    },
  ],
}

const UNBIND_EXAMPLE: KeybindingsSchemaType['bindings'][number] = {
  context: 'Chat',
  bindings: {
    'ctrl+s': null,
  },
}

const REBIND_EXAMPLE: KeybindingsSchemaType['bindings'][number] = {
  context: 'Chat',
  bindings: {
    'ctrl+g': null,
    'ctrl+e': 'chat:externalEditor',
  },
}

const CHORD_EXAMPLE: KeybindingsSchemaType['bindings'][number] = {
  context: 'Global',
  bindings: {
    'ctrl+k ctrl+t': 'app:toggleTodos',
  },
}

const SECTION_INTRO = [
  '# 快捷键技能',
  '',
  '创建或修改 `~/.claude/keybindings.json` 自定义键盘快捷键。',
  '',
  '## 重要：写入前必读',
  '',
  '**始终首先读取 `~/.claude/keybindings.json`**（可能尚不存在）。与现有绑定合并 — 不要替换整个文件。',
  '',
  '- 使用 **Edit** 工具修改现有文件',
  '- 仅在文件不存在时使用 **Write** 工具',
].join('\n')

const SECTION_FILE_FORMAT = [
  '## 文件格式',
  '',
  '```json',
  jsonStringify(FILE_FORMAT_EXAMPLE, null, 2),
  '```',
  '',
  '始终包含 `$schema` 和 `$docs` 字段。',
].join('\n')

const SECTION_KEYSTROKE_SYNTAX = [
  '## 按键语法',
  '',
  '**修饰键**（用 `+` 组合）：',
  '- `ctrl`（别名：`control`）',
  '- `alt`（别名：`opt`, `option`）— 注意：在终端中 `alt` 和 `meta` 等价',
  '- `shift`',
  '- `meta`（别名：`cmd`, `command`）',
  '',
  '**特殊键**：`escape`/`esc`、`enter`/`return`、`tab`、`space`、`backspace`、`delete`、`up`、`down`、`left`、`right`',
  '',
  '**组合键**：空格分隔的按键，如 `ctrl+k ctrl+s`（按键间 1 秒超时）',
  '',
  '**示例**：`ctrl+shift+p`、`alt+enter`、`ctrl+k ctrl+n`',
].join('\n')

const SECTION_UNBINDING = [
  '## 取消默认快捷键绑定',
  '',
  '将键设为 `null` 以移除其默认绑定：',
  '',
  '```json',
  jsonStringify(UNBIND_EXAMPLE, null, 2),
  '```',
].join('\n')

const SECTION_INTERACTION = [
  '## 用户绑定与默认绑定的交互方式',
  '',
  '- 用户绑定是**附加的** — 它们附加在默认绑定之后',
  '- 要将绑定移动到不同的键：取消旧键的绑定 (`null`) 并添加新绑定',
  '- 一个上下文只需要在用户文件中出现，如果他们想要更改该上下文中的某些内容',
].join('\n')

const SECTION_COMMON_PATTERNS = [
  '## 常见模式',
  '',
  '### 重新绑定一个键',
  '将外部编辑器快捷键从 `ctrl+g` 改为 `ctrl+e`：',
  '```json',
  jsonStringify(REBIND_EXAMPLE, null, 2),
  '```',
  '',
  '### 添加组合键绑定',
  '```json',
  jsonStringify(CHORD_EXAMPLE, null, 2),
  '```',
].join('\n')

const SECTION_BEHAVIORAL_RULES = [
  '## 行为规则',
  '',
  '1. 仅包含用户想要更改的上下文（最小覆盖）',
  '2. 验证操作和上下文来自已知列表',
  '3. 如果用户选择的键与保留快捷键或常见工具（如 tmux (`ctrl+b`) 和 screen (`ctrl+a`)）冲突，主动警告用户',
  '4. 为现有操作添加新绑定时，新绑定是附加的（现有默认仍有效，除非显式取消）',
  '5. 要完全替换默认绑定，取消旧键的绑定并添加新键',
].join('\n')

const SECTION_DOCTOR = [
  '## 使用 /doctor 验证',
  '',
  '`/doctor` 命令包含"快捷键配置问题"部分，验证 `~/.claude/keybindings.json`。',
  '',
  '### 常见问题及修复',
  '',
  markdownTable(
    ['问题', '原因', '修复'],
    [
      [
        '`keybindings.json 必须有 "bindings" 数组`',
        '缺少包装对象',
        '用 `{ "bindings": [...] }` 包装绑定',
      ],
      [
        '`"bindings" 必须是数组`',
        '`bindings` 不是数组',
        '将 `"bindings"` 设为数组：`[{ context: ..., bindings: ... }]`',
      ],
      [
        '`未知上下文 "X"`',
        '拼写错误或无效的上下文名称',
        '使用可用上下文表中的精确上下文名称',
      ],
      [
        '`Y 绑定中重复键 "X"`',
        '同一上下文中同一键被定义两次',
        '删除重复项；JSON 只使用最后一个值',
      ],
      [
        '`"X" 可能不工作：...`',
        '键与终端/操作系统保留快捷键冲突',
        '选择不同的键（参见保留快捷键部分）',
      ],
      [
        '`无法解析按键 "X"`',
        '无效的键语法',
        '检查语法：修饰键之间用 `+`，使用有效键名',
      ],
      [
        '`"X" 的操作无效`',
        '操作值不是字符串或 null',
        '操作必须是 `"app:help"` 之类的字符串或 `null`（取消绑定）',
      ],
    ],
  ),
  '',
  '### /doctor 输出示例',
  '',
  '```',
  '快捷键配置问题',
  '位置: ~/.claude/keybindings.json',
  '  └ [Error] 未知上下文 "chat"',
  '    → 有效上下文: Global, Chat, Autocomplete, ...',
  '  └ [Warning] "ctrl+c" 可能不起作用: 终端中断 (SIGINT)',
  '```',
  '',
  '**错误**阻止绑定工作，必须修复。**警告**表示潜在冲突，但绑定可能仍然有效。',
].join('\n')

export function registerKeybindingsSkill(): void {
  registerBundledSkill({
    name: 'keybindings-help',
    description:
      '当用户想要自定义键盘快捷键、重新绑定键、添加组合键绑定或修改 ~/.claude/keybindings.json 时使用。示例："重新绑定 ctrl+s"、"添加组合键快捷键"、"更改提交键"、"自定义快捷键"。',
    allowedTools: ['Read'],
    userInvocable: false,
    isEnabled: isKeybindingCustomizationEnabled,
    async getPromptForCommand(args) {
      // Generate reference tables dynamically from source-of-truth arrays
      const contextsTable = generateContextsTable()
      const actionsTable = generateActionsTable()
      const reservedShortcuts = generateReservedShortcuts()

      const sections = [
        SECTION_INTRO,
        SECTION_FILE_FORMAT,
        SECTION_KEYSTROKE_SYNTAX,
        SECTION_UNBINDING,
        SECTION_INTERACTION,
        SECTION_COMMON_PATTERNS,
        SECTION_BEHAVIORAL_RULES,
        SECTION_DOCTOR,
        `## 保留快捷键\n\n${reservedShortcuts}`,
        `## 可用上下文\n\n${contextsTable}`,
        `## 可用操作\n\n${actionsTable}`,
      ]

      if (args) {
        sections.push(`## 用户请求\n\n${args}`)
      }

      return [{ type: 'text', text: sections.join('\n\n') }]
    },
  })
}

/**
 * Build a markdown table from headers and rows.
 */
function markdownTable(headers: string[], rows: string[][]): string {
  const separator = headers.map(() => '---')
  return [
    `| ${headers.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}
