import chalk from 'chalk'
import * as path from 'path'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import type {
  CommandResultDisplay,
  LocalJSXCommandContext,
} from '../../commands.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '@anthropic/ink'
import {
  IdeAutoConnectDialog,
  IdeDisableAutoConnectDialog,
  shouldShowAutoConnectDialog,
  shouldShowDisableAutoConnectDialog,
} from '../../components/IdeAutoConnectDialog.js'
import { Box, Text } from '@anthropic/ink'
import { clearServerCache } from '../../services/mcp/client.js'
import type { ScopedMcpServerConfig } from '../../services/mcp/types.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import { getCwd } from '../../utils/cwd.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import {
  type DetectedIDEInfo,
  detectIDEs,
  detectRunningIDEs,
  type IdeType,
  isJetBrainsIde,
  isSupportedJetBrainsTerminal,
  isSupportedTerminal,
  toIDEDisplayName,
} from '../../utils/ide.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'

type IDEScreenProps = {
  availableIDEs: DetectedIDEInfo[]
  unavailableIDEs: DetectedIDEInfo[]
  selectedIDE?: DetectedIDEInfo | null
  onClose: () => void
  onSelect: (ide?: DetectedIDEInfo) => void
}

function IDEScreen({
  availableIDEs,
  unavailableIDEs,
  selectedIDE,
  onClose,
  onSelect,
}: IDEScreenProps): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(
    selectedIDE?.port?.toString() ?? 'None',
  )
  const [showAutoConnectDialog, setShowAutoConnectDialog] = useState(false)
  const [showDisableAutoConnectDialog, setShowDisableAutoConnectDialog] =
    useState(false)

  const handleSelectIDE = useCallback(
    (value: string) => {
      if (value !== 'None' && shouldShowAutoConnectDialog()) {
        setShowAutoConnectDialog(true)
      } else if (value === 'None' && shouldShowDisableAutoConnectDialog()) {
        setShowDisableAutoConnectDialog(true)
      } else {
        onSelect(availableIDEs.find(ide => ide.port === parseInt(value)))
      }
    },
    [availableIDEs, onSelect],
  )

  const ideCounts = availableIDEs.reduce<Record<string, number>>((acc, ide) => {
    acc[ide.name] = (acc[ide.name] || 0) + 1
    return acc
  }, {})

  const options = availableIDEs
    .map(ide => {
      const hasMultipleInstances = (ideCounts[ide.name] || 0) > 1
      const showWorkspace =
        hasMultipleInstances && ide.workspaceFolders.length > 0

      return {
        label: ide.name,
        value: ide.port.toString(),
        description: showWorkspace
          ? formatWorkspaceFolders(ide.workspaceFolders)
          : undefined,
      }
    })
    .concat([{ label: 'None', value: 'None', description: undefined }])

  if (showAutoConnectDialog) {
    return (
      <IdeAutoConnectDialog onComplete={() => handleSelectIDE(selectedValue)} />
    )
  }

  if (showDisableAutoConnectDialog) {
    return (
      <IdeDisableAutoConnectDialog
        onComplete={() => {
          // Always disconnect when user selects "None", regardless of their
          // choice about disabling auto-connect
          onSelect(undefined)
        }}
      />
    )
  }

  return (
    <Dialog
      title="选择 IDE"
      subtitle="连接到 IDE 以获得集成开发功能。"
      onCancel={onClose}
      color="ide"
    >
      <Box flexDirection="column">
        {availableIDEs.length === 0 && (
          <Text dimColor>
            {isSupportedJetBrainsTerminal()
              ? '未检测到可用 IDE。请安装插件并重新启动你的 IDE:\n' +
                'https://docs.claude.com/s/claude-code-jetbrains'
              : '未检测到可用 IDE。请确保你的 IDE 已安装 Claude Code 扩展或插件并正在运行。'}
          </Text>
        )}

        {availableIDEs.length !== 0 && (
          <Select
            defaultValue={selectedValue}
            defaultFocusValue={selectedValue}
            options={options}
            onChange={value => {
              setSelectedValue(value)
              handleSelectIDE(value)
            }}
          />
        )}
        {availableIDEs.length !== 0 &&
          availableIDEs.some(
            ide => ide.name === 'VS Code' || ide.name === 'Visual Studio Code',
          ) && (
            <Box marginTop={1}>
              <Text color="warning">
                注意：每次只能将一个 Claude Code 实例连接到 VS Code
                一次。
              </Text>
            </Box>
          )}
        {availableIDEs.length !== 0 && !isSupportedTerminal() && (
          <Box marginTop={1}>
            <Text dimColor>
              Tip: 你可以在 /config 中启用自动连接到 IDE 或使用 --ide 标志
            </Text>
          </Box>
        )}

        {unavailableIDEs.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              找到 {unavailableIDEs.length} 个其他正在运行的 IDE。然而，
              它们的工作区/项目目录与当前工作目录不匹配。可以手动连接到这些 IDE。
            </Text>
            <Box marginTop={1} flexDirection="column">
              {unavailableIDEs.map((ide, index) => (
                <Box key={index} paddingLeft={3}>
                  <Text dimColor>
                    • {ide.name}: {formatWorkspaceFolders(ide.workspaceFolders)}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Dialog>
  )
}

async function findCurrentIDE(
  availableIDEs: DetectedIDEInfo[],
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>,
): Promise<DetectedIDEInfo | null> {
  const currentConfig = dynamicMcpConfig?.ide
  if (
    !currentConfig ||
    (currentConfig.type !== 'sse-ide' && currentConfig.type !== 'ws-ide')
  ) {
    return null
  }
  for (const ide of availableIDEs) {
    if (ide.url === currentConfig.url) {
      return ide
    }
  }
  return null
}

type IDEOpenSelectionProps = {
  availableIDEs: DetectedIDEInfo[]
  onSelectIDE: (ide?: DetectedIDEInfo) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

function IDEOpenSelection({
  availableIDEs,
  onSelectIDE,
  onDone,
}: IDEOpenSelectionProps): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(
    availableIDEs[0]?.port?.toString() ?? '',
  )

  const handleSelectIDE = useCallback(
    (value: string) => {
      const selectedIDE = availableIDEs.find(
        ide => ide.port === parseInt(value),
      )
      onSelectIDE(selectedIDE)
    },
    [availableIDEs, onSelectIDE],
  )

  const options = availableIDEs.map(ide => ({
    label: ide.name,
    value: ide.port.toString(),
  }))

  function handleCancel(): void {
    onDone('IDE 选择已取消', { display: 'system' })
  }

  return (
    <Dialog
      title="选择一个 IDE 来打开项目"
      onCancel={handleCancel}
      color="ide"
    >
      <Select
        defaultValue={selectedValue}
        defaultFocusValue={selectedValue}
        options={options}
        onChange={value => {
          setSelectedValue(value)
          handleSelectIDE(value)
        }}
      />
    </Dialog>
  )
}

function RunningIDESelector({
  runningIDEs,
  onSelectIDE,
  onDone,
}: {
  runningIDEs: IdeType[]
  onSelectIDE: (ide: IdeType) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}): React.ReactNode {
  const [selectedValue, setSelectedValue] = useState(runningIDEs[0] ?? '')

  const handleSelectIDE = useCallback(
    (value: string) => {
      onSelectIDE(value as IdeType)
    },
    [onSelectIDE],
  )

  const options = runningIDEs.map(ide => ({
    label: toIDEDisplayName(ide),
    value: ide,
  }))

  function handleCancel(): void {
    onDone('IDE 选择已取消', { display: 'system' })
  }

  return (
    <Dialog
      title="选择一个 IDE 来安装扩展"
      onCancel={handleCancel}
      color="ide"
    >
      <Select
        defaultFocusValue={selectedValue}
        options={options}
        onChange={value => {
          setSelectedValue(value)
          handleSelectIDE(value)
        }}
      />
    </Dialog>
  )
}

function InstallOnMount({
  ide,
  onInstall,
}: {
  ide: IdeType
  onInstall: (ide: IdeType) => void
}): React.ReactNode {
  useEffect(() => {
    onInstall(ide)
  }, [ide, onInstall])
  return null
}

export async function call(
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void,
  context: LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null> {
  logEvent('tengu_ext_ide_command', {})
  const {
    options: { dynamicMcpConfig },
    onChangeDynamicMcpConfig,
  } = context

  // Handle 'open' argument
  if (args?.trim() === 'open') {
    const worktreeSession = getCurrentWorktreeSession()
    const targetPath = worktreeSession ? worktreeSession.worktreePath : getCwd()

    // Detect available IDEs
    const detectedIDEs = await detectIDEs(true)
    const availableIDEs = detectedIDEs.filter(ide => ide.isValid)

    if (availableIDEs.length === 0) {
      onDone('未检测到带有 Claude Code 扩展的 IDE。')
      return null
    }

    // Return IDE selection component
    return (
      <IDEOpenSelection
        availableIDEs={availableIDEs}
        onSelectIDE={async (selectedIDE?: DetectedIDEInfo) => {
          if (!selectedIDE) {
            onDone('未选择 IDE。')
            return
          }

          // Try to open the project in the selected IDE
          if (
            selectedIDE.name.toLowerCase().includes('vscode') ||
            selectedIDE.name.toLowerCase().includes('cursor') ||
            selectedIDE.name.toLowerCase().includes('windsurf')
          ) {
            // VS Code-based IDEs
            const { code } = await execFileNoThrow('code', [targetPath])
            if (code === 0) {
              onDone(
                `已打开 ${worktreeSession ? '工作树' : '项目'} 到 ${chalk.bold(selectedIDE.name)}`,
              )
            } else {
              onDone(
                `打开失败到 ${selectedIDE.name}。请手动打开: ${targetPath}`,
              )
            }
          } else if (isSupportedJetBrainsTerminal()) {
            // JetBrains IDEs - they usually open via their CLI tools
            onDone(
              `请手动打开 ${worktreeSession ? '工作树' : '项目'} 到 ${chalk.bold(selectedIDE.name)}: ${targetPath}`,
            )
          } else {
            onDone(
              `请手动打开 ${worktreeSession ? '工作树' : '项目'} 到 ${chalk.bold(selectedIDE.name)}: ${targetPath}`,
            )
          }
        }}
        onDone={() => {
          onDone('退出时未打开 IDE', { display: 'system' })
        }}
      />
    )
  }

  const detectedIDEs = await detectIDEs(true)

  // If no IDEs with extensions detected, check for running IDEs and offer to install
  if (
    detectedIDEs.length === 0 &&
    context.onInstallIDEExtension &&
    !isSupportedTerminal()
  ) {
    const runningIDEs = await detectRunningIDEs()

    const onInstall = (ide: IdeType) => {
      if (context.onInstallIDEExtension) {
        context.onInstallIDEExtension(ide)
        // The completion message will be shown after installation
        if (isJetBrainsIde(ide)) {
          onDone(
            `已安装插件到 ${chalk.bold(toIDEDisplayName(ide))}\n` +
              `请 ${chalk.bold('重新启动你的 IDE')} 完全生效`,
          )
        } else {
          onDone(`已安装扩展到 ${chalk.bold(toIDEDisplayName(ide))}`)
        }
      }
    }

    if (runningIDEs.length > 1) {
      // Show selector when multiple IDEs are running
      return (
        <RunningIDESelector
          runningIDEs={runningIDEs}
          onSelectIDE={onInstall}
          onDone={() => {
            onDone('未选择 IDE。', { display: 'system' })
          }}
        />
      )
    } else if (runningIDEs.length === 1) {
      return <InstallOnMount ide={runningIDEs[0]!} onInstall={onInstall} />
    }
  }

  const availableIDEs = detectedIDEs.filter(ide => ide.isValid)
  const unavailableIDEs = detectedIDEs.filter(ide => !ide.isValid)

  const currentIDE = await findCurrentIDE(availableIDEs, dynamicMcpConfig)

  return (
    <IDECommandFlow
      availableIDEs={availableIDEs}
      unavailableIDEs={unavailableIDEs}
      currentIDE={currentIDE}
      dynamicMcpConfig={dynamicMcpConfig}
      onChangeDynamicMcpConfig={onChangeDynamicMcpConfig}
      onDone={onDone}
    />
  )
}

// Connection timeout slightly longer than the 30s MCP connection timeout
const IDE_CONNECTION_TIMEOUT_MS = 35000

type IDECommandFlowProps = {
  availableIDEs: DetectedIDEInfo[]
  unavailableIDEs: DetectedIDEInfo[]
  currentIDE: DetectedIDEInfo | null
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  onChangeDynamicMcpConfig?: (
    config: Record<string, ScopedMcpServerConfig>,
  ) => void
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

function IDECommandFlow({
  availableIDEs,
  unavailableIDEs,
  currentIDE,
  dynamicMcpConfig,
  onChangeDynamicMcpConfig,
  onDone,
}: IDECommandFlowProps): React.ReactNode {
  const [connectingIDE, setConnectingIDE] = useState<DetectedIDEInfo | null>(
    null,
  )
  const ideClient = useAppState(s => s.mcp.clients.find(c => c.name === 'ide'))
  const setAppState = useSetAppState()
  const isFirstCheckRef = useRef(true)

  // Watch for connection result
  useEffect(() => {
    if (!connectingIDE) return
    // Skip the first check — it reflects stale state from before the
    // config change was dispatched
    if (isFirstCheckRef.current) {
      isFirstCheckRef.current = false
      return
    }
    if (!ideClient || ideClient.type === 'pending') return
    if (ideClient.type === 'connected') {
      onDone(`已连接到 ${connectingIDE.name}。`)
    } else if (ideClient.type === 'failed') {
      onDone(`连接到 ${connectingIDE.name} 失败。`)
    }
  }, [ideClient, connectingIDE, onDone])

  // Timeout fallback
  useEffect(() => {
    if (!connectingIDE) return
    const timer = setTimeout(
      onDone,
      IDE_CONNECTION_TIMEOUT_MS,
      `连接到 ${connectingIDE.name} 超时。`,
    )
    return () => clearTimeout(timer)
  }, [connectingIDE, onDone])

  const handleSelectIDE = useCallback(
    (selectedIDE?: DetectedIDEInfo) => {
      if (!onChangeDynamicMcpConfig) {
        onDone('连接到 IDE 失败。')
        return
      }
      const newConfig = { ...(dynamicMcpConfig || {}) }
      if (currentIDE) {
        delete newConfig.ide
      }
      if (!selectedIDE) {
        // Close the MCP transport and remove the client from state
        if (ideClient && ideClient.type === 'connected' && currentIDE) {
          // Null out onclose to prevent auto-reconnection
          ideClient.client.onclose = () => {}
          void clearServerCache('ide', ideClient.config)
          setAppState(prev => ({
            ...prev,
            mcp: {
              ...prev.mcp,
              clients: prev.mcp.clients.filter(c => c.name !== 'ide'),
              tools: prev.mcp.tools.filter(
                t => !t.name?.startsWith('mcp__ide__'),
              ),
              commands: prev.mcp.commands.filter(
                c => !c.name?.startsWith('mcp__ide__'),
              ),
            },
          }))
        }
        onChangeDynamicMcpConfig(newConfig)
        onDone(
          currentIDE
            ? `已断开与 ${currentIDE.name} 的连接。`
            : '未选择 IDE。',
        )
        return
      }
      const url = selectedIDE.url
      newConfig.ide = {
        type: url.startsWith('ws:') ? 'ws-ide' : 'sse-ide',
        url: url,
        ideName: selectedIDE.name,
        authToken: selectedIDE.authToken,
        ideRunningInWindows: selectedIDE.ideRunningInWindows,
        scope: 'dynamic' as const,
      } as ScopedMcpServerConfig
      isFirstCheckRef.current = true
      setConnectingIDE(selectedIDE)
      onChangeDynamicMcpConfig(newConfig)
    },
    [
      dynamicMcpConfig,
      currentIDE,
      ideClient,
      setAppState,
      onChangeDynamicMcpConfig,
      onDone,
    ],
  )

  if (connectingIDE) {
    return <Text dimColor>正在连接到 {connectingIDE.name}…</Text>
  }

  return (
    <IDEScreen
      availableIDEs={availableIDEs}
      unavailableIDEs={unavailableIDEs}
      selectedIDE={currentIDE}
      onClose={() => onDone('IDE 选择已取消', { display: 'system' })}
      onSelect={handleSelectIDE}
    />
  )
}

/**
 * Formats workspace folders for display, stripping cwd and showing tail end of paths
 * @param folders Array of folder paths
 * @param maxLength Maximum total length of the formatted string
 * @returns Formatted string with folder paths
 */
export function formatWorkspaceFolders(
  folders: string[],
  maxLength: number = 100,
): string {
  if (folders.length === 0) return ''

  const cwd = getCwd()

  // Only show first 2 workspaces
  const foldersToShow = folders.slice(0, 2)
  const hasMore = folders.length > 2

  // Account for ", …" if there are more folders
  const ellipsisOverhead = hasMore ? 3 : 0 // ", …"

  // Account for commas and spaces between paths (", " = 2 chars per separator)
  const separatorOverhead = (foldersToShow.length - 1) * 2
  const availableLength = maxLength - separatorOverhead - ellipsisOverhead

  const maxLengthPerPath = Math.floor(availableLength / foldersToShow.length)

  const cwdNFC = cwd.normalize('NFC')
  const formattedFolders = foldersToShow.map(folder => {
    // Strip cwd from the beginning if present
    // Normalize both to NFC for consistent comparison (macOS uses NFD paths)
    const folderNFC = folder.normalize('NFC')
    if (folderNFC.startsWith(cwdNFC + path.sep)) {
      folder = folderNFC.slice(cwdNFC.length + 1)
    }

    if (folder.length <= maxLengthPerPath) {
      return folder
    }
    return '…' + folder.slice(-(maxLengthPerPath - 1))
  })

  let result = formattedFolders.join(', ')
  if (hasMore) {
    result += ', …'
  }

  return result
}
