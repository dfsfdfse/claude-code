import { feature } from 'bun:bundle'
import type { Command } from '../commands.js'
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js'
import { isEnvTruthy } from '../utils/envUtils.js'

const OLD_INIT_PROMPT = `请分析此代码库并创建 CLAUDE.md 文件，该文件将提供给未来的 Claude Code 实例以在此仓库中操作。

需要添加的内容：
1. 通常使用的命令，如如何构建、lint 和运行测试。包括在此代码库中进行开发所需的必要命令，如如何运行单个测试。
2. 高级代码架构和结构，以便未来的实例能够更快地提高工作效率。专注于需要阅读多个文件才能理解的"大局"架构。

使用注意事项：
- 如果已有 CLAUDE.md，建议改进它。
- 当你创建初始 CLAUDE.md 时，不要重复自己，不要包含显而易见的指令，如"为用户提供有用的错误消息"、"为所有新工具编写单元测试"、"永远不要在代码或提交中包含敏感信息（API 密钥、令牌）"。
- 避免列出每个可以轻松发现的组件或文件结构。
- 不要包含通用开发实践。
- 如果有 Cursor 规则（在 .cursor/rules/ 或 .cursorrules 中）或 Copilot 规则（在 .github/copilot-instructions.md 中），确保包含重要部分。
- 如果有 README.md，确保包含重要部分。
- 不要编造信息，如"常见开发任务"、"开发提示"、"支持和文档"，除非这是你阅读的其他文件中明确包含的。
- 确保以以下文本作为文件前缀：

\`\`\`
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
\`\`\``

