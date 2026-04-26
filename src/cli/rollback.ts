/**
 * `claude rollback [target]` — roll back to a previous Claude Code version.
 *
 * ANT-only command (USER_TYPE === "ant").
 *
 * Options:
 *   --list      List recent published versions
 *   --dry-run   Show what would be installed without installing
 *   --safe      Roll back to the server-pinned safe version
 */
export async function rollback(
  target?: string,
  options?: { list?: boolean; dryRun?: boolean; safe?: boolean },
): Promise<void> {
  if (options?.list) {
    console.log('最近版本：')
    console.log('  （版本列表需要访问发布注册表）')
    console.log('  使用 `claude update --list` 查看可用版本。')
    return
  }

  if (options?.safe) {
    console.log('安全回滚：将安装服务器固定的版本。')
    if (options.dryRun) {
      console.log('  （演练 — 未做任何更改）')
      return
    }
    console.log('  安全版本固定需要访问发布 API。')
    console.log('  联系 oncall 获取当前安全版本。')
    return
  }

  if (!target) {
    console.error(
      '用法: claude rollback [目标]\n\n' +
        '选项：\n' +
        '  -l, --list     列出最近发布的版本\n' +
        '  --dry-run      显示将要安装的内容\n' +
        '  --safe         回滚到服务器固定的安全版本\n\n' +
        '示例：\n' +
        '  claude rollback 2.1.880\n' +
        '  claude rollback --list\n' +
        '  claude rollback --safe',
    )
    process.exitCode = 1
    return
  }

  console.log(`正在回滚到版本 ${target}...`)

  if (options?.dryRun) {
    console.log(`  （演练 — 将安装 ${target}）`)
    return
  }

  // Version rollback via npm/bun
  const { spawnSync } = await import('child_process')
  const result = spawnSync(
    'npm',
    ['install', '-g', `@anthropic-ai/claude-code@${target}`],
    { stdio: 'inherit' },
  )

  if (result.status !== 0) {
    console.error(`回滚失败，退出码 ${result.status}`)
    process.exitCode = result.status ?? 1
  } else {
    console.log(`已成功回滚到 ${target}。`)
  }
}
