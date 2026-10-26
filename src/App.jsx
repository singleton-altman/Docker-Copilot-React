import React, { useState, useEffect } from 'react'
import { Auth } from './components/Auth.jsx'
import { Sidebar, MobileBottomNav } from './components/Header.jsx'
import { Containers } from './components/Containers.jsx'
import { Images } from './components/Images.jsx'
import { Backups } from './components/Backups.jsx'
import { Compose } from './components/Compose.jsx'
import { Icons } from './components/Icons.jsx'
import { About } from './components/About.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cn } from './utils/cn.js'
import { composeAPI } from './api/client.js'
import { createComposeJobsController } from './hooks/composeJobs.js'

// 创建一个全局的QueryClient实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // Memory-only controller belongs to this authenticated session, not the tab.
  const [jobsController, setJobsController] = useState(() => createComposeJobsController(composeAPI))
  const resetComposeSession = () => setJobsController((previous) => {
    previous.stop()
    return createComposeJobsController(composeAPI)
  })
  const [activeTab, setActiveTab] = useState(() => typeof window !== 'undefined' ? window.location.hash || '#containers' : '#containers')
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)

  useEffect(() => {
    // 检查本地存储中是否有token
    const token = localStorage.getItem('docker_copilot_token')
    if (token) {
      setIsAuthenticated(true)
    }
    
    // 监听storage事件，当其他标签页修改localStorage时更新认证状态
    const handleStorageChange = (e) => {
      if (e.key === 'docker_copilot_token') {
        resetComposeSession()
        if (e.newValue) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    
    // 监听自定义事件，用于在本标签页中处理认证状态变化
    const handleAuthChange = (e) => {
      resetComposeSession()
      if (e.detail.authenticated) {
        setIsAuthenticated(true)
      } else {
        setIsAuthenticated(false)
      }
    }
    
    window.addEventListener('authChange', handleAuthChange)

    // 监听窗口大小变化
    const handleResize = () => {
      const width = window.innerWidth
      setWindowWidth(width)
    }
    
    window.addEventListener('resize', handleResize)
    const handleHashChange = () => setActiveTab(window.location.hash || '#containers')
    window.addEventListener('hashchange', handleHashChange)
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('authChange', handleAuthChange)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const handleLogin = () => {
    setIsAuthenticated(true)
    // 触发自定义事件通知其他组件认证状态已更新
    window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: true } }))
  }

  const handleLogout = () => {
    localStorage.removeItem('docker_copilot_token')
    setIsAuthenticated(false)
    // 触发自定义事件通知其他组件认证状态已更新
    window.dispatchEvent(new CustomEvent('authChange', { detail: { authenticated: false } }))
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (window.location.hash !== tab) window.location.hash = tab
  }

  const renderContent = () => {
    switch (activeTab) {
      case '#containers':
        return <Containers />
      case '#images':
        return <Images />
      case '#icons':
        return <Icons />
      case '#backups':
        return <Backups />
      case '#about':
        return <About />
      case '#compose':
        return <Compose jobsController={jobsController} />
      default:
        return <Containers />
    }
  }

  if (!isAuthenticated) {
    return <Auth onLogin={handleLogin} />
  }

  // 顶部导航布局：内容区占满宽度，移动端预留顶栏与底部导航空间
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 transition-colors duration-300 flex flex-col">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        windowWidth={windowWidth}
      />
      <main className="flex-1 w-full">
        <div className={cn(
          'max-w-[1440px] mx-auto px-4 sm:px-6 pt-4 sm:pt-5',
          windowWidth < 768
            ? 'pb-[calc(72px+env(safe-area-inset-bottom))]'
            : 'pb-8'
        )}>
          {renderContent()}
        </div>
      </main>
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        windowWidth={windowWidth}
      />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App