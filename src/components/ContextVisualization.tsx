import { feature } from 'bun:bundle'
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { ContextData } from '../utils/analyzeContext.js'
import { generateContextSuggestions } from '../utils/contextSuggestions.js'
import { getDisplayPath } from '../utils/file.js'
import { formatTokens } from '../utils/format.js'
import {
  getSourceDisplayName,
  type SettingSource,
} from '../utils/settings/constants.js'
import { plural } from '../utils/stringUtils.js'
import { ContextSuggestions } from './ContextSuggestions.js'

const RESERVED_CATEGORY_NAME = 'Autocompact buffer'

/**
 * One-liner for the legend header showing what context-collapse has done.
 * Returns null when nothing's summarized/staged so we don't add visual
 * noise in the common case. This is the one place a user can see that
 * their context was rewritten — the <collapsed> placeholders are isMeta
 * and don't appear in the conversation view.
 */
function CollapseStatus(): React.ReactNode {
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getStats, isContextCollapseEnabled } =
      require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (!isContextCollapseEnabled()) return null

    const s = getStats()
    const { health: h } = s

    const parts: string[] = []
    if (s.collapsedSpans > 0) {
      parts.push(
        `${s.collapsedSpans} 个 ${plural(s.collapsedSpans, 'span')} 已摘要（${s.collapsedMessages} 条消息）`,
      )
    }
    if (s.stagedSpans > 0) parts.push(`${s.stagedSpans} 个待处理`)
    const summary =
      parts.length > 0
        ? parts.join(', ')
        : h.totalSpawns > 0
          ? `${h.totalSpawns} 个 ${plural(h.totalSpawns, 'spawn')}，尚无待处理`
          : '等待首次触发'

    let line2: React.ReactNode = null
    if (h.totalErrors > 0) {
      line2 = (
        <Text color="warning">
          折叠错误：{h.totalErrors}/{h.totalSpawns} 个 spawn 失败
          {h.lastError ? `（最后：${h.lastError.slice(0, 60)}）` : ''}
        </Text>
      )
    } else if (h.emptySpawnWarningEmitted) {
      line2 = (
        <Text color="warning">
          折叠空闲：{h.totalEmptySpawns} 次连续空运行
        </Text>
      )
    }

    return (
      <>
        <Text dimColor>上下文策略：折叠（{summary}）</Text>
        {line2}
      </>
    )
  }
  return null
}

// Order for displaying source groups: Project > User > Managed > Plugin > Built-in
const SOURCE_DISPLAY_ORDER = [
  'Project',
  'User',
  'Managed',
  'Plugin',
  'Built-in',
]

/** Group items by source type for display, sorted by tokens descending within each group */
function groupBySource<
  T extends { source: SettingSource | 'plugin' | 'built-in'; tokens: number },
>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = getSourceDisplayName(item.source)
    const existing = groups.get(key) || []
    existing.push(item)
    groups.set(key, existing)
  }
  // Sort each group by tokens descending
  for (const [key, group] of groups.entries()) {
    groups.set(
      key,
      group.sort((a, b) => b.tokens - a.tokens),
    )
  }
  // Return groups in consistent order
  const orderedGroups = new Map<string, T[]>()
  for (const source of SOURCE_DISPLAY_ORDER) {
    const group = groups.get(source)
    if (group) {
      orderedGroups.set(source, group)
    }
  }
  return orderedGroups
}

interface Props {
  data: ContextData
}

