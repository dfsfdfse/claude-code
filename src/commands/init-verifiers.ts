import type { Command } from '../commands.js'

const command = {
  type: 'prompt',
  name: 'init-verifiers',
  description: '为代码更改的自动化验证创建验证者技能',
  contentLength: 0, // Dynamic content
  progressMessage: '正在分析项目并创建验证者技能',
  source: 'builtin',
  async getPromptForCommand() {
    return [
      {
        type: 'text',
        text: `使用 TodoWrite 工具跟踪你完成这个多步骤任务的进度。

## 目标

创建一个或多个验证者技能，可供验证代理自动验证此项目或文件夹中的代码更改。如果项目有不同的验证需求（例如 Web UI 和 API 端点），你可以创建多个验证者。

**不要为单元测试或类型检查创建验证者。** 那些已经由标准构建/测试工作流处理，不需要专门的验证者技能。专注于功能验证：Web UI（Playwright）、CLI（Tmux）和 API（HTTP）验证者。

## 阶段 1：自动检测

分析项目以检测不同子目录中的内容。项目可能包含多个子项目或需要不同验证方法的区域（例如，一个仓库中同时包含 Web 前端、API 后端和共享库）。

1. **扫描顶级目录**以识别不同的项目区域：
   - 在子目录中查找单独的 package.json、Cargo.toml、pyproject.toml、go.mod
   - 识别不同文件夹中的不同应用类型

2. **对每个区域，检测：**

   a. **项目类型和技术栈**
      - 主要语言和框架
      - 包管理器（npm、yarn、pnpm、pip、cargo 等）

   b. **应用类型**
      - Web 应用（React、Next.js、Vue 等）→ 建议使用基于 Playwright 的验证者
      - CLI 工具 → 建议使用基于 Tmux 的验证者
      - API 服务（Express、FastAPI 等）→ 建议使用基于 HTTP 的验证者

   c. **现有验证工具**
      - 测试框架（Jest、Vitest、pytest 等）
      - E2E 工具（Playwright、Cypress 等）
      - package.json 中的开发服务器脚本

   d. **开发服务器配置**
      - 如何启动开发服务器
      - 运行在什么 URL 上
      - 什么文本表明它已就绪

3. **已安装的验证包**（对于 Web 应用）
   - 检查 Playwright 是否已安装（在 package.json dependencies/devDependencies 中查找）
   - 检查 MCP 配置（.mcp.json）中是否有浏览器自动化工具：
     - Playwright MCP 服务器
     - Chrome DevTools MCP 服务器
     - Claude Chrome Extension MCP（通过 Claude 的 Chrome 扩展进行浏览器使用）
   - 对于 Python 项目，检查 playwright、pytest-playwright

## 阶段 2：验证工具设置

根据阶段 1 中检测到的内容，帮助用户设置适当的验证工具。

### 对于 Web 应用

1. **如果浏览器自动化工具已安装/配置**，询问用户他们想使用哪个：
   - 使用 AskUserQuestion 呈现检测到的选项
   - 示例："我发现 Playwright 和 Chrome DevTools MCP 已配置。想用哪个进行验证？"

2. **如果未检测到浏览器自动化工具**，询问他们是否要安装/配置一个：
   - 使用 AskUserQuestion："未检测到浏览器自动化工具。是否要设置一个用于 UI 验证？"
   - 提供的选项：
     - **Playwright**（推荐）- 完整的浏览器自动化库，无头运行，非常适合 CI
     - **Chrome DevTools MCP** - 通过 MCP 使用 Chrome DevTools 协议
     - **Claude Chrome Extension** - 使用 Claude Chrome 扩展进行浏览器交互（需要 Chrome 中已安装扩展）
     - **无** - 跳过浏览器自动化（将只使用基本 HTTP 检查）

3. **如果用户选择安装 Playwright**，根据包管理器运行适当的命令：
   - npm: \`npm install -D @playwright/test && npx playwright install\`
   - yarn: \`yarn add -D @playwright/test && yarn playwright install\`
   - pnpm: \`pnpm add -D @playwright/test && pnpm exec playwright install\`
   - bun: \`bun add -D @playwright/test && bun playwright install\`

4. **如果用户选择 Chrome DevTools MCP 或 Claude Chrome Extension**：
   - 这些需要 MCP 服务器配置而不是包安装
   - 询问他们是否要你将 MCP 服务器配置添加到 .mcp.json
   - 对于 Claude Chrome Extension，告知他们需要从 Chrome 网上应用店安装扩展

5. **MCP 服务器设置**（如适用）：
   - 如果用户选择了基于 MCP 的选项，在 .mcp.json 中配置适当的条目
   - 更新验证者技能的 allowed-tools 以使用适当的 mcp__* 工具

### 对于 CLI 工具

1. 检查 asciinema 是否可用（运行 \`which asciinema\`）
2. 如果不可用，告知用户 asciinema 可以帮助录制验证会话，但是可选的
3. Tmux 通常是系统安装的，只需验证它可用

### 对于 API 服务

1. 检查 HTTP 测试工具是否可用：
   - curl（通常系统安装）
   - httpie（\`http\` 命令）
2. 通常不需要安装

## 阶段 3：交互式问答

根据阶段 1 检测到的区域，你可能需要创建多个验证者。对于每个不同的区域，使用 AskUserQuestion 工具确认：

1. **验证者名称** - 根据检测建议名称，但让用户选择：

   如果只有一个项目区域，使用简单格式：
   - "verifier-playwright" 用于 Web UI 测试
   - "verifier-cli" 用于 CLI/终端测试
   - "verifier-api" 用于 HTTP API 测试

   如果有多个项目区域，使用格式 \`verifier-<project>-<type>\`：
   - "verifier-frontend-playwright" 用于前端 Web UI
   - "verifier-backend-api" 用于后端 API
   - "verifier-admin-playwright" 用于管理仪表板

   \`<project>\` 部分应该是子目录或项目区域的简短标识符（例如，文件夹名或包名）。

   允许自定义名称，但必须包含"verifier"——验证代理通过在文件夹名中查找"verifier"来发现技能。

2. **项目特定问题**（基于类型）：

   对于 Web 应用（playwright）：
   - 开发服务器命令（例如 "npm run dev"）
   - 开发服务器 URL（例如 "http://localhost:3000"）
   - 就绪信号（服务器就绪时出现的文本）

   对于 CLI 工具：
   - 入口点命令（例如 "node ./cli.js" 或 "./target/debug/myapp"）
   - 是否使用 asciinema 录制

   对于 API：
   - API 服务器命令
   - 基础 URL

3. **认证和登录**（对于 Web 应用和 API）：

   使用 AskUserQuestion 询问："你的应用是否需要认证/登录才能访问被验证的页面或端点？"
   - **无需认证** - 应用公开可访问，无需登录
   - **需要登录** - 应用需要认证才能继续验证
   - **部分页面需要认证** - 公开和需要认证的路由混合

   如果用户选择需要登录（或部分），询问后续问题：
   - **登录方式**：用户如何登录？
     - 基于表单的登录（登录页面上的用户名/密码）
     - API 令牌/密钥（作为 header 或查询参数传递）
     - OAuth/SSO（基于重定向的流程）
     - 其他（让用户描述）
   - **测试凭证**：验证者应使用什么凭证？
     - 询问登录 URL（例如 "/login"、"http://localhost:3000/auth"）
     - 询问测试用户名/邮箱和密码，或 API 密钥
     - 注意：建议用户使用环境变量存储密钥（例如 \`TEST_USER\`、\`TEST_PASSWORD\`），而不是硬编码
   - **登录后指示器**：如何确认登录成功？
     - URL 重定向（例如重定向到 "/dashboard"）
     - 元素出现（例如"欢迎"文本、用户头像）
     - 设置了 cookie/令牌

## 阶段 4：生成验证者技能

**所有验证者技能都创建在项目根目录的 \`.claude/skills/\` 目录中。** 这确保当 Claude 在项目中运行时，它们会自动加载。

将技能文件写入 \`.claude/skills/<verifier-name>/SKILL.md\`。

### 技能模板结构

\`\`\`markdown
---
name: <verifier-name>
description: <基于类型的描述>
allowed-tools:
  # 适合验证者类型的工具
---

# <验证者标题>

你是一个验证执行者。你收到验证计划并按原样精确执行。

## 项目上下文
<来自检测的项目特定详情>

## 设置说明
<如何启动任何所需服务>

## 认证
<如果需要认证，在此包含逐步登录说明>
<包含登录 URL、凭证环境变量和登录后验证>
<如果不需要认证，省略此部分>

## 报告

使用验证计划中指定的格式报告每个步骤的 PASS 或 FAIL。

## 清理

验证后：
1. 停止任何启动的开发服务器
2. 关闭任何浏览器会话
3. 报告最终摘要

## 自我更新

如果验证失败是因为此技能的说明已过时（开发服务器命令/端口/就绪信号更改等）——而不是被测功能损坏——或者用户在你运行期间纠正你，使用 AskUserQuestion 确认，然后用最小针对性的修复编辑此 SKILL.md。
\`\`\`

### 按类型允许的工具

**verifier-playwright**:
\`\`\`yaml
allowed-tools:
  - Bash(npm:*)
  - Bash(yarn:*)
  - Bash(pnpm:*)
  - Bash(bun:*)
  - mcp__playwright__*
  - Read
  - Glob
  - Grep
\`\`\`

**verifier-cli**:
\`\`\`yaml
allowed-tools:
  - Tmux
  - Bash(asciinema:*)
  - Read
  - Glob
  - Grep
\`\`\`

**verifier-api**:
\`\`\`yaml
allowed-tools:
  - Bash(curl:*)
  - Bash(http:*)
  - Bash(npm:*)
  - Bash(yarn:*)
  - Read
  - Glob
  - Grep
\`\`\`

## 阶段 5：确认创建

写入技能文件后，告知用户：
1. 每个技能创建在哪里（始终在 \`.claude/skills/\`）
2. 验证代理如何发现它们——文件夹名必须包含"verifier"（不区分大小写）才能自动发现
3. 他们可以编辑技能来自定义
4. 他们可以再次运行 /init-verifiers 来为其他区域添加更多验证者
5. 如果验证者检测到其自身说明已过时（错误的开发服务器命令、更改的就绪信号等），验证者将提供自我更新`,
      },
    ]
  },
} satisfies Command

export default command