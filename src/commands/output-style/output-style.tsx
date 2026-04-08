import type { LocalJSXCommandOnDone } from '../../types/command.js'

export async function call(onDone: LocalJSXCommandOnDone): Promise<undefined> {
  onDone(
    '/output-style 已弃用。使用 /config 更改输出样式, 或设置在您的设置文件中。更改将在下次会话中生效。',
    { display: 'system' },
  )
}
