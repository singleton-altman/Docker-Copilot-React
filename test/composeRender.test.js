import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Use the installed Vite/esbuild toolchain; no DOM renderer or new dependencies.
// Bundle once, reuse across the SSR smoke tests (old payload boundaries included).
const root = fileURLToPath(new URL('..', import.meta.url))
const compiled = await build({
  stdin: { contents: `
    import React from 'react'
    import { renderToStaticMarkup } from 'react-dom/server'
    import { Compose } from './src/components/Compose.jsx'
    import { createComposeJobsController } from './src/hooks/composeJobs.js'
    export { createComposeJobsController }
    export const render = (controller) => renderToStaticMarkup(React.createElement(Compose, { jobsController: controller }))
  `, resolveDir: root, loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'offline-api', setup(builder) {
    builder.onLoad({ filter: /[/\\]api[/\\]client\.js$/ }, () => ({
      contents: 'export const composeAPI = {}', loader: 'js',
    }))
  } }],
})

const load = () => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}

const ok = (data) => ({ data: { code: 200, data } })
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }

async function withBrowserMocks(run) {
  const storage = globalThis.localStorage
  const win = globalThis.window
  globalThis.localStorage = { getItem: () => null }
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  try {
    return await run()
  } finally {
    if (storage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = storage
    if (win === undefined) delete globalThis.window
    else globalThis.window = win
  }
}

// 真实控制器 + stub API 走 normalize/merge 全链路后，再 react-dom/server 渲染。
async function renderWithJobs(jobs, selectId) {
  return withBrowserMocks(async () => {
    const { createComposeJobsController, render } = load()
    const api = {
      history: async () => ok({ jobs }),
      getJob: async (id) => {
        const found = jobs.find((job) => job.id === id)
        return ok({ done: true, status: found?.status, job: found, result: found?.result })
      },
    }
    const controller = createComposeJobsController(api, { setTimer: () => 0, clearTimer: () => {} })
    controller.start()
    await flush()
    if (selectId) {
      controller.select(selectId)
      await flush()
    }
    const html = render(controller)
    controller.stop()
    return html
  })
}

const HASH = 'a1b2c3d4e5f6' + '0'.repeat(52)

test('production Compose and hook render with existing react-dom/server, no network', async () => {
  const html = await withBrowserMocks(() => {
    const { createComposeJobsController, render } = load()
    return render(createComposeJobsController({}))
  })
  assert.match(html, /Compose/)
  assert.match(html, /执行历史/)
  assert.match(html, /恢复跟踪 \/ 历史对账/)
  assert.match(html, /disabled=""/)
  assert.match(html, /grid-cols-1 lg:grid-cols-4/)
})

test('phase-4 payload renders config fingerprint and per-service state/health badges', async () => {
  const html = await renderWithJobs([{
    id: 'job-new', filename: 'app.yaml', action: 'up', status: 'succeeded', configSha256: HASH,
    result: {
      id: 'job-new', filename: 'app.yaml', action: 'up', success: true, configSha256: HASH,
      output: 'done', finishedAt: '2026-10-26T00:00:00Z',
      steps: [{ stage: 'up', status: 'success', message: 'started' }, { stage: 'ps', status: 'success', message: 'all running' }],
      services: [
        { name: 'web', state: 'running', health: 'healthy' },
        { name: 'db', state: 'running', health: 'unhealthy' },
        { name: 'cache', state: 'running', health: 'starting' },
        { name: 'worker', state: 'running' },
      ],
    },
  }], 'job-new')
  assert.match(html, /配置指纹/)
  assert.match(html, /a1b2c3d4e5f6/)
  assert.match(html, /服务状态/)
  assert.match(html, /web · running · healthy/)
  assert.match(html, /db · running · unhealthy/)
  assert.match(html, /cache · running · starting/)
  assert.match(html, /worker · running/)
  assert.doesNotMatch(html, /服务端未提供服务状态/)
  // SSR 未打开文件，不应误报「部署后文件已修改」
  assert.doesNotMatch(html, /部署后文件已修改/)
})

test('legacy payload: successful deploy without services shows old-server boundary and hides fingerprint', async () => {
  const html = await renderWithJobs([{
    id: 'job-old', filename: 'app.yaml', action: 'deploy', status: 'succeeded',
    result: { id: 'job-old', filename: 'app.yaml', action: 'deploy', success: true,
      output: 'done', steps: [{ stage: 'up', status: 'success', message: 'ok' }] },
  }], 'job-old')
  assert.match(html, /服务端未提供服务状态（旧版本）/)
  assert.doesNotMatch(html, /配置指纹/)
  assert.doesNotMatch(html, /服务状态</)
})

test('down/pull and failed-up jobs never show the service status block', async () => {
  const down = await renderWithJobs([{
    id: 'job-down', filename: 'app.yaml', action: 'down', status: 'succeeded',
    result: { id: 'job-down', filename: 'app.yaml', action: 'down', success: true,
      output: 'stopped', steps: [{ stage: 'down', status: 'success', message: 'stopped' }] },
  }], 'job-down')
  assert.doesNotMatch(down, /服务状态/)
  assert.doesNotMatch(down, /服务端未提供服务状态/)

  const failedUp = await renderWithJobs([{
    id: 'job-fail', filename: 'app.yaml', action: 'up', status: 'failed',
    result: { id: 'job-fail', filename: 'app.yaml', action: 'up', success: false,
      output: 'boom', steps: [{ stage: 'up', status: 'failed', message: 'boom' }] },
  }], 'job-fail')
  assert.doesNotMatch(failedUp, /服务状态/)
  assert.doesNotMatch(failedUp, /服务端未提供服务状态/)
  assert.doesNotMatch(failedUp, /配置指纹/)
})
