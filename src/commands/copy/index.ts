/**
 * Copy command - minimal metadata only.
 * Implementation is lazy-loaded from copy.tsx to reduce startup time.
 */
import type { Command } from '../../commands.js'

const copy = {
  type: 'local-jsx',
  name: 'copy',
  description:
    "复制 Claude 的最后一句话到剪贴板 (或者 /copy N 复制第 N 句)",
  load: () => import('./copy.js'),
} satisfies Command

export default copy
