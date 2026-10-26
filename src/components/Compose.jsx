import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  FileCode,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  Rocket,
  Square,
  RotateCcw,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  History,
  X,
  Wand2,
  Sun,
  Moon,
  Type,
} from 'lucide-react'
import { composeAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { ComposeEditor } from './ComposeEditor.jsx'
import { formatCompose } from '../utils/formatCompose.js'
import { useComposeJobs } from '../hooks/useComposeJobs.js'
import { ACTIVE_STATUSES, STATUS_LABELS, serviceBadgeTone, serviceStatusView } from '../hooks/composeJobs.js'
import { fileModifiedAfterDeploy, sha256Hex, shortFingerprint } from '../utils/fingerprint.js'

const ACTIONS = [
  { key: 'deploy', label: '更新并启动', icon: Rocket, color: 'text-green-600 dark:text-green-400' },
  { key: 'restart', label: '重启', icon: RotateCcw, color: 'text-amber-600 dark:text-amber-400' },
  { key: 'pull', label: '仅拉取', icon: Download, color: 'text-primary-600 dark:text-primary-400' },
  { key: 'down', label: '停止', icon: Square, color: 'text-red-600 dark:text-red-400' },
]

const VERSION_LABELS = {
  create: '创建',
  save: '保存',
  delete: '删除',
  restore: '从回收站恢复',
  rollback: '回滚',
}

const ACTION_LABELS = {
  deploy: '更新并启动',
  up: '启动',
  restart: '重启',
  pull: '拉取',
  down: '停止',
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action
}

const STEP_LABELS = {
  pull: '拉取',
  up: '启动',
  down: '停止',
  restart: '重启',
  result: '结论',
  ps: '容器状态',
  fingerprint: '配置指纹',
}

function versionLabel(action) {
  return VERSION_LABELS[action] || action
}

// 服务徽标色调：healthy 绿 / unhealthy 红 / starting 琥珀；无 health 仅展示 state（灰）。
// 半透明底 + 同色发丝圈，与 .badge-* 基础类同风格。
const SERVICE_TONE_CLASSES = {
  healthy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-400/20',
  unhealthy: 'bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20 dark:ring-red-400/20',
  starting: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-400/20',
  plain: 'bg-gray-500/10 text-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-600/20 dark:ring-gray-400/20',
}

// 确认弹窗里的指纹只展示前 16 位，完整值放 title 提示。
const DEPLOY_FINGERPRINT_DISPLAY_LENGTH = 16

const TEMPLATE = `services:
  app:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`

export function Compose({ jobsController }) {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const tasks = useComposeJobs(jobsController)
  const { controller } = tasks
  const history = Object.values(tasks.jobs).sort((a, b) =>
    (Date.parse(b.createdAt || b.result?.finishedAt) || 0) - (Date.parse(a.createdAt || a.result?.finishedAt) || 0) ||
    a.id.localeCompare(b.id))
  const task = tasks.jobs[tasks.selectedId]
  const job = task?.result
  // 指纹口径：任务结果里的指纹优先，回退到任务元数据（提交响应的 job.configSha256）。
  const jobFingerprint = job?.configSha256 || task?.configSha256 || ''
  const modifiedAfterDeploy = Boolean(task && selected === task.filename &&
    fileModifiedAfterDeploy(jobFingerprint, contentHash))
  const servicesView = task ? serviceStatusView(task.action, task.status, job) : null
  const selectedBusy = selected && controller.blocked(selected)
  const runningAction = history.find((item) => item.filename === selected && ACTIVE_STATUSES.has(item.status))?.action ||
    tasks.submissions[selected]?.action || ''
  const noticeTimer = useRef(null)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showDeployDialog, setShowDeployDialog] = useState(false)
  // 已保存内容的 SHA-256（打开/保存时缓存，避免每次渲染重算）；null 表示无法计算。
  const [contentHash, setContentHash] = useState(null)
  // 部署确认弹窗展示的指纹（对已保存内容计算）；null 表示 WebCrypto 不可用，隐藏该行。
  const [deployFingerprint, setDeployFingerprint] = useState(null)
  const [newName, setNewName] = useState('')
  // 编辑器主题：跟随系统偏好初始化，用户切换后持久化
  const [editorTheme, setEditorTheme] = useState(() => {
    const saved = localStorage.getItem('composeEditorTheme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState([])

  const dirty = selected && content !== original

  const flash = (message) => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 2000)
  }

  const loadFiles = useCallback(async () => {
    setLoadingList(true)
    setError('')
    try {
      const response = await composeAPI.listFiles()
      if (response.data.code !== 200) throw new Error(response.data.msg)
      setFiles(response.data.data?.files || [])
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '读取文件列表失败')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
    return () => clearTimeout(noticeTimer.current)
  }, [loadFiles])

  const guardFile = (name) => {
    if (!controller.blocked(name)) return false
    setError('此文件任务处理中、提交结果未知或尚未完成历史对账，请先恢复跟踪确认状态')
    return true
  }

  const mutateFile = async (name, operation) => {
    let response
    const reservation = await controller.withFileOperation(name, async () => { response = await operation() })
    if (!reservation.accepted) throw new Error('此文件处理中或结果待确认，请先历史对账')
    return response
  }

  const openFile = async (name) => {
    setLoadingFile(true)
    setError('')
    try {
      const response = await composeAPI.readFile(name)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      const text = response.data.data?.content || ''
      const hash = await sha256Hex(text)
      setSelected(name)
      setContent(text)
      setOriginal(text)
      setContentHash(hash)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '读取文件失败')
    } finally {
      setLoadingFile(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      const response = await mutateFile(selected, () => composeAPI.saveFile(selected, content))
      if (response.data.code !== 200) throw new Error(response.data.msg)
      const hash = await sha256Hex(content)
      setOriginal(content)
      setContentHash(hash)
      flash('已保存')
      loadFiles()
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleValidate = async () => {
    if (!selected) return
    setError('')
    try {
      const response = await composeAPI.validate(selected, content)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      flash('校验通过')
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '校验失败')
    }
  }

  /** 一键格式化：解析后重新序列化，失败时保留原内容 */
  const handleFormat = () => {
    if (!selected) return
    const result = formatCompose(content)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError('')
    setContent(result.content)
    flash('已格式化')
  }

  const toggleTheme = () => {
    setEditorTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('composeEditorTheme', next)
      return next
    })
  }

  const loadVersions = async () => {
    if (!selected) return
    try {
      const response = await composeAPI.getVersions(selected)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      setVersions(response.data.data?.versions || [])
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '读取版本历史失败')
    }
  }

  const handleRollback = async (version) => {
    if (!version.backupName || !selected || guardFile(selected)) return
    if (!window.confirm('当前内容会先被备份，然后恢复到选定版本。是否继续？')) return
    try {
      const response = await mutateFile(selected, () => composeAPI.rollback(selected, version.backupName))
      if (response.data.code !== 200) throw new Error(response.data.msg)
      flash('已回滚')
      await openFile(selected)
      await loadVersions()
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '回滚失败')
    }
  }

  const handleDelete = async (name) => {
    if (guardFile(name)) return
    if (!window.confirm(`确定删除 ${name}？`)) return
    try {
      const response = await mutateFile(name, () => composeAPI.deleteFile(name))
      if (response.data.code !== 200) throw new Error(response.data.msg)
      if (selected === name) {
        setSelected(null)
        setContent('')
        setOriginal('')
        setContentHash(null)
      }
      flash('已删除')
      loadFiles()
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '删除失败')
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    if (!/^[A-Za-z0-9._-]+\.(ya?ml)$/i.test(name)) {
      setError('文件名只能是 .yml 或 .yaml，且不含路径')
      return
    }
    setError('')
    try {
      const response = await mutateFile(name, () => composeAPI.saveFile(name, TEMPLATE))
      if (response.data.code !== 200) throw new Error(response.data.msg)
      setShowNewDialog(false)
      setNewName('')
      await loadFiles()
      await openFile(name)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '创建失败')
    }
  }

  const runAction = async (action) => {
    if (!selected || guardFile(selected)) return
    setError('')
    const outcome = await controller.submit(selected, action)
    if (outcome.reason) setError(outcome.reason)
  }

  const handleAction = async (action) => {
    if (!selected || guardFile(selected)) return
    if (dirty && !window.confirm('有未保存的修改，将以已保存的内容执行。是否继续？')) {
      return
    }
    // 部署前先问清楚要不要拉取最新镜像，避免「以为更新了其实用的是旧镜像」
    if (action === 'deploy') {
      openDeployDialog()
      return
    }
    await runAction(action)
  }

  // 确认弹窗内展示待提交（已保存）内容的 SHA-256；WebCrypto 不可用时保持 null，整行隐藏。
  const openDeployDialog = () => {
    setShowDeployDialog(true)
    setDeployFingerprint(null)
    void sha256Hex(original).then((hex) => setDeployFingerprint(hex))
  }

  const confirmDeploy = async (pullLatest) => {
    setShowDeployDialog(false)
    await runAction(pullLatest ? 'deploy' : 'up')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Compose</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            编辑 compose 文件并一键部署，内置执行器通过 docker.sock 直接执行
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!showHistory) void controller.reconcile()
              setShowHistory((prev) => !prev)
            }}
            aria-expanded={showHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <History className="w-4 h-4" />
            执行历史
          </button>
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(tasks.historyLoading || tasks.historyError || !tasks.restored || Object.values(tasks.submissions).some(Boolean)) && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {tasks.historyLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
          <span className="flex-1 min-w-0">
            {Object.values(tasks.submissions).find((item) => item?.phase === 'unknown')?.message ||
              tasks.historyError || (tasks.historyLoading ? '正在读取执行历史并恢复任务状态…' : '尚未完成历史对账')}
          </span>
          <button onClick={() => controller.reconcile()} className="underline shrink-0">恢复跟踪 / 历史对账</button>
        </div>
      )}

      {Object.entries(tasks.submissions).filter(([, item]) => item?.phase === 'unknown').map(([filename]) => (
        <div key={filename} className="flex flex-wrap gap-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="break-all">{filename}：提交结果未知，不会自动重发。</span>
          <button className="underline" onClick={() => controller.releaseUnknown(filename,
            window.confirm('请先查看执行历史并核验服务实际状态。确认原提交已结束或未执行后才可解除保护；此操作不会重发任务。是否已核验？'))}>已人工核验，解除提交保护</button>
        </div>
      ))}

      {history.some((item) => ACTIVE_STATUSES.has(item.status)) && (
        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
          {history.filter((item) => ACTIVE_STATUSES.has(item.status)).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              {!item.notFound && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="break-all">{item.filename} · {actionLabel(item.action)} · {item.notFound ? '任务未找到 / 结果待确认' : STATUS_LABELS[item.status]}</span>
              {item.queryError && <span className="text-amber-600 dark:text-amber-400">{item.queryError}</span>}
              <button onClick={() => controller.select(item.id)} aria-label={`查看任务详情 ${item.id}`} className="underline">查看详情</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 文件列表 */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">文件</span>
            <button onClick={loadFiles} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <RefreshCw className={cn('w-3.5 h-3.5', loadingList && 'animate-spin')} />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {files.length === 0 && !loadingList && (
              <p className="px-3 py-6 text-center text-xs text-gray-500">暂无 compose 文件</p>
            )}
            {files.map((file) => (
              <div
                key={file.name}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2',
                  selected === file.name
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                )}
                onClick={() => openFile(file.name)}
              >
                <FileCode className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-[10px] text-gray-500">
                    {file.size} B · {file.updatedAt}
                  </p>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete(file.name)
                  }}
                  disabled={controller.blocked(file.name)}
                  aria-label={`删除 ${file.name}`}
                  className="opacity-0 group-hover:opacity-100 disabled:opacity-30 p-1 rounded hover:bg-red-500/10 text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 编辑器 */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
              {selected || '未选择文件'}
              {dirty && <span className="ml-1 text-amber-500">●</span>}
            </span>
            <div className="flex-1" />
            <button
              onClick={handleFormat}
              disabled={!selected}
              title="格式化 YAML（统一缩进）"
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Wand2 className="w-3 h-3" />
              格式化
            </button>
            <button
              onClick={toggleTheme}
              title={editorTheme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
              className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {editorTheme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            </button>
            <button
              onClick={() => {
                loadVersions()
                setShowVersions(true)
              }}
              disabled={!selected}
              title="版本历史"
              className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <History className="w-3 h-3" />
            </button>
            <button
              onClick={handleValidate}
              disabled={!selected}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              校验
            </button>
            <button
              onClick={handleSave}
              disabled={!selected || !dirty || saving || selectedBusy}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              保存
            </button>
            {ACTIONS.map((action) => {
              const Icon = action.icon
              const busy = runningAction === action.key
              return (
                <button
                  key={action.key}
                  onClick={() => handleAction(action.key)}
                  disabled={!selected || selectedBusy}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border disabled:opacity-50',
                    'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700',
                    action.color
                  )}
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                  {action.label}
                </button>
              )
            })}
          </div>

          <div className="relative flex-1 h-[52vh] min-h-0">
            {loadingFile && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 z-10">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
            {selected ? (
              <div
                className={cn(
                  'h-full rounded-b-xl overflow-hidden border-t',
                  editorTheme === 'dark'
                    ? 'bg-[#282c34] border-gray-700'
                    : 'bg-white border-gray-200'
                )}
              >
                <ComposeEditor
                  value={content}
                  onChange={setContent}
                  theme={editorTheme}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400 rounded-b-xl border-t border-gray-200 dark:border-gray-800">
                从左侧选择或新建一个 compose 文件
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-500">
            <span>Ctrl/Cmd + Space 联想 · Tab 缩进 · Shift+Tab 反缩进</span>
            <span>{content.split('\n').length} 行 · {content.length} 字符</span>
          </div>
        </div>
      </div>

      {/* 版本历史 */}
      {showVersions && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium">版本历史 · {selected}</span>
            <button
              onClick={() => setShowVersions(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {versions.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-gray-500">暂无版本记录</p>
            )}
            {versions.map((version) => (
              <div key={`${version.createdAt}-${version.action}`} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {versionLabel(version.action)}
                    </span>
                    {version.backupName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-600 dark:text-gray-300 ring-1 ring-inset ring-gray-500/20">
                        可回滚
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono">{version.createdAt}</p>
                </div>
                {version.backupName && (
                  <button
                    onClick={() => handleRollback(version)}
                    disabled={selectedBusy}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    回滚
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 执行结果 */}
      {task && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            {task.notFound ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : task.status === 'succeeded' ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : task.status === 'failed' ? (
              <XCircle className="w-4 h-4 text-red-600" />
            ) : task.status === 'interrupted' ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            )}
            <span className="text-sm font-medium break-all">
              {actionLabel(task.action)} {task.filename} · {task.notFound ? '任务未找到 / 结果待确认' : STATUS_LABELS[task.status]}
            </span>
            <div className="flex-1" />
            <button onClick={() => controller.reconcile()} className="text-xs underline">刷新任务状态</button>
            <button aria-label="关闭任务详情" onClick={() => controller.select(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-2 text-xs text-gray-500 break-all">
            任务 ID：{task.id}
            {jobFingerprint && (
              <>
                {' · '}配置指纹：<code className="font-mono" title={jobFingerprint}>{shortFingerprint(jobFingerprint, 12)}</code>
              </>
            )}
          </div>
          {modifiedAfterDeploy && (
            <p className="px-3 pb-2 text-xs text-amber-600 dark:text-amber-400">部署后文件已修改</p>
          )}
          {task.queryError && <p role="status" className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{task.queryError}</p>}
          {task.notFound && !task.guardReleased && <button className="px-3 py-2 text-xs underline text-amber-600" onClick={() => controller.releaseNotFound(task.id,
            window.confirm('任务未找到不代表执行失败。请核验服务实际状态，确认已结束或未执行后再解除保护。是否已核验？'))}>已人工核验，解除任务保护</button>}
          {!job && <p className="px-3 py-2 text-xs text-gray-500">{ACTIVE_STATUSES.has(task.status) && !task.notFound ? '正在跟踪任务，尚无最终输出' : '结果详情待确认，请刷新任务状态'}</p>}
          {job?.steps?.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 space-y-1.5">
              {job.steps.map((step, index) => (
                <div key={`${step.stage}-${index}`} className="flex items-start gap-2 text-xs">
                  {step.status === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600" />
                  )}
                  {step.status === 'warning' && (
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  )}
                  {(step.status === 'failed' || step.status === 'skipped') && (
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
                  )}
                  <span className="font-medium text-gray-700 dark:text-gray-300 shrink-0 w-12">
                    {STEP_LABELS[step.stage] || step.stage}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">{step.message}</span>
                </div>
              ))}
            </div>
          )}
          {servicesView?.kind === 'services' && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">服务状态</p>
              <div className="flex flex-wrap gap-1.5">
                {servicesView.services.map((service, index) => (
                  <span
                    key={`${service?.name || 'service'}-${index}`}
                    title={typeof service?.health === 'string' && service.health
                      ? `${service.name} ${service.state}（health: ${service.health}）`
                      : `${service?.name || ''} ${service?.state || ''}`.trim()}
                    className={cn('inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px]',
                      SERVICE_TONE_CLASSES[serviceBadgeTone(service)])}
                  >
                    {service?.name || '未知服务'} · {service?.state || '未知状态'}{typeof service?.health === 'string' && service.health ? ` · ${service.health}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          {servicesView?.kind === 'legacy' && (
            <p className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              服务端未提供服务状态（旧版本）
            </p>
          )}
          {job && <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto text-gray-700 dark:text-gray-300">
            {job.output || '(无输出)'}
          </pre>}
        </div>
      )}

      {/* 历史 */}
      {showHistory && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium">执行历史</span>
            <button onClick={() => controller.reconcile()} className="text-xs underline">刷新执行历史</button>
            <button aria-label="关闭执行历史" onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {tasks.historyLoading && <p role="status" className="px-3 py-2 text-xs text-gray-500">正在刷新执行历史…</p>}
            {tasks.historyError && <div role="alert" className="px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{tasks.historyError} <button onClick={() => controller.reconcile()} className="underline">重试读取执行历史</button></div>}
            {history.length === 0 && !tasks.historyLoading && !tasks.historyError && (
              <p className="px-3 py-6 text-center text-xs text-gray-500">暂无执行记录</p>
            )}
            {history.map((item) => (
              <div key={item.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn('font-medium', item.status === 'succeeded' ? 'text-green-600' : item.status === 'failed' ? 'text-red-600' : 'text-amber-600')}>
                    {item.notFound ? '任务未找到 / 结果待确认' : STATUS_LABELS[item.status]}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{actionLabel(item.action)}</span>
                  <span className="text-gray-600 dark:text-gray-400 break-all">{item.filename}</span>
                  <span className="text-gray-400">{item.createdAt || item.result?.finishedAt ? new Date(item.createdAt || item.result.finishedAt).toLocaleString('zh-CN') : ''}</span>
                  <button onClick={() => controller.select(item.id)} aria-label={`查看任务详情 ${item.id}`} className="underline text-primary-600 dark:text-primary-400">查看详情</button>
                </div>
                {item.queryError && <p className="text-xs text-amber-600 dark:text-amber-400">{item.queryError}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新建对话框 */}
      {showDeployDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              部署 {selected}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              是否先拉取最新镜像？
            </p>
            {deployFingerprint && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 break-all">
                提交配置指纹: <code className="font-mono text-gray-700 dark:text-gray-300" title={deployFingerprint}>{shortFingerprint(deployFingerprint, DEPLOY_FINGERPRINT_DISPLAY_LENGTH)}…</code>
                （以服务端保存内容为准）
              </p>
            )}
            <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-400 space-y-1">
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-200">拉取最新</span>
                ：先 <code className="font-mono">pull</code> 再 <code className="font-mono">up -d</code>，
                能拿到镜像的新版本。拉取失败时会用本地已有镜像继续启动。
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-gray-200">用本地镜像</span>
                ：直接 <code className="font-mono">up -d</code>，不访问镜像仓库，
                适合离线环境或只有本地构建的服务。
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowDeployDialog(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => confirmDeploy(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                用本地镜像
              </button>
              <button
                onClick={() => confirmDeploy(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                拉取最新并启动
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-sm p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">新建 compose 文件</h3>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例如 app.yaml"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              onKeyDown={(event) => event.key === 'Enter' && handleCreate()}
            />
            <p className="mt-1 text-[11px] text-gray-500">仅支持 .yml / .yaml，不能包含路径</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full">
          {notice}
        </div>
      )}
    </div>
  )
}
