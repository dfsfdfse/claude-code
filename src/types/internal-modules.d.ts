/**
 * Type declarations for internal Anthropic packages that cannot be installed
 * from public npm. All exports are typed as `any` to suppress errors while
 * still allowing IDE navigation for the actual source code.
 */

// ============================================================================
// bun:bundle — compile-time macros
// ============================================================================
declare module "bun:bundle" {
    export function feature(name: string): boolean;
}

declare module "bun:ffi" {
    export function dlopen<T extends Record<string, { args: readonly string[]; returns: string }>>(path: string, symbols: T): { symbols: { [K in keyof T]: (...args: unknown[]) => unknown }; close(): void };
}

// Third-party modules without @types packages
declare module 'bidi-js' {
  function getEmbeddingLevels(text: string, defaultDirection?: string): { paragraphLevel: number; levels: Uint8Array }
  function getReorderSegments(text: string, embeddingLevels: { paragraphLevel: number; levels: Uint8Array }, start?: number, end?: number): [number, number][]
  function getVisualOrder(reorderSegments: [number, number][]): number[]
  export { getEmbeddingLevels, getReorderSegments, getVisualOrder }
  export default { getEmbeddingLevels, getReorderSegments, getVisualOrder }
}

declare module 'asciichart' {
  function plot(series: number[] | number[][], config?: Record<string, unknown>): string
  export { plot }
  export default { plot }
}

declare module 'lodash-es' {
  type Memoized<T extends (...args: any[]) => any> = T & { cache: Map<unknown, ReturnType<T>> }
  export function memoize<T extends (...args: any[]) => any>(func: T, resolver?: (...args: Parameters<T>) => unknown): Memoized<T>
  export function mergeWith<T>(object: T, ...sources: any[]): T
  export function cloneDeep<T>(value: T): T
  export function isEqual(a: unknown, b: unknown): boolean
  export function partition<T>(collection: readonly T[], predicate: (value: T) => boolean): [T[], T[]]
  export function uniqBy<T>(collection: readonly T[], iteratee: ((value: T) => unknown) | keyof T | string): T[]
  export function sample<T>(collection: readonly T[]): T
  export function last<T>(collection: readonly T[]): T | undefined
  export function reject<T>(collection: readonly T[], predicate: (value: T) => boolean): T[]
  export function pickBy<T extends object>(
    object: T,
    predicate: (value: T[keyof T], key: string) => boolean,
  ): T
  export function mapValues<T extends object, R>(
    object: T,
    iteratee: (value: T[keyof T], key: string) => R,
  ): Record<keyof T, R>
  const lodash: any
  export default lodash
}

declare module 'lodash-es/memoize.js' {
  type Memoized<T extends (...args: any[]) => any> = T & { cache: Map<unknown, ReturnType<T>> }
  export default function memoize<T extends (...args: any[]) => any>(
    func: T,
    resolver?: (...args: Parameters<T>) => unknown,
  ): Memoized<T>
}

declare module 'lodash-es/mergeWith.js' {
  export default function mergeWith<T>(object: T, ...sources: any[]): T
}

declare module 'lodash-es/cloneDeep.js' {
  export default function cloneDeep<T>(value: T): T
}

declare module 'lodash-es/isEqual.js' {
  export default function isEqual(a: unknown, b: unknown): boolean
}

declare module 'lodash-es/partition.js' {
  export default function partition<T>(collection: readonly T[], predicate: (value: T) => boolean): [T[], T[]]
}

declare module 'lodash-es/uniqBy.js' {
  export default function uniqBy<T>(collection: readonly T[], iteratee: ((value: T) => unknown) | keyof T | string): T[]
}

declare module 'lodash-es/sample.js' {
  export default function sample<T>(collection: readonly T[]): T
}

declare module 'lodash-es/mapValues.js' {
  export default function mapValues<T extends object, R>(
    object: T,
    iteratee: (value: T[keyof T], key: string) => R,
  ): Record<keyof T, R>
}

