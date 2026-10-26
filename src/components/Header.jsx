import React from 'react'
import {
  Box,
  LogOut,
  Server,
  DatabaseBackup,
  Palette,
  FileCode,
  Info,
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { UpdatePrompt } from './UpdatePrompt.jsx'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/DockerCopilot-logo.png'
import { useVersionCheck } from '../hooks/useVersionCheck.js'

const navItems = [
  { id: '#containers', label: '容器', icon: Server },
  { id: '#images', label: '镜像', icon: Box },
  { id: '#compose', label: '编排', icon: FileCode },
  { id: '#backups', label: '备份', icon: DatabaseBackup },
  { id: '#icons', label: '图标', icon: Palette },
  { id: '#about', label: '关于', icon: Info },
]

// 顶部导航栏：桌面端横排导航，移动端为紧凑顶栏（导航由底部栏承担）。
export function Sidebar({ activeTab, onTabChange, onLogout, windowWidth = 1024 }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)

  const {
    showUpdatePrompt,
    setShowUpdatePrompt,
    backendVersion,
    remoteVersion,
    buildDate,
    hasBackendUpdate,
    updateBackend,
    checkForUpdates
  } = useVersionCheck()

  return (
    <>
      {windowWidth < 768 ? (
        <>
          {/* 移动端紧凑顶栏 */}
          <div className="fixed top-0 left-0 right-0 h-14 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-3 z-40">
            <button
              onClick={() => onTabChange('#about')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity active:scale-95 rounded-lg"
              title="关于"
            >
              <img src={logoImg} alt="Docker Copilot" className="h-7 w-7 rounded-lg object-cover" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">Docker Copilot</span>
              <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500">{backendVersion || 'v1.0'}</span>
            </button>
            <div className="flex items-center gap-1">
              {hasBackendUpdate && (
                <button
                  onClick={() => setShowUpdatePrompt(true)}
                  className="px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg transition-colors"
                  title="有新版本可更新"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block mr-1"></span>
                  新版本
                </button>
              )}
              <ThemeToggle collapsed={false} />
              <button
                onClick={onLogout}
                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95"
                title="退出登录"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="h-14" />

          {/* 移动端遮罩与抽屉（保留ABOUT等无底部导航入口的可达性） */}
          {isMobileMenuOpen && (
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />
          )}
        </>
      ) : (
        <>
          {/* 桌面端顶部导航栏 */}
          <header className="sticky top-0 z-40 h-14 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center gap-3">
              {/* 品牌 */}
              <div className="flex items-center gap-2.5 shrink-0">
                <img src={logoImg} alt="Docker Copilot" className="h-8 w-8 rounded-lg object-cover" />
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">Docker Copilot</span>
                  <span className="text-xs font-mono text-primary-600 dark:text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded">
                    {backendVersion || 'v1.0'}
                  </span>
                </div>
              </div>

              {/* 横排导航 */}
              <nav className="flex-1 flex items-center justify-center gap-1 min-w-0">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 whitespace-nowrap',
                        isActive
                          ? 'bg-primary-500/10 text-primary-700 dark:text-primary-400 font-semibold'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-500/10'
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                    </button>
                  )
                })}
              </nav>

              {/* 右侧操作 */}
              <div className="flex items-center gap-1 shrink-0">
                {hasBackendUpdate && (
                  <button
                    onClick={() => setShowUpdatePrompt(true)}
                    className="px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition-colors whitespace-nowrap"
                    title="有新版本可更新"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block mr-1"></span>
                    新版本
                  </button>
                )}
                <ThemeToggle collapsed={false} />
                <button
                  onClick={onLogout}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95"
                  title="退出登录"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          {/* 顶部导航为 sticky 占位于文档流，无需额外占位符 */}
        </>
      )}

      {/* 版本更新提示弹窗 */}
      <UpdatePrompt
        isVisible={showUpdatePrompt}
        onClose={() => setShowUpdatePrompt(false)}
        backendVersion={backendVersion}
        remoteVersion={remoteVersion}
        hasBackendUpdate={hasBackendUpdate}
        onUpdateBackend={updateBackend}
      />
    </>
  )
}

// 手机底部导航栏组件
export function MobileBottomNav({ activeTab, onTabChange, windowWidth = 1024 }) {
  return (
    <>
      {windowWidth < 768 && (
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-40">
        <div className="flex items-center justify-around h-16 px-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 active:scale-95 flex-1 min-w-0 min-h-[64px]",
                  isActive
                    ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
                title={item.label}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="text-[11px] font-medium truncate max-w-full">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
      )}
    </>
  )
}
