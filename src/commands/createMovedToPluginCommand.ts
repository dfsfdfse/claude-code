import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../commands.js'
import type { ToolUseContext } from '../Tool.js'

type Options = {
  name: string
  description: string
  progressMessage: string
  pluginName: string
  pluginCommand: string
  /**
   * 市场私密时使用的提示词。
   * 外部用户将获得此提示词。一旦市场公开，
   * 可以删除此参数和回退逻辑。
   */
  getPromptWhileMarketplaceIsPrivate: (
    args: string,
    context: ToolUseContext,
  ) => Promise<ContentBlockParam[]>
}

export function createMovedToPluginCommand({
  name,
  description,
  progressMessage,
  pluginName,
  pluginCommand,
  getPromptWhileMarketplaceIsPrivate,
}: Options): Command {
  return {
    type: 'prompt',
    name,
    description,
    progressMessage,
    contentLength: 0, // Dynamic content
    userFacingName() {
      return name
    },
    source: 'builtin',
    async getPromptForCommand(
      args: string,
      context: ToolUseContext,
    ): Promise<ContentBlockParam[]> {
      if (process.env.USER_TYPE === 'ant') {
        return [
          {
            type: 'text',
            text: `此命令已移至插件。请告诉用户：

1. 要安装插件，请运行：
   claude plugin install ${pluginName}@claude-code-marketplace

2. 安装后，使用 /${pluginName}:${pluginCommand} 运行此命令

3. 更多信息请参阅：https://github.com/anthropics/claude-code-marketplace/blob/main/${pluginName}/README.md

不要尝试运行命令。只需告知用户关于插件安装的信息。`,
          },
        ]
      }

      return getPromptWhileMarketplaceIsPrivate(args, context)
    },
  }
}
