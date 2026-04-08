import React from 'react'
import { logEvent } from 'src/services/analytics/index.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- enter to continue
import { Box, Dialog, Link, Newline, Text, useInput } from '@anthropic/ink'
import { isChromeExtensionInstalled } from '../utils/claudeInChrome/setup.js'
import { saveGlobalConfig } from '../utils/config.js'

const CHROME_EXTENSION_URL = 'https://claude.ai/chrome'
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions'

type Props = {
  onDone(): void
}

export function ClaudeInChromeOnboarding({ onDone }: Props): React.ReactNode {
  const [isExtensionInstalled, setIsExtensionInstalled] = React.useState(false)

  React.useEffect(() => {
    logEvent('tengu_claude_in_chrome_onboarding_shown', {})
    void isChromeExtensionInstalled().then(setIsExtensionInstalled)
    saveGlobalConfig(current => {
      return { ...current, hasCompletedClaudeInChromeOnboarding: true }
    })
  }, [])

  // Handle Enter to continue
  useInput((_input, key) => {
    if (key.return) {
      onDone()
    }
  })

  return (
    <Dialog
      title="Chrome 中的 Claude（Beta版）"
      onCancel={onDone}
      color="chromeYellow"
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          Chrome 中的 Claude 可与 Chrome 扩展配合使用，让您直接从 Claude Code 控制浏览器。您可以浏览网站、填写表单、截取屏幕截图、录制 GIF，并使用控制台日志和网络请求进行调试。
          {!isExtensionInstalled && (
            <>
              <Newline />
              <Newline />
              需要安装 Chrome 扩展。访问{' '}
              <Link url={CHROME_EXTENSION_URL} />
            </>
          )}
        </Text>

        <Text dimColor>
          站点级权限继承自 Chrome 扩展。在 Chrome 扩展设置中管理权限，以控制 Claude 可以浏览、点击和输入的站点
          {isExtensionInstalled && (
            <>
              {' '}
              （<Link url={CHROME_PERMISSIONS_URL} />）
            </>
          )}
          。
        </Text>
        <Text dimColor>
          更多信息，请使用{' '}
          <Text bold color="chromeYellow">
            /chrome
          </Text>{' '}
          或访问 <Link url="https://code.claude.com/docs/en/chrome" />
        </Text>
      </Box>
    </Dialog>
  )
}
