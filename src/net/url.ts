/** 纯函数：校验 publicBaseUrl（Node 与 Worker 共用，不依赖 schemastery）。 */
export function validatePublicBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('publicBaseUrl 必须是绝对 http(s) 地址')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('publicBaseUrl 必须是 http 或 https')
  }
  if (parsed.origin !== trimmed) {
    throw new Error('publicBaseUrl 只能是一个 origin，不能带路径、查询或末尾斜杠')
  }
  return parsed.origin
}
