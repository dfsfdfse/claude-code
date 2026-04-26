import { basename, sep } from 'path'
import React, { type ReactNode } from 'react'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { Text } from '@anthropic/ink'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import { permissionRuleExtractPrefix } from '../../utils/permissions/shellRuleMatching.js'

function commandListDisplay(commands: string[]): ReactNode {
  switch (commands.length) {
    case 0:
      return ''
    case 1:
      return <Text bold>{commands[0]}</Text>
    case 2:
      return (
        <Text>
          <Text bold>{commands[0]}</Text> 和 <Text bold>{commands[1]}</Text>
        </Text>
      )
    default:
      return (
        <Text>
          <Text bold>{commands.slice(0, -1).join(', ')}</Text>、以及{' '}
          <Text bold>{commands.slice(-1)[0]}</Text>
        </Text>
      )
  }
}

function commandListDisplayTruncated(commands: string[]): ReactNode {
  // Check if the plain text representation would be too long
  const plainText = commands.join(', ')
  if (plainText.length > 50) {
    return '类似'
  }
  return commandListDisplay(commands)
}

function formatPathList(paths: string[]): ReactNode {
  if (paths.length === 0) return ''

  // Extract directory names from paths
  const names = paths.map(p => basename(p) || p)

  if (names.length === 1) {
    return (
      <Text>
        <Text bold>{names[0]}</Text>
        {sep}
      </Text>
    )
  }
  if (names.length === 2) {
    return (
      <Text>
        <Text bold>{names[0]}</Text>
        {sep} 和 <Text bold>{names[1]}</Text>
        {sep}
      </Text>
    )
  }

  // For 3+, show first two with "and N more"
  return (
    <Text>
      <Text bold>{names[0]}</Text>
      {sep}, <Text bold>{names[1]}</Text>
      {sep} 等 {paths.length - 2} 个
    </Text>
  )
}

/**
 * 生成 Shell 权限对话框（Bash、PowerShell）中"是，并应用建议"选项的标签。
 * 参数包括 shell 工具名称和可选的命令转换函数（例如 Bash 会剥离输出重定向，
 * 因此文件名不会显示为命令）。
 */
export function generateShellSuggestionsLabel(
  suggestions: PermissionUpdate[],
  shellToolName: string,
  commandTransform?: (command: string) => string,
): ReactNode | null {
  // Collect all rules for display
  const allRules = suggestions
    .filter(s => s.type === 'addRules')
    .flatMap(s => s.rules || [])

  // Separate Read rules from shell rules
  const readRules = allRules.filter(r => r.toolName === 'Read')
  const shellRules = allRules.filter(r => r.toolName === shellToolName)

  // Get directory info
  const directories = suggestions
    .filter(s => s.type === 'addDirectories')
    .flatMap(s => s.directories || [])

  // Extract paths from Read rules (keep separate from directories)
  const readPaths = readRules
    .map(r => r.ruleContent?.replace('/**', '') || '')
    .filter(p => p)

  // Extract shell command prefixes, optionally transforming for display
  const shellCommands = [
    ...new Set(
      shellRules.flatMap(rule => {
        if (!rule.ruleContent) return []
        const command =
          permissionRuleExtractPrefix(rule.ruleContent) ?? rule.ruleContent
        return commandTransform ? commandTransform(command) : command
      }),
    ),
  ]

  // Check what we have
  const hasDirectories = directories.length > 0
  const hasReadPaths = readPaths.length > 0
  const hasCommands = shellCommands.length > 0

  // Handle single type cases
  if (hasReadPaths && !hasDirectories && !hasCommands) {
    // Only Read rules - use "reading from" language
    if (readPaths.length === 1) {
      const firstPath = readPaths[0]!
      const dirName = basename(firstPath) || firstPath
      return (
        <Text>
          允许读取 <Text bold>{dirName}</Text>
          {sep} 中的文件
        </Text>
      )
    }

    // Multiple read paths
    return (
      <Text>
        允许读取 {formatPathList(readPaths)} 中的文件
      </Text>
    )
  }

  if (hasDirectories && !hasReadPaths && !hasCommands) {
    // Only directory permissions - use "access to" language
    if (directories.length === 1) {
      const firstDir = directories[0]!
      const dirName = basename(firstDir) || firstDir
      return (
        <Text>
          允许访问 <Text bold>{dirName}</Text>
          {sep} 中的文件
        </Text>
      )
    }

    // Multiple directories
    return (
      <Text>
        允许访问 {formatPathList(directories)} 中的文件
      </Text>
    )
  }

  if (hasCommands && !hasDirectories && !hasReadPaths) {
    // Only shell command permissions
    return (
      <Text>
        {"不再询问 "}
        {commandListDisplayTruncated(shellCommands)} 命令在{' '}
        <Text bold>{getOriginalCwd()}</Text>
      </Text>
    )
  }

  // Handle mixed cases
  if ((hasDirectories || hasReadPaths) && !hasCommands) {
    // Combine directories and read paths since they're both path access
    const allPaths = [...directories, ...readPaths]
    if (hasDirectories && hasReadPaths) {
      // Mixed - use generic "access to"
      return (
        <Text>
          允许访问 {formatPathList(allPaths)} 中的文件
        </Text>
      )
    }
  }

  if ((hasDirectories || hasReadPaths) && hasCommands) {
    // Build descriptive message for both types
    const allPaths = [...directories, ...readPaths]

    // Keep it concise but informative
    if (allPaths.length === 1 && shellCommands.length === 1) {
      return (
        <Text>
          允许访问 {formatPathList(allPaths)} 和{' '}
          {commandListDisplayTruncated(shellCommands)} 命令
        </Text>
      )
    }

    return (
      <Text>
        允许 {formatPathList(allPaths)} 访问和{' '}
        {commandListDisplayTruncated(shellCommands)} 命令
      </Text>
    )
  }

  return null
}
