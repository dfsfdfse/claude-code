import React from 'react'
import { Box, Dialog, wrappedRender as render, Text } from '@anthropic/ink'
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js'
import { AppStateProvider } from '../state/AppState.js'
import type { ConfigParseError } from '../utils/errors.js'
import { getBaseRenderOptions } from '../utils/renderOptions.js'
import {
  jsonStringify,
  writeFileSync_DEPRECATED,
} from '../utils/slowOperations.js'
import type { ThemeName } from '../utils/theme.js'
import { Select } from './CustomSelect/index.js'

interface InvalidConfigHandlerProps {
  error: ConfigParseError
}

interface InvalidConfigDialogProps {
  filePath: string
  errorDescription: string
  onExit: () => void
  onReset: () => void
}

/**
 * Dialog shown when the Claude config file contains invalid JSON
 */
function InvalidConfigDialog({
  filePath,
  errorDescription,
  onExit,
  onReset,
}: InvalidConfigDialogProps): React.ReactNode {
  // Handler for Select onChange
  const handleSelect = (value: string) => {
    if (value === 'exit') {
      onExit()
    } else {
      onReset()
    }
  }

  return (
    <Dialog title="配置错误" color="error" onCancel={onExit}>
      <Box flexDirection="column" gap={1}>
        <Text>
          位于 <Text bold>{filePath}</Text> 的配置文件包含无效的 JSON。
        </Text>
        <Text>{errorDescription}</Text>
      </Box>
      <Box flexDirection="column">
        <Text bold>选择一个选项：</Text>
        <Select
          options={[
            { label: '退出并手动修复', value: 'exit' },
            { label: '重置为默认配置', value: 'reset' },
          ]}
          onChange={handleSelect}
          onCancel={onExit}
        />
      </Box>
    </Dialog>
  )
}

/**
 * Safe fallback theme name for error dialogs to avoid circular dependency.
 * Uses a hardcoded dark theme that doesn't require reading from config.
 */
const SAFE_ERROR_THEME_NAME: ThemeName = 'dark'

export async function showInvalidConfigDialog({
  error,
}: InvalidConfigHandlerProps): Promise<void> {
  // Extend RenderOptions with theme property for this specific usage
  type SafeRenderOptions = Parameters<typeof render>[1] & { theme?: ThemeName }

  const renderOptions: SafeRenderOptions = {
    ...getBaseRenderOptions(false),
    // IMPORTANT: Use hardcoded theme name to avoid circular dependency with getGlobalConfig()
    // This allows the error dialog to show even when config file has JSON syntax errors
    theme: SAFE_ERROR_THEME_NAME,
  }

  await new Promise<void>(async resolve => {
    const { unmount } = await render(
      <AppStateProvider>
        <KeybindingSetup>
          <InvalidConfigDialog
            filePath={error.filePath}
            errorDescription={error.message}
            onExit={() => {
              unmount()
              void resolve()
              process.exit(1)
            }}
            onReset={() => {
              writeFileSync_DEPRECATED(
                error.filePath,
                jsonStringify(error.defaultConfig, null, 2),
                { flush: false, encoding: 'utf8' },
              )
              unmount()
              void resolve()
              process.exit(0)
            }}
          />
        </KeybindingSetup>
      </AppStateProvider>,
      renderOptions,
    )
  })
}
