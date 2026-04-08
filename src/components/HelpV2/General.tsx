import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box>
        <Text>
          Claude 能理解代码库、经您授权后进行编辑并执行命令 — 就在您的终端中。
        </Text>
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold>快捷键</Text>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth={true} />
      </Box>
    </Box>
  )
}
