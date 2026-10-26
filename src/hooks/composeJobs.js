// Shared by the Compose hook and offline tests. No browser storage or credentials.
export const ACTIVE_STATUSES = new Set(['queued', 'running'])
export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'interrupted'])
export const STATUS_LABELS = {
  queued: '排队中', running: '执行中', succeeded: '成功', failed: '失败', interrupted: '已中断',
}

// 第四阶段：up/deploy/restart 成功后，服务端才会回填 result.services；down/pull 不产出。
export const SERVICE_STATUS_ACTIONS = new Set(['up', 'deploy', 'restart'])

/**
 * 纯函数：任务详情里「服务状态」区块的展示方式。
 * - 仅成功（succeeded）任务展示：result.services 存在（数组）→ 按 services 渲染徽标；
 * - 旧服务端（无 services 字段）仅在 up/deploy/restart 成功时给出边界提示，不伪造健康结论；
 * - 其余情况（down/pull、无结果、失败/中断——即使异常残留 services 字段）不渲染该区块。
 */
export function serviceStatusView(action, status, result) {
  if (!result) return null
  // 与服务端口径一致：仅成功任务展示服务状态；
  // interrupted/failed 即使残留 services 字段也不渲染（结果不确定 ≠ 已确认状态）。
  if (status !== 'succeeded') return null
  if (Array.isArray(result.services)) return { kind: 'services', services: result.services }
  if (SERVICE_STATUS_ACTIONS.has(action)) return { kind: 'legacy' }
  return null
}

/** 纯函数：服务徽标色调；health 缺失或未知时仅按 state 灰色展示。 */
export function serviceBadgeTone(service) {
  const health = typeof service?.health === 'string' ? service.health.toLowerCase() : ''
  if (health === 'healthy') return 'healthy'
  if (health === 'unhealthy') return 'unhealthy'
  if (health === 'starting') return 'starting'
  return 'plain'
}

export function normalizeJob(job) {
  if (!job?.id) return null
  const candidateResult = job.result || (typeof job.success === 'boolean' ? job : undefined)
  const status = job.status || (candidateResult ? (candidateResult.success ? 'succeeded' : 'failed') : 'running')
  const result = TERMINAL_STATUSES.has(status) ? candidateResult : undefined
  if (!ACTIVE_STATUSES.has(status) && !TERMINAL_STATUSES.has(status)) return null
  const { result: ignoredResult, ...metadata } = job
  return { ...metadata, status, ...(result ? { result } : {}) }
}

export function normalizeHistory(data) {
  const entries = Array.isArray(data?.jobs) ? data.jobs : data?.results || []
  return entries.map(normalizeJob).filter(Boolean)
}

export function initialComposeJobsState() {
  return { jobs: {}, selectedId: null, submissions: {}, operations: {}, historyLoading: false,
    historyError: '', restored: false }
}

function mergeJob(previous, incoming) {
  if (!previous) return incoming
  // Delayed history/query snapshots must not undo a completion or running state.
  const stale = (TERMINAL_STATUSES.has(previous.status) && !TERMINAL_STATUSES.has(incoming.status)) ||
    (previous.status === 'running' && incoming.status === 'queued') ||
    (previous.updatedAt && incoming.updatedAt && Date.parse(incoming.updatedAt) < Date.parse(previous.updatedAt))
  const merged = stale ? { ...incoming, ...previous } : { ...previous, ...incoming }
  if (previous.result || incoming.result) {
    merged.result = stale
      ? { ...incoming.result, ...previous.result }
      : { ...previous.result, ...incoming.result }
  }
  return merged
}

