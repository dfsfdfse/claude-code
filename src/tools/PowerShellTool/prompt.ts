import { isEnvTruthy } from '../../utils/envUtils.js'
import { getMaxOutputLength } from '../../utils/shell/outputLimits.js'
import {
  getPowerShellEdition,
  type PowerShellEdition,
} from '../../utils/shell/powershellDetection.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from './toolName.js'

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
  return `  - 你可以使用 \`run_in_background\` 参数在后台运行命令。只有在不需要立即获取结果并且可以在命令稍后完成时收到通知的情况下才使用此参数。你不需要立即检查输出——命令完成时会收到通知。`
}

function getSleepGuidance(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return `  - 避免不必要的 \`Start-Sleep\` 命令：
    - 不要在可以立即运行的命令之间睡眠——直接运行即可。
    - 如果你的命令运行时间较长且希望在完成时收到通知——只需使用 \`run_in_background\` 运行你的命令。这种情况下不需要睡眠。
    - 不要在睡眠循环中重试失败的命令——诊断根本原因或考虑替代方法。
    - 如果等待用 \`run_in_background\` 启动的后台任务，它完成时会收到通知——不要轮询。
    - 如果必须轮询外部进程，使用检查命令而不是先睡眠。
    - 如果必须睡眠，保持时间短（1-5 秒）以避免阻塞用户。`
}

/**
 * 版本特定的语法指导。模型的训练数据涵盖两种版本，但它无法判断目标版本，
 * 所以它要么在 5.1 上发出 pwsh-7 语法（解析错误 → 退出 1），要么在 7 上不必要地避免使用 &&。
 */
function getEditionSection(edition: PowerShellEdition | null): string {
  if (edition === 'desktop') {
    return `PowerShell 版本：Windows PowerShell 5.1 (powershell.exe)
   - 管道链操作符 \`&&\` 和 \`||\` 不可用——它们会导致解析错误。要在 A 成功后运行 B：\`A; if ($?) { B }\`。无条件链：\`A; B\`。
   - 三元（\`?:\`）、空值合并（\`??\`）和空值条件（\`?.\`）操作符不可用。改用 \`if/else\` 和显式 \`$null -eq\` 检查。
   - 避免在原生可执行文件上使用 \`2>&1\`。在 5.1 中，在 PowerShell 内重定向原生命令的 stderr 会将每一行包装在 ErrorRecord (NativeCommandError) 中，并将 \`$?\` 设置为 \`$false\`，即使 exe 返回退出代码 0。stderr 已经为你捕获——不要重定向它。
   - 默认文件编码是带 BOM 的 UTF-16 LE。写入其他工具会读取的文件时，传递 \`-Encoding utf8\` 到 \`Out-File\`/\`Set-Content\`。
   - \`ConvertFrom-Json\` 返回 PSCustomObject，不是 hashtable。\`-AsHashtable\` 不可用。`
  }
  if (edition === 'core') {
    return `PowerShell 版本：PowerShell 7+ (pwsh)
   - 管道链操作符 \`&&\` 和 \`||\` 可用，工作方式与 bash 相同。当 cmd2 只应在 cmd1 成功时运行时，优先使用 \`cmd1 && cmd2\` 而不是 \`cmd1; cmd2\`。
   - 三元（\`$cond ? $a : $b\`）、空值合并（\`??\`）和空值条件（\`?.\`）操作符可用。
   - 默认文件编码是 UTF-8 without BOM。`
  }
  // 尚未解析（首次提示词构建在任何工具调用之前）或未安装 PS。给出保守的 5.1 安全指导。
  return `PowerShell 版本：未知——为兼容性假定 Windows PowerShell 5.1
   - 不要使用 \`&&\`、\`||\`、三元 \`?:\`、空值合并 \`??\` 或空值条件 \`?.\`。这些仅在 PowerShell 7+ 可用，在 5.1 上会导致解析错误。
   - 条件链命令：\`A; if ($?) { B }\`。无条件：\`A; B\`。`
}

