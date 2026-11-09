import React, { useEffect, useState } from 'react'
import wechatImg from '../assets/wechat.jpg'
import alipayImg from '../assets/alipay.jpg'
import apiClient, { mcpAPI } from '../api/client.js'

// MCP 配置卡片：开关 + 密钥 + 端点地址，保存即热生效（无需重启服务端）
function McpCard() {
  const [config, setConfig] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let cancelled = false
    mcpAPI.getConfig()
      .then((res) => {
        if (cancelled || res.data?.code !== 200) return
        const data = res.data.data || {}
        setConfig(data)
        setEnabled(!!data.enabled)
        setKeyInput(data.accessKey || '')
      })
      .catch(() => {
        if (!cancelled) setError('无法读取 MCP 配置，请确认服务端版本 ≥ v2.4.1')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const save = async (nextEnabled, nextKey) => {
    setSaving(true)
    setError('')
    try {
      const res = await mcpAPI.updateConfig(nextEnabled, nextKey)
      if (res.data?.code !== 200) {
        setError(res.data?.msg || '保存失败')
        return
      }
      const data = res.data.data || {}
      setConfig(data)
      setEnabled(!!data.enabled)
      setKeyInput(data.accessKey || '')
      showToast(nextEnabled ? 'MCP 服务已开启' : 'MCP 服务已关闭')
    } catch {
      setError('保存失败，请检查网络')
    } finally {
      setSaving(false)
    }
  }

  const copyEndpoint = async () => {
    if (!endpointURL) return
    try {
      await navigator.clipboard.writeText(endpointURL)
      showToast('端点地址已复制')
    } catch {
      showToast('复制失败')
    }
  }

  const endpointURL = config?.endpoint
    ? `${apiClient.defaults.baseURL}${config.endpoint}`
    : ''

  return (
    <div className="card p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">MCP 服务</h2>
        {!loading && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            enabled
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-primary-200 animate-pulse' : 'bg-gray-400'}`} />
            {enabled ? '已启用' : '未启用'}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
        开启后，Claude Desktop 等 AI 客户端可通过 MCP 协议连接本服务端，
        读取与操作容器和 compose（Bearer 密钥鉴权）。
      </p>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">加载中…</div>
      ) : (
        <div className="space-y-4">
          {/* 端点地址 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">端点地址</label>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs sm:text-sm text-gray-800 dark:text-gray-200 truncate font-mono">
                {endpointURL}
              </code>
              <button
                type="button"
                onClick={copyEndpoint}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                复制
              </button>
            </div>
          </div>

          {/* 访问密钥 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              访问密钥（≥ 8 位，留空保存则沿用现值）
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="设置 Bearer 密钥"
                autoComplete="new-password"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 border border-transparent focus:border-primary-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {/* 开关 + 保存 */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-[24px]' : 'translate-x-[3px]'
                }`} />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {enabled ? '开启中' : '已关闭'}
              </span>
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(enabled, keyInput)}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

export function About() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* 头部信息 */}
      <div className="card rounded-3xl p-6 sm:p-8 mb-4 text-center bg-primary-50 dark:bg-primary-900/10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">Docker Copilot</h1>
        <p className="text-gray-600 dark:text-gray-400">一个简洁优雅的Docker容器管理工具</p>
      </div>

      {/* 主要内容 */}
      <div className="space-y-4">
        {/* MCP 服务配置 */}
        <McpCard />

        {/* 感谢卡片 */}
        <div className="card p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">致谢</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            非常感谢大家自项目开始以来的使用、建议、鼓励和支持。特别感谢绿联对本项目的支持。没有大家的反馈，Docker Copilot 不会是今天的样子。他是属于我们共同的作品。
          </p>
        </div>

        {/* 反馈卡片 */}
        <div className="card p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">反馈与建议</h2>
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            在项目使用中遇到 bug 或想要提建议？欢迎在 
            <a 
              href="https://github.com/onlyLTY/dockercopilot/issues" 
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline font-medium transition-colors"
            >
              GitHub Issues
            </a>
            {' '}提出，或发送邮件至
            <a 
              href="mailto:onlylty@lty.wiki" 
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline font-medium transition-colors"
            >
              onlylty@lty.wiki
            </a>
            。期待您的反馈！
          </p>
        </div>

        {/* 赞赏卡片 */}
        <div className="card p-6 sm:p-8 rounded-2xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 hover:shadow-lg transition-all">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-primary-900 dark:text-primary-200 mb-2">最后的最后</h2>
            <p className="text-primary-800 dark:text-primary-300 mb-4">
              如果您用的愉快的话，可以请我喝一瓶快乐水吗？您的支持是我持续维护项目的动力！
            </p>
            
            {/* 赞赏码 */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="flex flex-col items-center">
                <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-lg border-2 border-white dark:border-gray-700 hover:shadow-xl transition-all transform hover:scale-105">
                  <img 
                    src={wechatImg} 
                    alt="微信赞赏码" 
                    className="w-full h-full object-contain bg-white"
                  />
                </div>
                <span className="mt-3 text-sm font-medium text-primary-700 dark:text-primary-300">微信支付</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-lg border-2 border-white dark:border-gray-700 hover:shadow-xl transition-all transform hover:scale-105">
                  <img 
                    src={alipayImg} 
                    alt="支付宝赞赏码" 
                    className="w-full h-full object-contain bg-white"
                  />
                </div>
                <span className="mt-3 text-sm font-medium text-primary-700 dark:text-primary-300">支付宝支付</span>
              </div>
            </div>
          </div>
        </div>

        {/* 信息卡片 */}
        <div className="card p-6 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">项目地址</p>
              <a 
                href="https://github.com/onlyLTY/dockercopilot" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline truncate"
              >
                GitHub
              </a>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">联系方式</p>
              <a 
                href="mailto:onlylty@lty.wiki"
                className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline truncate"
              >
                onlylty@lty.wiki
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}