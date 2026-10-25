import type { UserConfig } from 'tsdown'

/** Cloudflare Worker 产物：单文件 ESM，部署时由 wrangler 直接上传。 */
const config: UserConfig = {
  name: '@zhuweiyou/dsh-holdem/worker',
  entry: { worker: 'worker/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'neutral',
  target: 'es2024',
  dts: false,
  clean: false,
  sourcemap: true,
}

export default config