export function composeJobsReducer(state, event) {
  switch (event.type) {
    case 'resume': return { ...state, restored: false, operations: {} }
    case 'historyLoading': return { ...state, historyLoading: true, historyError: '' }
    case 'historyError': return { ...state, historyLoading: false, historyError: event.message }
    case 'merge': {
      const jobs = { ...state.jobs }
      for (const job of event.jobs) {
        const previous = jobs[job.id]
        const incoming = event.history && previous?.detailsLoaded ? { ...job, result: previous.result } : job
        jobs[job.id] = mergeJob(previous, incoming)
      }
      return { ...state, jobs, ...(event.history ? { historyLoading: false, historyError: '', restored: true } : {}),
        selectedId: event.history && !state.restored && !state.selectedId
          ? event.jobs.find((job) => ACTIVE_STATUSES.has(job.status))?.id || null : state.selectedId }
    }
    case 'queryError': {
      const job = state.jobs[event.id]
      if (!job) return state
      return { ...state, jobs: { ...state.jobs, [event.id]: { ...job, queryError: event.message,
        ...(event.notFound ? { notFound: true } : {}) } } }
    }
    case 'release': return { ...state, jobs: { ...state.jobs, [event.id]: { ...state.jobs[event.id], guardReleased: true } } }
    case 'select': return { ...state, selectedId: event.id }
    case 'submission': return { ...state, submissions: { ...state.submissions, [event.filename]: event.value } }
    case 'operation': return { ...state, operations: { ...state.operations, [event.filename]: event.busy } }
    default: return state
  }
}

function responseData(response) {
  if (response?.data?.code !== 200) throw new Error(response?.data?.msg || '请求未成功')
  return response.data.data || {}
}

function errorMessage(error) {
  return error.response?.data?.msg || error.message || '请求未成功'
}

