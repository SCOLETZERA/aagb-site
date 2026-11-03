/**
 * Empacota a API em dist/ com esbuild. O pacote @aagb/shared (TypeScript puro) entra no pacote;
 * as demais dependências ficam externas e são instaladas normalmente no servidor.
 */
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies: Record<string, string>
}
const external = Object.keys(pkg.dependencies).filter((name) => name !== '@aagb/shared')

await build({
  entryPoints: { server: 'src/server.ts', 'create-user': 'scripts/create-user.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
})
