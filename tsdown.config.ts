import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { name: string }

/** Modules the DSH web shell serves to client bundles from its module table. */
const CLIENT_SHARED = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]

export default defineConfig([
  {
    // Host half: imported by the DSH loader from the profile's node_modules.
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    // Browser half: served by the DSH web shell as `<package>/client.js` and
    // evaluated through `window.__ModuleLoader__`, which supplies `require`.
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2024',
    // The shell serves exactly `<package>/client.js`; the package `type` does not apply to a browser script.
    outExtensions: () => ({ js: '.js' }),
    dts: false,
    clean: false,
    deps: { neverBundle: CLIENT_SHARED },
    outputOptions: {
      banner: [
        'window.__ModuleLoader__.load({',
        `\tid: ${JSON.stringify(manifest.name)},`,
        '\tfactory: (require) => {',
        '\t\tvar module = { exports: {} };',
        '\t\tvar exports = module.exports;',
      ].join('\n'),
      footer: ['\t\treturn module.exports;', '\t}', '});'].join('\n'),
    },
  },
])
