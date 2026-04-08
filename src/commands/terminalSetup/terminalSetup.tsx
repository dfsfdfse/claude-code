import chalk from 'chalk'
import { randomBytes } from 'crypto'
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { homedir, platform } from 'os'
import { dirname, join } from 'path'
import type { ThemeName } from 'src/utils/theme.js'
import { pathToFileURL } from 'url'
import { supportsHyperlinks } from '@anthropic/ink'
import { color } from '@anthropic/ink'
import { maybeMarkProjectOnboardingComplete } from '../../projectOnboardingState.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  backupTerminalPreferences,
  checkAndRestoreTerminalBackup,
  getTerminalPlistPath,
  markTerminalSetupComplete,
} from '../../utils/appleTerminalBackup.js'
import { setupShellCompletion } from '../../utils/completionCache.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { env } from '../../utils/env.js'
import { isFsInaccessible } from '../../utils/errors.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { addItemToJSONCArray, safeParseJSONC } from '../../utils/json.js'
import { logError } from '../../utils/log.js'
import { getPlatform } from '../../utils/platform.js'
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'

const EOL = '\n'

// Terminals that natively support CSI u / Kitty keyboard protocol
const NATIVE_CSIU_TERMINALS: Record<string, string> = {
  ghostty: 'Ghostty',
  kitty: 'Kitty',
  'iTerm.app': 'iTerm2',
  WezTerm: 'WezTerm',
  WarpTerminal: 'Warp',
}

/**
 * Detect if we're running in a VSCode Remote SSH session.
 * In this case, keybindings need to be installed on the LOCAL machine,
 * not the remote server where Claude is running.
 */
function isVSCodeRemoteSSH(): boolean {
  const askpassMain = process.env.VSCODE_GIT_ASKPASS_MAIN ?? ''
  const path = process.env.PATH ?? ''

  // Check both env vars - VSCODE_GIT_ASKPASS_MAIN is more reliable when git extension
  // is active, and PATH is a fallback. Omit path separator for Windows compatibility.
  return (
    askpassMain.includes('.vscode-server') ||
    askpassMain.includes('.cursor-server') ||
    askpassMain.includes('.windsurf-server') ||
    path.includes('.vscode-server') ||
    path.includes('.cursor-server') ||
    path.includes('.windsurf-server')
  )
}

export function getNativeCSIuTerminalDisplayName(): string | null {
  if (!env.terminal || !(env.terminal in NATIVE_CSIU_TERMINALS)) {
    return null
  }
  return NATIVE_CSIU_TERMINALS[env.terminal] ?? null
}

/**
 * Format a file path as a clickable hyperlink.
 *
 * Paths containing spaces (e.g., "Application Support") are not clickable
 * in most terminals - they get split at the space. OSC 8 hyperlinks solve
 * this by embedding a file:// URL that the terminal can open on click,
 * while displaying the clean path to the user.
 *
 * Unlike createHyperlink(), this doesn't apply any color styling so the
 * path inherits the parent's styling (e.g., chalk.dim).
 */
function formatPathLink(filePath: string): string {
  if (!supportsHyperlinks()) {
    return filePath
  }
  const fileUrl = pathToFileURL(filePath).href
  // OSC 8 hyperlink: \e]8;;URL\a TEXT \e]8;;\a
  return `\x1b]8;;${fileUrl}\x07${filePath}\x1b]8;;\x07`
}

export function shouldOfferTerminalSetup(): boolean {
  // iTerm2, WezTerm, Ghostty, Kitty, and Warp natively support CSI u / Kitty
  // keyboard protocol, which Claude Code already parses. No setup needed for
  // these terminals.
  return (
    (platform() === 'darwin' && env.terminal === 'Apple_Terminal') ||
    env.terminal === 'vscode' ||
    env.terminal === 'cursor' ||
    env.terminal === 'windsurf' ||
    env.terminal === 'alacritty' ||
    env.terminal === 'zed'
  )
}

