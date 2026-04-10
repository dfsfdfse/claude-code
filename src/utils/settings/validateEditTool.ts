import type { ValidationResult } from 'src/Tool.js'
import { isClaudeSettingsPath } from '../permissions/filesystem.js'
import { validateSettingsFileContent } from './validation.js'

/**
 * 验证设置文件编辑，确保结果符合 SettingsSchema。
 * FileEditTool 使用此函数以避免代码重复。
 *
 * @param filePath - 被编辑的文件路径
 * @param originalContent - 编辑前的原始文件内容
 * @param getUpdatedContent - 返回应用编辑后内容的闭包
 * @returns 如果验证失败，返回带有错误详情的验证结果
 */
export function validateInputForSettingsFileEdit(
  filePath: string,
  originalContent: string,
  getUpdatedContent: () => string,
): Extract<ValidationResult, { result: false }> | null {
  // Only validate Claude settings files
  if (!isClaudeSettingsPath(filePath)) {
    return null
  }

  // Check if the current file (before edit) conforms to the schema
  const beforeValidation = validateSettingsFileContent(originalContent)

  if (!beforeValidation.isValid) {
    // If the before version is invalid, allow the edit (don't block it)
    return null
  }

  // If the before version is valid, ensure the after version is also valid
  const updatedContent = getUpdatedContent()
  const afterValidation = validateSettingsFileContent(updatedContent)

  if (!afterValidation.isValid) {
    return {
      result: false,
      message: `编辑后 Claude Code settings.json 校验未通过：\n${(afterValidation as any).error}\n\n完整校验规则：\n${(afterValidation as any).fullSchema}\n注意：除非有明确要求，请勿修改 env 字段。`,
 
      errorCode: 10,
    }
  }

  return null
}
