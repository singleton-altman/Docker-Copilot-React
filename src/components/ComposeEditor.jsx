import React, { useEffect, useRef } from 'react'
import { EditorView, keymap, highlightActiveLine, lineNumbers, drawSelection, ViewPlugin } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands'
import { yaml } from '@codemirror/lang-yaml'
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { oneDark } from '@codemirror/theme-one-dark'

/**
 * Compose 语法高亮。
 * 用语义色而不是固定色值，浅色主题下也能保持可读。
 */
const lightHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#8b949e', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#cf222e' },
  { tag: [tags.propertyName, tags.attributeName], color: '#0550ae' },
  { tag: [tags.string, tags.special(tags.string)], color: '#0a7d33' },
  { tag: tags.number, color: '#953800' },
  { tag: tags.bool, color: '#8250df' },
  { tag: tags.null, color: '#8250df' },
  { tag: tags.punctuation, color: '#57606a' },
  { tag: tags.invalid, color: '#cf222e', textDecoration: 'underline' },
])

// 深色主题下用 oneDark 自带的着色，这里只补充 YAML 的键名强调
const darkHighlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.attributeName], color: '#79b8ff' },
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
  { tag: tags.invalid, color: '#ff7b72', textDecoration: 'underline' },
])

/**
 * 回车智能缩进。
 *
 * CodeMirror 自带的 insertNewlineAndIndent 依赖语言解析，对 compose 的
 * `- key:` 处理不够直观。这里用简单的行尾特征判断：
 * - `key:` 结尾 → 缩进 +2
 * - `- ` 列表项 → 与列表项内容对齐
 * - `- key:` → 缩进 +4（继续写子项）
 */
const smartNewlineExtension = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '\n' || from !== to) return false

  const line = view.state.doc.lineAt(from)
  const beforeCaret = view.state.sliceDoc(line.from, from)
  const trimmed = beforeCaret.trim()
  const indentMatch = beforeCaret.match(/^[ \t]*/)
  const indent = indentMatch ? indentMatch[0] : ''

  let nextIndent = indent
  if (trimmed.endsWith(':')) {
    nextIndent = indent + '  '
  } else if (trimmed.startsWith('- ')) {
    const item = trimmed.slice(2).trim()
    nextIndent = item.endsWith(':') ? indent + '    ' : indent + '  '
  }

  view.dispatch({
    changes: { from, to, insert: '\n' + nextIndent },
    selection: { anchor: from + 1 + nextIndent.length },
    scrollIntoView: true,
  })
  return true
})

/**
 * Compose 常用键的联想来源。
 * 只在行首或缩进后的位置提供键名建议，减少与用户输入内容的干扰。
 */
const COMPOSE_KEYWORDS = [
  // 顶层
  { label: 'services', type: 'keyword', detail: '服务定义' },
  { label: 'volumes', type: 'keyword', detail: '命名卷' },
  { label: 'networks', type: 'keyword', detail: '网络' },
  { label: 'configs', type: 'keyword', detail: '配置' },
  { label: 'secrets', type: 'keyword', detail: '密钥' },
  // service 级
  { label: 'image', type: 'property', detail: '镜像引用' },
  { label: 'container_name', type: 'property', detail: '容器名' },
  { label: 'command', type: 'property', detail: '覆盖启动命令' },
  { label: 'entrypoint', type: 'property', detail: '覆盖入口点' },
  { label: 'ports', type: 'property', detail: '端口映射' },
  { label: 'volumes', type: 'property', detail: '卷挂载' },
  { label: 'environment', type: 'property', detail: '环境变量' },
  { label: 'env_file', type: 'property', detail: '环境变量文件' },
  { label: 'depends_on', type: 'property', detail: '依赖服务' },
  { label: 'restart', type: 'property', detail: '重启策略' },
  { label: 'networks', type: 'property', detail: '加入网络' },
  { label: 'healthcheck', type: 'property', detail: '健康检查' },
  { label: 'deploy', type: 'property', detail: '部署配置' },
  { label: 'labels', type: 'property', detail: '标签' },
  { label: 'working_dir', type: 'property', detail: '工作目录' },
  { label: 'user', type: 'property', detail: '运行用户' },
  { label: 'hostname', type: 'property', detail: '主机名' },
  { label: 'dns', type: 'property' },
  { label: 'extra_hosts', type: 'property' },
  { label: 'logging', type: 'property', detail: '日志驱动' },
  { label: 'cap_add', type: 'property' },
  { label: 'cap_drop', type: 'property' },
  { label: 'privileged', type: 'property', detail: '特权模式（慎用）' },
  { label: 'read_only', type: 'property' },
  { label: 'stdin_open', type: 'property' },
  { label: 'tty', type: 'property' },
  { label: 'platform', type: 'property' },
  { label: 'profiles', type: 'property' },
  // healthcheck 子项
  { label: 'test', type: 'property', detail: '健康检查命令' },
  { label: 'interval', type: 'property' },
  { label: 'timeout', type: 'property' },
  { label: 'retries', type: 'property' },
  { label: 'start_period', type: 'property' },
  // deploy 子项
  { label: 'replicas', type: 'property' },
  { label: 'resources', type: 'property' },
  { label: 'restart_policy', type: 'property' },
  // 常用值
  { label: 'unless-stopped', type: 'enum', detail: 'restart 策略' },
  { label: 'always', type: 'enum', detail: 'restart 策略' },
  { label: 'no', type: 'enum', detail: 'restart 策略' },
  { label: 'on-failure', type: 'enum', detail: 'restart 策略' },
  { label: 'latest', type: 'enum', detail: '镜像标签' },
  { label: 'bridge', type: 'enum', detail: '网络驱动' },
  { label: 'host', type: 'enum', detail: '网络模式' },
  { label: 'json-file', type: 'enum', detail: '日志驱动' },
]

