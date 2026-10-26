import test from 'node:test'
import assert from 'node:assert/strict'
import { composeJobsReducer, initialComposeJobsState, normalizeHistory, normalizeJob,
  createComposeJobsController, serviceBadgeTone, serviceStatusView, STATUS_LABELS } from '../src/hooks/composeJobs.js'

const ok = (data) => ({ data: { code: 200, data } })
const job = (overrides = {}) => ({ id: 'job-1', filename: 'app.yaml', action: 'deploy', status: 'running',
  createdAt: '2026-10-25T12:00:00Z', ...overrides })
const result = (overrides = {}) => ({ id: 'job-1', filename: 'app.yaml', action: 'deploy', success: true,
  output: 'complete output', finishedAt: '2026-10-25T12:01:00Z', steps: [{ stage: 'up', status: 'success', message: 'started' }], ...overrides })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function harness(overrides = {}) {
  const calls = []
  const timers = new Map()
  let timerId = 0
  const api = {
    history: async (...args) => { calls.push(['GET history', ...args]); return ok({ jobs: [] }) },
    getJob: async (...args) => { calls.push(['GET job', ...args]); return ok({ done: false, status: 'running', job: job() }) },
    deploy: async (...args) => { calls.push(['POST deploy', ...args]); return ok({ jobID: 'job-1' }) },
    ...overrides,
  }
  const controller = createComposeJobsController(api, {
    setTimer: (fn) => { timers.set(++timerId, fn); return timerId }, clearTimer: (id) => timers.delete(id),
    now: () => Date.parse('2026-10-25T12:00:00Z'),
  })
  return { controller, calls, timers, api }
}

test('normalizes new/old history, new jobs authoritative even when empty', () => {
  assert.equal(normalizeHistory({ results: [result()] })[0].status, 'succeeded')
  assert.equal(normalizeHistory({ results: [result({ success: false })] })[0].status, 'failed')
  assert.deepEqual(normalizeHistory({ jobs: [], results: [result()] }), [])
  assert.equal(normalizeHistory({ jobs: [job()] })[0].status, 'running')
  assert.equal(normalizeJob(job({ result: result({ success: false, id: '' }) })).result, undefined)
  assert.equal(normalizeJob(job({ status: 'not_found' })), null)
})

test('merge is ID-based and monotonic, retains steps/output, compares actual RFC3339 times', () => {
  let state = initialComposeJobsState()
  const merge = (jobs) => { state = composeJobsReducer(state, { type: 'merge', jobs: jobs.map(normalizeJob) }) }
  merge([job({ status: 'succeeded', result: result(), updatedAt: '2026-10-25T13:00:00+01:00' })])
  merge([job({ status: 'running', updatedAt: '2026-10-25T12:02:00Z' })])
  assert.equal(state.jobs['job-1'].status, 'succeeded')
  assert.deepEqual(state.jobs['job-1'].result.steps, result().steps)
  merge([job({ status: 'failed', result: result({ success: false }), updatedAt: '2026-10-25T11:59:59.999Z' })])
  assert.equal(state.jobs['job-1'].status, 'succeeded')
  merge([job({ id: 'job-2', status: 'queued' })])
  assert.equal(Object.keys(state.jobs).length, 2)
})

test('cold start and failed history prohibit submit inside production controller', async () => {
  const first = deferred()
  const h = harness({ history: () => first.promise })
  h.controller.start()
  assert.equal((await h.controller.submit('app.yaml', 'up')).accepted, false)
  first.reject(new Error('offline'))
  await settle()
  assert.match(h.controller.getSnapshot().historyError, /连接暂不可用/)
  assert.equal((await h.controller.submit('app.yaml', 'up')).accepted, false)
  assert.equal(h.calls.length, 0)
  h.controller.stop()
})

