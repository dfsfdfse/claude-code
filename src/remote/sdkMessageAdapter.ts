import type {
  SDKAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKToolProgressMessage,
  SDKUserMessage,
} from '../entrypoints/agentSdkTypes.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemMessage,
} from '../types/message.js'
import { logForDebugging } from '../utils/debug.js'
import { fromSDKCompactMetadata } from '../utils/messages/mappers.js'
import { createUserMessage } from '../utils/messages.js'

/**
 * 将 CCR 的 SDKMessage 转换为 REPL 的 Message 类型。
 *
 * CCR 后端通过 WebSocket 发送 SDK 格式消息，REPL 使用内部 Message 类型渲染。
 * 此适配器连接两种格式。
 */

/**
 * 将 SDKAssistantMessage 转换为 AssistantMessage
 */
function convertAssistantMessage(msg: SDKAssistantMessage): AssistantMessage {
  return {
    type: 'assistant',
    message: msg.message!,
    uuid: msg.uuid!,
    requestId: undefined,
    timestamp: new Date().toISOString(),
    error: msg.error,
  }
}

/**
 * 将 SDKPartialAssistantMessage（流式）转换为 StreamEvent
 */
function convertStreamEvent(msg: SDKPartialAssistantMessage): StreamEvent {
  return {
    type: 'stream_event',
    event: msg.event,
  }
}

/**
 * 将 SDKResultMessage 转换为 SystemMessage
 */
