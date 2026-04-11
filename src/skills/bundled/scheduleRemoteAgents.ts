import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { ToolUseContext } from '../../Tool.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { REMOTE_TRIGGER_TOOL_NAME } from '../../tools/RemoteTriggerTool/prompt.js'
import { getClaudeAIOAuthTokens } from '../../utils/auth.js'
import { checkRepoForRemoteAccess } from '../../utils/background/remote/preconditions.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  detectCurrentRepositoryWithHost,
  parseGitRemote,
} from '../../utils/detectRepository.js'
import { getRemoteUrl } from '../../utils/git.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  createDefaultCloudEnvironment,
  type EnvironmentResource,
  fetchEnvironments,
} from '../../utils/teleport/environments.js'
import { registerBundledSkill } from '../bundledSkills.js'

// Base58 alphabet (Bitcoin-style) used by the tagged ID system
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * Decode a mcpsrv_ tagged ID to a UUID string.
 * Tagged IDs have format: mcpsrv_01{base58(uuid.int)}
 * where 01 is the version prefix.
 *
 * TODO(public-ship): Before shipping publicly, the /v1/mcp_servers endpoint
 * should return the raw UUID directly so we don't need this client-side decoding.
 * The tagged ID format is an internal implementation detail that could change.
 */
function taggedIdToUUID(taggedId: string): string | null {
  const prefix = 'mcpsrv_'
  if (!taggedId.startsWith(prefix)) {
    return null
  }
  const rest = taggedId.slice(prefix.length)
  // Skip version prefix (2 chars, always "01")
  const base58Data = rest.slice(2)

  // Decode base58 to bigint
  let n = 0n
  for (const c of base58Data) {
    const idx = BASE58.indexOf(c)
    if (idx === -1) {
      return null
    }
    n = n * 58n + BigInt(idx)
  }

  // Convert to UUID hex string
  const hex = n.toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

type ConnectorInfo = {
  uuid: string
  name: string
  url: string
}

function getConnectedClaudeAIConnectors(
  mcpClients: MCPServerConnection[],
): ConnectorInfo[] {
  const connectors: ConnectorInfo[] = []
  for (const client of mcpClients) {
    if (client.type !== 'connected') {
      continue
    }
    if (client.config.type !== 'claudeai-proxy') {
      continue
    }
    const uuid = taggedIdToUUID(client.config.id)
    if (!uuid) {
      continue
    }
    connectors.push({
      uuid,
      name: client.name,
      url: client.config.url,
    })
  }
  return connectors
}

function sanitizeConnectorName(name: string): string {
  return name
    .replace(/^claude[.\s-]ai[.\s-]/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatConnectorsInfo(connectors: ConnectorInfo[]): string {
  if (connectors.length === 0) {
    return '未找到已连接的 MCP 连接器。用户可能需要在 https://claude.ai/settings/connectors 连接服务器'
  }
  const lines = ['已连接的连接器（可用于触发器）：']
  for (const c of connectors) {
    const safeName = sanitizeConnectorName(c.name)
    lines.push(
      `- ${c.name} (connector_uuid: ${c.uuid}, name: ${safeName}, url: ${c.url})`,
    )
  }
  return lines.join('\n')
}

const BASE_QUESTION = '你想对计划的远程智能体做什么？'

/**
 * Formats setup notes as a bulleted Heads-up block. Shared between the
 * initial AskUserQuestion dialog text (no-args path) and the prompt-body
 * section (args path) so notes are never silently dropped.
 */
function formatSetupNotes(notes: string[]): string {
  const items = notes.map(n => `- ${n}`).join('\n')
  return `⚠ 注意事项：\n${items}`
}

async function getCurrentRepoHttpsUrl(): Promise<string | null> {
  const remoteUrl = await getRemoteUrl()
  if (!remoteUrl) {
    return null
  }
  const parsed = parseGitRemote(remoteUrl)
  if (!parsed) {
    return null
  }
  return `https://${parsed.host}/${parsed.owner}/${parsed.name}`
}

function buildPrompt(opts: {
  userTimezone: string
  connectorsInfo: string
  gitRepoUrl: string | null
  environmentsInfo: string
  createdEnvironment: EnvironmentResource | null
  setupNotes: string[]
  needsGitHubAccessReminder: boolean
  userArgs: string
}): string {
  const {
    userTimezone,
    connectorsInfo,
    gitRepoUrl,
    environmentsInfo,
    createdEnvironment,
    setupNotes,
    needsGitHubAccessReminder,
    userArgs,
  } = opts
  // When the user passes args, the initial AskUserQuestion dialog is skipped.
  // Setup notes must surface in the prompt body instead, otherwise they're
  // computed and silently discarded (regression vs. the old hard-block).
  const setupNotesSection =
    userArgs && setupNotes.length > 0
      ? `\n## Setup Notes\n\n${formatSetupNotes(setupNotes)}\n`
      : ''
  const initialQuestion =
    setupNotes.length > 0
      ? `${formatSetupNotes(setupNotes)}\n\n${BASE_QUESTION}`
      : BASE_QUESTION
  const firstStep = userArgs
    ? `用户已经说明了他们想要的（见底部用户请求）。跳过初始问题，直接进入对应工作流。`
    : `你的第一步操作必须是单个 ${ASK_USER_QUESTION_TOOL_NAME} 工具调用（无序言）。使用此确切的字符串作为 \`question\` 字段——不要改写或缩短：

${jsonStringify(initialQuestion)}

设置 \`header: "操作"\` 并提供四个操作（创建/列出/更新/运行）作为选项。用户选择后，遵循下方对应工作流。`

  return `# 计划远程智能体

你正在帮助用户计划、更新、列出或运行**远程** Claude Code 智能体。这些不是本地 cron 任务——每个触发器都会在 Anthropic 云基础设施中按 cron 计划生成完全隔离的远程会话（CCR）。智能体在沙箱环境中运行，拥有自己的 git 仓库副本、工具和可选的 MCP 连接。

## 第一步

${firstStep}
${setupNotesSection}

## 你可以做什么

使用 \`${REMOTE_TRIGGER_TOOL_NAME}\` 工具（先用 \`ToolSearch select:${REMOTE_TRIGGER_TOOL_NAME}\` 加载；认证在进程内处理——不要使用 curl）：

- \`{action: "list"}\` — 列出所有触发器
- \`{action: "get", trigger_id: "..."}\` — 获取一个触发器
- \`{action: "create", body: {...}}\` — 创建触发器
- \`{action: "update", trigger_id: "...", body: {...}}\` — 部分更新
- \`{action: "run", trigger_id: "..."}\` — 立即运行触发器

你无法删除触发器。如果用户要求删除，请引导他们访问：https://claude.ai/code/scheduled

## 创建请求体结构

\`\`\`json
{
  "name": "智能体名称",
  "cron_expression": "CRON表达式",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "环境ID",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [
          {"git_repository": {"url": "${gitRepoUrl || 'https://github.com/ORG/REPO'}"}}
        ],
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
      },
      "events": [
        {"data": {
          "uuid": "<小写 v4 uuid>",
          "session_id": "",
          "type": "user",
          "parent_tool_use_id": null,
          "message": {"content": "提示词", "role": "user"}
        }}
      ]
    }
  }
}
\`\`\`

请自己生成一个新的小写 UUID 用于 \`events[].data.uuid\`。

## 可用的 MCP 连接器

这些是用户当前已连接的 claude.ai MCP 连接器：

${connectorsInfo}

将连接器附加到触发器时，使用上面显示的 \`connector_uuid\` 和 \`name\`（名称已经过清理，只包含字母、数字、连字符和下划线），以及连接器的 URL。\`mcp_connections\` 中的 \`name\` 字段只能包含 \`[a-zA-Z0-9_-]\`——不允许使用点和空格。

**重要提示：** 根据用户的描述推断智能体需要哪些服务。例如，如果用户说"检查 Datadog 并通过 Slack 发送错误"，智能体需要 Datadog 和 Slack 两个连接器。请与上面的列表交叉检查。如果任何需要的服务未连接，请警告用户并引导他们访问 https://claude.ai/settings/connectors 先进行连接。

## 环境

每个触发器都需要在作业配置中指定 \`environment_id\`。这决定了远程智能体运行在哪里。请询问用户使用哪个环境。

${environmentsInfo}

将 \`id\` 值用作 \`job_config.ccr.environment_id\`。${createdEnvironment ? `\n**注意：** 由于用户没有环境，刚刚为用户创建了新环境 \`${createdEnvironment.name}\`（id: \`${createdEnvironment.environment_id}\`）。请使用此 id 作为 \`job_config.ccr.environment_id\`，并在确认触发器配置时提及创建过程。\n` : ''}

## API 字段参考

### 创建触发器——必填字段
- \`name\`（字符串）——描述性名称
- \`cron_expression\`（字符串）——5 字段 cron。**最小间隔为 1 小时。**
- \`job_config\`（对象）——会话配置（见上方结构）

### 创建触发器——可选字段
- \`enabled\`（布尔值，默认：true）
- \`mcp_connections\`（数组）——要附加的 MCP 服务器：
  \`\`\`json
  [{"connector_uuid": "uuid", "name": "server-name", "url": "https://..."}]
  \`\`\`

### 更新触发器——可选字段
所有字段均可选（部分更新）：
- \`name\`、\`cron_expression\`、\`enabled\`、\`job_config\`
- \`mcp_connections\` ——替换 MCP 连接
- \`clear_mcp_connections\`（布尔值）——移除所有 MCP 连接

### Cron 表达式示例

用户的本地时区是 **${userTimezone}**。Cron 表达式始终使用 UTC。当用户说出本地时间时，请将其转换为 UTC 的 cron 表达式并与用户确认："${userTimezone} 时间上午 9 点 = UTC 时间上午 X 点，所以 cron 应该是 \`0 X * * 1-5\`。"

- \`0 9 * * 1-5\` — 每个工作日 UTC 时间上午 9 点
- \`0 */2 * * *\` — 每 2 小时
- \`0 0 * * *\` — 每天 UTC 时间午夜
- \`30 14 * * 1\` — 每个星期一二 UTC 时间下午 2:30
- \`0 8 1 * *\` — 每月 1 日 UTC 时间上午 8 点

最小间隔为 1 小时。\`*/30 * * * *\` 会被拒绝。

## 工作流

### 创建新触发器：

1. **了解目标** — 询问用户希望远程智能体做什么。哪个仓库？什么任务？提醒他们智能体在远程运行——它无法访问他们的本地机器、本地文件或本地环境变量。
2. **编写提示词** — 帮助用户写出有效的智能体提示词。好的提示词应该：
   - 明确说明要做什么以及成功是什么样的
   - 清楚指出要关注哪些文件/区域
   - 明确说明要采取什么行动（打开 PR、提交、仅分析等）
3. **设置计划** — 询问时间和频率。用户的时区是 ${userTimezone}。当他们说出一个时间（例如"每天上午 9 点"），请假设他们指的是本地时间并转换为 UTC 的 cron 表达式。始终确认转换："${userTimezone} 时间上午 9 点 = UTC 时间上午 X 点。"
4. **选择模型** — 默认为 \`claude-sonnet-4-6\`。告诉用户你默认使用哪个模型，并询问他们是否需要不同的模型。
5. **验证连接** — 根据用户的描述推断智能体需要哪些服务。例如，如果他们说"检查 Datadog 并通过 Slack 发送错误"，智能体需要 Datadog 和 Slack 两个 MCP 连接器。请与上面的连接器列表交叉检查。如果任何连接器缺失，请警告用户并引导他们访问 https://claude.ai/settings/connectors 进行连接。${gitRepoUrl ? ` 默认 git 仓库已设置为 \`${gitRepoUrl}\`。请询问用户这是否是正确的仓库，或者他们是否需要不同的仓库。` : ' 请询问远程智能体需要克隆到其环境中的 git 仓库。'}
6. **审查并确认** — 在创建前显示完整配置。让他们调整。
7. **创建** — 使用 \`action: "create"\` 调用 \`${REMOTE_TRIGGER_TOOL_NAME}\` 并显示结果。响应包含触发器 ID。最后始终输出一条链接：\`https://claude.ai/code/scheduled/{TRIGGER_ID}\`

### 更新触发器：

1. 先列出触发器，以便用户选择
2. 询问他们想更改什么
3. 显示当前值与提议值的对比
4. 确认并更新

### 列出触发器：

1. 获取并以可读格式显示
2. 显示：名称、计划（人类可读）、启用/禁用状态、下次运行时间、仓库

### 立即运行：

1. 如果用户未指定，先列出触发器
2. 确认是哪个触发器
3. 执行并确认

## 重要提示

- 这些是远程智能体——它们在 Anthropic 云中运行，而非用户的机器。它们无法访问本地文件、本地服务或本地环境变量。
- 显示 cron 时始终转换为人类可读的格式
- 除非用户另有说明，否则默认为 \`enabled: true\`
- 接受任何格式的 GitHub URL（https://github.com/org/repo、org/repo 等）并规范化为完整 HTTPS URL（不带 .git 后缀）
- 提示词是最重要的部分——请花时间把提示词写好。远程智能体从零开始，所以提示词必须是自包含的。
- 要删除触发器，请引导用户访问 https://claude.ai/code/scheduled
${needsGitHubAccessReminder ? `- 如果用户的请求似乎需要 GitHub 仓库访问权限（例如克隆仓库、打开 PR、读取代码），请提醒他们 ${getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_lantern', false) ? "他们应该运行 /web-setup 来同步 GitHub 凭据（或在仓库上安装 Claude GitHub App 作为替代方案）——否则远程智能体将无法访问它" : "他们需要在仓库上安装 Claude GitHub App——否则远程智能体将无法访问它"}.` : ''}
${userArgs ? `\n## 用户请求\n\nThe user said: "${userArgs}"\n\n首先理解他们的意图，然后按照上面的对应工作流进行操作。` : ''}`
}

export function registerScheduleRemoteAgentsSkill(): void {
  registerBundledSkill({
    name: 'schedule',
    description:
      '创建、更新、列出或运行按 cron 计划执行的计划远程智能体（触发器）。',
    whenToUse:
      '当用户想要计划重复远程智能体、设置自动化任务、为 Claude Code 创建 cron 任务或管理其计划智能体/触发器时使用。',
    userInvocable: true,
    isEnabled: () =>
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions'),
    allowedTools: [REMOTE_TRIGGER_TOOL_NAME, ASK_USER_QUESTION_TOOL_NAME],
    async getPromptForCommand(args: string, context: ToolUseContext) {
      if (!getClaudeAIOAuthTokens()?.accessToken) {
        return [
          {
            type: 'text',
            text: '你需要先通过 claude.ai 账户认证。API 账户不支持。请运行 /login，然后重试 /schedule。',
          },
        ]
      }

      let environments: EnvironmentResource[]
      try {
        environments = await fetchEnvironments()
      } catch (err) {
        logForDebugging(`[schedule] 获取环境失败：${err}`, {
          level: 'warn',
        })
        return [
          {
            type: 'text',
            text: '连接你的远程 claude.ai 账户以设置计划任务时遇到问题。请几分钟后重试 /schedule。',
          },
        ]
      }

      let createdEnvironment: EnvironmentResource | null = null
      if (environments.length === 0) {
        try {
          createdEnvironment = await createDefaultCloudEnvironment(
            'claude-code-default',
          )
          environments = [createdEnvironment]
        } catch (err) {
          logForDebugging(`[schedule] 创建环境失败：${err}`, {
            level: 'warn',
          })
          return [
            {
              type: 'text',
              text: '未找到远程环境，也无法自动创建。请访问 https://claude.ai/code 设置一个，然后再次运行 /schedule。',
            },
          ]
        }
      }

      // 软性前置检查 — 收集为提前注意事项嵌入在初始 AskUserQuestion 对话框中。
      // 永不阻止 — 触发器不需要 git 源（例如，仅 Slack 轮询），
      // 而且触发器的源可能指向与 cwd 不同的仓库。
      const setupNotes: string[] = []
      let needsGitHubAccessReminder = false

      const repo = await detectCurrentRepositoryWithHost()
      if (repo === null) {
        setupNotes.push(
          `不在 git 仓库中 — 你需要手动指定仓库 URL（或完全跳过仓库）。`,
        )
      } else if (repo.host === 'github.com') {
        const { hasAccess } = await checkRepoForRemoteAccess(
          repo.owner,
          repo.name,
        )
        if (!hasAccess) {
          needsGitHubAccessReminder = true
          const webSetupEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
            'tengu_cobalt_lantern',
            false,
          )
          const msg = webSetupEnabled
            ? `GitHub 未为 ${repo.owner}/${repo.name} 连接 — 运行 /web-setup 同步你的 GitHub 凭证，或在 https://claude.ai/code/onboarding?magic=github-app-setup 安装 Claude GitHub App。`
            : `${repo.owner}/${repo.name} 上未安装 Claude GitHub App — 如需此仓库请在 https://claude.ai/code/onboarding?magic=github-app-setup 安装。`
          setupNotes.push(msg)
        }
      }
      // 非 github.com 主机（GHE/GitLab 等）：静默跳过。GitHub
      // App 检查是 github.com 特有的，而"不在 git 仓库"的注释
      // 事实上是错误的 — getCurrentRepoHttpsUrl() 下方仍会
      // 用 GHE URL 填充 gitRepoUrl。

      const connectors = getConnectedClaudeAIConnectors(
        context.options.mcpClients,
      )
      if (connectors.length === 0) {
        setupNotes.push(
          `无 MCP 连接器 — 如有需要请在 https://claude.ai/settings/connectors 连接。`,
        )
      }

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const connectorsInfo = formatConnectorsInfo(connectors)
      const gitRepoUrl = await getCurrentRepoHttpsUrl()
      const lines = ['可用环境：']
      for (const env of environments) {
        lines.push(
          `- ${env.name}（id: ${env.environment_id}，类型: ${env.kind}）`,
        )
      }
      const environmentsInfo = lines.join('\n')
      const prompt = buildPrompt({
        userTimezone,
        connectorsInfo,
        gitRepoUrl,
        environmentsInfo,
        createdEnvironment,
        setupNotes,
        needsGitHubAccessReminder,
        userArgs: args,
      })
      return [{ type: 'text', text: prompt }]
    },
  })
}