test('restore/new history is GET only; all active tracked and query exceptions never fail jobs', async () => {
  const h = harness({ history: async () => ok({ jobs: [job(), job({ id: 'job-2', status: 'queued' })] }),
    getJob: async (id) => { h.calls.push(['GET job', id]); throw new Error('timeout') } })
  h.controller.start()
  await settle()
  const state = h.controller.getSnapshot()
  assert.equal(state.jobs['job-1'].status, 'running')
  assert.equal(state.jobs['job-2'].status, 'queued')
  assert.match(state.jobs['job-1'].queryError, /结果待确认/)
  assert.equal(h.controller.blocked('app.yaml'), true)
  assert.equal(h.calls.filter(([method]) => method === 'POST deploy').length, 0)
  assert.equal(h.timers.size, 1)
  h.controller.stop()
  assert.equal(h.timers.size, 0)
})

test('legacy deploy jobID and done/result finish using complete output and steps', async () => {
  const h = harness({ getJob: async () => ok({ done: true, result: result() }) })
  h.controller.start()
  await settle()
  assert.equal((await h.controller.submit('app.yaml', 'deploy')).accepted, true)
  await settle()
  assert.equal(h.controller.getSnapshot().jobs['job-1'].status, 'succeeded')
  assert.deepEqual(h.controller.getSnapshot().jobs['job-1'].result, result())
  assert.equal(h.timers.size, 0)
  h.controller.stop()
})

test('new deploy/job schema and interrupted remain distinct from failed', async () => {
  const interrupted = job({ status: 'interrupted', result: result({ success: false, output: 'server restarted' }) })
  const h = harness({ deploy: async () => ok({ jobID: 'job-1', job: job({ status: 'queued' }) }),
    getJob: async () => ok({ done: true, status: 'interrupted', job: interrupted, result: interrupted.result }) })
  h.controller.start(); await settle()
  await h.controller.submit('app.yaml', 'deploy'); await settle()
  assert.equal(h.controller.getSnapshot().jobs['job-1'].status, 'interrupted')
  assert.equal(STATUS_LABELS.interrupted, '已中断')
  h.controller.stop()
})

test('duplicate submit and same-file mutation guarded synchronously, other files independent', async () => {
  const post = deferred()
  const h = harness({ deploy: (...args) => { h.calls.push(['POST deploy', ...args]); return post.promise } })
  h.controller.start(); await settle()
  const pending = h.controller.submit('app.yaml', 'up')
  assert.equal((await h.controller.submit('app.yaml', 'down')).accepted, false)
  let mutated = false
  assert.equal((await h.controller.withFileOperation('app.yaml', async () => { mutated = true })).accepted, false)
  assert.equal(mutated, false)
  assert.equal(h.controller.blocked('other.yaml'), false)
  assert.equal(h.calls.filter(([method]) => method === 'POST deploy').length, 1)
  post.resolve(ok({ jobID: 'job-1' })); await pending; await settle()
  h.controller.stop()
})

test('mutation reservation also prevents deploy while saving; releases on exception', async () => {
  const h = harness()
  h.controller.start(); await settle()
  const save = deferred()
  const pending = h.controller.withFileOperation('app.yaml', () => save.promise)
  assert.equal((await h.controller.submit('app.yaml', 'up')).accepted, false)
  save.reject(new Error('save failed'))
  await assert.rejects(pending, /save failed/)
  assert.equal(h.controller.blocked('app.yaml'), false)
  h.controller.stop()
})

test('lost submit response reconciles GET only, never claims matching filename candidate; manual release explicit', async () => {
  let candidate = false
  const h = harness({ history: async () => ok({ jobs: candidate ? [job({ status: 'succeeded', result: result() })] : [] }),
    deploy: async () => { h.calls.push(['POST deploy']); candidate = true; throw new Error('response lost') } })
  h.controller.start(); await settle()
  assert.equal((await h.controller.submit('app.yaml', 'deploy')).unknown, true)
  await settle()
  assert.equal(h.controller.getSnapshot().submissions['app.yaml'].phase, 'unknown')
  assert.equal((await h.controller.submit('app.yaml', 'deploy')).accepted, false)
  await h.controller.reconcile()
  assert.equal(h.calls.filter(([method]) => method === 'POST deploy').length, 1)
  assert.equal(h.controller.releaseUnknown('app.yaml', false), false)
  assert.equal(h.controller.releaseUnknown('app.yaml', true), true)
  h.controller.stop()
})

