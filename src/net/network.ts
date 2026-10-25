import { networkInterfaces } from 'node:os'

/** 找本机一个可用的局域网 IPv4（同 Wi-Fi 的朋友能直接访问）。 */
export function firstLanIPv4(): string {
  const interfaces = networkInterfaces()
  const candidates: string[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      candidates.push(entry.address)
    }
  }
  // 常见家用/办公网段优先
  const preferred = candidates.find((ip) => ip.startsWith('192.168.'))
    ?? candidates.find((ip) => ip.startsWith('10.'))
    ?? candidates.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    ?? candidates[0]
  return preferred ?? ''
}
