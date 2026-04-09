import figures from 'figures';
import * as React from 'react';
import { useMemo, useRef } from 'react';
import { Box, Text, useAnimationFrame, stringWidth, Byline } from '@anthropic/ink';
import { toInkColor } from '../../utils/ink.js';
import type { InProcessTeammateTaskState } from '../../tasks/InProcessTeammateTask/types.js';
import { formatDuration, formatNumber } from '../../utils/format.js';

import type { Theme } from '../../utils/theme.js';

import { GlimmerMessage } from './GlimmerMessage.js';
import { SpinnerGlyph } from './SpinnerGlyph.js';
import type { SpinnerMode } from './types.js';
import { useStalledAnimation } from './useStalledAnimation.js';
import { interpolateColor, toRGBColor } from './utils.js';

const SEP_WIDTH = stringWidth(' · ');
const THINKING_BARE_WIDTH = stringWidth('思考中');
const SHOW_TOKENS_AFTER_MS = 30_000;

// 思考闪烁常量。之前在单独的 ThinkingShimmerText 组件中
// 拥有自己的 useAnimationFrame(50) —— 内联到这里以复用
// 现有的 50ms 时钟，消除冗余订阅。
const THINKING_INACTIVE = { r: 153, g: 153, b: 153 };
const THINKING_INACTIVE_SHIMMER = { r: 185, g: 185, b: 185 };
const THINKING_DELAY_MS = 3000;
const THINKING_GLOW_PERIOD_S = 2;

export type SpinnerAnimationRowProps = {
  // 动画输入
  mode: SpinnerMode;
  reducedMotion: boolean;
  hasActiveTools: boolean;
  responseLengthRef: React.RefObject<number>;

  // 消息（轮次内稳定）
  message: string;
  messageColor: keyof Theme;
  shimmerColor: keyof Theme;
  overrideColor?: keyof Theme | null;

  // 计时器引用（稳定引用）
  loadingStartTimeRef: React.RefObject<number>;
  totalPausedMsRef: React.RefObject<number>;
  pauseStartTimeRef: React.RefObject<number | null>;

  // 显示标志
  spinnerSuffix?: string | null;
  verbose: boolean;
  columns: number;

  // 队友派生（由父组件从 tasks 计算）
  hasRunningTeammates: boolean;
  teammateTokens: number;
  foregroundedTeammate: InProcessTeammateTaskState | undefined;
  /** 主代理轮次已完成。抑制停滞红色，因为 responseLengthRef/hasActiveTools 仅跟踪主代理状态。 */
  leaderIsIdle?: boolean;

  // 思考（状态由父组件持有，依模式而定）
  thinkingStatus: 'thinking' | number | null;
  effortSuffix: string;
};

/**
 * SpinnerWithVerb 中以 50ms 动画驱动的部分。拥有 useAnimationFrame(50)
 * 以及所有从动画时钟派生的值（帧、微光、令牌计数器动画、
 * 已用时间、停滞强度、思考闪烁）。
 *
 * 父组件 SpinnerWithVerb 从 50ms 渲染循环中解放出来，
 * 仅在其 props/app state 变化时重新渲染（每轮次约 25 次而非约 383 次）。
 * 这使外层 Box 壳、useAppState 选择器、任务过滤、
 * 提示/树子树远离热动画路径。
 */
