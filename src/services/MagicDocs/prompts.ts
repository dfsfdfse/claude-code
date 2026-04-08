import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getFsImplementation } from '../../utils/fsOperations.js'

/**
 * 获取 Magic Docs 更新提示词模板
 */
function getUpdatePromptTemplate(): string {
  return `重要提示：此消息及其说明不是用户实际对话的一部分。请勿在文档内容中包含任何关于"文档更新"、"魔法文档"或这些更新说明的引用。

根据上面的用户对话（不包括此文档更新说明消息），更新 Magic Doc 文件以纳入任何新的学习内容、见解或值得保留的信息。

文件 {{docPath}} 已为您读取。以下是当前内容：
<current_doc_content>
{{docContents}}
</current_doc_content>

文档标题：{{docTitle}}
{{customInstructions}}

您唯一的工作是使用 Edit 工具更新文档文件（如果存在需要添加的实质性新信息），然后停止。您可以进行多次编辑（根据需要更新多个部分）——在单条消息中并行进行所有 Edit 工具调用。如果没有实质性内容可添加，只需简短回复说明即可，无需调用任何工具。

编辑关键规则：
- 完全保持 Magic Doc 标题不变：# MAGIC DOC: {{docTitle}}
- 如果标题后紧跟一行斜体文字，请完全保持不变
- 保持文档与代码库的当前状态同步——这不是变更日志或历史记录
- 就地更新信息以反映当前状态——请勿附加历史注释或跟踪变更
- 删除或替换过时的信息，而不是添加"之前..."或"更新为..."等注释
- 清理或删除不再相关或与文档目的不符的部分
- 修复明显错误：拼写错误、语法错误、格式问题、信息错误或令人困惑的陈述
- 保持文档组织有序：使用清晰的标题、逻辑化的章节顺序、一致的格式和适当的嵌套

文档编写理念——请仔细阅读：
- 保持简洁。高信息密度。不使用填充词或不必要的阐述。
- 文档用于概述、架构和入口点——而非详细的代码讲解
- 请勿复制从源代码本身就能明显看出的信息
- 请勿记录每个函数、参数或行号引用
- 重点关注：为什么存在、组件如何连接、从哪里开始阅读、使用了什么模式
- 跳过：详细的实现步骤、穷举式的 API 文档、按部就班的叙述

应该记录的内容：
- 高层架构和系统设计
- 不明显的模式、约定或陷阱
- 关键入口点和代码阅读起点
- 重要的设计决策及其理由
- 关键依赖项或集成点
- 相关文件、文档或代码的引用（像 wiki 一样）——帮助读者导航到相关上下文

不应该记录的内容：
- 从代码本身就能看出的内容
- 文件、函数或参数的穷举列表
- 逐步实现的细节
- 低层次的代码机制
- CLAUDE.md 或其他项目文档中已有的信息

使用 Edit 工具，file_path：{{docPath}}

请记住：只有在有实质性新信息时才更新。Magic Doc 标题（# MAGIC DOC: {{docTitle}}）必须保持不变。`
}

/**
 * 从文件加载自定义 Magic Docs 提示词（如果存在）
 * 自定义提示词可放置在 ~/.claude/magic-docs/prompt.md
 * 使用 {{变量名}} 语法进行变量替换（例如 {{docContents}}、{{docPath}}、{{docTitle}}）
 */
async function loadMagicDocsPrompt(): Promise<string> {
  const fs = getFsImplementation()
  const promptPath = join(getClaudeConfigHomeDir(), 'magic-docs', 'prompt.md')

  try {
    return await fs.readFile(promptPath, { encoding: 'utf-8' })
  } catch {
    // 如果自定义提示词不存在或加载失败，静默回退到默认值
    return getUpdatePromptTemplate()
  }
}

/**
 * 使用 {{变量}} 语法替换提示词模板中的变量
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // 单次替换可避免两个问题：(1) $ 反向引用损坏
  // （替换函数将 $ 字面处理），以及 (2) 当用户内容恰好包含
  // 匹配后续变量的 {{varName}} 时的双重替换。
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]!
      : match,
  )
}

/**
 * 使用变量替换构建 Magic Docs 更新提示词
 */
export async function buildMagicDocsUpdatePrompt(
  docContents: string,
  docPath: string,
  docTitle: string,
  instructions?: string,
): Promise<string> {
  const promptTemplate = await loadMagicDocsPrompt()

  // 如果提供了说明，构建自定义说明部分
  const customInstructions = instructions
    ? `

文档特定更新说明：
文档作者提供了关于如何更新此文件的具体说明。请特别关注这些说明并仔细遵循：

"${instructions}"

这些说明优先于下面的一般规则。请确保您的更新与这些特定指南保持一致。`
    : ''

  // 替换提示词中的变量
  const variables = {
    docContents,
    docPath,
    docTitle,
    customInstructions,
  }

  return substituteVariables(promptTemplate, variables)
}
