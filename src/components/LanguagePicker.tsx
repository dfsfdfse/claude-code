import figures from 'figures'
import React, { useState } from 'react'
import { Box, Text } from '@anthropic/ink'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import TextInput from './TextInput.js'

type Props = {
  initialLanguage: string | undefined
  onComplete: (language: string | undefined) => void
  onCancel: () => void
}

export function LanguagePicker({
  initialLanguage,
  onComplete,
  onCancel,
}: Props): React.ReactNode {
  const [language, setLanguage] = useState(initialLanguage)
  const [cursorOffset, setCursorOffset] = useState(
    (initialLanguage ?? '').length,
  )

  // Use configurable keybinding for ESC to cancel
  // Use Settings context so 'n' key doesn't trigger cancel (allows typing 'n' in input)
  useKeybinding('confirm:no', onCancel, { context: 'Settings' })

  function handleSubmit(): void {
    const trimmed = language?.trim()
    onComplete(trimmed || undefined)
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>输入您偏好的回复和语音语言：</Text>
      <Box flexDirection="row" gap={1}>
        <Text>{figures.pointer}</Text>
        <TextInput
          value={language ?? ''}
          onChange={setLanguage}
          onSubmit={handleSubmit}
          focus={true}
          showCursor={true}
          placeholder={`例如：日语、简体中文、西班牙语${figures.ellipsis}`}
          columns={60}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
      </Box>
      <Text dimColor>留空使用默认语言（英文）</Text>
    </Box>
  )
}
