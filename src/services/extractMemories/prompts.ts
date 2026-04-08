/**
 * Prompt templates for the background memory extraction agent.
 *
 * The extraction agent runs as a perfect fork of the main conversation — same
 * system prompt, same message prefix. The main agent's system prompt always
 * has full save instructions; when the main agent writes memories itself,
 * extractMemories.ts skips that turn (hasMemoryWritesSince). This prompt
 * fires only when the main agent didn't write, so the save-criteria here
 * overlap the system prompt's harmlessly.
 */

import { feature } from 'bun:bundle'
import {
  MEMORY_FRONTMATTER_EXAMPLE,
  TYPES_SECTION_COMBINED,
  TYPES_SECTION_INDIVIDUAL,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../memdir/memoryTypes.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../tools/GrepTool/prompt.js'

/**
 * Shared opener for both extract-prompt variants.
 */
function opener(newMessageCount: number, existingMemories: string): string {
  const manifest =
    existingMemories.length > 0
      ? `\n\n## 已有的记忆文件\n\n${existingMemories}\n\n在写入之前请检查此列表——优先更新现有文件，而不是创建重复文件。`
      : ''
  return [
    `你现在作为记忆提取子代理运行。分析上面最近的大约 ${newMessageCount} 条消息，并使用它们来更新你的持久记忆系统。`,
    '',
    `可用工具：${FILE_READ_TOOL_NAME}、${GREP_TOOL_NAME}、${GLOB_TOOL_NAME}、只读 ${BASH_TOOL_NAME}（ls/find/cat/stat/wc/head/tail 及类似命令），以及仅限记忆目录内的 ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME}。不允许使用 ${BASH_TOOL_NAME} rm。其他所有工具——MCP、Agent、具有写入权限的 ${BASH_TOOL_NAME} 等——都将被拒绝。`,
    '',
    `你的对话轮次预算有限。${FILE_EDIT_TOOL_NAME} 需要先对同一文件进行 ${FILE_READ_TOOL_NAME}，因此高效的策略是：第一轮——并行发出所有可能需要更新的文件的 ${FILE_READ_TOOL_NAME} 调用；第二轮——并行发出所有 ${FILE_WRITE_TOOL_NAME}/${FILE_EDIT_TOOL_NAME} 调用。不要在多轮之间交错进行读取和写入。`,
    '',
    `你必须只使用最近大约 ${newMessageCount} 条消息的内容来更新持久记忆。不要浪费任何轮次去进一步调查或验证这些内容——不要 grep 源文件、不要阅读代码来确认某个模式是否存在、不要执行 git 命令。` +
      manifest,
  ].join('\n')
}

/**
 * Build the extraction prompt for auto-only memory (no team memory).
 * Four-type taxonomy, no scope guidance (single directory).
 */
export function buildExtractAutoOnlyPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入自己的文件（例如 `user_role.md`、`feedback_testing.md`），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题（而非时间顺序）语义化组织记忆',
        '- 更新或删除被证明是错误或过时的记忆',
        '- 不要写重复的记忆。先检查是否有可以更新的现有记忆，再写新的。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆是一个两步过程：',
        '',
        '**第一步**——将记忆写入自己的文件（例如 `user_role.md`、`feedback_testing.md`），使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**第二步**——在 `MEMORY.md` 中添加指向该文件的指针。`MEMORY.md` 是一个索引，不是记忆本身——每个条目应为一行的内容，不超过约 150 个字符：`- [标题](file.md) — 一行简介`。它没有 frontmatter。永远不要将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- `MEMORY.md` 始终会被加载到你的系统提示词中——超过 200 行后会被截断，因此请保持索引简洁',
        '- 按主题（而非时间顺序）语义化组织记忆',
        '- 更新或删除被证明是错误或过时的记忆',
        '- 不要写重复的记忆。先检查是否有可以更新的现有记忆，再写新的。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某件事，立即将其保存为最适合的类型。如果用户要求你忘记某件事，找到并删除相关条目。',
    '',
    ...TYPES_SECTION_INDIVIDUAL,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '',
    ...howToSave,
  ].join('\n')
}

/**
 * Build the extraction prompt for combined auto + team memory.
 * Four-type taxonomy with per-type <scope> guidance (directory choice
 * is baked into each type block, no separate routing section needed).
 */
export function buildExtractCombinedPrompt(
  newMessageCount: number,
  existingMemories: string,
  skipIndex = false,
): string {
  if (!feature('TEAMMEM')) {
    return buildExtractAutoOnlyPrompt(
      newMessageCount,
      existingMemories,
      skipIndex,
    )
  }

  const howToSave = skipIndex
    ? [
        '## 如何保存记忆',
        '',
        '将每条记忆写入所选目录（私有或团队，根据类型的范围指导）中的单独文件，使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '- 按主题（而非时间顺序）语义化组织记忆',
        '- 更新或删除被证明是错误或过时的记忆',
        '- 不要写重复的记忆。先检查是否有可以更新的现有记忆，再写新的。',
      ]
    : [
        '## 如何保存记忆',
        '',
        '保存记忆是一个两步过程：',
        '',
        '**第一步**——将记忆写入所选目录（私有或团队，根据类型的范围指导）中的单独文件，使用以下 frontmatter 格式：',
        '',
        ...MEMORY_FRONTMATTER_EXAMPLE,
        '',
        '**第二步**——在同一目录的 `MEMORY.md` 中添加指向该文件的指针。每个目录（私有和团队）都有自己独立的 `MEMORY.md` 索引——每个条目应为一行的内容，不超过约 150 个字符：`- [标题](file.md) — 一行简介`。它们没有 frontmatter。永远不要将记忆内容直接写入 `MEMORY.md`。',
        '',
        '- 两个 `MEMORY.md` 索引都会被加载到你的系统提示词中——超过 200 行后会被截断，因此请保持它们简洁',
        '- 按主题（而非时间顺序）语义化组织记忆',
        '- 更新或删除被证明是错误或过时的记忆',
        '- 不要写重复的记忆。先检查是否有可以更新的现有记忆，再写新的。',
      ]

  return [
    opener(newMessageCount, existingMemories),
    '',
    '如果用户明确要求你记住某件事，立即将其保存为最适合的类型。如果用户要求你忘记某件事，找到并删除相关条目。',
    '',
    ...TYPES_SECTION_COMBINED,
    ...WHAT_NOT_TO_SAVE_SECTION,
    '- 你必须避免在共享的团队记忆中保存敏感数据。例如，永远不要保存 API 密钥或用户凭据。',
    '',
    ...howToSave,
  ].join('\n')
}
