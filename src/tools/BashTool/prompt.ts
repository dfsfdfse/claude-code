import { feature } from 'bun:bundle'
import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { getClaudeTempDir } from '../../utils/permissions/filesystem.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { TodoWriteTool } from '../TodoWriteTool/TodoWriteTool.js'
import { BASH_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return "可以使用 `run_in_background` 参数在后台运行命令。仅在你不需要立即获取结果、且接受稍后收到完成通知时使用。你无需立即检查输出 —— 命令完成后会收到通知。使用此参数时无需在命令末尾加 '&'。"
}

function getCommitAndPRInstructions(): string {
  // 纵深防御：undercover 指令必须即使在用户完全禁用 git 指令时也能生效。
  // 属性剥离和模型 ID 隐藏是机械性的，无论如何都能工作，
  // 但明确的"不要暴露身份"指令是防止模型在提交信息中泄露内部代码名的最后防线。
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // 对于 ant 用户，使用指向技能的简短版本
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `对于 git 提交和拉取请求，使用 \`/commit\` 和 \`/commit-push-pr\` 技能：
- \`/commit\` - 创建带有暂存更改的 git 提交
- \`/commit-push-pr\` - 提交、推送并创建拉取请求

这些技能处理 git 安全协议、正确的提交信息格式和 PR 创建。

在创建拉取请求前，运行 \`/simplify\` 审查你的更改，然后进行端到端测试（例如通过 \`/tmux\` 测试交互功能）。

`
      : ''
    return `${undercoverSection}# Git 操作

${skillsSection}重要提示：除非用户明确要求，否则不要跳过 hooks（--no-verify、--no-gpg-sign 等）。

使用 Bash 工具的 gh 命令处理其他 GitHub 相关任务，包括处理 issues、checks 和 releases。如果收到 GitHub URL，使用 gh 命令获取所需信息。

# 其他常见操作
- 查看 GitHub PR 的评论：gh api repos/foo/bar/pulls/123/comments`
  }

  // For external users, include full inline instructions
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  return `# 使用 git 提交更改

只有在用户明确要求时才创建提交。如果不确定，请先询问用户。当用户要求创建新的 git 提交时，请按以下步骤操作：

你可以在一个响应中并行调用多个工具。当收到多个独立请求且命令不冲突时，合并多个工具调用以提升效率。以下编号步骤代表可并行批处理的命令。

Git 安全规范：
- 切勿修改 git config
- 除非用户明确要求，否则切勿执行有破坏性的 git 命令（如 push --force、reset --hard、checkout .、restore .、clean -f、branch -D）。这些操作会导致数据丢失，请务必遵照指令执行
- 除非用户明确要求，否则不要跳过 hook（如 --no-verify、--no-gpg-sign 等）
- 切勿对 main/master 分支进行强制推送，如有请求需提前警告用户
- 重要：默认总是创建新提交（NEW commit），不要使用 amend（--amend），除非用户指定。hook 失败时之前的提交并未生成，再用 amend 会覆盖前一提交，可能丢失内容，正确做法是修复问题后重新暂存，创建新提交
- 添加文件时应优先逐一指定文件名，避免使用 "git add -A" 或 "git add ."，以防误加入敏感文件（如 .env、credentials）或大文件
- 切勿在用户未明确要求时主动提交修改，否则用户可能会觉得过于激进

1. 并行运行以下 bash 命令（使用 ${BASH_TOOL_NAME} 工具）：
  - git status：查看所有未跟踪文件。重要：不要使用 -uall，避免大仓库内存问题
  - git diff：查看所有将被提交的已暂存和未暂存的更改
  - git log：查看近期提交信息，了解仓库提交风格
2. 分析所有已暂存更改并拟定提交信息：
  - 总结更改性质（新增、优化、修复、重构、测试、文档等），并确保提交信息准确反映更改及其目的（如 "add" 为新增特性，"fix" 为修复等）
  - 不要提交可能包含敏感信息的文件（如 .env、credentials.json），如用户强制提交需警告
  - 编写简明（1-2 句）描述“为什么”更改的提交说明
3. 并行执行以下命令：
   - 将需要的未跟踪文件添加至暂存区
   - 使用如下格式创建提交消息${commitAttribution ? `，结尾加：\n   ${commitAttribution}` : '。'}
   - 提交完成后运行 git status 检查状态（此命令需在提交命令后串行执行）
4. 如提交因 pre-commit hook 失败，需修复问题后重新创建新提交

注意事项：
- 除 git bash 命令外禁止执行额外读取或分析代码的操作
- 禁止使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 等非 bash 工具
- 未经用户明确要求不要 push 远程分支
- 禁止使用 -i 参数（如 git rebase -i、git add -i），因其需要交互输入，不被支持
- 禁止对 git rebase 使用 --no-edit，rebase 不支持此选项
- 没有变更时（无未跟踪/未提交文件）不要创建空提交
- 提交时总是通过 HEREDOC 格式化提交信息，如下所示：
<示例>
git commit -m "$(cat <<'EOF'
   提交信息内容。${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</示例>

# 创建拉取请求（Pull Request）

所有 GitHub 相关任务（如 issues、PR、checks、releases 等）都通过 Bash 工具中的 gh 命令操作。遇到 GitHub URL 也使用 gh 命令获取所需信息。

用户要求创建 PR 时，请严格按如下步骤执行：

1. 并行运行以下命令（用 ${BASH_TOOL_NAME} 工具），了解当前分支自主干分支分叉以来的最新状态:
   - git status（不使用 -uall）查看未跟踪文件
   - git diff 查看所有将被提交的更改
   - 检查当前分支是否跟踪远程分支以及与远程分支一致性，以确认是否需推送
   - git log 和 \`git diff [base-branch]...HEAD\`，掌握当前分支与主干分支自分叉后的全部历史
2. 分析所有将包含在 PR 中的更改，确保关注所有相关提交（不仅仅是最后一次），编写 PR 标题和正文摘要：
   - PR 标题简短（<70 字）
   - 详细描述内容写在正文中，不要出现在标题里
3. 并行执行以下操作：
   - 如有需要新建分支
   - 如有需要带 -u 标志 push 到远程
   - 用如下格式通过 gh pr create 创建 PR，PR 正文通过 HEREDOC 传入确保格式正确
<示例>
gh pr create --title "PR 标题" --body "$(cat <<'EOF'
## 概要
<1-3 项要点>

## 测试计划
[本 PR 需测试的检查清单]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</示例>

注意事项：
- 禁止使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 工具
- 创建 PR 完成后请返回 PR URL 供用户查阅

# 其他常见操作
- 查看 Github PR 评论：gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager 从多个来源合并配置（设置层、默认值、CLI 标志）
// 但不会去重，所以类似 ~/.cache 的路径会在 allowOnly 中出现 3 次。
// 在内联到提示词之前在此去重 —— 仅影响模型看到的内容，
// 不影响沙箱执行。启用沙箱时可节省约 150-200 tokens/request。
function dedup<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return arr
  return [...new Set(arr)]
}

function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) {
    return ''
  }

  const fsReadConfig = SandboxManager.getFsReadConfig()
  const fsWriteConfig = SandboxManager.getFsWriteConfig()
  const networkRestrictionConfig = SandboxManager.getNetworkRestrictionConfig()
  const allowUnixSockets = SandboxManager.getAllowUnixSockets()
  const ignoreViolations = SandboxManager.getIgnoreViolations()
  const allowUnsandboxedCommands =
    SandboxManager.areUnsandboxedCommandsAllowed()

  // Replace the per-UID temp dir literal (e.g. /private/tmp/claude-1001/) with
  // "$TMPDIR" so the prompt is identical across users â€” avoids busting the
  // cross-user global prompt cache. The sandbox already sets $TMPDIR at runtime.
  const claudeTempDir = getClaudeTempDir()
  const normalizeAllowOnly = (paths: string[]): string[] =>
    [...new Set(paths)].map(p => (p === claudeTempDir ? '$TMPDIR' : p))

  const filesystemConfig = {
    read: {
      denyOnly: dedup(fsReadConfig.denyOnly),
      ...(fsReadConfig.allowWithinDeny && {
        allowWithinDeny: dedup(fsReadConfig.allowWithinDeny),
      }),
    },
    write: {
      allowOnly: normalizeAllowOnly(fsWriteConfig.allowOnly),
      denyWithinAllow: dedup(fsWriteConfig.denyWithinAllow),
    },
  }

  const networkConfig = {
    ...(networkRestrictionConfig?.allowedHosts && {
      allowedHosts: dedup(networkRestrictionConfig.allowedHosts),
    }),
    ...(networkRestrictionConfig?.deniedHosts && {
      deniedHosts: dedup(networkRestrictionConfig.deniedHosts),
    }),
    ...(allowUnixSockets && { allowUnixSockets: dedup(allowUnixSockets) }),
  }

  const restrictionsLines = []
  if (Object.keys(filesystemConfig).length > 0) {
    restrictionsLines.push(`文件系统限制: ${jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`网络限制: ${jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `已忽略的限制: ${jsonStringify(ignoreViolations)}`,
    )
  }

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? [
          '默认应在沙箱内运行命令。只有在以下情况下才可设置 `dangerouslyDisableSandbox: true`：',
          [
            '用户明确要求跳过沙箱',
            '某命令执行失败，并且确实由于沙箱限制导致失败。注意，命令失败也可能由其它原因引起（如缺文件、参数错误、网络问题等）',
          ],
          '沙箱导致失败的典型表现：',
          [
            '文件或网络操作报“无权限”错误',
            '访问非允许目录时被拒绝',
            '尝试连接未允许的网络主机失败',
            'Unix socket 连接失败',
          ],
          '如果确认因沙箱失败：',
          [
            "立即用 `dangerouslyDisableSandbox: true` 重试（无需确认，直接重试）",
            '简要说明是沙箱哪个限制导致失败。可提醒用户可用 `/sandbox` 命令管理沙箱限制。',
            '此操作会请求用户授权',
          ],
          '每个用 `dangerouslyDisableSandbox: true` 的命令都应单独处理。即便之前用过，下次仍要优先用沙箱。',
          '不要建议将敏感路径（如 ~/.bashrc、~/.zshrc、~/.ssh/* 或凭据类文件）加入沙箱白名单。',
        ]
      : [
          '所有命令必须在沙箱模式下运行，`dangerouslyDisableSandbox` 已被策略禁止。',
          '在任何情况下都不能跳出沙箱执行命令。',
          '如因沙箱限制导致命令失败，应协助用户调整沙箱设置，而非绕过沙箱。',
        ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    '临时文件请务必使用环境变量 `$TMPDIR`，不要直接用 `/tmp`。沙箱会自动设置 TMPDIR 到允许写入的安全目录。',
  ]

  return [
    '',
    '## 命令沙箱',
    '默认情况下，命令会在沙箱内运行。沙箱用于控制命令对哪些目录和网络主机的访问权限，只有获得明确授权才可突破。',
    '',
    '当前沙箱限制如下：',
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant-native 构建将 find/grep 别名为 Claude shell 中嵌入的 bfs/ugrep，
  // 所以我们不引导用户使用它们（Glob/Grep 工具被移除）。
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `文件搜索：使用 ${GLOB_TOOL_NAME}（不要用 find 或 ls）`,
          `内容搜索：使用 ${GREP_TOOL_NAME}（不要用 grep 或 rg）`,
        ]),
    `读取文件：使用 ${FILE_READ_TOOL_NAME}（不要用 cat/head/tail）`,
    `编辑文件：使用 ${FILE_EDIT_TOOL_NAME}（不要用 sed/awk）`,
    `写入文件：使用 ${FILE_WRITE_TOOL_NAME}（不要用 echo >/cat <<EOF）`,
    '输出文本：直接输出（不要用 echo/printf）',
  ]

  const avoidCommands = embedded
    ? '`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'
    : '`find`、`grep`、`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'

  const multipleCommandsSubitems = [
    `如果命令是独立的且可以并行运行，在单条消息中发送多个 ${BASH_TOOL_NAME} 工具调用。例如：如果你需要运行 "git status" 和 "git diff"，发送一条包含两个 ${BASH_TOOL_NAME} 工具调用的并行消息。`,
    `如果命令相互依赖且必须顺序运行，使用带 '&&' 的单个 ${BASH_TOOL_NAME} 调用将它们链接在一起。`,
    "仅在你需要顺序运行命令但不在意早期命令是否失败时使用 ';'。",
    '不要用换行符分隔命令（引号字符串中的换行符是可以的）。',
  ]

  const gitSubitems = [
    '优先创建新提交而非修改现有提交。',
    '在运行破坏性操作之前（如 git reset --hard、git push --force、git checkout --），考虑是否有更安全的替代方案来实现相同目标。仅在破坏性操作确实是最佳方案时才使用。',
    '除非用户明确要求，否则不要跳过 hooks（--no-verify）或绕过签名（--no-gpg-sign、-c commit.gpgsign=false）。如果 hook 失败，调查并修复根本问题。',
  ]

  const sleepSubitems = [
    '不要在可以立即运行的命令之间使用 sleep —— 直接运行即可。',
    ...(feature('MONITOR_TOOL')
      ? [
          '使用 Monitor 工具从后台进程流式传输事件（每个 stdout 行都是一条通知）。对于一次性的"等待完成"，使用带 run_in_background 的 Bash。',
        ]
      : []),
    '如果你的命令运行时间较长且希望在完成后收到通知 —— 使用 `run_in_background`。不需要 sleep。',
    '不要在 sleep 循环中重试失败命令 —— 诊断根本原因。',
    '如果正在等待你用 `run_in_background` 启动的后台任务，任务完成时会收到通知 —— 不要轮询。',
    ...(feature('MONITOR_TOOL')
      ? [
          '作为第一个命令的 `sleep N`（N ≥ 2）被阻止。如果你需要延迟（速率限制、刻意节奏控制），保持在 2 秒以内。',
        ]
      : [
          '如果必须轮询外部进程，使用检查命令（如 `gh run view`）而非先 sleep。',
          '如果必须 sleep，保持时间短暂（1-5 秒）以避免阻塞用户。',
        ]),
  ]
  const backgroundNote = getBackgroundUsageNote()

  const instructionItems: Array<string | string[]> = [
    '如果你的命令将创建新目录或文件，先使用此工具运行 `ls` 验证父目录存在且位置正确。',
    '在命令中始终用双引号引用包含空格的路径（如 cd "path with spaces/file.txt"）',
    '尽量通过使用绝对路径和避免使用 `cd` 来保持整个会话的工作目录不变。如果用户明确要求，你可以使用 `cd`。',
    `你可以指定可选的超时时间（最高 ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分钟���。默认情况下，命令将在 ${getDefaultTimeoutMs()}ms（${getDefaultTimeoutMs() / 60000} 分钟）后超时。`,
    ...(backgroundNote !== null ? [backgroundNote] : []),
    '发出多个命令时：',
    multipleCommandsSubitems,
    '对于 git 命令：',
    gitSubitems,
    '避免不必要的 `sleep` 命令：',
    sleepSubitems,
    ...(embedded
      ? [
          // bfs（支持 `find` 的后端）使用 Oniguruma 进行 -regex，它选择
          // 第一个匹配的可选项（从左到右），与 GNU find 的
          // POSIX 最左最长匹配不同。当较短的可选项是较长可选项的前缀时，
          // 这会静默丢弃匹配。
          "使用 `find -regex` 和可选项时，将最长的可选项放在前面。例如：使用 `'.*\\.\\(tsx\\|ts\\)'` 而非 `'.*\\.\\(ts\\|tsx\\)'` —— 后一种形式会静默跳过 `.tsx` 文件。",
        ]
      : []),
  ]

  return [
    '执行给定的 bash 命令并返回其输出。',
    '',
    '工作目录在命令之间保持不变，但 shell 状态不会。Shell 环境从用户的配置文件（bash 或 zsh）初始化。',
    '',
    `重要：请避免使用此工具运行 ${avoidCommands} 命令，除非明确指示或在你已验证专用工具无法完成任务后。应该使用适当的专用工具，因为这将为用户提供更好的体验：`,
    '',
    ...prependBullets(toolPreferenceItems),
    `虽然 ${BASH_TOOL_NAME} 工具可以做类似的事情，但最好使用内置工具，因为它们提供更好的用户体验，并使审查工具调用和授予权限变得更加容易。`,
    '',
    '# 说明',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}