declare module 'lodash-es/pickBy.js' {
  export default function pickBy<T extends object>(
    object: T,
    predicate: (value: T[keyof T], key: string) => boolean,
  ): T
}

declare module 'lodash-es/last.js' {
  export default function last<T>(collection: readonly T[]): T | undefined
}

declare module 'lodash-es/reject.js' {
  export default function reject<T>(collection: readonly T[], predicate: (value: T) => boolean): T[]
}

declare module 'lodash-es/noop.js' {
  export default function noop(): void
}

declare module 'lodash-es/throttle.js' {
  export default function throttle<T extends (...args: any[]) => any>(func: T, wait?: number, options?: any): T & {
    cancel(): void
    flush(): ReturnType<T>
  }
}

declare module 'lodash-es/*' {
  const fn: any
  export default fn
}

declare module 'semver' {
  export function valid(version: string, options?: any): string | null
  export function satisfies(version: string, range: string, options?: any): boolean
  export function gt(a: string, b: string, options?: any): boolean
  export function lt(a: string, b: string, options?: any): boolean
  export function gte(a: string, b: string, options?: any): boolean
  export function lte(a: string, b: string, options?: any): boolean
  export function prerelease(version: string, options?: any): readonly unknown[] | null
  export function coerce(version: string | undefined, options?: any): { version: string; compare(other: string | { version: string }): 0 | 1 | -1 } | null
  export function compare(a: string, b: string, options?: any): 0 | 1 | -1
  export function major(version: string, options?: any): number
  export function minor(version: string, options?: any): number
  export function patch(version: string, options?: any): number
  const semver: {
    valid: typeof valid
    satisfies: typeof satisfies
    gt: typeof gt
    lt: typeof lt
    gte: typeof gte
    lte: typeof lte
    prerelease: typeof prerelease
    coerce: typeof coerce
    compare: typeof compare
    major: typeof major
    minor: typeof minor
    patch: typeof patch
  }
  export default semver
}

declare module 'stack-utils' {
  export default class StackUtils {
    static nodeInternals(): readonly RegExp[]
    constructor(options?: Record<string, unknown>)
    clean(stack: string): string
    parseLine(line: string): Record<string, any> | null
  }
}

declare module 'he' {
  export function decode(input: string, options?: Record<string, unknown>): string
  export function encode(input: string, options?: Record<string, unknown>): string
}

declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: Record<string, unknown>): Promise<void>
}

declare module 'ws' {
  export namespace WebSocket {
    type Data = any
    type RawData = any
  }
  export class WebSocket {
    static OPEN: number
    static CLOSING: number
    static CLOSED: number
    constructor(address: string | URL, protocols?: any, options?: any)
    readyState: number
    send(data: string | Uint8Array, callback?: (error?: Error) => void): void
    close(code?: number, reason?: string): void
    terminate(): void
    ping(data?: any): void
    removeAllListeners(event?: string): this
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'message', listener: (data: WebSocket.RawData) => void): this
    on(event: 'open', listener: () => void): this
    on(event: string, listener: (...args: any[]) => void): this
    off(event: string, listener: (...args: any[]) => void): this
  }
  export default WebSocket
}

declare module '@hono/node-server' {
  export function serve(
    options: Record<string, unknown>,
    callback?: (info: { port: number }) => void,
  ): { close(callback?: () => void): void; on(event: string, listener: (...args: any[]) => void): void }
}

declare module 'hono/ws' {
  export type WSContext = {
    raw?: unknown
    readyState?: number
    send(data: string | Uint8Array): void
    close(code?: number, reason?: string): void
  }
}

declare module '@hono/node-ws' {
  import type { Context, Handler, Hono } from 'hono'
  import type { WSContext } from 'hono/ws'

  export function createNodeWebSocket(options: { app: Hono }): {
    injectWebSocket(server: unknown): void
    upgradeWebSocket(
      handler: (c: Context) => {
        onOpen?: (event: Event, ws: WSContext) => void
        onMessage?: (event: MessageEvent, ws: WSContext) => void
        onClose?: (event: CloseEvent, ws: WSContext) => void
        onError?: (event: Event, ws: WSContext) => void
      },
    ): Handler
  }
}