export async function getPrompt(): Promise<string> {
  const backgroundNote = getBackgroundUsageNote()
  const sleepGuidance = getSleepGuidance()
  const edition = await getPowerShellEdition()

  return `执行给定的 PowerShell 命令，可选超时。工作目录在命令之间保持；shell 状态（变量、函数）不保持。

重要提示：此工具用于通过 PowerShell 进行终端操作：git、npm、docker 和 PS cmdlet。不要将其用于文件操作（读取、写入、编辑、搜索、查找文件）——改用专用工具。

${getEditionSection(edition)}

执行命令之前，请遵循以下步骤：

1. 目录验证：
   - 如果命令将创建新目录或文件，首先使用 \`Get-ChildItem\`（或 \`ls\`）验证父目录存在且位于正确位置

2. 命令执行：
   - 包含空格的文件路径始终用双引号括起来
   - 捕获命令的输出。

PowerShell 语法说明：
   - 变量使用 $ 前缀：$myVar = "value"
   - 转义字符是反引号（\`），不是反斜杠
   - 使用动词-名词 cmdlet 命名：Get-ChildItem、Set-Location、New-Item、Remove-Item
   - 常用别名：ls (Get-ChildItem)、cd (Set-Location)、cat (Get-Content)、rm (Remove-Item)
   - 管道操作符 | 工作方式与 bash 类似，但传递对象而非文本
   - 使用 Select-Object、Where-Object、ForEach-Object 进行过滤和转换
   - 字符串插值："Hello $name" 或 "Hello $($obj.Property)"
   - 注册表访问使用 PSDrive 前缀：\`HKLM:\\SOFTWARE\\...\`、\`HKCU:\\...\`，不要使用原始 \`HKEY_LOCAL_MACHINE\\...\`
   - 环境变量：用 \`$env:NAME\` 读取，用 \`$env:NAME = "value"\` 设置（不要使用 \`Set-Variable\` 或 bash \`export\`）
   - 用空格调用原生 exe：通过调用操作符：\`& "C:\\Program Files\\App\\app.exe" arg1 arg2\`

交互式和阻塞命令（会挂起——此工具以 -NonInteractive 运行）：
   - 绝不要使用 \`Read-Host\`、\`Get-Credential\`、\`Out-GridView\`、\`$Host.UI.PromptForChoice\` 或 \`pause\`
   - 破坏性 cmdlet（\`Remove-Item\`、\`Stop-Process\`、\`Clear-Content\` 等）可能提示确认。当你打算继续操作时添加 \`-Confirm:$false\`。对只读/隐藏项使用 \`-Force\`。
   - 绝不要使用 \`git rebase -i\`、\`git add -i\` 或其他打开交互式编辑器的命令

向原生可执行文件传递多行字符串（提交消息、文件内容）：
   - 使用单引号 here-string，这样 PowerShell 不会展开内部的 \`$\` 或反引号。结束 \`'@\`
     必须在其自己的行上位于第 0 列（无前导空白）——缩进它是解析错误：
<example>
git commit -m @'
提交消息在这里。
带有 $literal 美元符号的第二行。
'@
</example>
   - 使用 \`@'...'@\`（单引号，字面量）而不是 \`@"..."@\`（双引号，插值），除非你需要变量展开
   - 对于包含 \`-\`、\`@\`
     或 PowerShell 解析为操作符的其他字符的参数，使用停止解析标记：\`git log --% --format=%H\`

使用说明：
  - command 参数是必需的。
  - 你可以指定可选的超时时间（以毫秒为单位，最多 ${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分钟）。如果未指定，命令将在 ${getDefaultTimeoutMs()}ms（${getDefaultTimeoutMs() / 60000} 分钟）后超时。
  - 写一个清晰、简洁的命令描述会很有帮助。
  - 如果输出超过 ${getMaxOutputLength()} 个字符，输出在被返回给你之前会被截断。
${backgroundNote ? backgroundNote + '\n' : ''}\
  - 避免使用 PowerShell 运行有专用工具的命令，除非明确指示：
    - 文件搜索：使用 ${GLOB_TOOL_NAME}（不是 Get-ChildItem -Recurse）
    - 内容搜索：使用 ${GREP_TOOL_NAME}（不是 Select-String）
    - 读取文件：使用 ${FILE_READ_TOOL_NAME}（不是 Get-Content）
    - 编辑文件：使用 ${FILE_EDIT_TOOL_NAME}
    - 写入文件：使用 ${FILE_WRITE_TOOL_NAME}（不是 Set-Content/Out-File）
    - 通信：直接输出文本（不是 Write-Output/Write-Host）
  - 当发出多个命令时：
    - 如果命令是独立的且可以并行运行，在单条消息中进行多个 ${POWERSHELL_TOOL_NAME} 工具调用。
    - 如果命令相互依赖且必须顺序运行，在单个 ${POWERSHELL_TOOL_NAME} 调用中链接它们（参见上面特定版本的链接语法）。
    - 只有在需要顺序运行命令但不在乎早期命令是否失败时才使用 \`;\`。
    - 不要使用换行符分隔命令（换行符在引号字符串和 here-string 中是允许的）
  - 不要在命令前加上 \`cd\` 或 \`Set-Location\`——工作目录已自动设置为正确的项目目录。
${sleepGuidance ? sleepGuidance + '\n' : ''}\
  - 对于 git 命令：
    - 优先创建新提交而不是修改现有提交。
    - 在运行破坏性操作（如 git reset --hard、git push --force、git checkout --）之前，考虑是否有更安全的替代方案可以实现相同目标。只有在真正最佳方法时才使用破坏性操作。
    - 除非用户明确要求，否则不要跳过钩子（--no-verify）或绕过签名（--no-gpg-sign、-c commit.gpgsign=false）。如果钩子失败，调查并修复根本问题。`
}
