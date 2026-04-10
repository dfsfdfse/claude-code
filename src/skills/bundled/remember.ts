import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import { registerBundledSkill } from '../bundledSkills.js'

export function registerRememberSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  const SKILL_PROMPT = `# 记忆回顾

## 目标
审查用户的记忆全景，生成变更建议报告，按操作类型分组。
注意：不要直接应用变更 —— 仅展示建议供用户审批。

## 步骤

### 1. 收集所有记忆层
从项目根目录读取 CLAUDE.md 和 CLAUDE.local.md（如果存在）。
你的 auto-memory 内容已在系统提示词中 —— 在那里查看。
记录存在的团队记忆部分（如有）。

**成功标准**：获取所有记忆层内容并可进行对比。

### 2. 分类每个 auto-memory 条目
对于 auto-memory 中的每个实质性条目，确定最佳目标位置：

| 目标位置 | 适用内容 | 示例 |
|---|---|---|
| **CLAUDE.md** | 所有贡献者应遵循的项目规范和 Claude 指令 | "使用 bun 而非 npm"、"API 路由使用 kebab-case"、"测试命令是 bun test"、"优先使用函数式风格" |
| **CLAUDE.local.md** | 仅适用于当前用户的个人指令，不适用于其他贡献者 | "我偏好简洁回复"、"始终解释权衡"、"不要自动提交"、"提交前运行测试" |
| **团队记忆** | 跨仓库适用的组织级知识（仅在配置了团队记忆时） | "部署 PR 需经过 #deploy-queue"、"预发环境在 staging.internal"、"平台团队负责基础设施" |
| **保留在 auto-memory** | 工作笔记、临时上下文或不适于其他位置的条目 | 会话特定观察、不确定的模式 |

**重要区分**：
- CLAUDE.md 和 CLAUDE.local.md 包含给 Claude 的指令，不包含用户对外部工具的偏好（编辑器主题、IDE 快捷键等不属于两者）
- 工作流程实践（PR 规范、合并策略、分支命名）较模糊 —— 询问用户是个人还是团队范围
- 不确定时主动询问而非猜测

**成功标准**：每个条目都有建议目标位置或标记为模糊。

### 3. 识别清理机会
扫描所有层级查找：
- **重复**：auto-memory 条目已收录在 CLAUDE.md 或 CLAUDE.local.md → 建议从 auto-memory 删除
- **过时**：CLAUDE.md 或 CLAUDE.local.md 条目被更新的 auto-memory 条目否定 → 建议更新旧层
- **冲突**：任意两层之间的矛盾 → 建议解决方案，并注明哪个更新

**成功标准**：识别所有跨层问题。

### 4. 展示报告
按操作类型输出结构化报告：
1. **晋升** — 待移动的条目，含目标位置和理由
2. **清理** — 重复、过时条目、待解决的冲突
3. **模糊** — 需要用户输入目标位置的条目
4. **无需操作** — 简要说明应保留的条目

如果 auto-memory 为空，说明情况并提供审查 CLAUDE.md 清理的建议。

**成功标准**：用户可逐一审批/拒绝每个建议。

## 规则
- 在做任何变更前先展示所有建议
- 未经用户明确批准不得修改文件
- 除非目标文件不存在，否则不要创建新文件
- 对模糊条目主动询问 —— 不要猜测
`

  registerBundledSkill({
    name: 'remember',
    description:
      '审查 auto-memory 条目，建议晋升到 CLAUDE.md、CLAUDE.local.md 或共享记忆。同时检测各记忆层之间的过时、冲突和重复条目。',
    whenToUse:
      '当用户想审查、整理或晋升其 auto-memory 条目时使用。也适用于清理 CLAUDE.md、CLAUDE.local.md 和 auto-memory 之间的过时或冲突条目。',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    async getPromptForCommand(args) {
      let prompt = SKILL_PROMPT

      if (args) {
        prompt += `\n## 用户提供的额外上下文\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
