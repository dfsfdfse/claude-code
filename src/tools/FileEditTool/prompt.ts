import { isCompactLinePrefixEnabled } from '../../utils/file.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'

function getPreReadInstruction(): string {
  return `\n- 你必须在对话中至少使用一次 \`${FILE_READ_TOOL_NAME}\` 工具，然后再进行编辑。如果未读取文件就尝试编辑，此工具会报错。 `
}

export function getEditToolDescription(): string {
  return getDefaultEditDescription()
}

function getDefaultEditDescription(): string {
  const prefixFormat = isCompactLinePrefixEnabled()
    ? '行号 + Tab'
    : '空格 + 行号 + 箭头'
  const minimalUniquenessHint =
    process.env.USER_TYPE === 'ant'
      ? `\n- 使用最小的、明显唯一的 old_string——通常 2-4 行相邻内容就足够了。避免包含 10 行以上的上下文，因为较少的上下文更能定位目标。`
      : ''
  return `对文件执行精确的字符串替换。

用法：${getPreReadInstruction()}
- 当编辑读取工具输出中的文本时，确保保留行号前缀之后显示的精确缩进（Tab/空格）。行号前缀格式为：${prefixFormat}。之后的所有内容都是要匹配的实际文件内容。切勿在 old_string 或 new_string 中包含行号前缀的任何部分。
- 始终优先编辑代码库中的现有文件。除非明确要求，否则不要写入新文件。
- 仅在用户明确要求时才使用表情符号。除非用户要求，否则不要向文件添加表情符号。
- 如果 \`old_string\` 在文件中不唯一，编辑将失败。请提供包含更多周围上下文的较大字符串以使其唯一，或使用 \`replace_all\` 来更改 \`old_string\` 的每个实例。${minimalUniquenessHint}
- 使用 \`replace_all\` 来替换和重命名文件中的字符串。如果您想重命名变量，此参数会很有用。`
}
