import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const compact = {
  type: 'local',
  name: 'compact',
  description:
    '清除对话历史但保留上下文中的摘要。可选: /compact [压缩指令]',
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_COMPACT),
  supportsNonInteractive: true,
  argumentHint: '<可选的压缩指令>',
  load: () => import('./compact.js'),
} satisfies Command

export default compact
