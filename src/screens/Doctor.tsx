import figures from 'figures'
import { join } from 'path'
import React, {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { KeybindingWarnings } from 'src/components/KeybindingWarnings.js'
import { McpParsingWarnings } from 'src/components/mcp/McpParsingWarnings.js'
import { getModelMaxOutputTokens } from 'src/utils/context.js'
import { getClaudeConfigHomeDir } from 'src/utils/envUtils.js'
import type { SettingSource } from 'src/utils/settings/constants.js'
import { getOriginalCwd } from '../bootstrap/state.js'
import type { CommandResultDisplay } from '../commands.js'
import { Pane } from '@anthropic/ink'
import { PressEnterToContinue } from '../components/PressEnterToContinue.js'
import { SandboxDoctorSection } from '../components/sandbox/SandboxDoctorSection.js'
import { ValidationErrorsList } from '../components/ValidationErrorsList.js'
import { useSettingsErrors } from '../hooks/notifs/useSettingsErrors.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState } from '../state/AppState.js'
import { getPluginErrorMessage } from '../types/plugin.js'
import {
  getGcsDistTags,
  getNpmDistTags,
  type NpmDistTags,
} from '../utils/autoUpdater.js'
import {
  type ContextWarnings,
  checkContextWarnings,
} from '../utils/doctorContextWarnings.js'
import {
  type DiagnosticInfo,
  getDoctorDiagnostic,
} from '../utils/doctorDiagnostic.js'
import { validateBoundedIntEnvVar } from '../utils/envValidation.js'
import { pathExists } from '../utils/file.js'
import {
  cleanupStaleLocks,
  getAllLockInfo,
  isPidBasedLockingEnabled,
  type LockInfo,
} from '../utils/nativeInstaller/pidLock.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import {
  BASH_MAX_OUTPUT_DEFAULT,
  BASH_MAX_OUTPUT_UPPER_LIMIT,
} from '../utils/shell/outputLimits.js'
import {
  TASK_MAX_OUTPUT_DEFAULT,
  TASK_MAX_OUTPUT_UPPER_LIMIT,
} from '../utils/task/outputFormatting.js'
import { getXDGStateHome } from '../utils/xdg.js'

