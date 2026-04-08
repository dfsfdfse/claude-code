import React from 'react'
import { GITHUB_ACTION_SETUP_DOCS_URL } from '../../constants/github-app.js'
import { Box, Text } from '@anthropic/ink'

interface ErrorStepProps {
  error: string | undefined
  errorReason?: string
  errorInstructions?: string[]
}

export function ErrorStep({
  error,
  errorReason,
  errorInstructions,
}: ErrorStepProps) {
  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>安装 GitHub App</Text>
      </Box>
      <Text color="error">错误：{error}</Text>
        {errorReason && (
          <Box marginTop={1}>
            <Text dimColor>原因：{errorReason}</Text>
          </Box>
        )}
        {errorInstructions && errorInstructions.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>修复方法：</Text>
            {errorInstructions.map((instruction, index) => (
              <Box key={index} marginLeft={2}>
                <Text dimColor>• </Text>
                <Text>{instruction}</Text>
              </Box>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>
            手动设置说明：{' '}
            <Text color="claude">{GITHUB_ACTION_SETUP_DOCS_URL}</Text>
          </Text>
        </Box>
      </Box>
      <Box marginLeft={3}>
        <Text dimColor>按任意键退出</Text>
      </Box>
    </>
  )
}