export function createComposeJobsController(api, { setTimer = setTimeout, clearTimer = clearTimeout,
  now = Date.now, pollInterval = 3000 } = {}) {
  let state = initialComposeJobsState()
  let active = false
  let visible = true
  let epoch = 0
  let queryGeneration = 0
  let timer = null
  let detach = () => {}
  const listeners = new Set()
  const queries = new Set()
  const posts = new Set()
  const dispatch = (event) => {
    state = composeJobsReducer(state, event)
    listeners.forEach((listener) => listener())
  }
  const current = (version) => active && version === epoch
  const pendingJobs = () => Object.values(state.jobs).filter((job) => !job.notFound &&
    (ACTIVE_STATUSES.has(job.status) || (!job.result && TERMINAL_STATUSES.has(job.status))))
  const hasUnknown = () => Object.values(state.submissions).some((item) => item?.phase === 'unknown')
  const cancelQueries = () => {
    queryGeneration += 1
    queries.forEach((request) => request.abort())
    queries.clear()
    clearTimer(timer)
    timer = null
  }
  const blocked = (filename) => !active || !state.restored || Boolean(state.historyError) ||
    Boolean(state.operations[filename]) || Boolean(state.submissions[filename]) ||
    Object.values(state.jobs).some((job) => job.filename === filename && !job.guardReleased && ACTIVE_STATUSES.has(job.status))
  const schedule = () => {
    clearTimer(timer)
    timer = null
    if (active && visible && (pendingJobs().length || hasUnknown())) {
      timer = setTimer(() => { timer = null; void reconcile() }, pollInterval)
    }
  }

  async function reconcile() {
    if (!active || !visible) return
    cancelQueries()
    const generation = queryGeneration
    const version = epoch
    const request = new AbortController()
    queries.add(request)
    const valid = () => current(version) && visible && generation === queryGeneration && !request.signal.aborted
    dispatch({ type: 'historyLoading' })
    try {
      const data = responseData(await api.history({ signal: request.signal }))
      if (!valid()) return
      const jobs = normalizeHistory(data)
      dispatch({ type: 'merge', jobs, history: true })
      // Without a returned jobID there is no safe way to claim a history candidate.
      // Keep unknown submissions guarded; filename/action/time are not identity.
    } catch (error) {
      if (valid()) dispatch({ type: 'historyError', message: `连接暂不可用，历史对账失败：${errorMessage(error)}` })
    }
    if (!valid()) return
    // Even when history is temporarily unavailable, known IDs can still be queried.
    const candidates = new Map(pendingJobs().map((job) => [job.id, job]))
    const selected = state.jobs[state.selectedId]
    if (selected) candidates.set(selected.id, selected)
    await Promise.all([...candidates.values()].map(async (job) => {
      try {
        const data = responseData(await api.getJob(job.id, { signal: request.signal }))
        if (!valid()) return
        if (data.status === 'not_found' || data.job?.status === 'not_found') {
          dispatch({ type: 'queryError', id: job.id, notFound: true,
            message: '任务暂未找到（not_found），结果待确认；不代表执行失败，请人工核验' })
          return
        }
        const incoming = normalizeJob(data.job || (data.done && data.result
          ? { id: job.id, filename: data.result.filename, action: data.result.action,
            status: data.status || (data.result.success ? 'succeeded' : 'failed'), result: data.result }
          : { id: job.id, status: data.status || job.status }))
        if (!incoming) throw new Error('无法确认任务状态，结果待确认')
        dispatch({ type: 'merge', jobs: [{ ...incoming, queryError: '', notFound: false, guardReleased: false,
          detailsLoaded: Boolean(incoming.result) }] })
      } catch (error) {
        if (valid()) dispatch({ type: 'queryError', id: job.id,
          message: `连接暂不可用 / 结果待确认：${errorMessage(error)}` })
      }
    }))
    queries.delete(request)
    if (valid()) schedule()
  }

  async function submit(filename, action) {
    if (!filename || blocked(filename)) return { accepted: false, reason: '任务处理中或尚未完成历史对账，请先确认执行状态' }
    const version = epoch
    const submission = { phase: 'submitting', action, sentAt: now(), before: Object.keys(state.jobs) }
    // Synchronous reservation protects rapid clicks and callers outside the UI.
    dispatch({ type: 'submission', filename, value: submission })
    const request = new AbortController()
    posts.add(request)
    try {
      const data = responseData(await api.deploy(filename, action, { signal: request.signal }))
      if (!current(version)) return { accepted: false }
      const id = data.jobID || data.job?.id
      if (!id) throw new Error('提交响应未包含任务 ID')
      const job = normalizeJob({ ...data.job, id, filename, action, status: data.job?.status || 'queued' })
      if (!job) throw new Error('提交响应无法确认任务状态')
      dispatch({ type: 'merge', jobs: [job] })
      dispatch({ type: 'select', id })
      dispatch({ type: 'submission', filename, value: null })
      void reconcile()
      return { accepted: true, id }
    } catch (error) {
      if (!current(version)) return { accepted: false }
      dispatch({ type: 'submission', filename, value: { ...submission, phase: 'unknown',
        message: `提交结果未知，请先通过历史对账确认，勿重复提交：${errorMessage(error)}` } })
      void reconcile()
      return { accepted: false, unknown: true }
    } finally {
      posts.delete(request)
    }
  }

  async function withFileOperation(filename, operation) {
    if (!filename || blocked(filename)) return { accepted: false }
    const version = epoch
    dispatch({ type: 'operation', filename, busy: true })
    try { await operation(); return { accepted: true } }
    finally { if (current(version)) dispatch({ type: 'operation', filename, busy: false }) }
  }

  function start({ document: doc, window: win } = {}) {
    active = true
    epoch += 1
    dispatch({ type: 'resume' })
    visible = !doc || doc.visibilityState !== 'hidden'
    const onVisibility = () => {
      visible = !doc || doc.visibilityState !== 'hidden'
      if (visible) void reconcile()
      else cancelQueries()
    }
    const onForeground = () => { if (visible) void reconcile() }
    doc?.addEventListener('visibilitychange', onVisibility)
    win?.addEventListener('pageshow', onForeground)
    win?.addEventListener('focus', onForeground)
    detach = () => {
      doc?.removeEventListener('visibilitychange', onVisibility)
      win?.removeEventListener('pageshow', onForeground)
      win?.removeEventListener('focus', onForeground)
    }
    void reconcile()
  }

  function stop() {
    active = false
    epoch += 1
    cancelQueries()
    posts.forEach((request) => request.abort())
    posts.clear()
    for (const [filename, submission] of Object.entries(state.submissions)) {
      if (submission?.phase === 'submitting') dispatch({ type: 'submission', filename,
        value: { ...submission, phase: 'unknown', message: '提交结果未知：页面已离开，请先历史对账并人工核验，勿重复提交' } })
    }
    detach()
  }

  return { getSnapshot: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    start, stop, reconcile, submit, blocked, withFileOperation,
    releaseUnknown: (filename, confirmed) => {
      if (!confirmed || !state.restored || state.historyError || state.submissions[filename]?.phase !== 'unknown') return false
      dispatch({ type: 'submission', filename, value: null })
      return true
    },
    releaseNotFound: (id, confirmed) => {
      if (!confirmed || !state.restored || state.historyError || !state.jobs[id]?.notFound) return false
      dispatch({ type: 'release', id })
      return true
    },
    select: (id) => { dispatch({ type: 'select', id }); if (id) void reconcile() } }
}
