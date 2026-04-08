import { performHeapDump } from '../../utils/heapDumpService.js'

export async function call(): Promise<{ type: 'text'; value: string }> {
  const result = await performHeapDump()

  if (!result.success) {
    return {
      type: 'text',
      value: `创建堆转储失败: ${result.error}`,
    }
  }

  return {
    type: 'text',
    value: `堆转储路径: ${result.heapPath}\n诊断路径: ${result.diagPath}`,
  }
}
