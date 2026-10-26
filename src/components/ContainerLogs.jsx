import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  RefreshCw,
  Download,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowDownToLine,
  Loader2,
  AlertTriangle,
  Copy,
} from 'lucide-react'
import { containerAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

const TAIL_OPTIONS = [100, 300, 1000, 3000]
const LEVELS = [
  { key: 'all', label: '全部' },
  { key: 'error', label: '错误' },
  { key: 'warn', label: '警告' },
  { key: 'info', label: '信息' },
  { key: 'debug', label: '调试' },
]

/** 去掉 ANSI 转义序列，避免终端控制字符出现在页面上 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B(?:\[[0-9;?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-_])/g, '')
}

/** 判断是否为 docker 注入的 RFC3339 时间戳 */
function isTimestamp(value) {
  if (value.length < 20 || !value.includes('T')) return false
  return !Number.isNaN(Date.parse(value))
}

function inferLevel(text) {
  const lower = text.toLowerCase()
  if (
    lower.includes('"level":"error"') ||
    lower.includes('"level": "error"') ||
    /\berror\b/.test(lower) ||
    /\bfatal\b/.test(lower) ||
    /\bpanic\b/.test(lower)
  ) {
    return 'error'
  }
  if (lower.includes('"level":"warn"') || /\bwarn(ing)?\b/.test(lower)) return 'warn'
  if (lower.includes('"level":"debug"') || /\bdebug\b/.test(lower)) return 'debug'
  return 'info'
}

/** 解析一行日志：结构化 JSON 优先，其次带时间戳前缀的文本 */
function parseLine(raw) {
  let text = raw.replace(/\r$/, '')
  if (!text) return null

  // 1) 整行 JSON
  const structured = parseStructured(text)
  if (structured) return structured

  // 2) `2026-...Z {...}` 或 `2026-...Z 普通文本`
  const spaceIndex = text.indexOf(' ')
  if (spaceIndex > 0) {
    const candidate = text.slice(0, spaceIndex)
    if (isTimestamp(candidate)) {
      const rest = text.slice(spaceIndex + 1)
      const inner = parseStructured(rest)
      if (inner) return { ...inner, timestamp: inner.timestamp || candidate }
      return { timestamp: candidate, text: rest, level: inferLevel(rest), caller: null, extras: [] }
    }
  }

  return { timestamp: null, text, level: inferLevel(text), caller: null, extras: [] }
}

function parseStructured(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null

  let object
  try {
    object = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!object || typeof object !== 'object' || Array.isArray(object)) return null

  const messageKeys = ['content', 'message', 'msg', 'log', 'error']
  let message = null
  let usedKey = null
  for (const key of messageKeys) {
    if (object[key] !== undefined && object[key] !== null) {
      message = typeof object[key] === 'string' ? object[key] : JSON.stringify(object[key])
      usedKey = key
      break
    }
  }
  if (!message) return null

  const levelKey = ['level', 'severity', 'lvl'].find((k) => typeof object[k] === 'string')
  const timeKey = ['@timestamp', 'timestamp', 'time', 'ts'].find((k) => typeof object[k] === 'string')
  const callerKey = ['caller', 'logger', 'source', 'module'].find((k) => typeof object[k] === 'string')

  const handled = new Set([
    ...messageKeys,
    'level',
    'severity',
    'lvl',
    '@timestamp',
    'timestamp',
    'time',
    'ts',
    'caller',
    'logger',
    'source',
    'module',
    usedKey,
  ])
  const extras = Object.keys(object)
    .filter((key) => !handled.has(key))
    .sort()
    .map((key) => [key, typeof object[key] === 'string' ? object[key] : JSON.stringify(object[key])])

  return {
    timestamp: timeKey ? object[timeKey] : null,
    text: message,
    level: levelKey ? normalizeLevel(object[levelKey]) : inferLevel(message),
    caller: callerKey ? object[callerKey] : null,
    extras,
  }
}

function normalizeLevel(value) {
  const lower = String(value).toLowerCase()
  if (['error', 'err', 'fatal', 'panic', 'critical', 'crit', 'dpanic'].includes(lower)) return 'error'
  if (['warn', 'warning'].includes(lower)) return 'warn'
  if (['debug', 'trace'].includes(lower)) return 'debug'
  return 'info'
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp.slice(11, 19)
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

const LEVEL_STYLES = {
  error: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  info: 'text-gray-800 dark:text-gray-200',
  debug: 'text-gray-500 dark:text-gray-500',
}

export function ContainerLogsModal({ container, onClose }) {
  const [rawLines, setRawLines] = useState([])
  const [tail, setTail] = useState(300)
  const [timestamps, setTimestamps] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('all')
  const [follow, setFollow] = useState(true)
  const [matchIndex, setMatchIndex] = useState(0)
  const [toast, setToast] = useState('')
  const bodyRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await containerAPI.getLogs(container.id, { tail, timestamps })
      if (response.data.code !== 200) {
        throw new Error(response.data.msg || '读取日志失败')
      }
      const content = response.data.data?.logs || ''
      const parsed = content
        .split('\n')
        .map(parseLine)
        .filter(Boolean)
        .map((line, index) => ({ ...line, id: `${index}-${line.timestamp || ''}-${line.text}` }))
      setRawLines(parsed)
      setMatchIndex(0)
    } catch (err) {
      setError(err.response?.data?.msg || err.message || '读取日志失败')
    } finally {
      setLoading(false)
    }
  }, [container.id, tail, timestamps])

  useEffect(() => {
    load()
  }, [load])

  const levelCounts = useMemo(() => {
    const counts = { error: 0, warn: 0, info: 0, debug: 0 }
    rawLines.forEach((line) => {
      counts[line.level] = (counts[line.level] || 0) + 1
    })
    return counts
  }, [rawLines])

  const visibleLines = useMemo(
    () => (level === 'all' ? rawLines : rawLines.filter((line) => line.level === level)),
    [rawLines, level]
  )

  const keyword = search.trim()
  const matchedIndices = useMemo(() => {
    if (!keyword) return []
    const lower = keyword.toLowerCase()
    const indices = []
    visibleLines.forEach((line, index) => {
      if (line.text.toLowerCase().includes(lower)) indices.push(index)
    })
    return indices
  }, [visibleLines, keyword])

  useEffect(() => {
    setMatchIndex(0)
  }, [keyword, level])

  // 跟随：内容变化时滚动到底部
  useEffect(() => {
    if (!follow || keyword) return
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleLines, follow, keyword])

  // 跳转到当前命中项
  useEffect(() => {
    if (!keyword || matchedIndices.length === 0) return
    const target = matchedIndices[Math.min(matchIndex, matchedIndices.length - 1)]
    const el = bodyRef.current?.querySelector(`[data-line-index="${target}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [matchIndex, matchedIndices, keyword])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 1500)
  }

  const exportLogs = () => {
    const content = rawLines.map((line) => (line.timestamp ? `${line.timestamp} ${line.text}` : line.text)).join('\n')
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 15)
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${container.name.replace(/[^A-Za-z0-9._-]/g, '-')}-${stamp}.log`
    a.click()
    URL.revokeObjectURL(url)
    showToast('日志已导出')
  }

  const copyAll = async () => {
    const content = visibleLines
      .map((line) => (line.timestamp ? `${line.timestamp} ${line.text}` : line.text))
      .join('\n')
    try {
      await navigator.clipboard.writeText(content)
      showToast('已复制')
    } catch {
      showToast('复制失败')
    }
  }

  const jump = (offset) => {
    if (matchedIndices.length === 0) return
    setMatchIndex((prev) => (prev + offset + matchedIndices.length) % matchedIndices.length)
  }

  const renderText = (line, index) => {
    if (!keyword) return line.text
    const lowerText = line.text.toLowerCase()
    const lowerKey = keyword.toLowerCase()
    const parts = []
    let cursor = 0
    let found = lowerText.indexOf(lowerKey)
    let key = 0
    while (found !== -1) {
      if (found > cursor) parts.push(line.text.slice(cursor, found))
      parts.push(
        <mark key={key++} className="bg-yellow-300 text-black rounded-sm px-0.5">
          {line.text.slice(found, found + keyword.length)}
        </mark>
      )
      cursor = found + keyword.length
      found = lowerText.indexOf(lowerKey, cursor)
    }
    if (cursor < line.text.length) parts.push(line.text.slice(cursor))
    return parts
  }

  const currentMatchLine = keyword && matchedIndices.length > 0 ? matchedIndices[matchIndex] : -1

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-5xl h-[90vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              日志 · {container.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{container.usingImage}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} title="刷新" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button onClick={copyAll} title="复制当前视图" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={exportLogs} title="导出日志" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} title="关闭" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1"
          >
            {TAIL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} 行
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            {LEVELS.map((item) => (
              <button
                key={item.key}
                onClick={() => setLevel(item.key)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors',
                  level === item.key
                    ? 'bg-white dark:bg-gray-600 shadow-sm font-medium'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-600/60'
                )}
              >
                {item.label}
                {item.key !== 'all' && ` ${levelCounts[item.key] || 0}`}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={timestamps}
              onChange={(e) => setTimestamps(e.target.checked)}
              className="rounded"
            />
            时间戳
          </label>

          <button
            onClick={() => setFollow((prev) => !prev)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-xs rounded-lg border',
              follow
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-gray-300 dark:border-gray-600 text-gray-500'
            )}
            title="自动滚动到最新日志"
          >
            <ArrowDownToLine className="w-3 h-3" />
            跟随
          </button>

          <div className="flex-1" />

          {/* 搜索 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索日志"
              className="pl-7 pr-16 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 w-52"
            />
            {keyword && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <span className="text-[10px] text-gray-500 mr-1">
                  {matchedIndices.length ? `${matchIndex + 1}/${matchedIndices.length}` : '无结果'}
                </span>
                <button onClick={() => jump(-1)} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={() => jump(1)} className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 内容 */}
        <div ref={bodyRef} className="flex-1 overflow-auto bg-gray-950 text-gray-200 font-mono text-xs leading-5">
          {loading && rawLines.length === 0 && (
            <div className="flex items-center justify-center h-full gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在读取日志…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-amber-400 px-6 text-center">
              <AlertTriangle className="w-6 h-6" />
              <span>{error}</span>
              <button onClick={load} className="mt-2 px-3 py-1 rounded border border-amber-400/50 hover:bg-amber-400/10">
                重试
              </button>
            </div>
          )}

          {!loading && !error && visibleLines.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-500">
              {rawLines.length === 0 ? '暂无日志' : '没有符合过滤条件的日志'}
            </div>
          )}

          {!error && visibleLines.length > 0 && (
            <div className="py-2">
              {visibleLines.map((line, index) => (
                <div
                  key={line.id}
                  data-line-index={index}
                  className={cn(
                    'flex gap-3 px-3 py-0.5 hover:bg-white/5',
                    index === currentMatchLine && 'bg-yellow-500/20'
                  )}
                >
                  {line.timestamp && (
                    <span className="text-gray-500 shrink-0 select-none">{formatTime(line.timestamp)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn('whitespace-pre-wrap break-all', LEVEL_STYLES[line.level])}>
                      {renderText(line, index)}
                    </div>
                    {(line.caller || line.extras.length > 0) && (
                      <div className="text-gray-500 text-[10px] whitespace-pre-wrap break-all">
                        {line.caller && <span className="mr-2">{line.caller}</span>}
                        {line.extras.map(([key, value]) => (
                          <span key={key} className="mr-2">
                            {key}={value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500">
          <span>
            显示 {visibleLines.length} / {rawLines.length} 行
          </span>
          <span>{keyword ? '搜索仅作用于当前过滤结果' : '日志按服务端返回顺序展示'}</span>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full">
          {toast}
        </div>
      )}
    </div>
  )
}
