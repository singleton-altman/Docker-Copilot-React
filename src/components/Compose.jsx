import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileCode,
  Plus,
  Save,
  Trash2,
  RefreshCw,
  Play,
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

const ACTIONS = [
  { key: 'up', label: '启动', icon: Play, color: 'text-green-600 dark:text-green-400' },
  { key: 'restart', label: '重启', icon: RotateCcw, color: 'text-amber-600 dark:text-amber-400' },
  { key: 'pull', label: '拉取', icon: Download, color: 'text-blue-600 dark:text-blue-400' },
  { key: 'down', label: '停止', icon: Square, color: 'text-red-600 dark:text-red-400' },
]

const VERSION_LABELS = {
  create: '创建',
  save: '保存',
  delete: '删除',
  restore: '从回收站恢复',
  rollback: '回滚',
}

function versionLabel(action) {
  return VERSION_LABELS[action] || action
}

const TEMPLATE = `services:
  app:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`

export function Compose() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [job, setJob] = useState(null)
  const [runningAction, setRunningAction] = useState('')
  const [showNewDialog, setShowNewDialog] = useState(false)
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
    setTimeout(() => setNotice(''), 2000)
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

  const loadHistory = useCallback(async () => {
    try {
      const response = await composeAPI.history()
      if (response.data.code === 200) {
        setHistory(response.data.data?.results || [])
      }
    } catch {
      // 历史读取失败不影响主流程
    }
  }, [])

  useEffect(() => {
    loadFiles()
    loadHistory()
  }, [loadFiles, loadHistory])

  const openFile = async (name) => {
    setLoadingFile(true)
    setError('')
    try {
      const response = await composeAPI.readFile(name)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      const text = response.data.data?.content || ''
      setSelected(name)
      setContent(text)
      setOriginal(text)
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
      const response = await composeAPI.saveFile(selected, content)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      setOriginal(content)
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
    if (!version.backupName || !selected) return
    if (!window.confirm('当前内容会先被备份，然后恢复到选定版本。是否继续？')) return
    try {
      const response = await composeAPI.rollback(selected, version.backupName)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      flash('已回滚')
      await openFile(selected)
      await loadVersions()
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '回滚失败')
    }
  }

  const handleDelete = async (name) => {
    if (!window.confirm(`确定删除 ${name}？`)) return
    try {
      const response = await composeAPI.deleteFile(name)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      if (selected === name) {
        setSelected(null)
        setContent('')
        setOriginal('')
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
      const response = await composeAPI.saveFile(name, TEMPLATE)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      setShowNewDialog(false)
      setNewName('')
      await loadFiles()
      await openFile(name)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '创建失败')
    }
  }

  const pollJob = async (jobId) => {
    // 服务端只投递请求，宿主机 watcher 执行，首次可能需要拉镜像
    const deadline = Date.now() + 3 * 60 * 1000
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      try {
        const response = await composeAPI.getJob(jobId)
        if (response.data.code !== 200) throw new Error(response.data.msg)
        const data = response.data.data
        if (data.done) {
          setJob(data.result)
          setRunningAction('')
          loadHistory()
          return
        }
      } catch (err) {
        setError(err.response?.data?.msg || err.message || '查询执行结果失败')
        setRunningAction('')
        return
      }
    }
    setError('等待执行结果超时，请稍后在执行历史中查看')
    setRunningAction('')
  }

  const handleAction = async (action) => {
    if (!selected) return
    if (dirty && !window.confirm('有未保存的修改，将以已保存的内容执行。是否继续？')) {
      return
    }
    setError('')
    setJob(null)
    setRunningAction(action)
    try {
      const response = await composeAPI.deploy(selected, action)
      if (response.data.code !== 200) throw new Error(response.data.msg)
      const jobId = response.data.data?.jobID
      if (!jobId) throw new Error('未返回 jobID')
      await pollJob(jobId)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '执行失败')
      setRunningAction('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Compose</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            编辑 compose 文件并投递执行请求，实际执行由宿主机 watcher 完成
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <History className="w-4 h-4" />
            执行历史
          </button>
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 文件列表 */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
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
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
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
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 编辑器 */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
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
              disabled={!selected || !dirty || saving}
              className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
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
                  disabled={!selected || Boolean(runningAction)}
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
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-800/70 z-10">
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
              <div className="h-full flex items-center justify-center text-sm text-gray-400 rounded-b-xl border-t border-gray-200 dark:border-gray-700">
                从左侧选择或新建一个 compose 文件
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500">
            <span>Ctrl/Cmd + Space 联想 · Tab 缩进 · Shift+Tab 反缩进</span>
            <span>{content.split('\n').length} 行 · {content.length} 字符</span>
          </div>
        </div>
      </div>

      {/* 版本历史 */}
      {showVersions && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium">版本历史 · {selected}</span>
            <button
              onClick={() => setShowVersions(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        可回滚
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono">{version.createdAt}</p>
                </div>
                {version.backupName && (
                  <button
                    onClick={() => handleRollback(version)}
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
      {job && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            {job.success ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm font-medium">
              {job.action} {job.filename} · {job.success ? '成功' : '失败'}
            </span>
            <div className="flex-1" />
            <button onClick={() => setJob(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto text-gray-700 dark:text-gray-300">
            {job.output || '(无输出)'}
          </pre>
        </div>
      )}

      {/* 历史 */}
      {showHistory && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium">执行历史</span>
            <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {history.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-gray-500">暂无执行记录</p>
            )}
            {history.map((item) => (
              <div key={item.id} className="px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  {item.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                  )}
                  <span className="font-medium text-gray-800 dark:text-gray-200">{item.action}</span>
                  <span className="text-gray-600 dark:text-gray-400">{item.filename}</span>
                  <span className="text-gray-400">{new Date(item.finishedAt).toLocaleString('zh-CN')}</span>
                </div>
                {item.output && (
                  <pre className="mt-1 text-[10px] font-mono text-gray-500 whitespace-pre-wrap break-all max-h-20 overflow-hidden">
                    {item.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 新建对话框 */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">新建 compose 文件</h3>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例如 app.yaml"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
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
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
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
