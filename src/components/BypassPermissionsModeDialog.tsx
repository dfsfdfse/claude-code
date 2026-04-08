import React, { useCallback } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { Box, Link, Newline, Text } from '@anthropic/ink'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from '@anthropic/ink'

type Props = {
  onAccept(): void
}

export function BypassPermissionsModeDialog({
  onAccept,
}: Props): React.ReactNode {
  React.useEffect(() => {
    logEvent('tengu_bypass_permissions_mode_dialog_shown', {})
  }, [])

  function onChange(value: 'accept' | 'decline') {
    switch (value) {
      case 'accept': {
        logEvent('tengu_bypass_permissions_mode_dialog_accept', {})

        updateSettingsForSource('userSettings', {
          skipDangerousModePermissionPrompt: true,
        })
        onAccept()
        break
      }
      case 'decline': {
        gracefulShutdownSync(1)
        break
      }
    }
  }

  const handleEscape = useCallback(() => {
    gracefulShutdownSync(0)
  }, [])

  return (
    <Dialog
      title="警告：Claude Code 正以绕过权限模式运行"
      color="error"
      onCancel={handleEscape}
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          在绕过权限模式下，Claude Code 不会在运行潜在危险命令前请求您的批准。
          <Newline />
          此模式仅应在具有受限互联网访问权限的沙盒容器/虚拟机中使用，且该环境在受损时可以轻松恢复。
        </Text>
        <Text>
          继续即表示您接受在绕过权限模式下运行所产生的所有操作责任。
        </Text>

        <Link url="https://code.claude.com/docs/en/security" />
      </Box>

      <Select
        options={[
          { label: '否，退出', value: 'decline' },
          { label: '是，我接受', value: 'accept' },
        ]}
        onChange={value => onChange(value as 'accept' | 'decline')}
      />
    </Dialog>
  )
}
