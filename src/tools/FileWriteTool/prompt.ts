import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

export const FILE_WRITE_TOOL_NAME = 'Write'
export const DESCRIPTION = '将文件写入本地文件系统。'

function getPreReadInstruction(): string {
  return `\n- 如果这是一个已存在的文件，你必须首先使用 ${FILE_READ_TOOL_NAME} 工具来读取文件内容。如果未先读取文件，此工具将失败。`
}

export function getWriteToolDescription(): string {
  return `将文件写入本地文件系统。

用法：
- 此工具将覆盖提供的路径下已存在的文件。${getPreReadInstruction()}
- 修改现有文件时优先使用 Edit 工具——它只发送差异部分。仅在创建新文件或完全重写时才使用此工具。
- 除非用户明确要求，否则不要创建文档文件（*.md）或 README 文件。
- 仅在用户明确要求时才使用表情符号。除非被要求，否则避免向文件中写入表情符号。`
}