export async function setupTerminal(theme: ThemeName): Promise<string> {
  let result = ''

  switch (env.terminal) {
    case 'Apple_Terminal':
      result = await enableOptionAsMetaForTerminal(theme)
      break
    case 'vscode':
      result = await installBindingsForVSCodeTerminal('VSCode', theme)
      break
    case 'cursor':
      result = await installBindingsForVSCodeTerminal('Cursor', theme)
      break
    case 'windsurf':
      result = await installBindingsForVSCodeTerminal('Windsurf', theme)
      break
    case 'alacritty':
      result = await installBindingsForAlacritty(theme)
      break
    case 'zed':
      result = await installBindingsForZed(theme)
      break
    case null:
      break
  }

  saveGlobalConfig(current => {
    if (
      ['vscode', 'cursor', 'windsurf', 'alacritty', 'zed'].includes(
        env.terminal ?? '',
      )
    ) {
      if (current.shiftEnterKeyBindingInstalled === true) return current
      return { ...current, shiftEnterKeyBindingInstalled: true }
    } else if (env.terminal === 'Apple_Terminal') {
      if (current.optionAsMetaKeyInstalled === true) return current
      return { ...current, optionAsMetaKeyInstalled: true }
    }
    return current
  })

  maybeMarkProjectOnboardingComplete()

  // Install shell completions (ant-only, since the completion command is ant-only)
  if (process.env.USER_TYPE === 'ant') {
    result += await setupShellCompletion(theme)
  }

  return result
}

export function isShiftEnterKeyBindingInstalled(): boolean {
  return getGlobalConfig().shiftEnterKeyBindingInstalled === true
}

export function hasUsedBackslashReturn(): boolean {
  return getGlobalConfig().hasUsedBackslashReturn === true
}

