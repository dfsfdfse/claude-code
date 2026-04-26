/**
 * SelectEventMode is the entrypoint of the Hooks config menu, where the user
 * sees the list of available hook events.
 *
 * The /hooks menu is read-only: selecting an event lets you browse its
 * configured hooks but not modify them. To add or change hooks, users should
 * edit settings.json directly or ask Claude.
 */

import figures from 'figures'
import * as React from 'react'
import type { HookEvent } from 'src/entrypoints/agentSdkTypes.js'
import type { HookEventMetadata } from 'src/utils/hooks/hooksConfigManager.js'
import { Box, Link, Text } from '@anthropic/ink'
import { plural } from '../../utils/stringUtils.js'
import { Select } from '../CustomSelect/select.js'
import { Dialog } from '@anthropic/ink'

type Props = {
  hookEventMetadata: Record<HookEvent, HookEventMetadata>
  hooksByEvent: Partial<Record<HookEvent, number>>
  totalHooksCount: number
  restrictedByPolicy: boolean
  onSelectEvent: (event: HookEvent) => void
  onCancel: () => void
}

export function SelectEventMode({
  hookEventMetadata,
  hooksByEvent,
  totalHooksCount,
  restrictedByPolicy,
  onSelectEvent,
  onCancel,
}: Props): React.ReactNode {
  const subtitle = `已配置 ${totalHooksCount} 个 ${plural(totalHooksCount, 'hook')}`

  return (
    <Dialog title="Hooks" subtitle={subtitle} onCancel={onCancel}>
      <Box flexDirection="column" gap={1}>
        {restrictedByPolicy && (
          <Box flexDirection="column">
            <Text color="suggestion">
              {figures.info} Hooks 被策略限制
            </Text>
            <Text dimColor>
              只有托管设置中的 hook 可以运行。用户定义的 hook（来自
              ~/.claude/settings.json、.claude/settings.json 和
              .claude/settings.local.json）已被阻止。
            </Text>
          </Box>
        )}

        <Box flexDirection="column">
          <Text dimColor>
            {figures.info} 此菜单为只读。如需添加或修改 hook，请直接编辑
            settings.json 或询问 Claude.{' '}
            <Link url="https://code.claude.com/docs/en/hooks">了解更多</Link>
          </Text>
        </Box>

        <Box flexDirection="column">
          <Select
            onChange={value => {
              onSelectEvent(value as HookEvent)
            }}
            onCancel={onCancel}
            options={Object.entries(hookEventMetadata).map(
              ([name, metadata]) => {
                const count = hooksByEvent[name as HookEvent] || 0
                return {
                  label:
                    count > 0 ? (
                      <Text>
                        {name} <Text color="suggestion">({count})</Text>
                      </Text>
                    ) : (
                      name
                    ),
                  value: name,
                  description: metadata.summary,
                }
              },
            )}
          />
        </Box>
      </Box>
    </Dialog>
  )
}
