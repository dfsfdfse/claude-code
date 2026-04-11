import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlPermissionRequest,
  SDKControlRequest,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  type RemoteMessageContent,
  sendEventToRemoteSession,
} from '../utils/teleport/api.js'
import {
  SessionsWebSocket,
  type SessionsWebSocketCallbacks,
} from './SessionsWebSocket.js'

/**
 * 类型守卫，检查消息是否为 SDKMessage（而非控制消息）
 */
function isSDKMessage(
  message:
    | SDKMessage
    | SDKControlRequest
    | SDKControlResponse
    | SDKControlCancelRequest,
): message is SDKMessage {
  return (
    message.type !== 'control_request' &&
    message.type !== 'control_response' &&
    message.type !== 'control_cancel_request'
  )
}

/**
 * 远程会话的简单权限响应。
 * 这是 CCR 通信的简化版 PermissionResult。
 */
export type RemotePermissionResponse =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
    }
  | {
      behavior: 'deny'
      message: string
    }

export type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  /** 如果会话创建时带有正在处理的初始提示则为 true */
  hasInitialPrompt?: boolean
  /**
   * 为 true 时，此客户端为纯查看器。Ctrl+C/Escape 不发送中断到远程 agent；
   * 禁用 60s 重连超时；不更新会话标题。用于 `claude assistant`。
   */
  viewerOnly?: boolean
}

export type RemoteSessionCallbacks = {
  /** 收到来自会话的 SDKMessage 时调用 */
  onMessage: (message: SDKMessage) => void
  /** 收到来自 CCR 的权限请求时调用 */
  onPermissionRequest: (
    request: SDKControlPermissionRequest,
    requestId: string,
  ) => void
  /** 服务器取消待处理权限请求时调用 */
  onPermissionCancelled?: (
    requestId: string,
    toolUseId: string | undefined,
  ) => void
  /** 连接建立时调用 */
  onConnected?: () => void
  /** 连接丢失且无法恢复时调用 */
  onDisconnected?: () => void
  /** 重连退避期间 WebSocket 临时断开时调用 */
  onReconnecting?: () => void
  /** 发生错误时调用 */
  onError?: (error: Error) => void
}

/**
 * 管理远程 CCR 会话。
 *
 * 协调：
 * - 用于从 CCR 接收消息的 WebSocket 订阅
 * - 用于向 CCR 发送用户消息的 HTTP POST
 * - 权限请求/响应流程
 */
export class RemoteSessionManager {
  private websocket: SessionsWebSocket | null = null
  private pendingPermissionRequests: Map<string, SDKControlPermissionRequest> =
    new Map()

  constructor(
    private readonly config: RemoteSessionConfig,
    private readonly callbacks: RemoteSessionCallbacks,
  ) {}

  /**
   * 通过 WebSocket 连接到远程会话
   */
  connect(): void {
    logForDebugging(
      `[RemoteSessionManager] 正在连接会话 ${this.config.sessionId}`,
    )

    const wsCallbacks: SessionsWebSocketCallbacks = {
      onMessage: message => this.handleMessage(message),
      onConnected: () => {
        logForDebugging('[RemoteSessionManager] 已连接')
        this.callbacks.onConnected?.()
      },
      onClose: () => {
        logForDebugging('[RemoteSessionManager] 已断开')
        this.callbacks.onDisconnected?.()
      },
      onReconnecting: () => {
        logForDebugging('[RemoteSessionManager] 正在重连')
        this.callbacks.onReconnecting?.()
      },
      onError: error => {
        logError(error)
        this.callbacks.onError?.(error)
      },
    }

    this.websocket = new SessionsWebSocket(
      this.config.sessionId,
      this.config.orgUuid,
      this.config.getAccessToken,
      wsCallbacks,
    )

    void this.websocket.connect()
  }

