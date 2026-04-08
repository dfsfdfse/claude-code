import React from 'react'
import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import { type StoredCompanion, RARITY_STARS } from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { CompanionCard } from '../../buddy/CompanionCard.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

// Species → default name fragments for hatch (no API needed)
const SPECIES_NAMES: Record<string, string> = {
  duck: 'Waddles',
  goose: 'Goosberry',
  blob: 'Gooey',
  cat: 'Whiskers',
  dragon: 'Ember',
  octopus: 'Inky',
  owl: 'Hoots',
  penguin: 'Waddleford',
  turtle: 'Shelly',
  snail: 'Trailblazer',
  ghost: 'Casper',
  axolotl: 'Axie',
  capybara: 'Chill',
  cactus: 'Spike',
  robot: 'Byte',
  rabbit: 'Flops',
  mushroom: 'Spore',
  chonk: 'Chonk',
}

const SPECIES_PERSONALITY: Record<string, string> = {
  duck: '古怪而易于取悦。在每个地方留下橡胶鸭调试提示。',
  goose: '果断且在代码审查中不接受失败。',
  blob: '适应性强，随波逐流。有时在困惑时分裂成两个。',
  cat: '独立和有判断力。看着你打字时带着轻蔑。',
  dragon:
    '热情的建筑师。收藏好的变量名。',
  octopus:
    '多任务专家。同时用触手解决所有问题。',
  owl: '明智但冗长。总是说“让我想想”正好3秒。',
  penguin: '在压力下保持冷静。优雅地通过合并冲突。',
  turtle: '耐心和彻底。相信慢而稳赢得部署。',
  snail: '有条理且留下有用的评论。从不匆忙。',
  ghost:
    '神秘且在最糟糕的时刻出现，带来可怕的洞察。',
  axolotl: '再生和快乐。从任何错误中恢复，带着微笑。',
  capybara: '禅宗大师。在一切都着火时保持冷静。',
  cactus:
    '外面有刺，但充满好意。在忽视中茁壮成长。',
  robot: '高效和字面意思。处理反馈在二进制中。',
  rabbit: '精力充沛且在任务之间跳跃。在你开始之前完成。',
  mushroom: '默默地有见地。随着时间的推移成长。',
  chonk:
    '大，温暖，占据整个沙发。优先考虑舒适而不是优雅。',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sub = args?.trim().toLowerCase() ?? ''
  const setState = context.setAppState

  // ── /buddy off — mute companion ──
  if (sub === 'off') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('宠物静音', { display: 'system' })
    return null
  }

  // ── /buddy on — unmute companion ──
  if (sub === 'on') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('宠物取消静音', { display: 'system' })
    return null
  }

  // ── /buddy pet — trigger heart animation + auto unmute ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('没有宠物 \u00b7 先运行 /buddy 孵化', { display: 'system' })
      return null
    }

    // Auto-unmute on pet + trigger heart animation
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // Trigger a post-pet reaction
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    onDone(`抚摸了 ${companion.name}`, { display: 'system' })
    return null
  }

  // ── /buddy (no args) — show existing or hatch ──
  const companion = getCompanion()

  // Auto-unmute when viewing
  if (companion && getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  if (companion) {
    // Return JSX card — matches official vc8 component
    const lastReaction = context.getAppState?.()?.companionReaction
    return React.createElement(CompanionCard, {
      companion,
      lastReaction,
      onDone,
    })
  }

  // ── No companion → hatch ──
  const seed = generateSeed()
  const r = rollWithSeed(seed)
  const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
  const personality =
    SPECIES_PERSONALITY[r.bones.species] ?? 'Mysterious and code-savvy.'

  const stored: StoredCompanion = {
    name,
    personality,
    seed,
    hatchedAt: Date.now(),
  }

  saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

  const stars = RARITY_STARS[r.bones.rarity]
  const sprite = renderSprite(r.bones, 0)
  const shiny = r.bones.shiny ? ' \u2728 Shiny!' : ''

  const lines = [
    '一只野生宠物出现了！',
    '',
    ...sprite,
    '',
    `${name} the ${speciesLabel(r.bones.species)}${shiny}`,
    `Rarity: ${stars} (${r.bones.rarity})`,
    `"${personality}"`,
    '',
    '你的宠物现在会出现在你的输入框旁边！',
    '说出它的名字来让它说话，或者抚摸它 \u00b7 /buddy pet \u00b7 /buddy off',
  ]
  onDone(lines.join('\n'), { display: 'system' })
  return null
}
