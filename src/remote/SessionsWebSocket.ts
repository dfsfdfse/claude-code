import { randomUUID } from 'crypto'
import { getOauthConfig } from '../constants/oauth.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlRequest,
  SDKControlRequestInner,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { getWebSocketTLSOptions } from '../utils/mtls.js'
import { getWebSocketProxyAgent, getWebSocketProxyUrl } from '../utils/proxy.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5
const PING_INTERVAL_MS = 30000

/**
 * 4001（会话未找到）的最大重试次数。压缩期间服务器可能短暂认为会话过期；
 * 短暂重试窗口让客户端无需永久放弃即可恢复。
 */
const MAX_SESSION_NOT_FOUND_RETRIES = 3

/**
 * 表示永久服务端拒绝的 WebSocket 关闭码。
 * 客户端立即停止重连。
 * 注：4001（会话未找到）单独处理，有限重试次数，因为压缩期间可能是临时的。
 */
const PERMANENT_CLOSE_CODES = new Set([
  4003, // unauthorized
])

type WebSocketState = 'connecting' | 'connected' | 'closed'

type SessionsMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest

function isSessionsMessage(value: unknown): value is SessionsMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }
  // 接受任何带 string 类型 `type` 字段的消息。下游处理器
  //（sdkMessageAdapter、RemoteSessionManager）决定如何处理未知类型。
  // 在此硬编码允许列表会静默丢弃后端在新消息类型发送后但客户端更新前的消息。
  return typeof value.type === 'string'
}

export type SessionsWebSocketCallbacks = {
  onMessage: (message: SessionsMessage) => void
  onClose?: () => void
  onError?: (error: Error) => void
  onConnected?: () => void
  /** 检测到临时关闭并计划重连时触发。
   *  onClose 仅在永久关闭（服务器结束/重试耗尽）时触发。 */
  onReconnecting?: () => void
}

// globalThis.WebSocket 和 ws.WebSocket 之间的通用接口
type WebSocketLike = {
  close(): void
  send(data: string): void
  ping?(): void // Bun & ws both support this
}

/**
 * 通过 /v1/sessions/ws/{id}/subscribe 连接 CCR 会话的 WebSocket 客户端
 *
 * 协议：
 * 1. 连接到 wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
 * 2. 发送认证消息：{ type: 'auth', credential: { type: 'oauth', token: '...' } }
 * 3. 从会话接收 SDKMessage 流
 */
export class SessionsWebSocket {
  private ws: WebSocketLike | null = null
  private state: WebSocketState = 'closed'
  private reconnectAttempts = 0
  private sessionNotFoundRetries = 0
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly sessionId: string,
    private readonly orgUuid: string,
    private readonly getAccessToken: () => string,
    private readonly callbacks: SessionsWebSocketCallbacks,
  ) {}

  /**
   * 连接到会话 WebSocket 端点
   */
  async connect(): Promise<void> {
    if (this.state === 'connecting') {
      logForDebugging('[SessionsWebSocket] 已在连接中')
      return
    }

    this.state = 'connecting'

    const baseUrl = getOauthConfig().BASE_API_URL.replace('http', 'ws')
    const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`

    logForDebugging(`[SessionsWebSocket] 正在连接 ${url}`)

    // Get fresh token for each connection attempt
    const accessToken = this.getAccessToken()
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
    }

    if (typeof Bun !== 'undefined') {
      // Bun 的 WebSocket 支持 headers/proxy 选项，但 DOM 类型定义不支持
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const ws = new globalThis.WebSocket(url, {
        headers,
        proxy: getWebSocketProxyUrl(url),
        tls: getWebSocketTLSOptions() || undefined,
      } as unknown as string[])
      this.ws = ws

      ws.addEventListener('open', () => {
        logForDebugging(
          '[SessionsWebSocket] 连接已打开，已通过 headers 认证',
        )
        this.state = 'connected'
        this.reconnectAttempts = 0
        this.sessionNotFoundRetries = 0
        this.startPingInterval()
        this.callbacks.onConnected?.()
      })

      ws.addEventListener('message', (event: MessageEvent) => {
        const data =
          typeof event.data === 'string' ? event.data : String(event.data)
        this.handleMessage(data)
      })

      ws.addEventListener('error', () => {
        const err = new Error('[SessionsWebSocket] WebSocket 错误')
        logError(err)
        this.callbacks.onError?.(err)
      })

      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      ws.addEventListener('close', (event: CloseEvent) => {
        logForDebugging(
          `[SessionsWebSocket] 已关闭: code=${event.code} reason=${event.reason}`,
        )
        this.handleClose(event.code)
      })

      ws.addEventListener('pong', () => {
        logForDebugging('[SessionsWebSocket] 收到 Pong')
      })
    } else {
      const { default: WS } = await import('ws')
      const ws = new WS(url, {
        headers,
        agent: getWebSocketProxyAgent(url),
        ...getWebSocketTLSOptions(),
      })
      this.ws = ws

      ws.on('open', () => {
        logForDebugging(
          '[SessionsWebSocket] 连接已打开，已通过 headers 认证',
        )
        // 认证通过 headers 处理，因此立即连接
        this.state = 'connected'
        this.reconnectAttempts = 0
        this.sessionNotFoundRetries = 0
        this.startPingInterval()
        this.callbacks.onConnected?.()
      })

      ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString())
      })

      ws.on('error', (err: Error) => {
        logError(new Error(`[SessionsWebSocket] 错误: ${err.message}`))
        this.callbacks.onError?.(err)
      })

      ws.on('close', (code: number, reason: Buffer) => {
        logForDebugging(
          `[SessionsWebSocket] 已关闭: code=${code} reason=${reason.toString()}`,
        )
        this.handleClose(code)
      })

      ws.on('pong', () => {
        logForDebugging('[SessionsWebSocket] 收到 Pong')
      })
    }
  }

  /**
   * 处理传入的 WebSocket 消息
   */
  private handleMessage(data: string): void {
    try {
      const message: unknown = jsonParse(data)

      // 将 SDK 消息转发到回调
      if (isSessionsMessage(message)) {
        this.callbacks.onMessage(message)
      } else {
        logForDebugging(
          `[SessionsWebSocket] 忽略消息类型: ${typeof message === 'object' && message !== null && 'type' in message ? String(message.type) : 'unknown'}`,
        )
      }
    } catch (error) {
      logError(
        new Error(
          `[SessionsWebSocket] 解析消息失败: ${errorMessage(error)}`,
        ),
      )
    }
  }

  /**
   * 处理 WebSocket 关闭
   */
  private handleClose(closeCode: number): void {
    this.stopPingInterval()

    if (this.state === 'closed') {
      return
    }

    this.ws = null

    const previousState = this.state
    this.state = 'closed'

    // 永久码：停止重连——服务器已明确结束会话
    if (PERMANENT_CLOSE_CODES.has(closeCode)) {
      logForDebugging(
        `[SessionsWebSocket] 永久关闭码 ${closeCode}，不重连`,
      )
      this.callbacks.onClose?.()
      return
    }

    // 4001（会话未找到）可能发生在压缩期间：服务器可能短暂认为会话过期，
    // 而 CLI worker 正忙于压缩 API 调用，未发送事件。
    if (closeCode === 4001) {
      this.sessionNotFoundRetries++
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        logForDebugging(
          `[SessionsWebSocket] 4001 重试预算耗尽 (${MAX_SESSION_NOT_FOUND_RETRIES})，不重连`,
        )
        this.callbacks.onClose?.()
        return
      }
      this.scheduleReconnect(
        RECONNECT_DELAY_MS * this.sessionNotFoundRetries,
        `4001 重试 ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`,
      )
      return
    }

    // 如果之前已连接，尝试重连
    if (
      previousState === 'connected' &&
      this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
    ) {
      this.reconnectAttempts++
      this.scheduleReconnect(
        RECONNECT_DELAY_MS,
        `重试 ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
      )
    } else {
      logForDebugging('[SessionsWebSocket] 不重连')
      this.callbacks.onClose?.()
    }
  }

  private scheduleReconnect(delay: number, label: string): void {
    this.callbacks.onReconnecting?.()
    logForDebugging(
      `[SessionsWebSocket] 计划在 ${delay}ms 后重连 (${label})`,
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private startPingInterval(): void {
    this.stopPingInterval()

    this.pingInterval = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        try {
          this.ws.ping?.()
        } catch {
          // 忽略 ping 错误，关闭处理器会处理连接问题
        }
      }
    }, PING_INTERVAL_MS)
  }

  /**
   * 停止 ping 间隔
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * 向会话发送控制响应
   */
  sendControlResponse(response: SDKControlResponse): void {
    if (!this.ws || this.state !== 'connected') {
      logError(new Error('[SessionsWebSocket] 无法发送：未连接'))
      return
    }

    logForDebugging('[SessionsWebSocket] 发送控制响应')
    this.ws.send(jsonStringify(response))
  }

  /**
   * 向会话发送控制请求（如中断）
   */
  sendControlRequest(request: SDKControlRequestInner): void {
    if (!this.ws || this.state !== 'connected') {
      logError(new Error('[SessionsWebSocket] 无法发送：未连接'))
      return
    }

    const controlRequest: SDKControlRequest = {
      type: 'control_request',
      request_id: randomUUID(),
      request,
    }

    logForDebugging(
      `[SessionsWebSocket] 发送控制请求: ${request.subtype}`,
    )
    this.ws.send(jsonStringify(controlRequest))
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state === 'connected'
  }

  /**
   * 关闭 WebSocket 连接
   */
  close(): void {
    logForDebugging('[SessionsWebSocket] 关闭连接')
    this.state = 'closed'
    this.stopPingInterval()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      // 在重连期间将事件处理器置空以防止竞态条件。
      // Bun（原生 WebSocket）下，onX 处理器是分离的干净方式。
      // Node（ws 包）下，监听器在 connect() 中通过 .on() 附加，
      // 但由于即将关闭并置空 this.ws，无需清理。
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 强制重连——关闭现有连接并建立新连接。
   * 当订阅过期时有用（如容器关闭后）。
   */
  reconnect(): void {
    logForDebugging('[SessionsWebSocket] 强制重连')
    this.reconnectAttempts = 0
    this.sessionNotFoundRetries = 0
    this.close()
    // 重连前短暂延迟（存储在 reconnectTimer 中以便取消）
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, 500)
  }
}