  /**
   * Handle messages from WebSocket
   */
  private handleMessage(
    message:
      | SDKMessage
      | SDKControlRequest
      | SDKControlResponse
      | SDKControlCancelRequest,
  ): void {
    // Handle control requests (permission prompts from CCR)
    if (message.type === 'control_request') {
      this.handleControlRequest(message as SDKControlRequest)
      return
    }

    // Handle control cancel requests (server cancelling a pending permission prompt)
    if (message.type === 'control_cancel_request') {
      const { request_id } = message as SDKControlCancelRequest
      const pendingRequest = this.pendingPermissionRequests.get(request_id)
      logForDebugging(
        `[RemoteSessionManager] Permission request cancelled: ${request_id}`,
      )
      this.pendingPermissionRequests.delete(request_id)
      this.callbacks.onPermissionCancelled?.(
        request_id,
        pendingRequest?.tool_use_id,
      )
      return
    }

    // Handle control responses (acknowledgments)
    if (message.type === 'control_response') {
      logForDebugging('[RemoteSessionManager] Received control response')
      return
    }

    // Forward SDK messages to callback (type guard ensures proper narrowing)
    if (isSDKMessage(message)) {
      this.callbacks.onMessage(message)
    }
  }

  /**
   * Handle control requests from CCR (e.g., permission requests)
   */
  private handleControlRequest(request: SDKControlRequest): void {
    const requestId = request.request_id as string
    const inner = request.request as SDKControlPermissionRequest

    if (inner.subtype === 'can_use_tool') {
      logForDebugging(
        `[RemoteSessionManager] Permission request for tool: ${inner.tool_name}`,
      )
      this.pendingPermissionRequests.set(requestId, inner)
      this.callbacks.onPermissionRequest(inner, requestId)
    } else {
      // Send an error response for unrecognized subtypes so the server
      // doesn't hang waiting for a reply that never comes.
      logForDebugging(
        `[RemoteSessionManager] Unsupported control request subtype: ${inner.subtype}`,
      )
      const response: SDKControlResponse = {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error: `Unsupported control request subtype: ${inner.subtype}`,
        },
      }
      this.websocket?.sendControlResponse(response)
    }
  }

  /**
   * Send a user message to the remote session via HTTP POST
   */
  async sendMessage(
    content: RemoteMessageContent,
    opts?: { uuid?: string },
  ): Promise<boolean> {
    logForDebugging(
      `[RemoteSessionManager] Sending message to session ${this.config.sessionId}`,
    )

    const success = await sendEventToRemoteSession(
      this.config.sessionId,
      content,
      opts,
    )

    if (!success) {
      logError(
        new Error(
          `[RemoteSessionManager] Failed to send message to session ${this.config.sessionId}`,
        ),
      )
    }

    return success
  }

  /**
   * Respond to a permission request from CCR
   */
  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void {
    const pendingRequest = this.pendingPermissionRequests.get(requestId)
    if (!pendingRequest) {
      logError(
        new Error(
          `[RemoteSessionManager] No pending permission request with ID: ${requestId}`,
        ),
      )
      return
    }

    this.pendingPermissionRequests.delete(requestId)

    const response: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: result.behavior,
          ...(result.behavior === 'allow'
            ? { updatedInput: result.updatedInput }
            : { message: result.message }),
        },
      },
    }

    logForDebugging(
      `[RemoteSessionManager] Sending permission response: ${result.behavior}`,
    )

    this.websocket?.sendControlResponse(response)
  }

  /**
   * Check if connected to the remote session
   */
  isConnected(): boolean {
    return this.websocket?.isConnected() ?? false
  }

  /**
   * Send an interrupt signal to cancel the current request on the remote session
   */
  cancelSession(): void {
    logForDebugging('[RemoteSessionManager] Sending interrupt signal')
    this.websocket?.sendControlRequest({ subtype: 'interrupt' })
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.config.sessionId
  }

  /**
   * Disconnect from the remote session
   */
  disconnect(): void {
    logForDebugging('[RemoteSessionManager] Disconnecting')
    this.websocket?.close()
    this.websocket = null
    this.pendingPermissionRequests.clear()
  }

  /**
   * Force reconnect the WebSocket.
   * Useful when the subscription becomes stale after container shutdown.
   */
  reconnect(): void {
    logForDebugging('[RemoteSessionManager] Reconnecting WebSocket')
    this.websocket?.reconnect()
  }
}

/**
 * Create a remote session config from OAuth tokens
 */
export function createRemoteSessionConfig(
  sessionId: string,
  getAccessToken: () => string,
  orgUuid: string,
  hasInitialPrompt = false,
  viewerOnly = false,
): RemoteSessionConfig {
  return {
    sessionId,
    getAccessToken,
    orgUuid,
    hasInitialPrompt,
    viewerOnly,
  }
}