type Props = {
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type AgentInfo = {
  activeAgents: Array<{
    agentType: string
    source: SettingSource | 'built-in' | 'plugin'
  }>
  userAgentsDir: string
  projectAgentsDir: string
  userDirExists: boolean
  projectDirExists: boolean
  failedFiles?: Array<{ path: string; error: string }>
}

type VersionLockInfo = {
  enabled: boolean
  locks: LockInfo[]
  locksDir: string
  staleLocksCleaned: number
}

function DistTagsDisplay({
  promise,
}: {
  promise: Promise<NpmDistTags>
}): React.ReactNode {
  const distTags = use(promise)
  if (!distTags.latest) {
    return <Text dimColor>└ 无法获取版本信息</Text>
  }
  return (
    <>
      {distTags.stable && <Text>└ 稳定版本: {distTags.stable}</Text>}
      <Text>└ 最新版本: {distTags.latest}</Text>
    </>
  )
}

export function Doctor({ onDone }: Props): React.ReactNode {
  const agentDefinitions = useAppState(s => s.agentDefinitions)
  const mcpTools = useAppState(s => s.mcp.tools)
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)
  const pluginsErrors = useAppState(s => s.plugins.errors)
  useExitOnCtrlCDWithKeybindings()

  const tools = useMemo(() => {
    return mcpTools || []
  }, [mcpTools])

  const [diagnostic, setDiagnostic] = useState<DiagnosticInfo | null>(null)
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null)
  const [contextWarnings, setContextWarnings] =
    useState<ContextWarnings | null>(null)
  const [versionLockInfo, setVersionLockInfo] =
    useState<VersionLockInfo | null>(null)
  const validationErrors = useSettingsErrors()

  // Create promise once for dist-tags fetch (depends on diagnostic)
  const distTagsPromise = useMemo(
    () =>
      getDoctorDiagnostic().then(diag => {
        const fetchDistTags =
          diag.installationType === 'native' ? getGcsDistTags : getNpmDistTags
        return fetchDistTags().catch(() => ({ latest: null, stable: null }))
      }),
    [],
  )
  const autoUpdatesChannel =
    getInitialSettings()?.autoUpdatesChannel ?? 'latest'

  const errorsExcludingMcp = validationErrors.filter(
    error => error.mcpErrorMetadata === undefined,
  )

  const envValidationErrors = useMemo(() => {
    const envVars = [
      {
        name: 'BASH_MAX_OUTPUT_LENGTH',
        default: BASH_MAX_OUTPUT_DEFAULT,
        upperLimit: BASH_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'TASK_MAX_OUTPUT_LENGTH',
        default: TASK_MAX_OUTPUT_DEFAULT,
        upperLimit: TASK_MAX_OUTPUT_UPPER_LIMIT,
      },
      {
        name: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        // Check for values against the latest supported model
        ...getModelMaxOutputTokens('claude-opus-4-6'),
      },
    ]
    return envVars
      .map(v => {
        const value = process.env[v.name]
        const result = validateBoundedIntEnvVar(
          v.name,
          value,
          v.default,
          v.upperLimit,
        )
        return { name: v.name, ...result }
      })
      .filter(v => v.status !== 'valid')
  }, [])

  useEffect(() => {
    void getDoctorDiagnostic().then(setDiagnostic)

    void (async () => {
      const userAgentsDir = join(getClaudeConfigHomeDir(), 'agents')
      const projectAgentsDir = join(getOriginalCwd(), '.claude', 'agents')

      const { activeAgents, allAgents, failedFiles } = agentDefinitions

      const [userDirExists, projectDirExists] = await Promise.all([
        pathExists(userAgentsDir),
        pathExists(projectAgentsDir),
      ])

      const agentInfoData = {
        activeAgents: activeAgents.map(a => ({
          agentType: a.agentType,
          source: a.source,
        })),
        userAgentsDir,
        projectAgentsDir,
        userDirExists,
        projectDirExists,
        failedFiles,
      }
      setAgentInfo(agentInfoData)

      const warnings = await checkContextWarnings(
        tools,
        {
          activeAgents,
          allAgents,
          failedFiles,
        },
        async () => toolPermissionContext,
      )
      setContextWarnings(warnings)

      // Fetch version lock info if PID-based locking is enabled
      if (isPidBasedLockingEnabled()) {
        const locksDir = join(getXDGStateHome(), 'claude', 'locks')
        const staleLocksCleaned = cleanupStaleLocks(locksDir)
        const locks = getAllLockInfo(locksDir)
        setVersionLockInfo({
          enabled: true,
          locks,
          locksDir,
          staleLocksCleaned,
        })
      } else {
        setVersionLockInfo({
          enabled: false,
          locks: [],
          locksDir: '',
          staleLocksCleaned: 0,
        })
      }
    })()
  }, [toolPermissionContext, tools, agentDefinitions])

  const handleDismiss = useCallback(() => {
    onDone('Claude Code 诊断已关闭', { display: 'system' })
  }, [onDone])

  // Handle dismiss via keybindings (Enter, Escape, or Ctrl+C)
  useKeybindings(
    {
      'confirm:yes': handleDismiss,
      'confirm:no': handleDismiss,
    },
    { context: 'Confirmation' },
  )

  // Loading state
  if (!diagnostic) {
    return (
      <Pane>
        <Text dimColor>正在检查安装状态…</Text>
      </Pane>
    )
  }

  // Format the diagnostic output according to spec
  return (
    <Pane>
      <Box flexDirection="column">
        <Text bold>诊断信息</Text>
        <Text>
          └ 当前运行版本: {diagnostic.installationType} (
          {diagnostic.version})
        </Text>
        {diagnostic.packageManager && (
          <Text>└ 包管理器: {diagnostic.packageManager}</Text>
        )}
        <Text>└ 安装路径: {diagnostic.installationPath}</Text>
        <Text>└ 调用命令: {diagnostic.invokedBinary}</Text>
        <Text>└ 配置安装方式: {diagnostic.configInstallMethod}</Text>
        <Text>
          └ 搜索功能: {diagnostic.ripgrepStatus.working ? '正常' : '异常'} (
          {diagnostic.ripgrepStatus.mode === 'embedded'
            ? '内置'
            : diagnostic.ripgrepStatus.mode === 'builtin'
              ? '系统'
              : diagnostic.ripgrepStatus.systemPath || 'system'}
          )
        </Text>

        {/* Show recommendation if auto-updates are disabled */}
        {diagnostic.recommendation && (
          <>
            <Text></Text>
            <Text color="warning">
              建议: {diagnostic.recommendation.split('\n')[0]}
            </Text>
            <Text dimColor>{diagnostic.recommendation.split('\n')[1]}</Text>
          </>
        )}

        {/* Show multiple installations warning */}
        {diagnostic.multipleInstallations.length > 1 && (
          <>
            <Text></Text>
            <Text color="warning">警告: 检测到多个安装版本</Text>
            {diagnostic.multipleInstallations.map((install, i) => (
              <Text key={i}>
                └ {install.type} 位于 {install.path}
              </Text>
            ))}
          </>
        )}

        {/* Show configuration warnings */}
        {diagnostic.warnings.length > 0 && (
          <>
            <Text></Text>
            {diagnostic.warnings.map((warning, i) => (
              <Box key={i} flexDirection="column">
                <Text color="warning">警告: {warning.issue}</Text>
                <Text>修复: {warning.fix}</Text>
              </Box>
            ))}
          </>
        )}

        {/* Show invalid settings errors */}
        {errorsExcludingMcp.length > 0 && (
          <Box flexDirection="column" marginTop={1} marginBottom={1}>
            <Text bold>无效的设置</Text>
            <ValidationErrorsList errors={errorsExcludingMcp} />
          </Box>
        )}
      </Box>

      {/* Updates section */}
      <Box flexDirection="column">
        <Text bold>更新</Text>
        <Text>
          └ 自动更新:{' '}
          {diagnostic.packageManager
            ? '由包管理器管理'
            : diagnostic.autoUpdates}
        </Text>
        {diagnostic.hasUpdatePermissions !== null && (
          <Text>
            └ 更新权限:{' '}
            {diagnostic.hasUpdatePermissions ? '有' : '无 (需要 sudo)'}
          </Text>
        )}
        <Text>└ 自动更新频道: {autoUpdatesChannel}</Text>
        <Suspense fallback={null}>
          <DistTagsDisplay promise={distTagsPromise} />
        </Suspense>
      </Box>

      <SandboxDoctorSection />

      <McpParsingWarnings />

      <KeybindingWarnings />

      {/* Environment Variables */}
      {envValidationErrors.length > 0 && (
        <Box flexDirection="column">
          <Text bold>环境变量</Text>
          {envValidationErrors.map((validation, i) => (
            <Text key={i}>
              └ {validation.name}:{' '}
              <Text
                color={validation.status === 'capped' ? 'warning' : 'error'}
              >
                {validation.message}
              </Text>
            </Text>
          ))}
        </Box>
      )}

      {/* Version Locks (PID-based locking) */}
      {versionLockInfo?.enabled && (
        <Box flexDirection="column">
          <Text bold>版本锁</Text>
          {versionLockInfo.staleLocksCleaned > 0 && (
            <Text dimColor>
              └ 已清理 {versionLockInfo.staleLocksCleaned} 个过期锁
            </Text>
          )}
          {versionLockInfo.locks.length === 0 ? (
            <Text dimColor>└ 无活跃版本锁</Text>
          ) : (
            versionLockInfo.locks.map((lock, i) => (
              <Text key={i}>
                └ {lock.version}: PID {lock.pid}{' '}
                {lock.isProcessRunning ? (
                  <Text>(运行中)</Text>
                ) : (
                  <Text color="warning">(已过期)</Text>
                )}
              </Text>
            ))
          )}
        </Box>
      )}

      {agentInfo?.failedFiles && agentInfo.failedFiles.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="error">
            Agent 解析错误
          </Text>
          <Text color="error">
            └ 解析失败 {agentInfo.failedFiles.length} 个 agent 文件:
          </Text>
          {agentInfo.failedFiles.map((file, i) => (
            <Text key={i} dimColor>
              {'  '}└ {file.path}: {file.error}
            </Text>
          ))}
        </Box>
      )}

      {/* Plugin Errors */}
      {pluginsErrors.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="error">
            插件错误
          </Text>
          <Text color="error">
            └ 检测到 {pluginsErrors.length} 个插件错误:
          </Text>
          {pluginsErrors.map((error, i) => (
            <Text key={i} dimColor>
              {'  '}└ {error.source || '未知'}
              {'plugin' in error && error.plugin ? ` [${error.plugin}]` : ''}:{' '}
              {getPluginErrorMessage(error)}
            </Text>
          ))}
        </Box>
      )}

      {/* Unreachable Permission Rules Warning */}
      {contextWarnings?.unreachableRulesWarning && (
        <Box flexDirection="column">
          <Text bold color="warning">
            无法到达的权限规则
          </Text>
          <Text>
            └{' '}
            <Text color="warning">
              {figures.warning}{' '}
              {contextWarnings.unreachableRulesWarning.message}
            </Text>
          </Text>
          {contextWarnings.unreachableRulesWarning.details.map((detail, i) => (
            <Text key={i} dimColor>
              {'  '}└ {detail}
            </Text>
          ))}
        </Box>
      )}

      {/* Context Usage Warnings */}
      {contextWarnings &&
        (contextWarnings.claudeMdWarning ||
          contextWarnings.agentWarning ||
          contextWarnings.mcpWarning) && (
          <Box flexDirection="column">
            <Text bold>上下文使用警告</Text>

            {contextWarnings.claudeMdWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.claudeMdWarning.message}
                  </Text>
                </Text>
                <Text>{'  '}└ 文件:</Text>
                {contextWarnings.claudeMdWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}

            {contextWarnings.agentWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.agentWarning.message}
                  </Text>
                </Text>
                <Text>{'  '}└ 主要贡献者:</Text>
                {contextWarnings.agentWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}

            {contextWarnings.mcpWarning && (
              <>
                <Text>
                  └{' '}
                  <Text color="warning">
                    {figures.warning} {contextWarnings.mcpWarning.message}
                  </Text>
                </Text>
                <Text>{'  '}└ MCP 服务器:</Text>
                {contextWarnings.mcpWarning.details.map((detail, i) => (
                  <Text key={i} dimColor>
                    {'    '}└ {detail}
                  </Text>
                ))}
              </>
            )}
          </Box>
        )}

      <Box>
        <PressEnterToContinue />
      </Box>
    </Pane>
  )
}
