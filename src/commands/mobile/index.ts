import type { Command } from '../../commands.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  description: '显示 QR 代码以下载 Claude 移动应用程序',
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile
