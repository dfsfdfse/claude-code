import { getBridgeDebugHandle } from '../bridge/bridgeDebug.js'
import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'

/**
 * Ant-only: 注入 bridge 故障状态以手动测试恢复路径。
 *
 *   /bridge-kick close 1002            — 触发 ws_closed，代码 1002
 *   /bridge-kick close 1006            — 触发 ws_closed，代码 1006
 *   /bridge-kick poll 404              — 下一次 poll 抛出 404/not_found_error
 *   /bridge-kick poll 404 <type>       — 下一次 poll 抛出 404 并带有 error_type
 *   /bridge-kick poll 401              — 下一次 poll 抛出 401（认证）
 *   /bridge-kick poll transient        — 下一次 poll 抛出类 axios 拒绝（5xx/网络）
 *   /bridge-kick register fail         — 下一次 register（在 doReconnect 内）瞬态失败
 *   /bridge-kick register fail 3       — 接下来的 3 次 register 瞬态失败
 *   /bridge-kick register fatal        — 下一次 register 403（终止）
 *   /bridge-kick reconnect-session fail — POST /bridge/reconnect 失败（→ 策略 2）
 *   /bridge-kick heartbeat 401         — 下一次 heartbeat 401（JWT 过期）
 *   /bridge-kick reconnect             — 直接调用 doReconnect（= SIGUSR2）
 *   /bridge-kick status                — 打印当前 bridge 状态
 *
 * 工作流程：连接远程控制，运行子命令，`tail -f debug.log`
 * 并观察 [bridge:repl] / [bridge:debug] 行以查看恢复反应。
 *
 * 复合序列 — BQ 数据中的故障模式是链式，而非单事件。排队故障然后触发：
 *
 *   # #22148 残留：ws_closed → register 瞬态闪烁 → 拆除？
 *   /bridge-kick register fail 2
 *   /bridge-kick close 1002
 *   → 预期：doReconnect 尝试 register，失败，返回 false → 拆除
 *     （展示了需要修复的重试间隙）
 *
 *   # 死门：poll 404/not_found_error → onEnvironmentLost 是否触发？
 *   /bridge-kick poll 404
 *   → 预期：tengu_bridge_repl_fatal_error（门已死 — 147K/周）
 *     修复后：tengu_bridge_repl_env_lost → doReconnect
 */

const USAGE = `/bridge-kick <子命令>
  close <code>              用给定代码触发 ws_closed（例如 1002）
  poll <status> [type]      下一次 poll 抛出 BridgeFatalError(status, type)
  poll transient            下一次 poll 抛出类 axios 拒绝（5xx/网络）
  register fail [N]         接下来 N 次 register 瞬态失败（默认 1）
  register fatal            下一次 register 403（终止）
  reconnect-session fail    下一次 POST /bridge/reconnect 失败
  heartbeat <status>        下一次 heartbeat 抛出 BridgeFatalError(status)
  reconnect                 直接调用 reconnectEnvironmentWithSession
  status                    打印 bridge 状态`

const call: LocalCommandCall = async args => {
  const h = getBridgeDebugHandle()
  if (!h) {
    return {
      type: 'text',
      value:
        '未注册 bridge 调试句柄。必须连接远程控制（USER_TYPE=ant）。',
    }
  }

  const [sub, a, b] = args.trim().split(/\s+/)

  switch (sub) {
    case 'close': {
      const code = Number(a)
      if (!Number.isFinite(code)) {
        return { type: 'text', value: `close: 需要数字代码\n${USAGE}` }
      }
      h.fireClose(code)
      return {
        type: 'text',
        value: `已触发 transport close(${code})。观察 debug.log 中的 [bridge:repl] 恢复。`,
      }
    }

    case 'poll': {
      if (a === 'transient') {
        h.injectFault({
          method: 'pollForWork',
          kind: 'transient',
          status: 503,
          count: 1,
        })
        h.wakePollLoop()
        return {
          type: 'text',
          value:
            '下一次 poll 将抛出瞬态错误（axios 拒绝）。Poll 循环已唤醒。',
        }
      }
      const status = Number(a)
      if (!Number.isFinite(status)) {
        return {
          type: 'text',
          value: `poll: 需要 'transient' 或状态代码\n${USAGE}`,
        }
      }
      const errorType =
        b ?? (status === 404 ? 'not_found_error' : 'authentication_error')
      h.injectFault({
        method: 'pollForWork',
        kind: 'fatal',
        status,
        errorType,
        count: 1,
      })
      h.wakePollLoop()
      return {
        type: 'text',
        value: `下一次 poll 将抛出 BridgeFatalError(${status}, ${errorType})。Poll 循环已唤醒。`,
      }
    }

    case 'register': {
      if (a === 'fatal') {
        h.injectFault({
          method: 'registerBridgeEnvironment',
          kind: 'fatal',
          status: 403,
          errorType: 'permission_error',
          count: 1,
        })
        return {
          type: 'text',
          value:
            '下一次 registerBridgeEnvironment 将 403。用 close/reconnect 触发。',
        }
      }
      const n = Number(b) || 1
      h.injectFault({
        method: 'registerBridgeEnvironment',
        kind: 'transient',
        status: 503,
        count: n,
      })
      return {
        type: 'text',
        value: `接下来 ${n} 次 registerBridgeEnvironment 调用将瞬态失败。用 close/reconnect 触发。`,
      }
    }

    case 'reconnect-session': {
      h.injectFault({
        method: 'reconnectSession',
        kind: 'fatal',
        status: 404,
        errorType: 'not_found_error',
        count: 2,
      })
      return {
        type: 'text',
        value:
          '接下来 2 次 POST /bridge/reconnect 调用将 404。doReconnect 策略 1 回退到策略 2。',
      }
    }

    case 'heartbeat': {
      const status = Number(a) || 401
      h.injectFault({
        method: 'heartbeatWork',
        kind: 'fatal',
        status,
        errorType: status === 401 ? 'authentication_error' : 'not_found_error',
        count: 1,
      })
      return {
        type: 'text',
        value: `下一次 heartbeat 将 ${status}。观察 onHeartbeatFatal → 工作状态拆除。`,
      }
    }

    case 'reconnect': {
      h.forceReconnect()
      return {
        type: 'text',
        value: '已调用 reconnectEnvironmentWithSession()。观察 debug.log。',
      }
    }

    case 'status': {
      return { type: 'text', value: h.describe() }
    }

    default:
      return { type: 'text', value: USAGE }
  }
}

const bridgeKick = {
  type: 'local',
  name: 'bridge-kick',
  description: '注入 bridge 故障状态以手动测试恢复路径',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default bridgeKick
