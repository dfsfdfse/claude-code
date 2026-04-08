import React from 'react'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { SettingsJson } from '../../utils/settings/types.js'
import { Select } from '../CustomSelect/index.js'
import { PermissionDialog } from '../permissions/PermissionDialog.js'
import {
  extractDangerousSettings,
  formatDangerousSettingsList,
} from './utils.js'

type Props = {
  settings: SettingsJson
  onAccept: () => void
  onReject: () => void
}

export function ManagedSettingsSecurityDialog({
  settings,
  onAccept,
  onReject,
}: Props): React.ReactNode {
  const dangerous = extractDangerousSettings(settings)
  const settingsList = formatDangerousSettingsList(dangerous)

  const exitState = useExitOnCtrlCDWithKeybindings()

  useKeybinding('confirm:no', onReject, { context: 'Confirmation' })

  function onChange(value: 'accept' | 'exit'): void {
    if (value === 'exit') {
      onReject()
      return
    }
    onAccept()
  }

  return (
    <PermissionDialog
      color="warning"
      titleColor="warning"
      title="托管设置需要审批"
    >
      <Box flexDirection="column" gap={1} paddingTop={1}>
        <Text>
          您的组织已配置托管设置，可能允许执行任意代码或拦截您的提示和回复。
        </Text>

        <Box flexDirection="column">
          <Text dimColor>需要审批的设置：</Text>
          {settingsList.map((item, index) => (
            <Box key={index} paddingLeft={2}>
              <Text>
                <Text dimColor>· </Text>
                <Text>{item}</Text>
              </Text>
            </Box>
          ))}
        </Box>

        <Text>
          仅在您信任组织的 IT 管理部门并预期这些设置已配置时才接受。
        </Text>

        <Select
          options={[
            { label: '是，我信任这些设置', value: 'accept' },
            { label: '否，退出 Claude Code', value: 'exit' },
          ]}
          onChange={value => onChange(value as 'accept' | 'exit')}
          onCancel={() => onChange('exit')}
        />

        <Text dimColor>
          {exitState.pending ? (
            <>按 {exitState.keyName} 再按一次退出</>
          ) : (
            <>回车确认 · Esc 退出</>
          )}
        </Text>
      </Box>
    </PermissionDialog>
  )
}
