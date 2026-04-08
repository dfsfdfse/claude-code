import { feature } from 'bun:bundle'
import type { Message } from '../types/message.js'
import type { Attachment } from '../utils/attachments.js'
import { getGlobalConfig } from '../utils/config.js'
import { getCompanion } from './companion.js'

export function companionIntroText(name: string, species: string): string {
  return `# 伙伴

一只名为 ${name} 的小型 ${species} 坐在用户的输入框旁边，偶尔会在气泡中发表评论。你不是 ${name} —— 它是一个独立的观察者。

当用户直接称呼 ${name}（通过名字）时，它的气泡会回答。此时你的任务是不要碍事：用一行或更少的文字回应，或者只回答消息中针对你的部分。不要解释你不是 ${name} —— 他们知道。不要叙述 ${name} 可能说的话 —— 气泡会处理那些。`
}

export function getCompanionIntroAttachment(
  messages: Message[] | undefined,
): Attachment[] {
  if (!feature('BUDDY')) return []
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) return []

  // Skip if already announced for this companion.
  for (const msg of messages ?? []) {
    if (msg.type !== 'attachment') continue
    if (msg.attachment.type !== 'companion_intro') continue
    if (msg.attachment.name === companion.name) return []
  }

  return [
    {
      type: 'companion_intro',
      name: companion.name,
      species: companion.species,
    },
  ]
}
