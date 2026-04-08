import React, { useCallback } from 'react'
import type { ChannelEntry } from '../bootstrap/state.js'
import { Box, Text, Dialog } from '@anthropic/ink'
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js'
import { Select } from './CustomSelect/index.js'

type Props = {
  channels: ChannelEntry[]
  onAccept(): void
}

export function DevChannelsDialog({
  channels,
  onAccept,
}: Props): React.ReactNode {
  function onChange(value: 'accept' | 'exit') {
    switch (value) {
      case 'accept':
        onAccept()
        break
      case 'exit':
        gracefulShutdownSync(1)
        break
    }
  }

  const handleEscape = useCallback(() => {
    gracefulShutdownSync(0)
  }, [])

  return (
    <Dialog
      title="警告：正在加载开发通道"
      color="error"
      onCancel={handleEscape}
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          --dangerously-load-development-channels 仅用于本地通道开发。请勿使用此选项来运行从互联网下载的通道。
        </Text>
        <Text>请使用 --channels 运行已批准通道列表。</Text>
        <Text dimColor>
          通道：{' '}
          {channels
            .map(c =>
              c.kind === 'plugin'
                ? `插件：${c.name}@${c.marketplace}`
                : `服务器：${c.name}`,
            )
            .join(', ')}
        </Text>
      </Box>

      <Select
        options={[
          { label: '我正在用于本地开发', value: 'accept' },
          { label: '退出', value: 'exit' },
        ]}
        onChange={value => onChange(value as 'accept' | 'exit')}
      />
    </Dialog>
  )
}