function buildCompletions(context) {
  const word = context.matchBefore(/[A-Za-z0-9_.-]*/)
  if (!word) return null

  // 仅在行首空白后触发键名联想；行中间的值联想用统一来源
  const line = context.state.doc.lineAt(context.pos)
  const textBefore = line.text.slice(0, context.pos - line.from)
  const isKeyPosition = /^\s*[A-Za-z0-9_.-]*$/.test(textBefore)

  const options = COMPOSE_KEYWORDS.filter((item) => {
    if (isKeyPosition) {
      return item.type === 'keyword' || item.type === 'property'
    }
    return true
  })

  if (word.from === word.to && !context.explicit) return null

  return {
    from: word.from,
    options,
    validFor: /^[A-Za-z0-9_.-]*$/,
  }
}

/**
 * CodeMirror 6 编辑器封装。
 * 用 Compartment 动态切换主题，避免重建整个编辑器导致光标丢失。
 */
export function ComposeEditor({
  value,
  onChange,
  theme = 'dark',
  readOnly = false,
  placeholder = '',
  onReady,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const themeCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)

  onChangeRef.current = onChange

  // 初始化：只创建一次
  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({
          override: [buildCompletions],
          activateOnTyping: true,
          maxRenderedOptions: 40,
        }),
        yaml(),
        syntaxHighlighting(lightHighlight),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        // 回车时按上一行结构自动对齐：`key:` 深一层，`- item` 对齐列表
        smartNewlineExtension,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        }),
        themeCompartment.current.of([]),
        readOnlyCompartment.current.of([]),
        EditorView.theme({
          '&': { height: '100%', fontSize: '12px' },
          '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
          '.cm-content': { padding: '8px 0' },
          '.cm-gutters': { border: 'none' },
          '&.cm-focused': { outline: 'none' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    onReady?.(view)
    applyTheme(view, theme, themeCompartment.current)
    applyReadOnly(view, readOnly, readOnlyCompartment.current)

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部内容变化时同步（例如格式化、回滚、切换文件）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === (value || '')) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value || '' },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    applyTheme(view, theme, themeCompartment.current)
  }, [theme])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    applyReadOnly(view, readOnly, readOnlyCompartment.current)
  }, [readOnly])

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden" data-placeholder={placeholder} />
}

function applyTheme(view, theme, compartment) {
  view.dispatch({
    effects: compartment.reconfigure(
      theme === 'dark' ? [oneDark, syntaxHighlighting(darkHighlight)] : []
    ),
  })
}

function applyReadOnly(view, readOnly, compartment) {
  view.dispatch({
    effects: compartment.reconfigure(
      EditorView.editable.of(!readOnly)
    ),
  })
}