export function markBackslashReturnUsed(): void {
  const config = getGlobalConfig()
  if (!config.hasUsedBackslashReturn) {
    saveGlobalConfig(current => ({
      ...current,
      hasUsedBackslashReturn: true,
    }))
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  _args: string,
): Promise<null> {
  if (env.terminal && env.terminal in NATIVE_CSIU_TERMINALS) {
    const message = `${NATIVE_CSIU_TERMINALS[env.terminal]} 原生支持 Shift+Enter。

无需配置。使用 Shift+Enter 即可添加换行符。`
    onDone(message)
    return null
  }

  // Check if terminal is supported
  if (!shouldOfferTerminalSetup()) {
    const terminalName = env.terminal || '您当前的终端'
    const currentPlatform = getPlatform()

    // Build platform-specific terminal suggestions
    let platformTerminals = ''
    if (currentPlatform === 'macos') {
      platformTerminals = '   • macOS：Apple Terminal\n'
    } else if (currentPlatform === 'windows') {
      platformTerminals = '   • Windows：Windows Terminal\n'
    }

    const message = `无法从 ${terminalName} 运行终端设置。

此命令用于配置便捷的 Shift+Enter 快捷键以输入多行提示。
${chalk.dim('注意：您已可使用反斜杠（\\\\）+ 回车来添加换行符。')}

设置快捷键（可选）：
1. 暂时退出 tmux/screen
2. 直接在以下终端之一中运行 /terminal-setup：
${platformTerminals}   • IDE：VSCode、Cursor、Windsurf、Zed
   • 其他：Alacritty
3. 返回 tmux/screen——设置将保持

${chalk.dim('注意：iTerm2、WezTerm、Ghostty、Kitty 和 Warp 原生支持 Shift+Enter。')}`
    onDone(message)
    return null
  }

  const result = await setupTerminal(context.options.theme)
  onDone(result)
  return null
}

type VSCodeKeybinding = {
  key: string
  command: string
  args: { text: string }
  when: string
}

async function installBindingsForVSCodeTerminal(
  editor: 'VSCode' | 'Cursor' | 'Windsurf' = 'VSCode',
  theme: ThemeName,
): Promise<string> {
  // Check if we're running in a VSCode Remote SSH session
  // In this case, keybindings need to be installed on the LOCAL machine
  if (isVSCodeRemoteSSH()) {
    return `${color(
      'warning',
      theme,
    )(
      `无法从远程 ${editor} 会话安装按键绑定。`,
    )}${EOL}${EOL}${editor} 按键绑定必须安装到您的本地计算机，而非远程服务器。${EOL}${EOL}安装 Shift+Enter 按键绑定：${EOL}1. 在本地计算机上打开 ${editor}（不要连接远程）${EOL}2. 打开命令面板（Cmd/Ctrl+Shift+P）→ "首选项：打开键盘快捷键（JSON）"${EOL}3. 添加此按键绑定（文件必须是 JSON 数组）：${EOL}${EOL}${chalk.dim(`[
  {
    "key": "shift+enter",
    "command": "workbench.action.terminal.sendSequence",
    "args": { "text": "\\u001b\\r" },
    "when": "terminalFocus"
  }
]`)}${EOL}`
  }

  const editorDir = editor === 'VSCode' ? 'Code' : editor
  const userDirPath = join(
    homedir(),
    platform() === 'win32'
      ? join('AppData', 'Roaming', editorDir, 'User')
      : platform() === 'darwin'
        ? join('Library', 'Application Support', editorDir, 'User')
        : join('.config', editorDir, 'User'),
  )
  const keybindingsPath = join(userDirPath, 'keybindings.json')

  try {
    // Ensure user directory exists (idempotent with recursive)
    await mkdir(userDirPath, { recursive: true })

    // Read existing keybindings file, or default to empty array if it doesn't exist
    let content = '[]'
    let keybindings: VSCodeKeybinding[] = []
    let fileExists = false
    try {
      content = await readFile(keybindingsPath, { encoding: 'utf-8' })
      fileExists = true
      keybindings = (safeParseJSONC(content) as VSCodeKeybinding[]) ?? []
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e
    }

    // Backup the existing file before modifying it
    if (fileExists) {
      const randomSha = randomBytes(4).toString('hex')
      const backupPath = `${keybindingsPath}.${randomSha}.bak`
      try {
        await copyFile(keybindingsPath, backupPath)
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          `备份现有 ${editor} 终端按键绑定时出错。放弃操作。`,
        )}${EOL}${chalk.dim(`参见 ${formatPathLink(keybindingsPath)}`)}${EOL}${chalk.dim(`备份路径：${formatPathLink(backupPath)}`)}${EOL}`
      }
    }

    // Check if keybinding already exists
    const existingBinding = keybindings.find(
      binding =>
        binding.key === 'shift+enter' &&
        binding.command === 'workbench.action.terminal.sendSequence' &&
        binding.when === 'terminalFocus',
    )
    if (existingBinding) {
      return `${color(
        'warning',
        theme,
      )(
        `发现现有 ${editor} 终端 Shift+Enter 按键绑定。请先移除它以继续。`,
      )}${EOL}${chalk.dim(`参见 ${formatPathLink(keybindingsPath)}`)}${EOL}`
    }

    // Create the new keybinding
    const newKeybinding: VSCodeKeybinding = {
      key: 'shift+enter',
      command: 'workbench.action.terminal.sendSequence',
      args: { text: '\u001b\r' },
      when: 'terminalFocus',
    }

    // Modify the content by adding the new keybinding while preserving comments and formatting
    const updatedContent = addItemToJSONCArray(content, newKeybinding)

    // Write the updated content back to the file
    await writeFile(keybindingsPath, updatedContent, { encoding: 'utf-8' })

    return `${color(
      'success',
      theme,
    )(
      `已安装 ${editor} 终端 Shift+Enter 按键绑定`,
    )}${EOL}${chalk.dim(`参见 ${formatPathLink(keybindingsPath)}`)}${EOL}`
  } catch (error) {
    logError(error)
    throw new Error(
      `安装 ${editor} 终端 Shift+Enter 按键绑定失败`,
    )
  }
}

async function enableOptionAsMetaForProfile(
  profileName: string,
): Promise<boolean> {
  // First try to add the property (in case it doesn't exist)
  // Quote the profile name to handle names with spaces (e.g., "Man Page", "Red Sands")
  const { code: addCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
    '-c',
    `Add :'Window Settings':'${profileName}':useOptionAsMetaKey bool true`,
    getTerminalPlistPath(),
  ])

  // If adding fails (likely because it already exists), try setting it instead
  if (addCode !== 0) {
    const { code: setCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
      '-c',
      `Set :'Window Settings':'${profileName}':useOptionAsMetaKey true`,
      getTerminalPlistPath(),
    ])

    if (setCode !== 0) {
      logError(
        new Error(
          `为 Terminal.app 配置文件的 ${profileName} 启用 Option 作为 Meta 键失败`,
        ),
      )
      return false
    }
  }

  return true
}

async function disableAudioBellForProfile(
  profileName: string,
): Promise<boolean> {
  // First try to add the property (in case it doesn't exist)
  // Quote the profile name to handle names with spaces (e.g., "Man Page", "Red Sands")
  const { code: addCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
    '-c',
    `Add :'Window Settings':'${profileName}':Bell bool false`,
    getTerminalPlistPath(),
  ])

  // If adding fails (likely because it already exists), try setting it instead
  if (addCode !== 0) {
    const { code: setCode } = await execFileNoThrow('/usr/libexec/PlistBuddy', [
      '-c',
      `Set :'Window Settings':'${profileName}':Bell false`,
      getTerminalPlistPath(),
    ])

    if (setCode !== 0) {
      logError(
        new Error(
          `为 Terminal.app 配置文件的 ${profileName} 禁用音频提示音失败`,
        ),
      )
      return false
    }
  }

  return true
}

// Enable Option as Meta key for Terminal.app
async function enableOptionAsMetaForTerminal(
  theme: ThemeName,
): Promise<string> {
  try {
    // Create a backup of the current plist file
    const backupPath = await backupTerminalPreferences()
    if (!backupPath) {
      throw new Error(
        '创建 Terminal.app 偏好设置备份失败，放弃操作',
      )
    }

    // Read the current default profile from the plist
    const { stdout: defaultProfile, code: readCode } = await execFileNoThrow(
      'defaults',
      ['read', 'com.apple.Terminal', 'Default Window Settings'],
    )

    if (readCode !== 0 || !defaultProfile.trim()) {
      throw new Error('读取默认 Terminal.app 配置文件失败')
    }

    const { stdout: startupProfile, code: startupCode } = await execFileNoThrow(
      'defaults',
      ['read', 'com.apple.Terminal', 'Startup Window Settings'],
    )
    if (startupCode !== 0 || !startupProfile.trim()) {
      throw new Error('读取启动 Terminal.app 配置文件失败')
    }

    let wasAnyProfileUpdated = false

    const defaultProfileName = defaultProfile.trim()
    const optionAsMetaEnabled =
      await enableOptionAsMetaForProfile(defaultProfileName)
    const audioBellDisabled =
      await disableAudioBellForProfile(defaultProfileName)

    if (optionAsMetaEnabled || audioBellDisabled) {
      wasAnyProfileUpdated = true
    }

    const startupProfileName = startupProfile.trim()

    // Only proceed if the startup profile is different from the default profile
    if (startupProfileName !== defaultProfileName) {
      const startupOptionAsMetaEnabled =
        await enableOptionAsMetaForProfile(startupProfileName)
      const startupAudioBellDisabled =
        await disableAudioBellForProfile(startupProfileName)

      if (startupOptionAsMetaEnabled || startupAudioBellDisabled) {
        wasAnyProfileUpdated = true
      }
    }

    if (!wasAnyProfileUpdated) {
      throw new Error(
        '为任何 Terminal.app 配置文件启用 Option 作为 Meta 键或禁用音频提示音失败',
      )
    }

    // Flush the preferences cache
    await execFileNoThrow('killall', ['cfprefsd'])

    markTerminalSetupComplete()

    return `${color(
      'success',
      theme,
    )(
      `已配置 Terminal.app 设置：`,
    )}${EOL}${color('success', theme)('- 已启用"使用 Option 作为 Meta 键"')}${EOL}${color('success', theme)('- 已切换到视觉提示音')}${EOL}${chalk.dim('Option+Enter 现在将输入换行符。')}${EOL}${chalk.dim('您必须重启 Terminal.app 才能使更改生效。', theme)}${EOL}`
  } catch (error) {
    logError(error)

    // Attempt to restore from backup
    const restoreResult = await checkAndRestoreTerminalBackup()

    const errorMessage = '为 Terminal.app 启用 Option 作为 Meta 键失败。'
    if (restoreResult.status === 'restored') {
      throw new Error(
        `${errorMessage} 您的设置已从备份恢复。`,
      )
    } else if (restoreResult.status === 'failed') {
      throw new Error(
        `${errorMessage} 从备份恢复失败，请尝试手动操作：defaults import com.apple.Terminal ${restoreResult.backupPath}`,
      )
    } else {
      throw new Error(
        `${errorMessage} 没有可用的备份可供恢复。`,
      )
    }
  }
}

async function installBindingsForAlacritty(theme: ThemeName): Promise<string> {
  const ALACRITTY_KEYBINDING = `[[keyboard.bindings]]
key = "Return"
mods = "Shift"
chars = "\\u001B\\r"`

  // Get Alacritty config file paths in order of preference
  const configPaths: string[] = []

  // XDG config path (Linux and macOS)
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
  if (xdgConfigHome) {
    configPaths.push(join(xdgConfigHome, 'alacritty', 'alacritty.toml'))
  } else {
    configPaths.push(join(homedir(), '.config', 'alacritty', 'alacritty.toml'))
  }

  // Windows-specific path
  if (platform() === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      configPaths.push(join(appData, 'alacritty', 'alacritty.toml'))
    }
  }

  // Find existing config file by attempting to read it, or use first preferred path
  let configPath: string | null = null
  let configContent = ''
  let configExists = false

  for (const path of configPaths) {
    try {
      configContent = await readFile(path, { encoding: 'utf-8' })
      configPath = path
      configExists = true
      break
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e
      // File missing or inaccessible — try next config path
    }
  }

  // If no config exists, use the first path (XDG/default location)
  if (!configPath) {
    configPath = configPaths[0] ?? null
  }

  if (!configPath) {
    throw new Error('未找到 Alacritty 的有效配置路径')
  }

  try {
    if (configExists) {
      // Check if keybinding already exists (look for Shift+Return binding)
      if (
        configContent.includes('mods = "Shift"') &&
        configContent.includes('key = "Return"')
      ) {
        return `${color(
          'warning',
          theme,
        )(
          '发现现有 Alacritty Shift+Enter 按键绑定。请先移除它以继续。',
        )}${EOL}${chalk.dim(`参见 ${formatPathLink(configPath)}`)}${EOL}`
      }

      // Create backup
      const randomSha = randomBytes(4).toString('hex')
      const backupPath = `${configPath}.${randomSha}.bak`
      try {
        await copyFile(configPath, backupPath)
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          '备份现有 Alacritty 配置时出错。放弃操作。',
        )}${EOL}${chalk.dim(`参见 ${formatPathLink(configPath)}`)}${EOL}${chalk.dim(`备份路径：${formatPathLink(backupPath)}`)}${EOL}`
      }
    } else {
      // Ensure config directory exists (idempotent with recursive)
      await mkdir(dirname(configPath), { recursive: true })
    }

    // Add the keybinding to the config
    let updatedContent = configContent
    if (configContent && !configContent.endsWith('\n')) {
      updatedContent += '\n'
    }
    updatedContent += '\n' + ALACRITTY_KEYBINDING + '\n'

    // Write the updated config
    await writeFile(configPath, updatedContent, { encoding: 'utf-8' })

    return `${color(
      'success',
      theme,
    )('已安装 Alacritty Shift+Enter 按键绑定')}${EOL}${color(
      'success',
      theme,
    )(
      '您可能需要重启 Alacritty 才能使更改生效',
    )}${EOL}${chalk.dim(`参见 ${formatPathLink(configPath)}`)}${EOL}`
  } catch (error) {
    logError(error)
    throw new Error('安装 Alacritty Shift+Enter 按键绑定失败')
  }
}

