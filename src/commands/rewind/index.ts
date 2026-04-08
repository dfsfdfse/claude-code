import type { Command } from '../../commands.js'

const rewind = {
  description: `恢复代码和/或对话到之前的点`,
  name: 'rewind',
  aliases: ['checkpoint'],
  argumentHint: '',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./rewind.js'),
} satisfies Command

export default rewind
