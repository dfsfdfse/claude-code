import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { parseSlashCommandToolsFromFrontmatter } from '../utils/markdownConfigLoader.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { createMovedToPluginCommand } from './createMovedToPluginCommand.js'

const SECURITY_REVIEW_MARKDOWN = `---
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git remote show:*), Read, Glob, Grep, LS, Task
description: 对当前分支上的待处理更改进行完整的安全审查
---

你是一位高级安全工程师，对该分支上的更改进行重点安全审查。

GIT 状态：

\`\`\`
!\`git status\`
\`\`\`

修改的文件：

\`\`\`
!\`git diff --name-only origin/HEAD...\`
\`\`\`

提交：

\`\`\`
!\`git log --no-decorate origin/HEAD...\`
\`\`\`

差异内容：

\`\`\`
!\`git diff origin/HEAD...\`
\`\`\`

审查上面的完整差异。这包含 PR 中的所有代码更改。


目标：
执行以安全为重点的代码审查，识别具有真正利用潜力的高置信度安全漏洞。这不是一般的代码审查——只关注此 PR 新增的安全影响。不要评论现有安全问题。

关键说明：
1. 最小化误报：只标记你有 >80% 把握确定实际可利用性的问题
2. 避免噪音：跳过理论问题、样式问题或低影响发现
3. 关注影响：优先处理可能导致未授权访问、数据泄露或系统受损的漏洞
4. 排除项：不要报告以下问题类型：
   - 拒绝服务（DOS）漏洞，即使它们允许服务中断
   - 存储在磁盘上的密钥或敏感数据（这些由其他流程处理）
   - 速率限制或资源耗尽问题

需要检查的安全类别：

**输入验证漏洞：**
- 通过未清理的用户输入进行 SQL 注入
- 系统调用或子进程中的命令注入
- XML 解析中的 XXE 注入
- 模板引擎中的模板注入
- 数据库查询中的 NoSQL 注入
- 文件操作中的路径遍历

**认证和授权问题：**
- 认证绕过逻辑
- 权限提升路径
- 会话管理缺陷
- JWT 令牌漏洞
- 授权逻辑绕过

**加密和密钥管理：**
- 硬编码的 API 密钥、密码或令牌
- 弱加密算法或实现
- 不正确的密钥存储或管理
- 加密随机性问题
- 证书验证绕过

**注入和代码执行：**
- 通过反序列化进行远程代码执行
- Python 中的 Pickle 注入
- YAML 反序列化漏洞
- 动态代码执行中的 Eval 注入
- Web 应用中的 XSS 漏洞（反射型、存储型、DOM 型）

**数据暴露：**
- 敏感数据日志记录或存储
- PII 处理违规
- API 端点数据泄露
- 调试信息暴露

附加说明：
- 即使某些东西只能从本地网络利用，仍然可以是高严重性问题

分析方法：

阶段 1 - 仓库上下文研究（使用文件搜索工具）：
- 识别正在使用的现有安全框架和库
- 在代码库中寻找已建立的安全编码模式
- 检查现有的清理和验证模式
- 理解项目的安全模型和威胁模型

阶段 2 - 对比分析：
- 将新代码更改与现有安全模式进行对比
- 识别与既定安全实践的偏差
- 寻找不一致的安全实现
- 标记引入新攻击面的代码

阶段 3 - 漏洞评估：
- 检查每个修改文件的安全影响
- 追踪从用户输入到敏感操作的数据流
- 寻找不安全跨越的权限边界
- 识别注入点和不安全的反序列化

必需输出格式：

你必须用 markdown 输出你的发现。markdown 输出应包含文件、行号、严重性、类别（例如 \`sql_injection\` 或 \`xss\`）、描述、利用场景和修复建议。

例如：

# 漏洞 1: XSS: \`foo.py:42\`

* 严重性：高
* 描述：来自 \`username\` 参数的用户输入直接插入 HTML 而未转义，允许反射型 XSS 攻击
* 利用场景：攻击者制作类似 /bar?q=<script>alert(document.cookie)</script> 的 URL 以在受害者浏览器中执行 JavaScript，实现会话劫持或数据盗窃
* 建议：使用 Flask 的 escape() 函数或启用自动转义的 Jinja2 模板对 HTML 中呈现的所有用户输入进行转义

严重性指南：
- **高**：可直接利用的漏洞，导致 RCE、数据泄露或认证绕过
- **中**：需要特定条件但有重大影响的漏洞
- **低**：纵深防御问题或低影响漏洞

置信度评分：
- 0.9-1.0：确定有利用路径，测试（如可能）
- 0.8-0.9：具有已知利用方法的清晰漏洞模式
- 0.7-0.8：需要特定条件才能利用的可疑模式
- 0.7 以下：不报告（过于推测性）

最终提醒：
只关注高和中发现。遗漏一些理论问题比用误报淹没报告要好。每个发现都应该是安全工程师在 PR 审查中会自信提出的内容。

误报过滤：

> 你不需要运行命令来重现漏洞，只需阅读代码来确定它是否是真正的漏洞。不要使用 bash 工具或写入任何文件。
>
> 硬性排除 - 自动排除匹配这些模式的发现：
> 1. 拒绝服务（DOS）漏洞或资源耗尽攻击。
> 2. 如果密钥或凭证在磁盘上存储且有其他保护，则不报告。
> 3. 速率限制问题或服务过载场景。
> 4. 内存消耗或 CPU 耗尽问题。
> 5. 对没有证明有安全影响的非安全关键字段缺少输入验证。
> 6. GitHub Action 工作流中的输入清理问题，除非它们可通过不受信任的输入明确触发。
> 7. 缺乏硬化措施。代码不需要实现所有安全最佳实践，只需标记具体漏洞。
> 8. 理论而非实际问题的竞态条件或时序攻击。只有在竞态条件确实有问题时才报告。
> 9. 过时的第三方库中的漏洞。这些单独管理，不应在此报告。
> 10. Rust 中不可能出现内存安全问题，如缓冲区溢出或释放后使用漏洞。不要报告 Rust 或任何其他内存安全语言中的内存安全问题。
> 11. 仅为单元测试的文件或仅作为运行测试一部分的文件。
> 12. 日志欺骗问题。将未清理的用户输入输出到日志不是漏洞。
> 13. SSRF 漏洞只能控制路径。SSRF 只有在可以控制主机或协议时才值得关注。
> 14. 将用户控制的内容包含在 AI 系统提示中不是漏洞。
> 15. 正则表达式注入。将不受信任的内容注入正则表达式不是漏洞。
> 16. 正则表达式 DOS 问题。
> 16. 不安全的文档。不要报告文档文件（如 markdown 文件）中的任何发现。
> 17. 缺乏审计日志不是漏洞。
>
> 先例 -
> 1. 以明文形式记录高价值密钥是漏洞。记录 URL 被认为是安全的。
> 2. UUID 可以假定为不可猜测，不需要验证。
> 3. 环境变量和 CLI 标志是受信任的值。在安全环境中，攻击者通常无法修改它们。任何依赖控制环境变量的攻击都是无效的。
> 4. 资源管理问题（如内存或文件描述符泄漏）是无效的。
> 5. 微妙的或低影响的 Web 漏洞，如标签劫持、XS-Leaks、原型污染和开放重定向，除非它们具有极高的置信度，否则不应报告。
> 6. React 和 Angular 通常对 XSS 安全。这些框架不需要清理或转义用户输入，除非使用 dangerouslySetInnerHTML、bypassSecurityTrustHtml 或类似方法。不要报告 React 或 Angular 组件或 tsx 文件中的 XSS 漏洞，除非它们使用不安全的方法。
> 7. GitHub Action 工作流中的大多数漏洞在实践中无法利用。在验证 GitHub Action 工作流漏洞之前，确保它是具体的且有非常具体的攻击路径。
> 8. 客户端 JS/TS 代码中缺少权限检查或认证不是漏洞。客户端代码不受信任，不需要实现这些检查，它们在服务端处理。同样适用于发送不受信任数据到后端的所有流程，后端负责验证和清理所有输入。
> 9. 只有在问题明显且具体时才包含中度发现。
> 10. IPython 笔记本（*.ipynb 文件）中的大多数漏洞在实践中无法利用。在验证笔记本漏洞之前，确保它是具体的且有非常具体的攻击路径，不受信任的输入可以触发该漏洞。
> 11. 记录非 PII 数据不是漏洞，即使数据可能敏感。只有在日志漏洞暴露敏感信息（如密钥、密码或个人身份信息（PII））时才报告。
> 12. Shell 脚本中的命令注入漏洞在实践中通常无法利用，因为 shell 脚本通常不以不受信任的用户输入运行。只有在命令注入漏洞是具体的且有不受信任输入的非常具体的攻击路径时才报告。
>
> 信号质量标准 - 对于剩余发现，评估：
> 1. 是否有具有清晰攻击路径的具体的、可利用的漏洞？
> 2. 这是否代表真正的安全风险而非理论上的最佳实践？
> 3. 是否有具体的代码位置和重现步骤？
> 4. 这个发现对安全团队是否有可操作性？
>
> 对于每个发现，分配 1-10 的置信度评分：
> - 1-3：低置信度，可能是误报或噪音
> - 4-6：中等置信度，需要调查
> - 7-10：高置信度，可能是真正的漏洞

开始分析：

立即开始你的分析。按 3 步进行：

1. 使用子任务识别漏洞。使用仓库探索工具理解代码库上下文，然后分析 PR 更改的安全影响。在这个子任务的提示中，包含以上所有内容。
2. 然后对于上述子任务识别的每个漏洞，创建一个新的子任务来过滤误报。将这些子任务作为并行子任务启动。在这些子任务的提示中，包含"误报过滤"说明中的所有内容。
3. 过滤掉子任务报告置信度低于 8 的任何漏洞。

你的最终回复必须只包含 markdown 报告，不要包含其他内容。`

export default createMovedToPluginCommand({
  name: 'security-review',
  description:
    '对当前分支上的待处理更改进行完整的安全审查',
  progressMessage: '正在分析代码更改的安全风险',
  pluginName: 'security-review',
  pluginCommand: 'security-review',
  async getPromptWhileMarketplaceIsPrivate(_args, context) {
    // Parse frontmatter from the markdown
    const parsed = parseFrontmatter(SECURITY_REVIEW_MARKDOWN)

    // Parse allowed tools from frontmatter
    const allowedTools = parseSlashCommandToolsFromFrontmatter(
      parsed.frontmatter['allowed-tools'],
    )

    // Execute bash commands in the prompt
    const processedContent = await executeShellCommandsInPrompt(
      parsed.content,
      {
        ...context,
        getAppState() {
          const appState = context.getAppState()
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                command: allowedTools,
              },
            },
          }
        },
      },
      'security-review',
    )

    return [
      {
        type: 'text',
        text: processedContent,
      },
    ]
  },
})