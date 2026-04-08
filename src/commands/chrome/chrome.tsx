import React, { useState } from 'react'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Dialog } from '@anthropic/ink'
import { Box, Text } from '@anthropic/ink'
import { useAppState } from '../../state/AppState.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'
import { openBrowser } from '../../utils/browser.js'
import {
  CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  openInChrome,
} from '../../utils/claudeInChrome/common.js'
import { isChromeExtensionInstalled } from '../../utils/claudeInChrome/setup.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { env } from '../../utils/env.js'
import { isRunningOnHomespace } from '../../utils/envUtils.js'

const CHROME_EXTENSION_URL = 'https://claude.ai/chrome'
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions'
const CHROME_RECONNECT_URL = 'https://clau.de/chrome/reconnect'

type MenuAction =
  | 'install-extension'
  | 'reconnect'
  | 'manage-permissions'
  | 'toggle-default'

type Props = {
  onDone: (result?: string) => void
  isExtensionInstalled: boolean
  configEnabled: boolean | undefined
  isClaudeAISubscriber: boolean
  isWSL: boolean
}

function ClaudeInChromeMenu({
  onDone,
  isExtensionInstalled: installed,
  configEnabled,
  isClaudeAISubscriber,
  isWSL,
}: Props): React.ReactNode {
  const mcpClients = useAppState(s => s.mcp.clients)
  const [selectKey, setSelectKey] = useState(0)
  const [enabledByDefault, setEnabledByDefault] = useState(
    configEnabled ?? false,
  )
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(installed)

  const isHomespace = process.env.USER_TYPE === 'ant' && isRunningOnHomespace()

  const chromeClient = mcpClients.find(
    c => c.name === CLAUDE_IN_CHROME_MCP_SERVER_NAME,
  )
  const isConnected = chromeClient?.type === 'connected'

  function openUrl(url: string): void {
    if (isHomespace) {
      void openBrowser(url)
    } else {
      void openInChrome(url)
    }
  }

  function handleAction(action: MenuAction): void {
    switch (action) {
      case 'install-extension':
        setSelectKey(k => k + 1)
        setShowInstallHint(true)
        openUrl(CHROME_EXTENSION_URL)
        break
      case 'reconnect':
        setSelectKey(k => k + 1)
        void isChromeExtensionInstalled().then(installed => {
          setIsExtensionInstalled(installed)
          if (installed) {
            setShowInstallHint(false)
          }
        })
        openUrl(CHROME_RECONNECT_URL)
        break
      case 'manage-permissions':
        setSelectKey(k => k + 1)
        openUrl(CHROME_PERMISSIONS_URL)
        break
      case 'toggle-default': {
        const newValue = !enabledByDefault
        saveGlobalConfig(current => ({
          ...current,
          claudeInChromeDefaultEnabled: newValue,
        }))
        setEnabledByDefault(newValue)
        break
      }
    }
  }

  const options: OptionWithDescription<MenuAction>[] = []
  const requiresExtensionSuffix = isExtensionInstalled
    ? ''
    : ' (需要扩展程序)'

  if (!isExtensionInstalled && !isHomespace) {
    options.push({
      label: '安装 Chrome 扩展程序',
      value: 'install-extension',
    })
  }

  options.push(
    {
      label: (
        <>
          <Text>管理权限</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'manage-permissions',
    },
    {
      label: (
        <>
          <Text>重新连接扩展程序</Text>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'reconnect',
    },
    {
      label: `默认启用: ${enabledByDefault ? '是' : '否'}`,
      value: 'toggle-default',
    },
  )

  const isDisabled =
    isWSL || (process.env.USER_TYPE !== 'ant' && !isClaudeAISubscriber)

  return (
    <Dialog
      title="Chrome 中的 Claude (Beta)"
      onCancel={() => onDone()}
      color="chromeYellow"
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          Chrome 中的 Claude 通过 Chrome 扩展程序让您可以直接从 Claude Code
          控制浏览器。浏览网站、填写表单、截取屏幕截图、录制 GIF、调试控制台日志和网络请求。
        </Text>

        {isWSL && (
          <Text color="error">
            Chrome 中的 Claude 目前不支持 WSL。
          </Text>
        )}


        {process.env.USER_TYPE === 'external' && !isClaudeAISubscriber && (
          <Text color="error">
            Chrome 中的 Claude 需要 claude.ai 订阅。
          </Text>
        )}

        {!isDisabled && (
          <>
            {!isHomespace && (
              <Box flexDirection="column">
                <Text>
                  状态:{' '}
                  {isConnected ? (
                    <Text color="success">已启用</Text>
                  ) : (
                    <Text color="inactive">已禁用</Text>
                  )}
                </Text>
                <Text>
                  扩展程序:{' '}
                  {isExtensionInstalled ? (
                    <Text color="success">已安装</Text>
                  ) : (
                    <Text color="warning">未检测到</Text>
                  )}
                </Text>
              </Box>
            )}
            <Select
              key={selectKey}
              options={options}
              onChange={handleAction}
              hideIndexes
            />

            {showInstallHint && (
              <Text color="warning">
                安装后，选择 {"重新连接扩展程序"} 来连接。
              </Text>
            )}

            <Text>
              <Text dimColor>用法: </Text>
              <Text>claude --chrome</Text>
              <Text dimColor> 或 </Text>
              <Text>claude --no-chrome</Text>
            </Text>

            <Text dimColor>
              网站级权限继承自 Chrome 扩展程序。在 Chrome 扩展程序设置中管理权限，
              控制 Claude 可以浏览、点击和输入的网站。
            </Text>
          </>
        )}
        <Text dimColor>Learn more: https://code.claude.com/docs/en/chrome</Text>
      </Box>
    </Dialog>
  )
}

export const call = async function (
  onDone: (result?: string) => void,
): Promise<React.ReactNode> {
  const isExtensionInstalled = await isChromeExtensionInstalled()
  const config = getGlobalConfig()
  const isSubscriber = isClaudeAISubscriber()
  const isWSL = env.isWslEnvironment()

  return (
    <ClaudeInChromeMenu
      onDone={onDone}
      isExtensionInstalled={isExtensionInstalled}
      configEnabled={config.claudeInChromeDefaultEnabled}
      isClaudeAISubscriber={isSubscriber}
      isWSL={isWSL}
    />
  )
}