test('not_found is not failed, stops automatic polling but keeps guard until manual verification', async () => {
  const h = harness({ history: async () => ok({ jobs: [job()] }),
    getJob: async () => ok({ done: false, status: 'not_found', result: result({ id: '', success: false }) }) })
  h.controller.start(); await settle()
  assert.equal(h.controller.getSnapshot().jobs['job-1'].notFound, true)
  assert.equal(h.controller.getSnapshot().jobs['job-1'].status, 'running')
  assert.equal(h.controller.getSnapshot().jobs['job-1'].result, undefined)
  assert.equal(h.timers.size, 0)
  assert.equal(h.controller.blocked('app.yaml'), true)
  assert.equal(h.controller.releaseNotFound('job-1', false), false)
  assert.equal(h.controller.releaseNotFound('job-1', true), true)
  assert.equal(h.controller.blocked('app.yaml'), false)
  h.controller.stop()
})

test('select completed legacy summary GETs full details, later history cannot truncate them', async () => {
  const full = result({ output: 'full output\n'.repeat(1000) })
  const h = harness({ history: async () => ok({ results: [result({ output: 'summary' })] }),
    getJob: async () => { h.calls.push(['GET job']); return ok({ done: true, result: full }) } })
  h.controller.start(); await settle()
  assert.equal(h.calls.length, 0)
  h.controller.select('job-1'); await settle()
  assert.deepEqual(h.controller.getSnapshot().jobs['job-1'].result, full)
  h.api.getJob = async () => { throw new Error('offline detail') }
  await h.controller.reconcile()
  assert.equal(h.controller.getSnapshot().jobs['job-1'].result.output, full.output)
  assert.match(h.controller.getSnapshot().jobs['job-1'].queryError, /offline detail/)
  h.controller.stop()
})

test('unmount cancels requests/timers; restart ignores old GET response and requires fresh history', async () => {
  const old = deferred(), fresh = deferred()
  let count = 0, oldSignal
  const h = harness({ history: ({ signal }) => { count += 1; if (count === 1) { oldSignal = signal; return old.promise } return fresh.promise } })
  h.controller.start(); h.controller.stop()
  assert.equal(oldSignal.aborted, true)
  h.controller.start()
  assert.equal((await h.controller.submit('app.yaml', 'up')).accepted, false)
  fresh.resolve(ok({ jobs: [job({ id: 'fresh', status: 'succeeded', result: result({ id: 'fresh' }) })] })); await settle()
  old.resolve(ok({ jobs: [job({ id: 'old' })] })); await settle()
  assert.deepEqual(Object.keys(h.controller.getSnapshot().jobs), ['fresh'])
  h.controller.stop()
})

test('tab reentry preserves unknown POST guard; old POST response cannot mutate restarted controller', async () => {
  const post = deferred()
  let signal
  const h = harness({ deploy: (_file, _action, options) => { signal = options.signal; return post.promise } })
  h.controller.start(); await settle()
  const pending = h.controller.submit('app.yaml', 'deploy')
  h.controller.stop()
  assert.equal(signal.aborted, true)
  h.controller.start(); await settle()
  assert.equal(h.controller.getSnapshot().submissions['app.yaml'].phase, 'unknown')
  assert.equal((await h.controller.submit('app.yaml', 'deploy')).accepted, false)
  post.resolve(ok({ jobID: 'stale-post' })); await pending; await settle()
  assert.equal(h.controller.getSnapshot().jobs['stale-post'], undefined)
  assert.equal(h.controller.getSnapshot().submissions['app.yaml'].phase, 'unknown')
  h.controller.stop()
})

