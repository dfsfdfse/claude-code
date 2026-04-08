/**
 * MCP add CLI subcommand
 *
 * Extracted from main.tsx to enable direct testing.
 */
import { type Command, Option } from '@commander-js/extra-typings'
import { cliError, cliOk } from '../../cli/exit.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  readClientSecret,
  saveMcpClientSecret,
} from '../../services/mcp/auth.js'
import { addMcpConfig } from '../../services/mcp/config.js'
import {
  describeMcpConfigFilePath,
  ensureConfigScope,
  ensureTransport,
  parseHeaders,
} from '../../services/mcp/utils.js'
import {
  getXaaIdpSettings,
  isXaaEnabled,
} from '../../services/mcp/xaaIdpLogin.js'
import { parseEnvVars } from '../../utils/envUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'

/**
 * Registers the `mcp add` subcommand on the given Commander command.
 */
export function registerMcpAddCommand(mcp: Command): void {
  mcp
    .command('add <name> <commandOrUrl> [args...]')
    .description(
      '添加一个 MCP 服务器到 Claude Code。\n\n' +
        '例如:\n' +
        '  # 添加 HTTP 服务器:\n' +
        '  claude mcp add --transport http sentry https://mcp.sentry.dev/mcp\n\n' +
        '  # 添加 HTTP 服务器并设置 headers:\n' +
        '  claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer ..."\n\n' +
        '  # 添加 stdio 服务器并设置环境变量:\n' +
        '  claude mcp add -e API_KEY=xxx my-server -- npx my-mcp-server\n\n' +
        '  # 添加 stdio 服务器并设置子进程标志:\n' +
        '  claude mcp add my-server -- my-command --some-flag arg1',
    )
    .option(
      '-s, --scope <scope>',
      '配置范围 (local, user, or project)',
      'local',
    )
    .option(
      '-t, --transport <transport>',
      '传输类型 (stdio, sse, http). 如果未指定, 默认为 stdio。',
    )
    .option(
      '-e, --env <env...>',
      '设置环境变量 (例如: -e KEY=value)',
    )
    .option(
      '-H, --header <header...>',
      '设置 WebSocket headers (例如: -H "X-Api-Key: abc123" -H "X-Custom: value")',
    )
    .option('--client-id <clientId>', 'OAuth client ID for HTTP/SSE servers')
    .option(
      '--client-secret',
      '提示输入 OAuth 客户端密钥 (或设置 MCP_CLIENT_SECRET 环境变量)',
    )
    .option(
      '--callback-port <port>',
      '固定的 OAuth 回调端口 (适用于需要预注册重定向 URI 的服务器)',
    )
    .helpOption('-h, --help', '显示命令帮助')
    .addOption(
      new Option(
        '--xaa',
        "启用 XAA (SEP-990) 用于此服务器。需要先执行 'claude mcp xaa setup'。还需要 --client-id 和 --client-secret (用于 MCP 服务器的 AS)。",
      ).hideHelp(!isXaaEnabled()),
    )
    .action(async (name, commandOrUrl, args, options) => {
      // Commander.js handles -- natively: it consumes -- and everything after becomes args
      const actualCommand = commandOrUrl
      const actualArgs = args

      // If no name is provided, error
      if (!name) {
        cliError(
          '错误: 服务器名称是必需的。\n' +
            '用法: claude mcp add <name> <command> [args...]',
        )
      } else if (!actualCommand) {
        cliError(
          '错误: 当提供服务器名称时, 命令是必需的。\n' +
            '用法: claude mcp add <name> <command> [args...]',
        )
      }

      try {
        const scope = ensureConfigScope(options.scope)
        const transport = ensureTransport(options.transport)

        // XAA fail-fast: validate at add-time, not auth-time.
        if (options.xaa && !isXaaEnabled()) {
          cliError(
            '错误: --xaa 需要在您的环境中设置 CLAUDE_CODE_ENABLE_XAA=1',
          )
        }
        const xaa = Boolean(options.xaa)
        if (xaa) {
          const missing: string[] = []
          if (!options.clientId) missing.push('--client-id')
          if (!options.clientSecret) missing.push('--client-secret')
          if (!getXaaIdpSettings()) {
            missing.push(
              "'claude mcp xaa setup' (settings.xaaIdp 未配置)",
            )
          }
          if (missing.length) {
            cliError(`错误: --xaa 需要: ${missing.join(', ')}`)
          }
        }

        // Check if transport was explicitly provided
        const transportExplicit = options.transport !== undefined

        // Check if the command looks like a URL (likely incorrect usage)
        const looksLikeUrl =
          actualCommand.startsWith('http://') ||
          actualCommand.startsWith('https://') ||
          actualCommand.startsWith('localhost') ||
          actualCommand.endsWith('/sse') ||
          actualCommand.endsWith('/mcp')

        logEvent('tengu_mcp_add', {
          type: transport as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          scope:
            scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          source:
            'command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          transport:
            transport as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          transportExplicit: transportExplicit,
          looksLikeUrl: looksLikeUrl,
        })

        if (transport === 'sse') {
          if (!actualCommand) {
            cliError('错误: URL 是必需的用于 SSE 传输。')
          }

          const headers = options.header
            ? parseHeaders(options.header)
            : undefined

          const callbackPort = options.callbackPort
            ? parseInt(options.callbackPort, 10)
            : undefined
          const oauth =
            options.clientId || callbackPort || xaa
              ? {
                  ...(options.clientId ? { clientId: options.clientId } : {}),
                  ...(callbackPort ? { callbackPort } : {}),
                  ...(xaa ? { xaa: true } : {}),
                }
              : undefined

          const clientSecret =
            options.clientSecret && options.clientId
              ? await readClientSecret()
              : undefined

          const serverConfig = {
            type: 'sse' as const,
            url: actualCommand,
            headers,
            oauth,
          }
          await addMcpConfig(name, serverConfig, scope)

          if (clientSecret) {
            saveMcpClientSecret(name, serverConfig, clientSecret)
          }

          process.stdout.write(
            `添加 SSE MCP 服务器 ${name} 与 URL: ${actualCommand} 到 ${scope} 配置\n`,
          )
          if (headers) {
            process.stdout.write(
              `Headers: ${jsonStringify(headers, null, 2)}\n`,
            )
          }
        } else if (transport === 'http') {
          if (!actualCommand) {
            cliError('错误: URL 是必需的用于 HTTP 传输。')
          }

          const headers = options.header
            ? parseHeaders(options.header)
            : undefined

          const callbackPort = options.callbackPort
            ? parseInt(options.callbackPort, 10)
            : undefined
          const oauth =
            options.clientId || callbackPort || xaa
              ? {
                  ...(options.clientId ? { clientId: options.clientId } : {}),
                  ...(callbackPort ? { callbackPort } : {}),
                  ...(xaa ? { xaa: true } : {}),
                }
              : undefined

          const clientSecret =
            options.clientSecret && options.clientId
              ? await readClientSecret()
              : undefined

          const serverConfig = {
            type: 'http' as const,
            url: actualCommand,
            headers,
            oauth,
          }
          await addMcpConfig(name, serverConfig, scope)

          if (clientSecret) {
            saveMcpClientSecret(name, serverConfig, clientSecret)
          }

          process.stdout.write(
            `添加 HTTP MCP 服务器 ${name} 与 URL: ${actualCommand} 到 ${scope} 配置\n`,
          )
          if (headers) {
            process.stdout.write(
              `Headers: ${jsonStringify(headers, null, 2)}\n`,
            )
          }
        } else {
          if (
            options.clientId ||
            options.clientSecret ||
            options.callbackPort ||
            options.xaa
          ) {
            process.stderr.write(
              `警告: --client-id, --client-secret, --callback-port, and --xaa 仅支持 HTTP/SSE 传输, 并将在 stdio 中被忽略。\n`,
            )
          }

          // Warn if this looks like a URL but transport wasn't explicitly specified
          if (!transportExplicit && looksLikeUrl) {
            process.stderr.write(
              `\n警告: 命令 "${actualCommand}" 看起来像一个 URL, 但被解释为 stdio 服务器, 因为 --transport 未指定。\n`,
            )
            process.stderr.write(
              `如果这是一个 HTTP 服务器, 使用: claude mcp add --transport http ${name} ${actualCommand}\n`,
            )
            process.stderr.write(
              `如果这是一个 SSE 服务器, 使用: claude mcp add --transport sse ${name} ${actualCommand}\n`,
            )
          }

          const env = parseEnvVars(options.env)
          await addMcpConfig(
            name,
            { type: 'stdio', command: actualCommand, args: actualArgs, env },
            scope,
          )

          process.stdout.write(
            `添加 stdio MCP 服务器 ${name} 与命令: ${actualCommand} ${actualArgs.join(' ')} 到 ${scope} 配置\n`,
          )
        }
        cliOk(`文件已修改: ${describeMcpConfigFilePath(scope)}`)
      } catch (error) {
        cliError((error as Error).message)
      }
    })
}
