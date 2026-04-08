import React from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import { Box, Dialog, Link, Text } from '@anthropic/ink'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { Select } from './CustomSelect/index.js'

// NOTE: This copy is legally reviewed — do not modify without Legal team approval.
export const AUTO_MODE_DESCRIPTION =
  "自动模式让 Claude 自动处理权限提示——Claude 在执行前会检查每个工具调用中是否存在危险操作和提示注入。Claude 判定为安全的操作将被执行，而判定为危险的操作将被阻止，Claude 可能会尝试其他方法。适用于长时间运行的任务。会话成本略高。Claude 可能犯错导致有害命令运行，建议仅在隔离环境中使用。按 Shift+Tab 切换模式。"

type Props = {
  onAccept(): void
  onDecline(): void
  // Startup gate: decline exits the process, so relabel accordingly.
  declineExits?: boolean
}

export function AutoModeOptInDialog({
  onAccept,
  onDecline,
  declineExits,
}: Props): React.ReactNode {
  React.useEffect(() => {
    logEvent('tengu_auto_mode_opt_in_dialog_shown', {})
  }, [])

  function onChange(value: 'accept' | 'accept-default' | 'decline') {
    switch (value) {
      case 'accept': {
        logEvent('tengu_auto_mode_opt_in_dialog_accept', {})
        updateSettingsForSource('userSettings', {
          skipAutoPermissionPrompt: true,
        })
        onAccept()
        break
      }
      case 'accept-default': {
        logEvent('tengu_auto_mode_opt_in_dialog_accept_default', {})
        updateSettingsForSource('userSettings', {
          skipAutoPermissionPrompt: true,
          permissions: { defaultMode: 'auto' },
        })
        onAccept()
        break
      }
      case 'decline': {
        logEvent('tengu_auto_mode_opt_in_dialog_decline', {})
        onDecline()
        break
      }
    }
  }

  return (
    <Dialog title="启用自动模式？" color="warning" onCancel={onDecline}>
      <Box flexDirection="column" gap={1}>
        <Text>{AUTO_MODE_DESCRIPTION}</Text>

        <Link url="https://code.claude.com/docs/en/security" />
      </Box>

      <Select
        options={[
          ...(process.env.USER_TYPE !== 'ant'
            ? [
                {
                  label: '是，并设为默认模式',
                  value: 'accept-default' as const,
                },
              ]
            : []),
          { label: '是，启用自动模式', value: 'accept' as const },
          {
            label: declineExits ? '否，退出' : '否，返回',
            value: 'decline' as const,
          },
        ]}
        onChange={value =>
          onChange(value as 'accept' | 'accept-default' | 'decline')
        }
        onCancel={onDecline}
      />
    </Dialog>
  )
}
