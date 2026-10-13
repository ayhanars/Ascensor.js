import { build, context } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')
const options = {
  entryPoints: ['src/code.tsx'],
  bundle: true,
  outfile: 'dist/code.js',
  target: 'es2017',
  minify: true,
  jsxFactory: 'figma.widget.h',
  jsxFragment: 'figma.widget.Fragment',
  logLevel: 'info',
}

mkdirSync('dist', { recursive: true })
copyFileSync('src/ui.html', 'dist/ui.html')

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
} else {
  await build(options)
}
