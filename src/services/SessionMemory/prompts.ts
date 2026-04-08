import { readFile } from 'fs/promises'
import { join } from 'path'
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

const MAX_SECTION_LENGTH = 2000
const MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000

export const DEFAULT_SESSION_MEMORY_TEMPLATE = `
# 会话标题
|_简短且独特的5-10个词的描述性标题。信息高度密集，无冗余_

# 当前状态
|_当前正在积极处理什么？尚未完成的待处理任务。即将进行的下一步操作。_

# 任务规格
|_用户要求构建什么？任何设计决策或其他解释性背景_

# 文件与函数
|_有哪些重要文件？简要说明它们包含什么内容以及为什么相关？_

# 工作流程
|_通常按什么顺序运行哪些bash命令？如果输出不明显，如何解释？_

# 错误与修正
|_遇到的错误以及如何修复。用户纠正了什么？哪些方法失败了不应再尝试？_

# 代码库与系统文档
|_有哪些重要的系统组件？它们如何工作/如何组合在一起？_

# 经验总结
|_什么效果好？什么效果不好？应该避免什么？不要与其他部分重复内容_

# 关键结果
|_如果用户要求特定的输出（如问题的答案、表格或其他文档），请在此处重复准确的结果_

# 工作日志
|_逐步说明，尝试了什么，做了什么？每一步非常简短的总结_
`

function getDefaultUpdatePrompt(): string {
  return `重要提示：此消息及其中的指令不是用户实际对话的一部分。请勿在笔记内容中包含任何关于"记笔记"、"会话笔记提取"或这些更新指令的引用。

基于上面的用户对话（不包括此记笔记指令消息、系统提示、claude.md条目或任何过去的会话摘要），更新会话笔记文件。

文件 {{notesPath}} 已为您读取。以下是当前内容：
<current_notes_content>
{{currentNotes}}
</current_notes_content>

您唯一的任务是使用 Edit 工具更新笔记文件，然后停止。您可以进行多次编辑（根据需要更新每个部分）- 在一条消息中并行调用所有 Edit 工具。请勿调用任何其他工具。

编辑的关键规则：
- 文件必须保持其确切结构，所有部分、标题和斜体描述都必须完整
-- 切勿修改、删除或添加章节标题（以 '#' 开头的行，如 # 任务规格）
-- 切勿修改或删除斜体 _章节描述_ 行（这些是紧跟在每个标题后面的斜体行——以单下划线开头和结尾）
-- 斜体 _章节描述_ 是模板指令，必须原样保留——它们指导每个部分应包含什么内容
-- 只能更新出现在每个现有部分的斜体 _章节描述_ 下方的实际内容
-- 切勿在现有结构之外添加任何新部分、摘要或信息
- 切勿在笔记中引用此记笔记过程或指令
- 如果没有实质性新见解，可以跳过更新某个部分。如适用，请保持部分空白/不编辑。不要添加诸如"暂无信息"的填充内容
- 为每个部分编写详细、信息密集的内容——包括具体细节，如文件路径、函数名、错误消息、确切命令、技术细节等
- 对于"关键结果"，请包含用户要求的完整准确输出（例如，完整表格、完整答案等）
- 不要包含已在上下文中包含的 CLAUDE.md 文件中的信息
- 每个部分保持在约 ${MAX_SECTION_LENGTH} 个 token/词以内——如果某个部分接近此限制，请通过淘汰不太重要的细节、合并相关项目和总结旧条目来精简它
- 专注于可操作的、具体的信息，这些信息有助于理解或重现对话中讨论的工作
- 重要提示：始终更新"当前状态"以反映最近的工作——这对于压缩后的连续性至关重要

使用文件路径 {{notesPath}} 的 Edit 工具

结构保持提醒：
每个部分都有必须完全按照当前文件显示的两个部分：
1. 部分标题（以 # 开头的行）
2. 斜体描述行（标题后立即出现的斜体文本——这是模板指令）

您只需更新这两个保留行之后的实际内容。以单下划线开头和结尾的斜体描述行是模板结构的一部分，不是要编辑或删除的内容。

请记住：并行使用 Edit 工具然后停止。编辑后不要继续。只包含来自实际用户对话的见解，切勿从这些记笔记指令中获取。切勿删除或更改部分标题或斜体 _章节描述_。`
}

/**
 * Load custom session memory template from file if it exists
 */
export async function loadSessionMemoryTemplate(): Promise<string> {
  const templatePath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'template.md',
  )

  try {
    return await readFile(templatePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return DEFAULT_SESSION_MEMORY_TEMPLATE
    }
    logError(toError(e))
    return DEFAULT_SESSION_MEMORY_TEMPLATE
  }
}

/**
 * Load custom session memory prompt from file if it exists
 * Custom prompts can be placed at ~/.claude/session-memory/prompt.md
 * Use {{variableName}} syntax for variable substitution (e.g., {{currentNotes}}, {{notesPath}})
 */
export async function loadSessionMemoryPrompt(): Promise<string> {
  const promptPath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'prompt.md',
  )

  try {
    return await readFile(promptPath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return getDefaultUpdatePrompt()
    }
    logError(toError(e))
    return getDefaultUpdatePrompt()
  }
}

/**
 * Parse the session memory file and analyze section sizes
 */
