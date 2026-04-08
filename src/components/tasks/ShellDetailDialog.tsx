import React, {
  Suspense,
  use,
  useDeferredValue,
  useEffect,
  useState,
} from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import type { CommandResultDisplay } from '../../commands.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { type KeyboardEvent, Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { LocalShellTaskState } from '../../tasks/LocalShellTask/guards.js'
import {
  formatDuration,
  formatFileSize,
  truncateToWidth,
} from '../../utils/format.js'
import { tailFile } from '../../utils/fsOperations.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink'

type Props = {
  shell: DeepImmutable<LocalShellTaskState>
  onDone: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  onKillShell?: () => void
  onBack?: () => void
}

const SHELL_DETAIL_TAIL_BYTES = 8192

type TaskOutputResult = {
  content: string
  bytesTotal: number
}

/**
 * Read the tail of the task output file. Only reads the last few KB,
 * not the entire file.
 */
async function getTaskOutput(
  shell: DeepImmutable<LocalShellTaskState>,
): Promise<TaskOutputResult> {
  const path = getTaskOutputPath(shell.id)
  try {
    const result = await tailFile(path, SHELL_DETAIL_TAIL_BYTES)
    return { content: result.content, bytesTotal: result.bytesTotal }
  } catch {
    return { content: '', bytesTotal: 0 }
  }
}

export function ShellDetailDialog({
  shell,
  onDone,
  onKillShell,
  onBack,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()

  // Promise created in initializer (not during render). For running shells,
  // the effect timer replaces it periodically to pick up new output.
  // useDeferredValue keeps showing the previous output while the new promise
  // resolves, preventing the Suspense fallback from flickering.
  const [outputPromise, setOutputPromise] = useState<Promise<TaskOutputResult>>(
    () => getTaskOutput(shell),
  )
  const deferredOutputPromise = useDeferredValue(outputPromise)

  useEffect(() => {
    if (shell.status !== 'running') {
      return
    }
    const timer = setInterval(
      (setOutputPromise, shell) => setOutputPromise(getTaskOutput(shell)),
      1000,
      setOutputPromise,
      shell,
    )
    return () => clearInterval(timer)
  }, [shell.id, shell.status])

  // Handle standard close action
  const handleClose = () =>
    onDone('Shell details dismissed', { display: 'system' })

  // Handle additional close actions beyond Dialog's built-in Esc handler
  useKeybindings(
    {
      'confirm:yes': handleClose,
    },
    { context: 'Confirmation' },
  )

  // Handle dialog-specific keys
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      onDone('Shell details dismissed', { display: 'system' })
    } else if (e.key === 'left' && onBack) {
      e.preventDefault()
      onBack()
    } else if (e.key === 'x' && shell.status === 'running' && onKillShell) {
      e.preventDefault()
      onKillShell()
    }
  }

  // Truncate command if too long (for display purposes)
  const isMonitor = shell.kind === 'monitor'
  const displayCommand = truncateToWidth(shell.command, 280)

  return (
    <Box
      flexDirection="column"
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
    >
      <Dialog
        title={isMonitor ? '监控详情' : '终端详情'}
        onCancel={handleClose}
        color="background"
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>再次按 {exitState.keyName} 退出</Text>
          ) : (
            <Byline>
              {onBack && <KeyboardShortcutHint shortcut="←" action="返回" />}
              <KeyboardShortcutHint shortcut="Esc/Enter/Space" action="关闭" />
              {shell.status === 'running' && onKillShell && (
                <KeyboardShortcutHint shortcut="x" action="停止" />
              )}
            </Byline>
          )
        }
      >
        <Box flexDirection="column">
          <Text>
            <Text bold>状态:</Text>{' '}
            {shell.status === 'running' ? (
              <Text color="background">
                {shell.status}
                {shell.result?.code !== undefined &&
                  `（退出码: ${shell.result.code}）`}
              </Text>
            ) : shell.status === 'completed' ? (
              <Text color="success">
                {shell.status}
                {shell.result?.code !== undefined &&
                  `（退出码: ${shell.result.code}）`}
              </Text>
            ) : (
              <Text color="error">
                {shell.status}
                {shell.result?.code !== undefined &&
                  `（退出码: ${shell.result.code}）`}
              </Text>
            )}
          </Text>
          <Text>
            <Text bold>运行时长:</Text>{' '}
            {formatDuration((shell.endTime ?? Date.now()) - shell.startTime)}
          </Text>
          <Text wrap="wrap">
            <Text bold>{isMonitor ? '脚本:' : '命令:'}</Text>{' '}
            {displayCommand}
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text bold>输出:</Text>
          <Suspense fallback={<Text dimColor>加载输出中…</Text>}>
            <ShellOutputContent
              outputPromise={deferredOutputPromise}
              columns={columns}
            />
          </Suspense>
        </Box>
      </Dialog>
    </Box>
  )
}

type ShellOutputContentProps = {
  outputPromise: Promise<TaskOutputResult>
  columns: number
}

function ShellOutputContent({
  outputPromise,
  columns,
}: ShellOutputContentProps): React.ReactNode {
  const { content, bytesTotal } = use(outputPromise)

  if (!content) {
    return <Text dimColor>无可用输出</Text>
  }

  // Find last 10 line boundaries via lastIndexOf
  const starts: number[] = []
  let pos = content.length
  for (let i = 0; i < 10 && pos > 0; i++) {
    const prev = content.lastIndexOf('\n', pos - 1)
    starts.push(prev + 1)
    pos = prev
  }
  starts.reverse()
  const isIncomplete = bytesTotal > content.length

  // Build lines, skip empty trailing/leading segments
  const rendered: string[] = []
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!
    const end = i < starts.length - 1 ? starts[i + 1]! - 1 : content.length
    const line = content.slice(start, end)
    if (line) rendered.push(line)
  }

  return (
    <>
      <Box
        borderStyle="round"
        paddingX={1}
        flexDirection="column"
        height={12}
        maxWidth={columns - 6}
      >
        {rendered.map((line, i) => (
          <Text key={i} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
      <Text dimColor italic>
        {`显示 ${rendered.length} 行`}
        {isIncomplete ? `（共 ${formatFileSize(bytesTotal)}）` : ''}
      </Text>
    </>
  )
}