const NEW_INIT_PROMPT = `为此仓库设置最小的 CLAUDE.md（以及可选的技能和钩子）。CLAUDE.md 加载到每个 Claude Code 会话中，因此必须简洁——只包含没有它 Claude 会出错的内容。

## 阶段 1：询问要设置什么

使用 AskUserQuestion 了解用户想要什么：

- "/init 应该设置哪些 CLAUDE.md 文件？"
  选项："项目 CLAUDE.md" | "个人 CLAUDE.local.md" | "项目 + 个人都要"
  项目描述："团队共享的说明，检入源代码控制——架构、编码标准、常见工作流。"
  个人描述："你对此项目的私人偏好（gitignored，不共享）——你的角色、沙箱 URL、首选测试数据、工作流怪癖。"

- "还要设置技能和钩子吗？"
  选项："技能 + 钩子" | "仅技能" | "仅钩子" | "都不要，只要 CLAUDE.md"
  技能描述："你或 Claude 用 \`/skill-name\` 按需调用的能力——适合可重复的工作流和参考知识。"
  钩子描述："在工具事件上运行的确定性 shell 命令（例如每次编辑后格式化）。Claude 不能跳过它们。"

## 阶段 2：探索代码库

启动一个子代理来调查代码库，并要求它阅读关键文件以了解项目：清单文件（package.json、Cargo.toml、pyproject.toml、go.mod、pom.xml 等）、README、Makefile/构建配置、CI 配置、现有 CLAUDE.md、.claude/rules/、AGENTS.md、.cursor/rules 或 .cursorrules、.github/copilot-instructions.md、.windsurfrules、.clinerules、.mcp.json。

检测：
- 构建、测试和 lint 命令（特别是非标准命令）
- 语言、框架和包管理器
- 项目结构（带工作区 monorepo、多模块或单一项目）
- 与语言默认设置不同的代码风格规则
- 非显而易见的陷阱、所需环境变量或工作流怪癖
- 现有 .claude/skills/ 和 .claude/rules/ 目录
- 格式化器配置（prettier、biome、ruff、black、gofmt、rustfmt，或统一格式脚本如 \`npm run format\` / \`make fmt\`）
- Git worktree 使用：运行 \`git worktree list\` 检查此仓库是否有多个 worktree（仅在用户想要个人 CLAUDE.local.md 时相关）

注意你无法仅从代码中弄清楚的——这些成为面试问题。

## 阶段 3：填补空白

使用 AskUserQuestion 收集你仍需要的内容以编写好的 CLAUDE.md 文件和技能。只问代码无法回答的问题。

如果用户选择了项目 CLAUDE.md 或两者都要：询问代码库实践——非显而易见的命令、陷阱、分支/PR 约定、所需环境设置、测试怪癖。跳过 README 或从清单文件中显而易见的內容。不要将任何选项标记为"推荐"——这是关于他们的团队如何工作，不是最佳实践。

如果用户选择了个人 CLAUDE.local.md 或两者都要：询问关于他们自己的问题，不是代码库。不要将任何选项标记为"推荐"——这是关于他们的个人偏好，不是最佳实践。问题示例：
  - 他们在团队中的角色是什么？（例如"后端工程师"、"数据科学家"、"新员工入职"）
  - 他们对这个代码库及其语言/框架有多熟悉？（以便 Claude 校准解释深度）
  - 他们是否有 Claude 应该知道的个人沙箱 URL、测试账户、API 密钥路径或本地设置详情？
  - 仅当阶段 2 发现多个 git worktree 时：询问他们的 worktree 是嵌套在主仓库内（例如 \`.claude/worktrees/<name>/\`）还是同级/外部（例如 \`../myrepo-feature/\`）。如果是嵌套的，向上的文件遍历会自动找到主仓库的 CLAUDE.local.md——无需特殊处理。如果是同级/外部，个人内容应位于主目录文件（例如 \`~/.claude/<project-name>-instructions.md\`），每个 worktree 获得一个一行 CLAUDE.local.md 存根以导入它：\`@~/.claude/<project-name>-instructions.md\`。永远不要将此导入放入项目 CLAUDE.md——那会将个人引用检入团队共享文件。
  - 有任何沟通偏好吗？（例如"简洁"、"始终解释权衡"、"不要在最后总结"）

**根据阶段 2 发现综合提案**——例如，如果存在格式化器则格式化后编辑、如果存在测试则 \`/verify\` 技能、对任何来自差距填充答案的作为指南而非工作流的內容在 CLAUDE.md 中注明。根据阶段 1 技能+钩子选择，为每个选择适合的产物类型，**受其约束**：

  - **钩子**（更严格）——工具事件上的确定性 shell 命令；Claude 不能跳过它。适合机械、快速、每次编辑的步骤：格式化、lint、运行对更改文件的快速测试。
  - **技能**（按需）——你或 Claude 在想要时用 \`/skill-name\` 调用。适合不属于每次编辑的工作流：深度验证、会话报告、部署。
  - **CLAUDE.md 注释**（更宽松）——影响 Claude 的行为但不强制。适合沟通/思考偏好："编程前计划"、"简洁"、"解释权衡"。

  **遵守阶段 1 技能+钩子选择作为硬过滤器**：如果用户选择了"仅技能"，将你建议的任何钩子降级为技能或 CLAUDE.md 注释。如果"仅钩子"，将技能降级为钩子（如果机械可能）或注释。如果"都不要"，一切成为 CLAUDE.md 注释。永远不要提出用户未选择加入的产物类型。

**通过 AskUserQuestion 的 \`preview\` 字段显示提案，而不是作为单独的文本消息**——对话框覆盖你的输出，因此前面的文本被隐藏。\`preview\` 字段在侧边栏中呈现 markdown（类似计划模式）；\`question\` 字段是纯文本。结构化如下：

  - \`question\`：简短且纯文本，例如"这个提案看起来正确吗？"
  - 每个选项的 \`preview\` 包含完整的提案作为 markdown。"看起来不错——继续"选项的 preview 显示一切；每个项目删除选项的 preview 显示删除后的剩余内容。
  - **保持 preview 紧凑——preview 框会截断而不会滚动。** 每项一行，项之间无空行，无标题。示例 preview 内容：

    • **格式化后编辑钩子**（自动）——通过 PostToolUse 使用 \`ruff format <file>\`
    • **/verify 技能**（按需）——\`make lint && make typecheck && make test\`
    • **CLAUDE.md 注释**（指南）——"标记完成前运行 lint/typecheck/test"

  - 选项标签保持简短（"看起来不错"、"删除钩子"、"删除技能"）——工具会自动添加"其他"自由文本选项，所以不要添加你自己的全覆盖。

**从接受的提案构建偏好队列**。每个条目：{type: hook|skill|note, description, target file, any Phase-2-sourced details like the actual test/format command}。阶段 4-7 使用此队列。

## 阶段 4：编写 CLAUDE.md（如果用户选择了项目或两者都要）

在项目根目录编写最小的 CLAUDE.md。每一行必须通过此测试："删除它会导致 Claude 出错吗？"如果否，删除它。

**使用阶段 3 偏好队列中目标为 CLAUDE.md 的 \`note\` 条目**（团队级注释）——在最有相关的部分将每个添加为简洁行。这些是用户希望 Claude 遵循但不需要保证的行为（例如"编程前提出计划"、"重构时解释权衡"）。将个人目标注释留待阶段 5。

包含：
- Claude 无法猜测的构建/测试/lint 命令（非标准脚本、标志或序列）
- 与语言默认设置**不同**的代码风格规则（例如"优先使用 type 而非 interface"）
- 测试说明和怪癖（例如"用以下方式运行单个测试：pytest -k 'test_name'"）
- 仓库礼仪（分支命名、PR 约定、提交风格）
- 所需环境变量或设置步骤
- 非显而易见的陷阱或架构决策
- 现有 AI 编码工具配置的重要部分（如果存在）：AGENTS.md、.cursor/rules、.cursorrules、.github/copilot-instructions.md、.windsurfrules、.clinerules

排除：
- 文件级结构或组件列表（Claude 可以通过阅读代码库发现这些）
- Claude 已经知道的语言标准约定
- 通用建议（"编写干净的代码"、"处理错误"）
- 详细 API 文档或长引用——使用 \`@path/to/import\` 语法改为按需内联内容而不是膨胀 CLAUDE.md
- 经常更改的信息——用 \`@path/to/import\` 引用源以便 Claude 始终阅读当前版本
- 冗长的教程或演练（移至单独文件并用 \`@path/to/import\` 引用，或放入技能）
- 来自清单文件显而易见的命令（例如标准 "npm test"、"cargo test"、"pytest"）

要具体："TypeScript 使用 2 空格缩进"比"正确格式化代码"更好。

不要重复自己，不要编造"常见开发任务"或"开发提示"等部分——只包含在阅读的文件中明确发现的内容。

以前缀开头：

\`\`\`
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
\`\`\`

如果 CLAUDE.md 已存在：阅读它，作为 diff 提出具体更改，并解释每个更改如何改进它。不要静默覆盖。

对于有多个关注点的项目：建议将说明组织到 \`.claude/rules/\` 作为单独的聚焦文件（例如 \`code-style.md\`、\`testing.md\`、\`security.md\`）。这些会自动随 CLAUDE.md 一起加载，可以使用 \`paths\` 前台matter 作用域到特定文件路径。

对于有不同子目录的项目（monorepo、多模块项目等）：提及可以为模块特定说明添加子目录 CLAUDE.md 文件（当 Claude 在这些目录中工作时它们会自动加载）。如果用户想要，提供创建。

## 阶段 5：编写 CLAUDE.local.md（如果用户选择了个人或两者都要）

在项目根目录编写最小的 CLAUDE.local.md。此文件自动随 CLAUDE.md 一起加载。创建后，将 \`CLAUDE.local.md\` 添加到项目的 .gitignore 以保持私密。

**使用阶段 3 偏好队列中目标为 CLAUDE.local.md 的 \`note\` 条目**（个人级注释）——将每个添加为简洁行。如果用户在阶段 1 选择了仅个人，此是注释条目的唯一使用者。

包含：
- 用户的角色和对代码库的熟悉程度（以便 Claude 校准解释）
- 个人沙箱 URL、测试账户或本地设置详情
- 个人工作流或沟通偏好

保持简短——只包含会使 Claude 对此用户的回复明显更好的内容。

如果阶段 2 发现了多个 git worktree 且用户确认使用同级/外部 worktree（不在主仓库内）：向上的文件遍历不会从所有 worktree 中找到单个 CLAUDE.local.md。将实际个人内容写入 \`~/.claude/<project-name>-instructions.md\` 并使 CLAUDE.local.md 为一个一行存根导入它：\`@~/.claude/<project-name>-instructions.md\`。用户可以将此一行存根复制到每个同级 worktree。永远不要将此导入放入项目 CLAUDE.md。如果 worktree 嵌套在主仓库内（例如 \`.claude/worktrees/\`），无需特殊处理——主仓库的 CLAUDE.local.md 会自动找到。

如果 CLAUDE.local.md 已存在：阅读它，提出具体补充，不要静默覆盖。

## 阶段 6：建议并创建技能（如果用户选择了"技能 + 钩子"或"仅技能"）

技能添加 Claude 可以按需使用的功能，不会膨胀每个会话。

**首先，使用阶段 3 偏好队列中的 \`skill\` 条目**。每个排队的技能偏好成为根据用户描述量身定制的 SKILL.md。对于每个：
- 根据偏好命名（例如 "verify-deep"、"session-report"、"deploy-sandbox"）
- 使用用户在面试中的措辞加上阶段 2 发现的任何内容（测试命令、报告格式、部署目标）编写正文。如果偏好映射到现有捆绑技能（例如 \`/verify\`），编写在其上添加用户特定约束的项目技能——告诉用户捆绑的仍然存在且他的是附加的。
- 如果偏好未充分指定，快速跟进询问（例如"verify-deep 应该运行什么测试命令？"）

**然后建议额外的技能**超出队列当你发现时：
- 特定任务的参考知识（子系统的约定、模式、风格指南）
- 用户想要直接触发的可重复工作流（部署、修复问题、发布流程、验证更改）

对于每个建议的技能，提供：名称、一行目的以及为什么它适合此仓库。

如果 \`.claude/skills/\` 已存在技能，首先阅读它们。不要覆盖现有技能——只提出补充现有技能的新技能。

在 \`.claude/skills/<skill-name>/SKILL.md\` 创建每个技能：

\`\`\`yaml
---
name: <skill-name>
description: <技能做什么以及何时使用>
---

<给 Claude 的说明>
\`\`\`

默认情况下，用户（\`/<skill-name>\`）和 Claude 都可以调用技能。对于有副作用的工作流（例如 \`/deploy\`、\`/fix-issue 123\`），添加 \`disable-model-invocation: true\` 以便只有用户可以触发，并使用 \`$ARGUMENTS\` 接受输入。

## 阶段 7：建议额外的优化

告诉用户现在 CLAUDE.md 和技能（如果选择）已就位，你将提出一些额外的优化建议。

检查环境并使用 AskUserQuestion 询问你发现的每个差距：

- **GitHub CLI**：运行 \`which gh\`（或在 Windows 上 \`where gh\`）。如果缺失且项目使用 GitHub（检查 \`git remote -v\` 是否有 github.com），询问用户是否要安装它。解释 GitHub CLI 让 Claude 直接帮助提交、pull request、issues 和代码审查。

- **Linting**：如果阶段 2 未发现 lint 配置（对于项目语言没有 .eslintrc、ruff.toml、.golangci.yml 等），询问用户是否要为此代码库设置 linting。解释 linting 提前发现问题，并为 Claude 的编辑提供快速反馈。

- **来自提案的钩子**（如果用户选择了"技能 + 钩子"或"仅钩子"）：使用阶段 3 偏好队列。如果阶段 2 发现了格式化器且队列中没有格式化钩子，提供格式化后编辑作为后备。如果用户在阶段 1 选择了"都不要"或"仅技能"，完全跳过此部分。

  对于每个钩子偏好（来自队列或格式化器后备）：

  1. 目标文件：基于阶段 1 CLAUDE.md 选择默认——项目 → \`.claude/settings.json\`（团队共享，已提交）；个人 → \`.claude/settings.local.json\`。仅在阶段 1 用户选择"两者都要"或偏好模糊时才询问。一次为所有钩子询问，而不是每个钩子一次。

  2. 从偏好中选择事件和匹配器：
     - "每次编辑后" → \`PostToolUse\` 匹配器 \`Write|Edit\`
     - "当 Claude 完成时"/"在我审查前" → \`Stop\` 事件（在每轮结束时触发——包括只读轮次）
     - "运行 bash 前" → \`PreToolUse\` 匹配器 \`Bash\`
     - "提交前"（字面 git-commit 门）→ **不是 hooks.json 钩子。** 匹配器无法按命令内容过滤 Bash，因此无法仅针对 \`git commit\`。将其路由到 git pre-commit 钩子（\`.git/hooks/pre-commit\`、husky、pre-commit 框架）——提供编写一个。如果用户实际意思是"在我审查和提交 Claude 输出前"，那是 \`Stop\`——探查以消除歧义。
     如果偏好模糊则探查。

  3. **加载钩子引用**（每 \`/init\` 运行一次，在第一个钩子之前）：使用 \`skill: 'update-config'\` 调用技能工具，args 以 \`[hooks-only]\` 开头，后跟你正在构建的内容的一行摘要——例如 \`[hooks-only] 使用 ruff 为 .claude/settings.json 构建 PostToolUse/Write|Edit 格式钩子\`。这将钩子模式和验证流程加载到上下文中。后续钩子重用它——不要重新调用。

  4. 遵循技能的 **"构建钩子"** 流程：去重检查 → 为此项目构建 → 管道测试原始 → 包装 → 写入 JSON → \`jq -e\` 验证 → 实时验证（对于 \`Pre|PostToolUse\` 上的可触发匹配器）→ 清理 → 交接。目标文件和事件/匹配器来自步骤 1-2。

在继续之前对每个"是"采取行动。

## 阶段 8：摘要和后续步骤

总结设置了什么——编写了哪些文件以及每个文件包含的关键点。提醒用户这些文件是一个起点：他们应该审查和调整，可以随时再次运行 \`/init\` 重新扫描。

然后告诉用户，基于你发现的内容，你将提出一些关于优化代码库和 Claude Code 设置的更多建议。以单个格式良好的待办事项列表呈现，每个项目与此仓库相关。按影响最大的项目放在最前面。

构建列表时，完成这些检查并仅包含适用的内容：
- 如果检测到前端代码（React、Vue、Svelte 等）：\`/plugin install frontend-design@claude-plugins-official\` 赋予 Claude 设计原则和组件模式以便它产生精美的 UI；\`/plugin install playwright@claude-plugins-official\` 让 Claude 启动真实浏览器、截图它构建的内容并自行修复视觉 bug。
- 如果在阶段 7 发现差距（缺少 GitHub CLI、缺少 linting）且用户说不：在此列出它们，每项一行说明各自如何帮助。
- 如果测试缺失或稀疏：建议设置测试框架以便 Claude 可以验证其自身的更改。
- 为帮助你创建技能并使用 evals 优化现有技能，Claude Code 有一个官方技能创建者插件可以安装。用 \`/plugin install skill-creator@claude-plugins-official\` 安装，然后运行 \`/skill-creator <skill-name>\` 创建新技能或改进任何现有技能。（始终包含此。）
- 用 \`/plugin\` 浏览官方插件——这些捆绑了你可能觉得有用的技能、代理、钩子和 MCP 服务器。你也可以创建自己的自定义插件与他人共享。（始终包含此。）`

const command = {
  type: 'prompt',
  name: 'init',
  get description() {
    return feature('NEW_INIT') &&
      (process.env.USER_TYPE === 'ant' ||
        isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT))
      ? '初始化新的 CLAUDE.md 文件和可选的技能/钩子，包含代码库文档'
      : '使用代码库文档初始化新的 CLAUDE.md 文件'
  },
  contentLength: 0, // Dynamic content
  progressMessage: '正在分析代码库',
  source: 'builtin',
  async getPromptForCommand() {
    maybeMarkProjectOnboardingComplete()

    return [
      {
        type: 'text',
        text:
          feature('NEW_INIT') &&
          (process.env.USER_TYPE === 'ant' ||
            isEnvTruthy(process.env.CLAUDE_CODE_NEW_INIT))
            ? NEW_INIT_PROMPT
            : OLD_INIT_PROMPT,
      },
    ]
  },
} satisfies Command

export default command