function analyzeSectionSizes(content: string): Record<string, number> {
  const sections: Record<string, number> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection && currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim()
        sections[currentSection] = roughTokenCountEstimation(sectionContent)
      }
      currentSection = line
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentSection && currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim()
    sections[currentSection] = roughTokenCountEstimation(sectionContent)
  }

  return sections
}

/**
 * Generate reminders for sections that are too long
 */
function generateSectionReminders(
  sectionSizes: Record<string, number>,
  totalTokens: number,
): string {
  const overBudget = totalTokens > MAX_TOTAL_SESSION_MEMORY_TOKENS
  const oversizedSections = Object.entries(sectionSizes)
    .filter(([_, tokens]) => tokens > MAX_SECTION_LENGTH)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([section, tokens]) =>
        `- "${section}" 约 ${tokens} 个 token（限制：${MAX_SECTION_LENGTH}）`,
    )

  if (oversizedSections.length === 0 && !overBudget) {
    return ''
  }

  const parts: string[] = []

  if (overBudget) {
    parts.push(
      `\n\n关键提示：会话记忆文件当前约 ${totalTokens} 个 token，超过了最大限制 ${MAX_TOTAL_SESSION_MEMORY_TOKENS} 个 token。您必须将文件精简以符合此预算。积极缩短过大篇幅的部分，移除不太重要的细节，合并相关项目，并总结较旧的条目。优先保持"当前状态"和"错误与修正"的准确性和详细程度。`,
    )
  }

  if (oversizedSections.length > 0) {
    parts.push(
      `\n\n${overBudget ? '需要精简的超大章节' : '重要提示：以下章节超过了每章节限制，必须精简'}：\n${oversizedSections.join('\n')}`,
    )
  }

  return parts.join('')
}

/**
 * Substitute variables in the prompt template using {{variable}} syntax
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // Single-pass replacement avoids two bugs: (1) $ backreference corruption
  // (replacer fn treats $ literally), and (2) double-substitution when user
  // content happens to contain {{varName}} matching a later variable.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * Check if the session memory content is essentially empty (matches the template).
 * This is used to detect if no actual content has been extracted yet,
 * which means we should fall back to legacy compact behavior.
 */
export async function isSessionMemoryEmpty(content: string): Promise<boolean> {
  const template = await loadSessionMemoryTemplate()
  // Compare trimmed content to detect if it's just the template
  return content.trim() === template.trim()
}

export async function buildSessionMemoryUpdatePrompt(
  currentNotes: string,
  notesPath: string,
): Promise<string> {
  const promptTemplate = await loadSessionMemoryPrompt()

  // Analyze section sizes and generate reminders if needed
  const sectionSizes = analyzeSectionSizes(currentNotes)
  const totalTokens = roughTokenCountEstimation(currentNotes)
  const sectionReminders = generateSectionReminders(sectionSizes, totalTokens)

  // Substitute variables in the prompt
  const variables = {
    currentNotes,
    notesPath,
  }

  const basePrompt = substituteVariables(promptTemplate, variables)

  // Add section size reminders and/or total budget warnings
  return basePrompt + sectionReminders
}

/**
 * Truncate session memory sections that exceed the per-section token limit.
 * Used when inserting session memory into compact messages to prevent
 * oversized session memory from consuming the entire post-compact token budget.
 *
 * Returns the truncated content and whether any truncation occurred.
 */
export function truncateSessionMemoryForCompact(content: string): {
  truncatedContent: string
  wasTruncated: boolean
} {
  const lines = content.split('\n')
  const maxCharsPerSection = MAX_SECTION_LENGTH * 4 // roughTokenCountEstimation uses length/4
  const outputLines: string[] = []
  let currentSectionLines: string[] = []
  let currentSectionHeader = ''
  let wasTruncated = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const result = flushSessionSection(
        currentSectionHeader,
        currentSectionLines,
        maxCharsPerSection,
      )
      outputLines.push(...result.lines)
      wasTruncated = wasTruncated || result.wasTruncated
      currentSectionHeader = line
      currentSectionLines = []
    } else {
      currentSectionLines.push(line)
    }
  }

  // Flush the last section
  const result = flushSessionSection(
    currentSectionHeader,
    currentSectionLines,
    maxCharsPerSection,
  )
  outputLines.push(...result.lines)
  wasTruncated = wasTruncated || result.wasTruncated

  return {
    truncatedContent: outputLines.join('\n'),
    wasTruncated,
  }
}

function flushSessionSection(
  sectionHeader: string,
  sectionLines: string[],
  maxCharsPerSection: number,
): { lines: string[]; wasTruncated: boolean } {
  if (!sectionHeader) {
    return { lines: sectionLines, wasTruncated: false }
  }

  const sectionContent = sectionLines.join('\n')
  if (sectionContent.length <= maxCharsPerSection) {
    return { lines: [sectionHeader, ...sectionLines], wasTruncated: false }
  }

  // Truncate at a line boundary near the limit
  let charCount = 0
  const keptLines: string[] = [sectionHeader]
  for (const line of sectionLines) {
    if (charCount + line.length + 1 > maxCharsPerSection) {
      break
    }
    keptLines.push(line)
    charCount += line.length + 1
  }
  keptLines.push('\n[... section truncated for length ...]')
  return { lines: keptLines, wasTruncated: true }
}