async function installBindingsForZed(theme: ThemeName): Promise<string> {
  // Zed uses JSON keybindings similar to VSCode
  const zedDir = join(homedir(), '.config', 'zed')
  const keymapPath = join(zedDir, 'keymap.json')

  try {
    // Ensure zed directory exists (idempotent with recursive)
    await mkdir(zedDir, { recursive: true })

    // Read existing keymap file, or default to empty array if it doesn't exist
    let keymapContent = '[]'
    let fileExists = false
    try {
      keymapContent = await readFile(keymapPath, { encoding: 'utf-8' })
      fileExists = true
    } catch (e: unknown) {
      if (!isFsInaccessible(e)) throw e
    }

    if (fileExists) {
      // Check if keybinding already exists
      if (keymapContent.includes('shift-enter')) {
        return `${color(
          'warning',
          theme,
        )(
          '发现现有 Zed Shift+Enter 按键绑定。请先移除它以继续。',
        )}${EOL}${chalk.dim(`参见 ${formatPathLink(keymapPath)}`)}${EOL}`
      }

      // Create backup
      const randomSha = randomBytes(4).toString('hex')
      const backupPath = `${keymapPath}.${randomSha}.bak`
      try {
        await copyFile(keymapPath, backupPath)
      } catch {
        return `${color(
          'warning',
          theme,
        )(
          '备份现有 Zed 键位映射时出错。放弃操作。',
        )}${EOL}${chalk.dim(`参见 ${formatPathLink(keymapPath)}`)}${EOL}${chalk.dim(`备份路径：${formatPathLink(backupPath)}`)}${EOL}`
      }
    }

    // Parse and modify the keymap
    let keymap: Array<{
      context?: string
      bindings: Record<string, string | string[]>
    }>
    try {
      keymap = jsonParse(keymapContent)
      if (!Array.isArray(keymap)) {
        keymap = []
      }
    } catch {
      keymap = []
    }

    // Add the new keybinding for terminal context
    keymap.push({
      context: 'Terminal',
      bindings: {
        'shift-enter': ['terminal::SendText', '\u001b\r'],
      },
    })

    // Write the updated keymap
    await writeFile(keymapPath, jsonStringify(keymap, null, 2) + '\n', {
      encoding: 'utf-8',
    })

    return `${color(
      'success',
      theme,
    )(
      '已安装 Zed Shift+Enter 按键绑定',
    )}${EOL}${chalk.dim(`参见 ${formatPathLink(keymapPath)}`)}${EOL}`
  } catch (error) {
    logError(error)
    throw new Error('安装 Zed Shift+Enter 按键绑定失败')
  }
}
