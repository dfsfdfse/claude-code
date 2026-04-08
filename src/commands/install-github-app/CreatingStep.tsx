import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Workflow } from './types.js'

interface CreatingStepProps {
  currentWorkflowInstallStep: number
  secretExists: boolean
  useExistingSecret: boolean
  secretName: string
  skipWorkflow?: boolean
  selectedWorkflows: Workflow[]
}

export function CreatingStep({
  currentWorkflowInstallStep,
  secretExists,
  useExistingSecret,
  secretName,
  skipWorkflow = false,
  selectedWorkflows,
}: CreatingStepProps) {
  const progressSteps = skipWorkflow
    ? [
        '正在获取仓库信息',
        secretExists && useExistingSecret
          ? '使用现有 API 密钥'
          : `正在设置 ${secretName} 密钥`,
      ]
    : [
        '正在获取仓库信息',
        '正在创建分支',
        selectedWorkflows.length > 1
          ? '正在创建工作流文件'
          : '正在创建工作流文件',
        secretExists && useExistingSecret
          ? '使用现有 API 密钥'
          : `正在设置 ${secretName} 密钥`,
        '正在打开 Pull Request 页面',
      ]

  return (
    <>
      <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>安装 GitHub App</Text>
        <Text dimColor>创建 GitHub Actions 工作流</Text>
      </Box>
        {progressSteps.map((stepText, index) => {
          let status: 'completed' | 'in-progress' | 'pending' = 'pending'

          if (index < currentWorkflowInstallStep) {
            status = 'completed'
          } else if (index === currentWorkflowInstallStep) {
            status = 'in-progress'
          }

          return (
            <Box key={index}>
              <Text
                color={
                  status === 'completed'
                    ? 'success'
                    : status === 'in-progress'
                      ? 'warning'
                      : undefined
                }
              >
                {status === 'completed' ? '✓ ' : ''}
                {stepText}
                {status === 'in-progress' ? '…' : ''}
              </Text>
            </Box>
          )
        })}
      </Box>
    </>
  )
}