declare module '@stricli/core' {
  export type LocalContext = Record<string, unknown>
  export type CommandContext = Record<string, unknown>
  export const numberParser: any
  export function buildApplication(...args: unknown[]): unknown
  export function buildCommand(...args: unknown[]): unknown
  export function run(...args: unknown[]): Promise<void>
}

declare module 'pino' {
  namespace pino {
    type Logger = {
      info: (...args: unknown[]) => void
      warn: (...args: unknown[]) => void
      error: (...args: unknown[]) => void
      debug: (...args: unknown[]) => void
      child: (bindings: Record<string, unknown>) => Logger
    }
    type LoggerOptions = Record<string, unknown>
  }
  function pino(...args: unknown[]): pino.Logger
  namespace pino {
    const stdTimeFunctions: Record<string, unknown>
    function transport(...args: unknown[]): unknown
  }
  export = pino
}

declare module 'selfsigned' {
  export function generate(
    attrs?: readonly Record<string, unknown>[],
    options?: Record<string, unknown>,
  ): { private: string; cert: string }
}

declare module '@agentclientprotocol/sdk' {
  export type Agent = any
  export interface Client {
    requestPermission(params: any): Promise<any>
    sessionUpdate(params: any): Promise<any>
    readTextFile(params: any): Promise<any>
    writeTextFile(params: any): Promise<any>
    [key: string]: any
  }
  export const Client: any
  export class AgentSideConnection {
    constructor(factory: (connection: any) => Agent, stream: any)
    [key: string]: any
  }
  export class Server {
    constructor(...args: any[])
    [key: string]: any
  }
  export class ClientSideConnection {
    constructor(factory: (agent: any) => Client, stream: any)
    [key: string]: any
  }
  export type SessionInfo = any
  export type ContentBlock = any
  export type ClientCapabilities = any
  export type SessionModeState = any
  export type SessionModelState = any
  export type SessionConfigOption = any
  export type InitializeRequest = any
  export type InitializeResponse = any
  export type AuthenticateRequest = any
  export type AuthenticateResponse = any
  export type NewSessionRequest = any
  export type NewSessionResponse = any
  export type PromptRequest = any
  export type PromptResponse = any
  export type CancelNotification = any
  export type LoadSessionRequest = any
  export type LoadSessionResponse = any
  export type ListSessionsRequest = any
  export type ListSessionsResponse = any
  export type ResumeSessionRequest = any
  export type ResumeSessionResponse = any
  export type ForkSessionRequest = any
  export type ForkSessionResponse = any
  export type CloseSessionRequest = any
  export type CloseSessionResponse = any
  export type SetSessionModeRequest = any
  export type SetSessionModeResponse = any
  export type SetSessionModelRequest = any
  export type SetSessionModelResponse = any
  export type SetSessionConfigOptionRequest = any
  export type SetSessionConfigOptionResponse = any
  export type PlanEntry = any
  export type SessionNotification = any
  export type SessionUpdate = any
  export type StopReason = any
  export type ToolCallContent = any
  export type ToolCallLocation = any
  export type PermissionOption = any
  export type ToolCallUpdate = any
  export type Stream = any
  export type ToolKind = string
  export const ToolKind: Record<string, ToolKind>
  export const ndJsonStream: any
  export const PROTOCOL_VERSION: string
}

declare module '@agentclientprotocol/sdk/*' {
  const value: any
  export default value
}

declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react'
  export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number; absoluteStrokeWidth?: boolean }>
  export const Activity: LucideIcon
  export const ArrowDownIcon: LucideIcon
  export const AlertCircle: LucideIcon
  export const Bot: LucideIcon
  export const BrainIcon: LucideIcon
  export const Check: LucideIcon
  export const CheckCircle2: LucideIcon
  export const CheckCircle: LucideIcon
  export const CheckCircleIcon: LucideIcon
  export const CheckIcon: LucideIcon
  export const ChevronDown: LucideIcon
  export const ChevronDownIcon: LucideIcon
  export const ChevronLeft: LucideIcon
  export const ChevronLeftIcon: LucideIcon
  export const ChevronRight: LucideIcon
  export const ChevronRightIcon: LucideIcon
  export const ChevronUp: LucideIcon
  export const ChevronUpIcon: LucideIcon
  export const Circle: LucideIcon
  export const CircleIcon: LucideIcon
  export const Clipboard: LucideIcon
  export const Clock: LucideIcon
  export const ClockIcon: LucideIcon
  export const Code: LucideIcon
  export const Copy: LucideIcon
  export const CopyIcon: LucideIcon
  export const CornerDownLeftIcon: LucideIcon
  export const Download: LucideIcon
  export const Eye: LucideIcon
  export const EyeOff: LucideIcon
  export const FileText: LucideIcon
  export const FolderOpen: LucideIcon
  export const Globe: LucideIcon
  export const GripVerticalIcon: LucideIcon
  export const History: LucideIcon
  export const Image: LucideIcon
  export const ImageIcon: LucideIcon
  export const Info: LucideIcon
  export const KeyRound: LucideIcon
  export const LayoutGrid: LucideIcon
  export const Loader2: LucideIcon
  export const Loader2Icon: LucideIcon
  export const Menu: LucideIcon
  export const MessageSquare: LucideIcon
  export const MicIcon: LucideIcon
  export const Monitor: LucideIcon
  export const Moon: LucideIcon
  export const MoreHorizontal: LucideIcon
  export const PanelLeft: LucideIcon
  export const PanelLeftClose: LucideIcon
  export const Paperclip: LucideIcon
  export const PaperclipIcon: LucideIcon
  export const Pencil: LucideIcon
  export const Play: LucideIcon
  export const Plus: LucideIcon
  export const PlusIcon: LucideIcon
  export const RefreshCw: LucideIcon
  export const Scan: LucideIcon
  export const ScanLine: LucideIcon
  export const Search: LucideIcon
  export const SearchIcon: LucideIcon
  export const Send: LucideIcon
  export const SendHorizonal: LucideIcon
  export const Settings: LucideIcon
  export const Shield: LucideIcon
  export const ShieldAlert: LucideIcon
  export const ShieldAlertIcon: LucideIcon
  export const Slash: LucideIcon
  export const Square: LucideIcon
  export const SquareIcon: LucideIcon
  export const Sun: LucideIcon
  export const Terminal: LucideIcon
  export const Trash: LucideIcon
  export const Trash2: LucideIcon
  export const TriangleAlert: LucideIcon
  export const User: LucideIcon
  export const UserIcon: LucideIcon
  export const UserPlus: LucideIcon
  export const Wifi: LucideIcon
  export const Wrench: LucideIcon
  export const WrenchIcon: LucideIcon
  export const X: LucideIcon
  export const XCircle: LucideIcon
  export const XCircleIcon: LucideIcon
  export const XIcon: LucideIcon
  const icons: Record<string, LucideIcon>
  export default icons
}

declare module 'browser-image-compression' {
  export default function imageCompression(file: File, options?: Record<string, unknown>): Promise<File>
}

declare module 'ai' {
  export type UIMessage = {
    id?: string
    role: 'system' | 'user' | 'assistant' | 'data'
    parts: Array<{ type: 'text'; text: string } | Record<string, any>>
    [key: string]: any
  }
  export type UIMessageChunk = Record<string, any>
  export type ChatTransport<TMessage = UIMessage> = {
    sendMessages(args: { messages: TMessage[]; abortSignal?: AbortSignal }): Promise<ReadableStream<UIMessageChunk>>
    reconnectToStream?(args: { id: string }): Promise<ReadableStream<UIMessageChunk> | null>
  }
  export type FileUIPart = {
    id?: string
    type?: string
    url?: string
    mediaType?: string
    filename?: string
    [key: string]: any
  }
  export type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'
  export type ToolUIPart = {
    type: string
    input: any
    output?: any
    errorText?: string
    state:
      | 'input-streaming'
      | 'input-available'
      | 'approval-requested'
      | 'approval-responded'
      | 'output-available'
      | 'output-error'
      | 'output-denied'
  }
}

