import chalk from 'chalk'
import figures from 'figures'
import React, { useEffect } from 'react'
import {
  getAdditionalDirectoriesForClaudeMd,
  setAdditionalDirectoriesForClaudeMd,
} from '../../bootstrap/state.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { MessageResponse } from '../../components/MessageResponse.js'
import { AddWorkspaceDirectory } from '../../components/permissions/rules/AddWorkspaceDirectory.js'
import { Box, Text } from '@anthropic/ink'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  applyPermissionUpdate,
  persistPermissionUpdate,
} from '../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdateDestination } from '../../utils/permissions/PermissionUpdateSchema.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import {
  addDirHelpMessage,
  validateDirectoryForWorkspace,
} from './validation.js'

function AddDirError({
  message,
  args,
  onDone,
}: {
  message: string
  args: string
  onDone: () => void
}): React.ReactNode {
  useEffect(() => {
    // We need to defer calling onDone to avoid the "return null" bug where
    // the component unmounts before React can render the error message.
    // Using setTimeout ensures the error displays before the command exits.
    const timer = setTimeout(onDone, 0)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <Box flexDirection="column">
      <Text dimColor>
        {figures.pointer} /add-dir {args}
      </Text>
      <MessageResponse>
        <Text>{message}</Text>
      </MessageResponse>
    </Box>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const directoryPath = (args ?? '').trim()
  const appState = context.getAppState()

  // Helper to handle adding a directory (shared by both with-path and no-path cases)
  const handleAddDirectory = async (path: string, remember = false) => {
    const destination: PermissionUpdateDestination = remember
      ? 'localSettings'
      : 'session'

    const permissionUpdate = {
      type: 'addDirectories' as const,
      directories: [path],
      destination,
    }

    // Apply to session context
    const latestAppState = context.getAppState()
    const updatedContext = applyPermissionUpdate(
      latestAppState.toolPermissionContext,
      permissionUpdate,
    )
    context.setAppState(prev => ({
      ...prev,
      toolPermissionContext: updatedContext,
    }))

    // Update sandbox config so Bash commands can access the new directory.
    // Bootstrap state is the source of truth for session-only dirs; persisted
    // dirs are picked up via the settings subscription, but we refresh
    // eagerly here to avoid a race when the user acts immediately.
    const currentDirs = getAdditionalDirectoriesForClaudeMd()
    if (!currentDirs.includes(path)) {
      setAdditionalDirectoriesForClaudeMd([...currentDirs, path])
    }
    SandboxManager.refreshConfig()

    let message: string

    if (remember) {
      try {
        persistPermissionUpdate(permissionUpdate)
        message = `已将 ${chalk.bold(path)} 添加为工作目录并保存到本地设置`
      } catch (error) {
        message = `已将 ${chalk.bold(path)} 添加为工作目录。保存到本地设置失败：${error instanceof Error ? error.message : '未知错误'}`
      }
    } else {
      message = `已将 ${chalk.bold(path)} 添加为当前会话的工作目录`
    }

    const messageWithHint = `${message} ${chalk.dim('· /permissions 管理')}`
    onDone(messageWithHint)
  }

  // When no path is provided, show AddWorkspaceDirectory input form directly
  // and return to REPL after confirmation
  if (!directoryPath) {
    return (
      <AddWorkspaceDirectory
        permissionContext={appState.toolPermissionContext}
        onAddDirectory={handleAddDirectory}
        onCancel={() => {
          onDone('未添加工作目录。')
        }}
      />
    )
  }

  const result = await validateDirectoryForWorkspace(
    directoryPath,
    appState.toolPermissionContext,
  )

  if (result.resultType !== 'success') {
    const message = addDirHelpMessage(result)

    return (
      <AddDirError
        message={message}
        args={args ?? ''}
        onDone={() => onDone(message)}
      />
    )
  }

  return (
    <AddWorkspaceDirectory
      directoryPath={result.absolutePath}
      permissionContext={appState.toolPermissionContext}
      onAddDirectory={handleAddDirectory}
        onCancel={() => {
          onDone(
            `未将 ${chalk.bold(result.absolutePath)} 添加为工作目录。`,
          )
        }}
    />
  )
}
