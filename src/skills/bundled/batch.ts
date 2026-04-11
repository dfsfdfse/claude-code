import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../tools/ExitPlanModeTool/constants.js'
import { SKILL_TOOL_NAME } from '../../tools/SkillTool/constants.js'
import { getIsGit } from '../../utils/git.js'
import { registerBundledSkill } from '../bundledSkills.js'

const MIN_AGENTS = 5
const MAX_AGENTS = 30

const WORKER_INSTRUCTIONS = `完成实现后：
1. **简化** — 调用 \`${SKILL_TOOL_NAME}\` 工具，参数 \`skill: "simplify"\`，审查并清理你的变更。
2. **运行单元测试** — 运行项目测试套件（检查 package.json 脚本、Makefile 目标或常见命令如 \`npm test\`、\`bun test\`、\`pytest\`、\`go test\`）。如果测试失败，修复它们。
3. **端到端测试** — 按照协调者的 e2e 测试配方执行（见下方）。如果配方说跳过此单元的 e2e，跳过。
4. **提交并推送** — 用清晰的提交信息提交所有变更，推送分支，使用 \`gh pr create\` 创建 PR。标题要描述性强。如果 \`gh\` 不可用或推送失败，在最终消息中注明。
5. **报告** — 以单行结束：\`PR: <url>\`，以便协调者跟踪。如果未创建 PR，以 \`PR: none — <原因>\` 结束。`

function buildPrompt(instruction: string): string {
  return `# 批量处理：并行工作编排

你正在协调对代码库的大规模并行变更。

## 用户指令

${instruction}

## 阶段 1：研究与规划（计划模式）

立即调用 \`${ENTER_PLAN_MODE_TOOL_NAME}\` 工具进入计划模式，然后：

1. **理解范围** — 启动一个或多个子智能体（前台运行 — 你需要它们的结果），深入研究此指令涉及的内容。找出所有需要变更的文件、模式和调用点。理解现有约定以确保迁移一致性。

2. **分解为独立单元** — 将工作拆分为 ${MIN_AGENTS}–${MAX_AGENTS} 个自包含单元。每个单元必须：
   - 可在独立的 git worktree 中独立实现（与兄弟单元无共享状态）
   - 可自行合并，无需依赖另一单元的 PR 先落地
   - 大小大致均匀（拆分大单元，合并小单元）

   根据实际工作量调整数量：文件少 → 接近 ${MIN_AGENTS}；文件多 → 接近 ${MAX_AGENTS}。优先按目录或模块切片，而非任意文件列表。

3. **确定 e2e 测试配方** — 弄清楚工作者如何端到端验证变更是否真正有效，而不仅仅是单元测试通过。查找：
   - \`claude-in-chrome\` 技能或浏览器自动化工具（UI 变更：点击相关流程、截图结果）
   - \`tmux\` 或 CLI 验证器技能（CLI 变更：交互式启动应用、操作用户变更的行为）
   - 开发服务器 + curl 模式（API 变更：启动服务器、请求相关端点）
   - 现有 e2e/集成测试套件

   如果找不到具体的 e2e 路径，使用 \`${ASK_USER_QUESTION_TOOL_NAME}\` 工具询问用户如何端到端验证此变更。根据你的发现提供 2–3 个具体选项（如"通过浏览器扩展截图"、"运行 \`bun run dev\` 并 curl 端点"、"无 e2e — 单元测试已足够"）。不要跳过此步骤 — 工作者无法自己询问用户。

   将配方写为工作者可自主执行的一组简短具体步骤。包括任何设置（启动开发服务器、先构建）和验证的确切命令/交互。

4. **编写计划** — 在计划文件中包含：
   - 研究发现摘要
   - 工作单元编号列表 — 每个：简短标题、覆盖的文件/目录列表、变更的一行描述
   - e2e 测试配方（或"因…跳过 e2e"如果用户选择了）
   - 将给每个智能体的确切工作者指令（共享模板）

5. 调用 \`${EXIT_PLAN_MODE_TOOL_NAME}\` 呈现计划待批准。

## 阶段 2：启动工作者（计划批准后）

计划批准后，使用 \`${AGENT_TOOL_NAME}\` 工具每个工作单元启动一个后台智能体。**所有智能体必须使用 \`isolation: "worktree"\` 和 \`run_in_background: true\`。** 在单条消息中全部启动以便并行运行。

每个智能体的提示词必须完全自包含。包括：
- 总体目标（用户的指令）
- 本单元的具体任务（标题、文件列表、变更描述 — 从计划中逐字复制）
- 工作者需要遵循的代码库约定
- 计划中的 e2e 测试配方（或"因…跳过 e2e"）
- 下方的worker指令，逐字复制：

\`\`\`
${WORKER_INSTRUCTIONS}
\`\`\`

除非有更具体的智能体类型适合，否则使用 \`subagent_type: "general-purpose"\`。

## 阶段 3：跟踪进度

启动所有工作者后，渲染初始状态表：

| # | 单元 | 状态 | PR |
|---|------|--------|----|
| 1 | <标题> | 运行中 | — |
| 2 | <标题> | 运行中 | — |

后台智能体完成通知到达时，从每个智能体结果中解析 \`PR: <url>\` 行，并用更新后的状态（\`完成\` / \`失败\`）和 PR 链接重新渲染表格。对任何未产生 PR 的智能体保留简短失败说明。

所有智能体报告完成后，渲染最终表格和一行摘要（如"22/24 单元已作为 PR 落地"）。
`
}

const NOT_A_GIT_REPO_MESSAGE = `这不是一个 git 仓库。\`/batch\` 命令需要 git 仓库，因为它会在独立的 git worktree 中启动工作者并从每个单元创建 PR。请先初始化仓库，或在现有仓库中运行此命令。`

const MISSING_INSTRUCTION_MESSAGE = `请提供描述要执行的批量变更的指令。

示例：
  /batch 从 react 迁移到 vue
  /batch 将所有 lodash 使用替换为原生等价物
  /batch 为所有未类型化的函数参数添加类型注解`

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: 'batch',
    description:
      '研究和规划大规模变更，然后通过 5–30 个隔离的 worktree 智能体并行执行，每个智能体创建一个 PR。',
    whenToUse:
      '当用户希望跨多个文件进行大规模、机械化的变更（迁移、重构、批量重命名）且可分解为独立并行单元时使用。',
    argumentHint: '<instruction>',
    userInvocable: true,
    disableModelInvocation: true,
    async getPromptForCommand(args) {
      const instruction = args.trim()
      if (!instruction) {
        return [{ type: 'text', text: MISSING_INSTRUCTION_MESSAGE }]
      }

      const isGit = await getIsGit()
      if (!isGit) {
        return [{ type: 'text', text: NOT_A_GIT_REPO_MESSAGE }]
      }

      return [{ type: 'text', text: buildPrompt(instruction) }]
    },
  })
}