function convertResultMessage(msg: SDKResultMessage): SystemMessage {
  const isError = msg.subtype !== 'success'
  const content = isError
    ? msg.errors?.join(', ') || '未知错误'
    : '会话成功结束'

  return {
    type: 'system',
    subtype: 'informational',
    content,
    level: isError ? 'warning' : 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 将 SDKSystemMessage（初始化）转换为 SystemMessage
 */
function convertInitMessage(msg: SDKSystemMessage): SystemMessage {
  return {
    type: 'system',
    subtype: 'informational',
    content: `远程会话已初始化 (模型: ${msg.model})`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 将 SDKStatusMessage 转换为 SystemMessage
 */
function convertStatusMessage(msg: SDKStatusMessage): SystemMessage | null {
  if (!msg.status) {
    return null
  }

  return {
    type: 'system',
    subtype: 'informational',
    content:
      msg.status === 'compacting'
        ? '正在压缩对话…'
        : `状态: ${msg.status}`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 将 SDKToolProgressMessage 转换为 SystemMessage。
 * 使用系统消息而非 ProgressMessage，因为 Progress 类型是复杂联合类型，
 * 需要工具特定数据，而 CCR 没有提供。
 */
function convertToolProgressMessage(
  msg: SDKToolProgressMessage,
): SystemMessage {
  return {
    type: 'system',
    subtype: 'informational',
    content: `工具 ${msg.tool_name} 运行中 ${msg.elapsed_time_seconds}s…`,
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
    toolUseID: msg.tool_use_id,
  }
}

/**
 * 将 SDKCompactBoundaryMessage 转换为 SystemMessage
 */
function convertCompactBoundaryMessage(
  msg: SDKCompactBoundaryMessage,
): SystemMessage {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    content: '会话已压缩',
    level: 'info',
    uuid: msg.uuid!,
    timestamp: new Date().toISOString(),
    compactMetadata: fromSDKCompactMetadata(msg.compact_metadata),
  }
}

/**
 * SDKMessage 转换结果
 */
export type ConvertedMessage =
  | { type: 'message'; message: Message }
  | { type: 'stream_event'; event: StreamEvent }
  | { type: 'ignored' }

type ConvertOptions = {
  /** 将包含 tool_result 内容块的用户消息转换为 UserMessage。
   * 用于直连模式，工具结果来自远程服务器，需要本地渲染。
   * CCR 模式忽略用户消息，因为处理方式不同。 */
  convertToolResults?: boolean
  /**
   * 将用户文本消息转换为 UserMessage 显示。用于转换历史事件，
   * 需要展示用户输入的消息。实时 WS 模式下这些已在本地由 REPL 添加，
   * 默认忽略。
   */
  convertUserTextMessages?: boolean
}

/**
 * 将 SDKMessage 转换为 REPL 消息格式
 */
export function convertSDKMessage(
  msg: SDKMessage,
  opts?: ConvertOptions,
): ConvertedMessage {
  switch (msg.type) {
    case 'assistant':
      return { type: 'message', message: convertAssistantMessage(msg as SDKAssistantMessage) }

    case 'user': {
      const userMsg = msg as SDKUserMessage
      const content = userMsg.message?.content
      // 远程服务器的 tool result 消息需要转换，以便像本地工具结果一样渲染和折叠。
      // 通过内容形状检测（tool_result 块）—— parent_tool_use_id 不可靠：
      // agent 端的 normalizeMessage() 会将其硬编码为 null，
      // 无法区分工具结果和提示回显。
      const isToolResult =
        Array.isArray(content) && content.some(b => b.type === 'tool_result')
      if (opts?.convertToolResults && isToolResult) {
        return {
          type: 'message',
          message: createUserMessage({
            content,
            toolUseResult: userMsg.tool_use_result,
            uuid: userMsg.uuid,
            timestamp: userMsg.timestamp,
          }),
        }
      }
      // 转换历史事件时，需要渲染用户输入的消息（不是由 REPL 本地添加的）。
      // 在这里跳过 tool_results——已在上方处理。
      if (opts?.convertUserTextMessages && !isToolResult) {
        if (typeof content === 'string' || Array.isArray(content)) {
          return {
            type: 'message',
            message: createUserMessage({
              content,
              toolUseResult: userMsg.tool_use_result,
              uuid: userMsg.uuid,
              timestamp: userMsg.timestamp,
            }),
          }
        }
      }
      // 用户输入的消息（字符串内容）已由 REPL 本地添加。
      // 在 CCR 模式下，所有用户消息都被忽略（工具结果处理方式不同）。
      return { type: 'ignored' }
    }

    case 'stream_event':
      return { type: 'stream_event', event: convertStreamEvent(msg as SDKPartialAssistantMessage) }

    case 'result':
      // 只显示错误的结果消息，成功结果在多轮会话中是噪音
      //（isLoading=false 是足够的信号）。
      if ((msg as SDKResultMessage).subtype !== 'success') {
        return { type: 'message', message: convertResultMessage(msg as SDKResultMessage) }
      }
      return { type: 'ignored' }

    case 'system': {
      const sysMsg = msg as SDKSystemMessage
      if (sysMsg.subtype === 'init') {
        return { type: 'message', message: convertInitMessage(sysMsg) }
      }
      if (sysMsg.subtype === 'status') {
        const statusMsg = convertStatusMessage(msg as SDKStatusMessage)
        return statusMsg
          ? { type: 'message', message: statusMsg }
          : { type: 'ignored' }
      }
      if (sysMsg.subtype === 'compact_boundary') {
        return {
          type: 'message',
          message: convertCompactBoundaryMessage(msg as SDKCompactBoundaryMessage),
        }
      }
      // hook_response 和其他子类型
      logForDebugging(
        `[sdkMessageAdapter] 忽略系统消息子类型: ${sysMsg.subtype}`,
      )
      return { type: 'ignored' }
    }

    case 'tool_progress':
      return { type: 'message', message: convertToolProgressMessage(msg as SDKToolProgressMessage) }

    case 'auth_status':
      // Auth 状态单独处理，不转换为显示消息
      logForDebugging('[sdkMessageAdapter] 忽略 auth_status 消息')
      return { type: 'ignored' }

    case 'tool_use_summary':
      // 工具使用摘要仅限 SDK 事件，不在 REPL 显示
      logForDebugging('[sdkMessageAdapter] 忽略 tool_use_summary 消息')
      return { type: 'ignored' }

    case 'rate_limit_event':
      // 速率限制事件仅限 SDK 事件，不在 REPL 显示
      logForDebugging('[sdkMessageAdapter] 忽略 rate_limit_event 消息')
      return { type: 'ignored' }

    case 'task_state':
      // Bridge-only task snapshots are consumed by the web panel, not REPL UIs.
      logForDebugging('[sdkMessageAdapter] Ignoring task_state message')
      return { type: 'ignored' }

    default: {
      // 优雅忽略未知消息类型，后端可能在新类型发送后才更新客户端；
      // 日志有助于调试，不会崩溃或丢失会话。
      logForDebugging(
        `[sdkMessageAdapter] 未知消息类型: ${(msg as { type: string }).type}`,
      )
      return { type: 'ignored' }
    }
  }
}

/**
 * 检查 SDKMessage 是否表示会话结束
 */
export function isSessionEndMessage(msg: SDKMessage): boolean {
  return msg.type === 'result'
}

/**
 * 检查 SDKResultMessage 是否表示成功
 */
export function isSuccessResult(msg: SDKResultMessage): boolean {
  return msg.subtype === 'success'
}

/**
 * 从成功的 SDKResultMessage 提取结果文本
 */
export function getResultText(msg: SDKResultMessage): string | null {
  if (msg.subtype === 'success') {
    return msg.result ?? null
  }
  return null
}
