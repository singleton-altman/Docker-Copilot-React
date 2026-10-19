import React from 'react'
import { 
  Box, 
  HardDrive, 
  LogOut, 
  Menu, 
  X,
  Server,
  Image,
  DatabaseBackup,
  Palette,
  FileCode,
  Info
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { UpdatePrompt } from './UpdatePrompt.jsx'
import { cn } from '../utils/cn.js'
import { LOGO_CONFIG } from '../assets/logo.js'
import { useVersionCheck } from '../hooks/useVersionCheck.js'

export function Sidebar({ activeTab, onTabChange, onLogout, isCollapsed = false, onToggleCollapse }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const [internalCollapsed, setInternalCollapsed] = React.useState(false)
  
  // 时间格式转换函数 - 将UTC时间转换为北京时间
  const formatVersionBuildDate = (dateString) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }
      
      // 转换为北京时间 (UTC+8)
      const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)
      
      return beijingDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
    } catch (error) {
      return dateString
    }
  }
  
  // 使用版本检查 Hook
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

  // 使用外部传入的收起状态，如果没有则使用内部状态
  const sidebarCollapsed = onToggleCollapse ? isCollapsed : internalCollapsed
  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse()
    } else {
      setInternalCollapsed(!internalCollapsed)
    }
  }

  const navItems = [
    {
      id: '#containers',
      label: '容器',
      icon: Server,
    },
    {
      id: '#images',
      label: '镜像',
      icon: Box,
    },    
    {
      id: '#compose',
      label: '编排',
      icon: FileCode,
    },
    {
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#icons',
      label: '图标',
      icon: Palette,
    },    
  ]

  return (
    <>
      {/* 移动端菜单按钮 */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-30 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md"
      >
        <Menu className="h-6 w-6 text-gray-600 dark:text-gray-300" />
      </button>

      {/* 侧边栏遮罩 */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 shadow-lg lg:shadow-none transform transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "w-20" : "w-64",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex flex-col h-full">
          {/* 头部 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className={cn(
              "flex items-center w-full",
              sidebarCollapsed ? "justify-center" : "justify-between"
            )}>
              {/* Logo区域 - 点击可收起/展开 */}
              <button
                onClick={handleToggleCollapse}
                className={cn(
                  "flex items-center hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer group",
                  sidebarCollapsed ? "p-2" : "space-x-3 p-2 -m-2"
                )}
                title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
              >
                <div className="flex-shrink-0">
                  <img 
                    {...LOGO_CONFIG}
                    className="h-10 w-10 rounded-xl object-cover flex-shrink-0 group-hover:scale-105 transition-transform duration-200"
                  />
                </div>
                {!sidebarCollapsed && (
                  <div className="text-left transition-all duration-300">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Docker Copilot</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">容器管理平台</p>
                  </div>
                )}
              </button>

              {/* 移动端关闭按钮 */}
              {!sidebarCollapsed && (
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="lg:hidden p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className={cn("flex-1 py-6", sidebarCollapsed ? "px-2" : "px-4")}>
            <ul className={cn("space-y-1", sidebarCollapsed ? "space-y-8" : "space-y-1")}>
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        onTabChange(item.id)
                        setIsMobileMenuOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-center rounded-xl text-left transition-all duration-200 group",
                        sidebarCollapsed ? "justify-center px-2 py-3" : "space-x-3 px-4 py-4",
                        activeTab === item.id
                          ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className={cn("flex-shrink-0", sidebarCollapsed ? "h-6 w-6" : "h-5 w-5")} />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* 底部 */}
          <div className={cn("border-t border-gray-200 dark:border-gray-700", sidebarCollapsed ? "p-2" : "p-4")}>
            {/* 操作按钮区域 */}
            <div className={cn(
              "flex items-center gap-2",
              sidebarCollapsed ? "flex-col" : "justify-between"
            )}>
              {/* 主题切换按钮 */}
              <div className={cn(
                "flex items-center justify-center",
                sidebarCollapsed ? "w-full" : ""
              )}>
                <ThemeToggle collapsed={sidebarCollapsed} />
              </div>
              
              {/* 退出登录按钮 */}
              <button
                onClick={onLogout}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-all duration-200 group",
                  sidebarCollapsed ? "w-full p-2" : "flex-1"
                )}
                title={sidebarCollapsed ? "退出登录" : ""}
              >
                <LogOut className="h-4 w-4 flex-shrink-0 group-hover:rotate-12 transition-transform duration-200" />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">退出</span>
                )}
              </button>
            </div>
            {!sidebarCollapsed && (
              <div className="mt-4">
                {/* 版本信息卡片 */}
                <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-lg p-3 border border-primary-200 dark:border-primary-700/50">
                  <div className="space-y-2">
                    {/* 后端版本 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">后端</span>
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded cursor-pointer hover:shadow-md transition-all",
                          hasBackendUpdate
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' 
                            : 'bg-white dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        )}
                        onClick={() => checkForUpdates()}
                        title="点击检查更新">
                          {backendVersion || '获取中...'}
                        </span>
                        {hasBackendUpdate && (
                          <button
                            onClick={() => setShowUpdatePrompt(true)}
                            className="text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded animate-pulse hover:bg-yellow-200 dark:hover:bg-yellow-900/40 transition-colors cursor-pointer"
                            title="点击查看更新">
                            更新
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 后端构建时间 */}
                    {buildDate && (
                      <div className="pt-2 border-t border-primary-200 dark:border-primary-700/50">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          构建：{formatVersionBuildDate(buildDate)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

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