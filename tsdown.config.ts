import type { UserConfig } from 'tsdown'

const config: UserConfig = {
  name: 'dsh-holdem-p2p',
  entry: {
    index: 'src/index.ts',
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: false,
  sourcemap: true,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    'ws',
    /^node:/,
  ],
}

export default config