declare module '@ai-sdk/react' {
  export function useChat(...args: unknown[]): Record<string, unknown>
}

declare module 'streamdown' {
  import type { ComponentType, PropsWithChildren } from 'react'
  export const Streamdown: ComponentType<PropsWithChildren<Record<string, unknown>>>
}

declare module 'use-stick-to-bottom' {
  export function useStickToBottom(...args: unknown[]): Record<string, unknown>
  export function useStickToBottomContext(...args: unknown[]): Record<string, unknown>
  export const StickToBottom: any
}

declare module 'nanoid' {
  export function nanoid(size?: number): string
}

declare module 'qr-scanner' {
  export default class QrScanner {
    static scanImage(image: File | Blob | HTMLImageElement | HTMLCanvasElement | string, options?: Record<string, unknown>): Promise<string>
    constructor(video: HTMLVideoElement, onDecode: (result: any) => void, options?: Record<string, unknown>)
    start(): Promise<void>
    stop(): void
    destroy(): void
  }
}

declare module '@radix-ui/react-slot' {
  import type { ComponentType, PropsWithChildren } from 'react'
  export const Slot: ComponentType<PropsWithChildren<Record<string, unknown>>>
}

declare module '@radix-ui/react-*' {
  import type { ComponentType, PropsWithChildren } from 'react'
  export function useControllableState<T>(args: {
    prop?: T
    defaultProp?: T
    onChange?: (value: T) => void
  }): [T, (value: T) => void]
  export const Root: ComponentType<PropsWithChildren<Record<string, any>>>
  export const CollapsibleTrigger: ComponentType<PropsWithChildren<Record<string, any>>>
  export const CollapsibleContent: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Trigger: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Content: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Group: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Item: ComponentType<PropsWithChildren<Record<string, any>>>
  export const CheckboxItem: ComponentType<PropsWithChildren<Record<string, any>>>
  export const RadioItem: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Sub: ComponentType<PropsWithChildren<Record<string, any>>>
  export const SubTrigger: ComponentType<PropsWithChildren<Record<string, any>>>
  export const SubContent: ComponentType<PropsWithChildren<Record<string, any>>>
  export const RadioGroup: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ItemIndicator: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ItemText: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Anchor: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Corner: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ScrollAreaScrollbar: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ScrollAreaThumb: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Value: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Icon: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ScrollUpButton: ComponentType<PropsWithChildren<Record<string, any>>>
  export const ScrollDownButton: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Provider: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Arrow: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Portal: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Overlay: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Title: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Description: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Close: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Label: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Viewport: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Thumb: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Indicator: ComponentType<PropsWithChildren<Record<string, any>>>
  export const List: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Separator: ComponentType<PropsWithChildren<Record<string, any>>>
  const value: Record<string, any>
  export default value
}

declare module 'radix-ui' {
  import type { ComponentType, PropsWithChildren } from 'react'
  const part: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Tabs: {
    Root: typeof part
    List: typeof part
    Trigger: typeof part
    Content: typeof part
  }
}

declare module 'class-variance-authority' {
  export type VariantProps<T> = T extends (...args: unknown[]) => unknown ? Record<string, unknown> : never
  export function cva(...args: unknown[]): (...args: unknown[]) => string
}

declare module 'cmdk' {
  import type { ComponentType, PropsWithChildren } from 'react'
  export const Command: ComponentType<PropsWithChildren<Record<string, unknown>>> & Record<string, ComponentType<PropsWithChildren<Record<string, unknown>>>>
}

declare module 'motion/react' {
  export const motion: any
  export const AnimatePresence: any
}

