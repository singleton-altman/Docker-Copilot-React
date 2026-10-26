import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// 构建时导出跨端共享的 logo 配置（share-logos.json + share-icon-*）：
// server 以 front 静态文件直接提供服务，App/第三方可按约定 URL 拉取。
// 数据源为 src/config/imageLogos.js 与 src/assets/logos/，无需手工维护副本。
function logoSharePlugin() {
  let outDirAbs = 'dist'
  let projectRoot = process.cwd()
  return {
    name: 'logo-share-export',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root
      outDirAbs = path.isAbsolute(config.build.outDir)
        ? config.build.outDir
        : path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      try {
        const source = fs.readFileSync(
          path.join(projectRoot, 'src/config/imageLogos.js'),
          'utf8'
        )

        // 导入表: const XLogo from '../assets/logos/<file>'
        const imports = new Map()
        for (const m of source.matchAll(/import\s+(\w+)\s+from\s+'[^']*assets\/logos\/([^']+)'/g)) {
          imports.set(m[1], m[2])
        }
        // 单色集合（深色模式需反色的单色 SVG）
        const monoVars = new Set()
        const monoBlock = source.match(/const monoLogoSet = new Set\(\[([\s\S]*?)\]\)/)
        if (monoBlock) {
          for (const m of monoBlock[1].matchAll(/\b(\w+Logo)\b/g)) monoVars.add(m[1])
        }
        // 映射表: "匹配键": 变量名
        const mapBlock = source.match(/export const builtInImageLogos = \{([\s\S]*?)\n\};/)
        if (!mapBlock) throw new Error('builtInImageLogos not found')

        const mappings = {}
        const mono = []
        const copied = new Set()
        const logosDir = path.join(projectRoot, 'src/assets/logos')
        for (const m of mapBlock[1].matchAll(/"([^"]+)":\s*(\w+)/g)) {
          const [, key, varName] = m
          const file = imports.get(varName)
          if (!file) continue
          mappings[key] = file
          if (monoVars.has(varName) && !mono.includes(file)) mono.push(file)
          const src = path.join(logosDir, file)
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(outDirAbs, 'share-icon-' + file))
            copied.add(file)
          }
        }

        fs.writeFileSync(
          path.join(outDirAbs, 'share-logos.json'),
          JSON.stringify({ version: Date.now(), mappings, mono }, null, 2)
        )
        console.log(`[logo-share] exported ${Object.keys(mappings).length} mappings, ${copied.size} icon files`)
      } catch (err) {
        console.warn('[logo-share] export skipped: ' + err.message)
      }
    }
  }
}

export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic'
  }), logoSharePlugin()],
  server: {
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 12713,
    host: true
  },
  build: {
    // 确保静态资源被正确复制
    assetsDir: 'assets'
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  }
})
