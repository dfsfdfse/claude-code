import React, { useCallback, useEffect, useState } from 'react'
import { gracefulShutdown } from 'src/utils/gracefulShutdown.js'
import { writeToStdout } from 'src/utils/process.js'
import { Box, color, Text, useTheme, Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink'
import { addMcpConfig, getAllMcpConfigs } from '../services/mcp/config.js'
import type {
  ConfigScope,
  McpServerConfig,
  ScopedMcpServerConfig,
} from '../services/mcp/types.js'
import { plural } from '../utils/stringUtils.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { SelectMulti } from './CustomSelect/SelectMulti.js'

type Props = {
  servers: Record<string, McpServerConfig>
  scope: ConfigScope
  onDone(): void
}

export function MCPServerDesktopImportDialog({
  servers,
  scope,
  onDone,
}: Props): React.ReactNode {
  const serverNames = Object.keys(servers)
  const [existingServers, setExistingServers] = useState<
    Record<string, ScopedMcpServerConfig>
  >({})

  useEffect(() => {
    void getAllMcpConfigs().then(({ servers }) => setExistingServers(servers))
  }, [])

  const collisions = serverNames.filter(
    name => existingServers[name] !== undefined,
  )

  async function onSubmit(selectedServers: string[]) {
    let importedCount = 0

    for (const serverName of selectedServers) {
      const serverConfig = servers[serverName]
      if (serverConfig) {
        // If the server name already exists, find a new name with _1, _2, etc.
        let finalName = serverName
        if (existingServers[finalName] !== undefined) {
          let counter = 1
          while (existingServers[`${serverName}_${counter}`] !== undefined) {
            counter++
          }
          finalName = `${serverName}_${counter}`
        }

        await addMcpConfig(finalName, serverConfig, scope)
        importedCount++
      }
    }

    done(importedCount)
  }

  const [theme] = useTheme()

  // Define done before using in useCallback
  const done = useCallback(
    (importedCount: number) => {
      if (importedCount > 0) {
        writeToStdout(
          `\n${color('success', theme)(`成功导入 ${importedCount} 个 MCP ${plural(importedCount, 'server')} 到 ${scope} 配置。`)}\n`,
        )
      } else {
        writeToStdout('\n未导入任何服务器。')
      }
      onDone()

      void gracefulShutdown()
    },
    [theme, scope, onDone],
  )

  // Handle ESC to cancel (import 0 servers)
  const handleEscCancel = useCallback(() => {
    done(0)
  }, [done])

  return (
    <>
      <Dialog
        title="从 Claude Desktop 导入 MCP 服务器"
        subtitle={`在 Claude Desktop 中找到 ${serverNames.length} 个 MCP ${plural(serverNames.length, 'server')}。`}
        color="success"
        onCancel={handleEscCancel}
        hideInputGuide
      >
        {collisions.length > 0 && (
          <Text color="warning">
            注意：某些服务器已存在同名。如果选择，它们将被导入并带有数字后缀。
          </Text>
        )}
        <Text>请选择要导入的服务器：</Text>

        <SelectMulti
          options={serverNames.map(server => ({
            label: `${server}${collisions.includes(server) ? '（已存在）' : ''}`,
            value: server,
          }))}
          defaultValue={serverNames.filter(name => !collisions.includes(name))} // Only preselect non-colliding servers
          onSubmit={onSubmit}
          onCancel={handleEscCancel}
          hideIndexes
        />
      </Dialog>
      <Box paddingX={1}>
        <Text dimColor italic>
          <Byline>
            <KeyboardShortcutHint shortcut="空格" action="选择" />
            <KeyboardShortcutHint shortcut="回车" action="确认" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="取消"
            />
          </Byline>
        </Text>
      </Box>
    </>
  )
}