declare module 'react-resizable-panels' {
  import type { ComponentType, PropsWithChildren } from 'react'
  export type GroupProps = Record<string, any>
  export type PanelProps = Record<string, any>
  export type SeparatorProps = Record<string, any>
  export const Group: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Separator: ComponentType<PropsWithChildren<Record<string, any>>>
  export const Panel: ComponentType<PropsWithChildren<Record<string, unknown>>>
  export const PanelGroup: ComponentType<PropsWithChildren<Record<string, unknown>>>
  export const PanelResizeHandle: ComponentType<PropsWithChildren<Record<string, unknown>>>
}

declare module 'tailwind-merge' {
  export function twMerge(...classes: Array<string | undefined | null | false>): string
}

declare module 'shell-quote' {
  export type ControlOperator = string
  export type ParseEntry =
    | string
    | { op: string; pattern?: string }
    | { comment: string }
  export function parse(command: string, env?: Record<string, string | undefined> | ((key: string) => string | undefined)): ParseEntry[]
  export function quote(args: readonly string[], options?: Record<string, unknown>): string
}

declare module 'picomatch' {
  function picomatch(pattern: string | readonly string[], options?: Record<string, unknown>): (input: string) => boolean
  namespace picomatch {
    function isMatch(input: string, pattern: string | readonly string[], options?: Record<string, unknown>): boolean
  }
  export default picomatch
}

declare module 'proper-lockfile' {
  export type CheckOptions = Record<string, unknown>
  export type LockOptions = Record<string, unknown> & { onCompromised?: (err: Error) => void }
  export type UnlockOptions = Record<string, unknown>
  export function lock(file: string, options?: Record<string, unknown>): Promise<() => Promise<void>>
  export function lockSync(file: string, options?: Record<string, unknown>): () => void
  export function unlock(file: string, options?: Record<string, unknown>): Promise<void>
  export function check(file: string, options?: Record<string, unknown>): Promise<boolean>
}

declare module '@aws-sdk/client-sts' {
  export const STSClient: any
  export const GetCallerIdentityCommand: any
}

declare module '@aws-sdk/credential-providers' {
  export function fromIni(...args: any[]): any
  export function fromNodeProviderChain(...args: any[]): any
  export function fromTemporaryCredentials(...args: any[]): any
}

declare module '@aws-sdk/credential-provider-node' {
  export function defaultProvider(...args: any[]): any
}

declare module '@aws-sdk/client-bedrock' {
  export class BedrockClient {
    constructor(config?: any)
    send(command: any): Promise<any>
  }
  export const ListFoundationModelsCommand: any
  export const GetFoundationModelCommand: any
  export const ListInferenceProfilesCommand: any
  export const GetInferenceProfileCommand: any
}

declare module '@aws-sdk/client-bedrock-runtime' {
  export type CountTokensCommandInput = any
  export class BedrockRuntimeClient {
    constructor(config?: any)
    send(command: any): Promise<any>
  }
  export const CountTokensCommand: any
}

declare module '@langfuse/otel' {
  export type MaskFunction = (args: { data: unknown }) => unknown
  export const LangfuseExporter: any
  export class LangfuseSpanProcessor {
    constructor(...args: any[])
    forceFlush(): Promise<void>
    shutdown(): Promise<void>
    onStart(...args: any[]): void
    onEnd(...args: any[]): void
  }
  export function observeOpenAI(...args: any[]): any
}

declare module '@langfuse/tracing' {
  export type LangfuseSpan = any
  export type LangfuseGeneration = any
  export type LangfuseAgent = any
  export const LangfuseOtelSpanAttributes: Record<string, string>
  export const Langfuse: any
  export const LangfuseTraceClient: any
  export const LangfuseSpanClient: any
  export function observe(...args: any[]): any
  export function startObservation(...args: any[]): any
  export function setLangfuseTracerProvider(...args: any[]): void
}

declare module 'clsx' {
  export type ClassValue = any
  export function clsx(...inputs: ClassValue[]): string
  export default clsx
}

declare module '@anthropic-ai/claude-agent-sdk' {
  export type SDKMessage = any
  export type SDKUserMessage = any
  export type SDKAssistantMessage = any
  export type SDKResultMessage = any
  export type PermissionMode = any
}
