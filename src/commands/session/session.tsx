import { toString as qrToString } from 'qrcode'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Pane, Text } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { useAppState } from '../../state/AppState.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { logForDebugging } from '../../utils/debug.js'

type Props = {
  onDone: () => void
}

function SessionInfo({ onDone }: Props): React.ReactNode {
  const remoteSessionUrl = useAppState(s => s.remoteSessionUrl)
  const [qrCode, setQrCode] = useState<string>('')

  // Generate QR code when URL is available
  useEffect(() => {
    if (!remoteSessionUrl) return

    const url = remoteSessionUrl
    async function generateQRCode(): Promise<void> {
      const qr = await qrToString(url, {
        type: 'utf8',
        errorCorrectionLevel: 'L',
      })
      setQrCode(qr)
    }
    // Intentionally silent fail - URL is still shown so QR is non-critical
    generateQRCode().catch(e => {
      logForDebugging('二维码生成失败', e)
    })
  }, [remoteSessionUrl])

  // Handle ESC to dismiss
  useKeybinding('confirm:no', onDone, { context: 'Confirmation' })

  // Not in remote mode
  if (!remoteSessionUrl) {
    return (
      <Pane>
        <Text color="warning">
          不在远程模式。使用 `claude --remote` 启动以使用此命令。
        </Text>
        <Text dimColor>(按 ESC 关闭)</Text>
      </Pane>
    )
  }

  const lines = qrCode.split('\n').filter(line => line.length > 0)
  const isLoading = lines.length === 0

  return (
    <Pane>
      <Box marginBottom={1}>
        <Text bold>远程会话</Text>
      </Box>

      {/* QR Code - silently fails if generation errors, URL is still shown */}
      {isLoading ? (
        <Text dimColor>生成二维码…</Text>
      ) : (
        lines.map((line, i) => <Text key={i}>{line}</Text>)
      )}

      {/* URL */}
      <Box marginTop={1}>
        <Text dimColor>在浏览器中打开: </Text>
        <Text color="ide">{remoteSessionUrl}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>(按 ESC 关闭)</Text>
      </Box>
    </Pane>
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  return <SessionInfo onDone={onDone} />
}
