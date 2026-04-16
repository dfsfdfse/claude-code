export const REMOTE_TRIGGER_TOOL_NAME = 'RemoteTrigger'

export const DESCRIPTION =
  '通过 claude.ai CCR API 管理计划的远程 Claude Code 代理（触发器）。身份验证在进程内处理——令牌永远不会到达 shell。'

export const PROMPT = `调用 claude.ai 远程触发 API。使用此工具而不是 curl——OAuth 令牌在进程内自动添加，永不暴露。

操作：
- list: GET /v1/code/triggers
- get: GET /v1/code/triggers/{trigger_id}
- create: POST /v1/code/triggers（需要 body）
- update: POST /v1/code/triggers/{trigger_id}（需要 body，部分更新）
- run: POST /v1/code/triggers/{trigger_id}/run

响应是 API 的原始 JSON。`