export function ContextVisualization({ data }: Props): React.ReactNode {
  const {
    categories,
    totalTokens,
    rawMaxTokens,
    percentage,
    gridRows,
    model,
    memoryFiles,
    mcpTools,
    deferredBuiltinTools = [],
    systemTools,
    systemPromptSections,
    agents,
    skills,
    messageBreakdown,
  } = data

  // Filter out categories with 0 tokens for the legend, and exclude Free space, Autocompact buffer, and deferred
  const visibleCategories = categories.filter(
    cat =>
      cat.tokens > 0 &&
      cat.name !== 'Free space' &&
      cat.name !== RESERVED_CATEGORY_NAME &&
      !cat.isDeferred,
  )
  // Check if MCP tools are deferred (loaded on-demand via tool search)
  const hasDeferredMcpTools = categories.some(
    cat => cat.isDeferred && cat.name.includes('MCP'),
  )
  // Check if builtin tools are deferred
  const hasDeferredBuiltinTools = deferredBuiltinTools.length > 0
  const autocompactCategory = categories.find(
    cat => cat.name === RESERVED_CATEGORY_NAME,
  )

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text bold>上下文使用情况</Text>
      <Box flexDirection="row" gap={2}>
        {/* Fixed size grid */}
        <Box flexDirection="column" flexShrink={0}>
          {gridRows.map((row, rowIndex) => (
            <Box key={rowIndex} flexDirection="row" marginLeft={-1}>
              {row.map((square, colIndex) => {
                if (square.categoryName === 'Free space') {
                  return (
                    <Text key={colIndex} dimColor>
                      {'⛶ '}
                    </Text>
                  )
                }
                if (square.categoryName === RESERVED_CATEGORY_NAME) {
                  return (
                    <Text key={colIndex} color={square.color}>
                      {'⛝ '}
                    </Text>
                  )
                }
                return (
                  <Text key={colIndex} color={square.color}>
                    {square.squareFullness >= 0.7 ? '⛁ ' : '⛀ '}
                  </Text>
                )
              })}
            </Box>
          ))}
        </Box>

        {/* Legend to the right */}
        <Box flexDirection="column" gap={0} flexShrink={0}>
          <Text dimColor>
            {model} · {formatTokens(totalTokens)}/{formatTokens(rawMaxTokens)}{' '}
            tokens（{percentage}%）
          </Text>
          <CollapseStatus />
          <Text> </Text>
          <Text dimColor italic>
            按分类估算使用量
          </Text>
          {visibleCategories.map((cat, index) => {
            const tokenDisplay = formatTokens(cat.tokens)
            // Show "N/A" for deferred categories since they don't count toward context
            const percentDisplay = cat.isDeferred
              ? 'N/A'
              : `${((cat.tokens / rawMaxTokens) * 100).toFixed(1)}%`
            const isReserved = cat.name === RESERVED_CATEGORY_NAME
            const displayName = cat.name
            // Deferred categories don't appear in grid, so show blank instead of symbol
            const symbol = cat.isDeferred ? ' ' : isReserved ? '⛝' : '⛁'

            return (
              <Box key={index}>
                <Text color={cat.color}>{symbol}</Text>
                <Text> {displayName}：</Text>
                <Text dimColor>
                  {tokenDisplay} tokens（{percentDisplay}）
                </Text>
              </Box>
            )
          })}
          {(categories.find(c => c.name === 'Free space')?.tokens ?? 0) > 0 && (
            <Box>
              <Text dimColor>⛶</Text>
              <Text> 剩余空间：</Text>
              <Text dimColor>
                {formatTokens(
                  categories.find(c => c.name === 'Free space')?.tokens || 0,
                )}{' '}
                （{(
                  ((categories.find(c => c.name === 'Free space')?.tokens ||
                    0) /
                    rawMaxTokens) *
                  100
                ).toFixed(1)}
                %）
              </Text>
            </Box>
          )}
          {autocompactCategory && autocompactCategory.tokens > 0 && (
            <Box>
              <Text color={autocompactCategory.color}>⛝</Text>
              <Text dimColor> {autocompactCategory.name}：</Text>
              <Text dimColor>
                {formatTokens(autocompactCategory.tokens)} tokens （
                {((autocompactCategory.tokens / rawMaxTokens) * 100).toFixed(1)}
                %）
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexDirection="column" marginLeft={-1}>
        {mcpTools.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text bold>MCP 工具</Text>
              <Text dimColor>
                {' '}
                · /mcp{hasDeferredMcpTools ? '（按需加载）' : ''}
              </Text>
            </Box>
            {/* Show loaded tools first */}
            {mcpTools.some(t => t.isLoaded) && (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>已加载</Text>
                {mcpTools
                  .filter(t => t.isLoaded)
                  .map((tool, i) => (
                    <Box key={i}>
                      <Text>└ {tool.name}：</Text>
                      <Text dimColor>{formatTokens(tool.tokens)} tokens</Text>
                    </Box>
                  ))}
              </Box>
            )}
            {/* Show available (deferred) tools */}
            {hasDeferredMcpTools && mcpTools.some(t => !t.isLoaded) && (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>可用</Text>
                {mcpTools
                  .filter(t => !t.isLoaded)
                  .map((tool, i) => (
                    <Box key={i}>
                      <Text dimColor>└ {tool.name}</Text>
                    </Box>
                  ))}
              </Box>
            )}
            {/* Show all tools normally when not deferred */}
            {!hasDeferredMcpTools &&
              mcpTools.map((tool, i) => (
                <Box key={i}>
                  <Text>└ {tool.name}: </Text>
                  <Text dimColor>{formatTokens(tool.tokens)} tokens</Text>
                </Box>
              ))}
          </Box>
        )}

        {/* Show builtin tools: always-loaded + deferred (ant-only) */}
        {((systemTools && systemTools.length > 0) || hasDeferredBuiltinTools) &&
          process.env.USER_TYPE === 'ant' && (
            <Box flexDirection="column" marginTop={1}>
              <Box>
                <Text bold>[ANT-ONLY] System tools</Text>
                {hasDeferredBuiltinTools && (
                  <Text dimColor> (some loaded on-demand)</Text>
                )}
              </Box>
              {/* Always-loaded + deferred-but-loaded tools */}
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>已加载</Text>
                {systemTools?.map((tool, i) => (
                  <Box key={`sys-${i}`}>
                    <Text>└ {tool.name}：</Text>
                    <Text dimColor>{formatTokens(tool.tokens)} tokens</Text>
                  </Box>
                ))}
                {deferredBuiltinTools
                  .filter(t => t.isLoaded)
                  .map((tool, i) => (
                    <Box key={`def-${i}`}>
                      <Text>└ {tool.name}: </Text>
                      <Text dimColor>{formatTokens(tool.tokens)} tokens</Text>
                    </Box>
                  ))}
              </Box>
              {/* Deferred (not yet loaded) tools */}
              {hasDeferredBuiltinTools &&
                deferredBuiltinTools.some(t => !t.isLoaded) && (
                  <Box flexDirection="column" marginTop={1}>
                    <Text dimColor>可用</Text>
                    {deferredBuiltinTools
                      .filter(t => !t.isLoaded)
                      .map((tool, i) => (
                        <Box key={i}>
                          <Text dimColor>└ {tool.name}</Text>
                        </Box>
                      ))}
                  </Box>
                )}
            </Box>
          )}

        {systemPromptSections &&
          systemPromptSections.length > 0 &&
          process.env.USER_TYPE === 'ant' && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>【仅内部】系统提示词部分</Text>
              {systemPromptSections.map((section, i) => (
                <Box key={i}>
                  <Text>└ {section.name}: </Text>
                  <Text dimColor>{formatTokens(section.tokens)} tokens</Text>
                </Box>
              ))}
            </Box>
          )}

        {agents.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text bold>自定义代理</Text>
              <Text dimColor> · /agents</Text>
            </Box>
            {Array.from(groupBySource(agents).entries()).map(
              ([sourceDisplay, sourceAgents]) => (
                <Box key={sourceDisplay} flexDirection="column" marginTop={1}>
                  <Text dimColor>{sourceDisplay}</Text>
                  {sourceAgents.map((agent, i) => (
                    <Box key={i}>
                      <Text>└ {agent.agentType}: </Text>
                      <Text dimColor>{formatTokens(agent.tokens)} tokens</Text>
                    </Box>
                  ))}
                </Box>
              ),
            )}
          </Box>
        )}

        {memoryFiles.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text bold>记忆文件</Text>
              <Text dimColor> · /memory</Text>
            </Box>
            {memoryFiles.map((file, i) => (
              <Box key={i}>
                <Text>└ {getDisplayPath(file.path)}: </Text>
                <Text dimColor>{formatTokens(file.tokens)} tokens</Text>
              </Box>
            ))}
          </Box>
        )}

        {skills && skills.tokens > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text bold>技能</Text>
              <Text dimColor> · /skills</Text>
            </Box>
            {Array.from(groupBySource(skills.skillFrontmatter).entries()).map(
              ([sourceDisplay, sourceSkills]) => (
                <Box key={sourceDisplay} flexDirection="column" marginTop={1}>
                  <Text dimColor>{sourceDisplay}</Text>
                  {sourceSkills.map((skill, i) => (
                    <Box key={i}>
                      <Text>└ {skill.name}: </Text>
                      <Text dimColor>{formatTokens(skill.tokens)} tokens</Text>
                    </Box>
                  ))}
                </Box>
              ),
            )}
          </Box>
        )}

        {messageBreakdown && process.env.USER_TYPE === 'ant' && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>【仅内部】消息分析</Text>

            <Box flexDirection="column" marginLeft={1}>
              <Box>
                <Text>工具调用：</Text>
                <Text dimColor>
                  {formatTokens(messageBreakdown.toolCallTokens)} tokens
                </Text>
              </Box>

              <Box>
                <Text>工具结果：</Text>
                <Text dimColor>
                  {formatTokens(messageBreakdown.toolResultTokens)} tokens
                </Text>
              </Box>

              <Box>
                <Text>附件：</Text>
                <Text dimColor>
                  {formatTokens(messageBreakdown.attachmentTokens)} tokens
                </Text>
              </Box>

              <Box>
                <Text>助手消息（非工具）：</Text>
                <Text dimColor>
                  {formatTokens(messageBreakdown.assistantMessageTokens)} tokens
                </Text>
              </Box>

              <Box>
                <Text>用户消息（非工具结果）：</Text>
                <Text dimColor>
                  {formatTokens(messageBreakdown.userMessageTokens)} tokens
                </Text>
              </Box>
            </Box>

            {messageBreakdown.toolCallsByType.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>【仅内部】使用最多的工具</Text>
                {messageBreakdown.toolCallsByType.slice(0, 5).map((tool, i) => (
                  <Box key={i} marginLeft={1}>
                    <Text>└ {tool.name}：</Text>
                    <Text dimColor>
                      调用 {formatTokens(tool.callTokens)}，结果{' '}
                      {formatTokens(tool.resultTokens)}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}

            {messageBreakdown.attachmentsByType.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>【仅内部】使用最多的附件</Text>
                {messageBreakdown.attachmentsByType
                  .slice(0, 5)
                  .map((attachment, i) => (
                    <Box key={i} marginLeft={1}>
                      <Text>└ {attachment.name}: </Text>
                      <Text dimColor>
                        {formatTokens(attachment.tokens)} tokens
                      </Text>
                    </Box>
                  ))}
              </Box>
            )}
          </Box>
        )}
      </Box>
      <ContextSuggestions suggestions={generateContextSuggestions(data)} />
    </Box>
  )
}
