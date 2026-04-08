import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import React from 'react'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  checkOverageGate,
  confirmOverage,
  launchRemoteReview,
} from './reviewRemote.js'
import { UltrareviewOverageDialog } from './UltrareviewOverageDialog.js'

function contentBlocksToString(blocks: ContentBlockParam[]): string {
  return blocks
    .map(b => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
}

async function launchAndDone(
  args: string,
  context: Parameters<LocalJSXCommandCall>[1],
  onDone: LocalJSXCommandOnDone,
  billingNote: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await launchRemoteReview(args, context, billingNote)
  // User hit Escape during the ~5s launch — the dialog already showed
  // "cancelled" and unmounted, so skip onDone (would write to a dead
  // transcript slot) and let the caller skip confirmOverage.
  if (signal?.aborted) return
  if (result) {
    onDone(contentBlocksToString(result), { shouldQuery: true })
  } else {
    // Precondition failures now return specific ContentBlockParam[] above.
    // null only reaches here on teleport failure (PR mode) or non-github
    // repo — both are CCR/repo connectivity issues.
    onDone(
      'Ultrareview 无法启动远程会话。请确保这是 GitHub 仓库并重试。',
      { display: 'system' },
    )
  }
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const gate = await checkOverageGate()

  if (gate.kind === 'not-enabled') {
    onDone(
      '免费 ultrareview 已用完。请在 https://claude.ai/settings/billing 启用额外用量以继续。',
      { display: 'system' },
    )
    return null
  }

  if (gate.kind === 'low-balance') {
    onDone(
      `余额过低无法启动 ultrareview（可用余额 $${gate.available.toFixed(2)}，最低 $10）。请在 https://claude.ai/settings/billing 充值`,
      { display: 'system' },
    )
    return null
  }

  if (gate.kind === 'needs-confirm') {
    return (
      <UltrareviewOverageDialog
        onProceed={async signal => {
          await launchAndDone(
            args,
            context,
            onDone,
            ' 此评论按额外用量计费。',
            signal,
          )
          // Only persist the confirmation flag after a non-aborted launch —
          // otherwise Escape-during-launch would leave the flag set and
          // skip this dialog on the next attempt.
          if (!signal.aborted) confirmOverage()
        }}
        onCancel={() => onDone('Ultrareview 已取消。', { display: 'system' })}
      />
    )
  }

  // gate.kind === 'proceed'
  await launchAndDone(args, context, onDone, gate.billingNote)
  return null
}