export function SpinnerAnimationRow({
  mode,
  reducedMotion,
  hasActiveTools,
  responseLengthRef,
  message,
  messageColor,
  shimmerColor,
  overrideColor,
  loadingStartTimeRef,
  totalPausedMsRef,
  pauseStartTimeRef,
  spinnerSuffix,
  verbose,
  columns,
  hasRunningTeammates,
  teammateTokens,
  foregroundedTeammate,
  leaderIsIdle = false,
  thinkingStatus,
  effortSuffix,
}: SpinnerAnimationRowProps): React.ReactNode {
  const [viewportRef, time] = useAnimationFrame(reducedMotion ? null : 50);

  // === 已用时间（挂钟时间，每帧从引用派生）===
  const now = Date.now();
  const elapsedTimeMs =
    pauseStartTimeRef.current !== null
      ? pauseStartTimeRef.current - loadingStartTimeRef.current - totalPausedMsRef.current
      : now - loadingStartTimeRef.current - totalPausedMsRef.current;

  // 跟踪队友的挂钟轮次开始时间。当 swarm 运行时，
  // 主代理的 elapsedTimeMs 可能跳动（新的 API 调用重置
  // loadingStartTimeRef；暂停会冻结它），所以我们锚定到
  // 目前为止见到的最早派生开始时间。当没有队友运行时，
  // 这只是每帧跟踪 derivedStart，实际上为下一次 swarm 重置。
  const derivedStart = now - elapsedTimeMs;
  const turnStartRef = useRef(derivedStart);
  if (!hasRunningTeammates || derivedStart < turnStartRef.current) {
    turnStartRef.current = derivedStart;
  }

  // === 从 `time` 派生的动画值 ===
  const currentResponseLength = responseLengthRef.current;

  // 当主代理空闲时抑制停滞检测 —— responseLengthRef 和
  // hasActiveTools 都跟踪主代理状态。当查看活跃队友
  // 而主代理空闲时，它们会在 3 秒后误报停滞。
  // 将 leaderIsIdle 视同 hasActiveTools 来重置停滞计时器。
  const { isStalled, stalledIntensity } = useStalledAnimation(
    time,
    currentResponseLength,
    hasActiveTools || leaderIsIdle,
    reducedMotion,
  );

  const frame = reducedMotion ? 0 : Math.floor(time / 120);

  const glimmerSpeed = mode === 'requesting' ? 50 : 200;
  // message 在轮次内稳定；stringWidth 足够昂贵（每个码位一次 Bun 原生调用），
  // 在 50ms 循环中值得显式记忆。
  const glimmerMessageWidth = useMemo(() => stringWidth(message), [message]);
  const cycleLength = glimmerMessageWidth + 20;
  const cyclePosition = Math.floor(time / glimmerSpeed);
  const glimmerIndex = reducedMotion
    ? -100
    : isStalled
      ? -100
      : mode === 'requesting'
        ? (cyclePosition % cycleLength) - 10
        : glimmerMessageWidth + 10 - (cyclePosition % cycleLength);

  const flashOpacity = reducedMotion ? 0 : mode === 'tool-use' ? (Math.sin((time / 1000) * Math.PI) + 1) / 2 : 0;

  // === 令牌计数器动画（平滑递增，由 50ms 时钟驱动）===
  const tokenCounterRef = useRef(currentResponseLength);
  if (reducedMotion) {
    tokenCounterRef.current = currentResponseLength;
  } else {
    const gap = currentResponseLength - tokenCounterRef.current;
    if (gap > 0) {
      let increment: number;
      if (gap < 70) {
        increment = 3;
      } else if (gap < 200) {
        increment = Math.max(8, Math.ceil(gap * 0.15));
      } else {
        increment = 50;
      }
      tokenCounterRef.current = Math.min(tokenCounterRef.current + increment, currentResponseLength);
    }
  }
  const displayedResponseLength = tokenCounterRef.current;
  const leaderTokens = Math.round(displayedResponseLength / 4);

  const effectiveElapsedMs = hasRunningTeammates ? Math.max(elapsedTimeMs, now - turnStartRef.current) : elapsedTimeMs;
  const timerText = formatDuration(effectiveElapsedMs);
  const timerWidth = stringWidth(timerText);

  // === 令牌计数（主代理 + 队友，或前台队友）===
  const totalTokens =
    foregroundedTeammate && !foregroundedTeammate.isIdle
      ? (foregroundedTeammate.progress?.tokenCount ?? 0)
      : leaderTokens + teammateTokens;
  const tokenCount = formatNumber(totalTokens);
  const tokensText = hasRunningTeammates ? `${tokenCount} 令牌` : `${figures.arrowDown} ${tokenCount} 令牌`;
  const tokensWidth = stringWidth(tokensText);

  // === 思考文本（可能缩小以适应空间）===
  let thinkingText =
    thinkingStatus === 'thinking'
      ? `思考中${effortSuffix}`
      : typeof thinkingStatus === 'number'
        ? `已思考 ${Math.max(1, Math.round(thinkingStatus / 1000))}秒`
        : null;
  let thinkingWidthValue = thinkingText ? stringWidth(thinkingText) : 0;

  // === 渐进式宽度门控 ===
  const messageWidth = glimmerMessageWidth + 2;
  const sep = SEP_WIDTH;

  const wantsThinking = thinkingStatus !== null;
  const wantsTimerAndTokens = verbose || hasRunningTeammates || effectiveElapsedMs > SHOW_TOKENS_AFTER_MS;

  const availableSpace = columns - messageWidth - 5;

  let showThinking = wantsThinking && availableSpace > thinkingWidthValue;
  if (!showThinking && wantsThinking && thinkingStatus === 'thinking' && effortSuffix) {
    if (availableSpace > THINKING_BARE_WIDTH) {
      thinkingText = '思考中';
      thinkingWidthValue = THINKING_BARE_WIDTH;
      showThinking = true;
    }
  }
  const usedAfterThinking = showThinking ? thinkingWidthValue + sep : 0;

  const showTimer = wantsTimerAndTokens && availableSpace > usedAfterThinking + timerWidth;
  const usedAfterTimer = usedAfterThinking + (showTimer ? timerWidth + sep : 0);

  const showTokens = wantsTimerAndTokens && totalTokens > 0 && availableSpace > usedAfterTimer + tokensWidth;

  const thinkingOnly =
    showThinking && thinkingStatus === 'thinking' && !spinnerSuffix && !showTimer && !showTokens && true;

  // === 思考闪烁颜色（原 ThinkingShimmerText 独立计时器的逻辑）===
  // 同样的正弦波透明度，但从共享的 `time` 派生，
  // 而非第二个 useAnimationFrame(50) 订阅。
  const thinkingElapsedSec = (time - THINKING_DELAY_MS) / 1000;
  const thinkingOpacity =
    time < THINKING_DELAY_MS ? 0 : (Math.sin((thinkingElapsedSec * Math.PI * 2) / THINKING_GLOW_PERIOD_S) + 1) / 2;
  const thinkingShimmerColor = toRGBColor(
    interpolateColor(THINKING_INACTIVE, THINKING_INACTIVE_SHIMMER, thinkingOpacity),
  );

  // === 构建状态部件 ===
  const parts = [
    ...(spinnerSuffix
      ? [
          <Text dimColor key="suffix">
            {spinnerSuffix}
          </Text>,
        ]
      : []),
    ...(showTimer
      ? [
          <Text dimColor key="elapsedTime">
            {timerText}
          </Text>,
        ]
      : []),
    ...(showTokens
      ? [
          <Box flexDirection="row" key="tokens">
            {!hasRunningTeammates && <SpinnerModeGlyph mode={mode} />}
            <Text dimColor>{tokenCount} 令牌</Text>
          </Box>,
        ]
      : []),
    ...(showThinking && thinkingText
      ? [
          thinkingStatus === 'thinking' && !reducedMotion ? (
            <Text key="thinking" color={thinkingShimmerColor}>
              {thinkingOnly ? `(${thinkingText})` : thinkingText}
            </Text>
          ) : (
            <Text dimColor key="thinking">
              {thinkingText}
            </Text>
          ),
        ]
      : []),
  ];

  const status =
    foregroundedTeammate && !foregroundedTeammate.isIdle ? (
      <>
        <Text dimColor>(Esc 中断 </Text>
        <Text color={toInkColor(foregroundedTeammate.identity.color)}>{foregroundedTeammate.identity.agentName}</Text>
        <Text dimColor>)</Text>
      </>
    ) : !foregroundedTeammate && parts.length > 0 ? (
      thinkingOnly ? (
        <Byline>{parts}</Byline>
      ) : (
        <>
          <Text dimColor>(</Text>
          <Byline>{parts}</Byline>
          <Text dimColor>)</Text>
        </>
      )
    ) : null;

  return (
    <Box ref={viewportRef} flexDirection="row" flexWrap="wrap" marginTop={1} width="100%">
      <SpinnerGlyph
        frame={frame}
        messageColor={messageColor}
        stalledIntensity={overrideColor ? 0 : stalledIntensity}
        reducedMotion={reducedMotion}
        time={time}
      />
      <GlimmerMessage
        message={message}
        mode={mode}
        messageColor={messageColor}
        glimmerIndex={glimmerIndex}
        flashOpacity={flashOpacity}
        shimmerColor={shimmerColor}
        stalledIntensity={overrideColor ? 0 : stalledIntensity}
      />
      {status}
    </Box>
  );
}

function SpinnerModeGlyph({ mode }: { mode: SpinnerMode }): React.ReactNode {
  switch (mode) {
    case 'tool-input':
    case 'tool-use':
    case 'responding':
    case 'thinking':
      return (
        <Box width={2}>
          <Text dimColor>{figures.arrowDown}</Text>
        </Box>
      );
    case 'requesting':
      return (
        <Box width={2}>
          <Text dimColor>{figures.arrowUp}</Text>
        </Box>
      );
  }
}