test('return to foreground reconciles GET, hidden old responses discarded; listeners detached on stop', async () => {
  const doc = new EventTarget(), win = new EventTarget()
  doc.visibilityState = 'visible'
  let reads = 0
  const h = harness({ history: async () => { reads++; return ok({ jobs: [job()] }) } })
  h.controller.start({ document: doc, window: win }); await settle()
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.timers.size, 0)
  const before = reads
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await settle()
  assert.equal(reads, before + 1)
  assert.equal(h.calls.filter(([method]) => method === 'POST deploy').length, 0)
  h.controller.stop()
  win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange')); await settle()
  assert.equal(reads, before + 1)
})

test('phase-4 optional configSha256/services round-trip through normalize, merge and history', () => {
  const fingerprint = 'a1b2c3d4e5f6' + '0'.repeat(52)
  const services = [{ name: 'web', state: 'running', health: 'healthy' }, { name: 'db', state: 'exited' }]
  const normalized = normalizeJob(job({ status: 'succeeded', configSha256: fingerprint,
    result: result({ configSha256: fingerprint, services }) }))
  assert.equal(normalized.configSha256, fingerprint)
  assert.deepEqual(normalized.result.services, services)

  let state = initialComposeJobsState()
  state = composeJobsReducer(state, { type: 'merge', jobs: [normalized] })
  // 后续快照缺新字段时不回退：已保存的指纹与服务状态保留
  state = composeJobsReducer(state, { type: 'merge',
    jobs: [normalizeJob(job({ status: 'succeeded', result: result({ output: 'again' }) }))] })
  assert.equal(state.jobs['job-1'].configSha256, fingerprint)
  assert.deepEqual(state.jobs['job-1'].result.services, services)

  // 旧 payload：无新字段时 normalize 不报错也不伪造
  assert.equal(normalizeJob(job()).configSha256, undefined)
  assert.equal(normalizeJob(job()).result, undefined)
  assert.deepEqual(normalizeHistory({ results: [result({ services })] })[0].result.services, services)
  assert.equal(normalizeHistory({ results: [result()] })[0].services, undefined)
})

test('service status view: services array wins, legacy boundary only for successful up/deploy/restart', () => {
  const withServices = result({ services: [{ name: 'web', state: 'running', health: 'healthy' }] })
  assert.deepEqual(serviceStatusView('up', 'succeeded', withServices),
    { kind: 'services', services: withServices.services })
  assert.deepEqual(serviceStatusView('deploy', 'succeeded', result()), { kind: 'legacy' })
  assert.deepEqual(serviceStatusView('restart', 'succeeded', result()), { kind: 'legacy' })
  assert.deepEqual(serviceStatusView('up', 'succeeded', result({ services: [] })), { kind: 'services', services: [] })
  assert.equal(serviceStatusView('down', 'succeeded', result()), null)
  assert.equal(serviceStatusView('pull', 'succeeded', result()), null)
  assert.equal(serviceStatusView('up', 'failed', result()), null)
  assert.equal(serviceStatusView('up', 'interrupted', result()), null)
  assert.equal(serviceStatusView('up', 'succeeded', undefined), null)
  // 异常残留 services 字段的中断/失败任务也不渲染（结果不确定 ≠ 已确认状态）
  assert.equal(serviceStatusView('up', 'interrupted', withServices), null)
  assert.equal(serviceStatusView('up', 'failed', withServices), null)

  assert.equal(serviceBadgeTone({ name: 'web', state: 'running', health: 'healthy' }), 'healthy')
  assert.equal(serviceBadgeTone({ health: 'UNHEALTHY' }), 'unhealthy')
  assert.equal(serviceBadgeTone({ health: 'starting' }), 'starting')
  assert.equal(serviceBadgeTone({ name: 'db', state: 'exited' }), 'plain')
  assert.equal(serviceBadgeTone({ health: 'weird' }), 'plain')
  assert.equal(serviceBadgeTone(undefined), 'plain')
})
