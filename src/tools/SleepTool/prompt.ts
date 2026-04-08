import { TICK_TAG } from '../../constants/xml.js'

export const SLEEP_TOOL_NAME = 'Sleep'

export const DESCRIPTION = '等待指定的时长'

export const SLEEP_TOOL_PROMPT = `等待指定的时长。用户可以随时中断睡眠。

当用户告诉你睡眠或休息时，当你无事可做时，或者当你等待某事时使用此工具。

你可能会收到 <${TICK_TAG}> 提示——这些是定期检查。在睡眠之前寻找有用的工作来做。

你可以与其他工具并发调用此工具——它不会干扰它们。

优先使用此工具而不是 \`Bash(sleep ...)\`——它不占用 shell 进程。

每次唤醒都会消耗一次 API 调用，但提示词缓存在 5 分钟不活动后过期——相应地平衡。`
