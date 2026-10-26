import React, { useState } from 'react'
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Upload,
  Clock,
  Calendar,
  Package,
  X,
  Info,
  ScrollText,
  AlertCircle,
  Cpu,
  MemoryStick,
  ArrowDownUp
} from 'lucide-react'
import { containerAPI, progressAPI } from '../api/client.js'
import { ContainerLogsModal } from './ContainerLogs.jsx'
import { cn } from '../utils/cn.js'
import { formatBytes, formatRate } from '../utils/format.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getImageLogo } from '../config/imageLogos.js'
import icons8Img from '../assets/icons8.png'

// 格式化运行时间为中文
function formatRunningTime(runningTime) {
  if (!runningTime) return '未知'
  
  // 如果已经是中文格式，直接返回
  if (runningTime.includes('小时') || runningTime.includes('分钟') || runningTime.includes('秒')) {
    return runningTime
  }
  
  // 尝试解析英文格式
  // 支持格式: "2h 30m", "2 hours 30 minutes", "30m", "30 minutes", "1 day 2h 30m" 等
  let hours = 0
  let minutes = 0
  let days = 0
  
  // 提取天数
  const dayMatch = runningTime.match(/(\d+)\s*(?:day|d)/)
  if (dayMatch) {
    days = parseInt(dayMatch[1])
  }
  
  // 提取小时
  const hourMatch = runningTime.match(/(\d+)\s*(?:hour|h)/)
  if (hourMatch) {
    hours = parseInt(hourMatch[1])
  }
  
  // 提取分钟
  const minMatch = runningTime.match(/(\d+)\s*(?:minute|min|m)/)
  if (minMatch) {
    minutes = parseInt(minMatch[1])
  }
  
  // 构建中文输出
  let result = ''
  if (days > 0) {
    result += `${days}天 `
  }
  if (hours > 0) {
    result += `${hours}小时 `
  }
  if (minutes > 0 || (days === 0 && hours === 0)) {
    result += `${minutes}分钟`
  }
  
  return result.trim()
}

export function Containers() {
  const queryClient = useQueryClient()
  const [selectedContainer, setSelectedContainer] = useState(null)
  // 添加批量操作相关的状态
  const [selectedContainers, setSelectedContainers] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  // 添加操作状态跟踪
  const [containerActions, setContainerActions] = useState({}) // 跟踪每个容器的操作状态
  const [updateTasks, setUpdateTasks] = useState({}) // 跟踪更新任务
  // 添加筛选状态
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部

  // 自定义确认弹窗状态
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    type: 'info' // info, warning, danger
  })



  // 使用React Query获取容器列表
  const { data: containers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await containerAPI.getContainers()
      if (response.data.code === 200 || response.data.code === 0) {
        console.log('容器数据:', response.data.data)
        return response.data.data || []
      } else {
        throw new Error(response.data.msg)
      }
    },
    refetchInterval: 10000, // 每10秒自动刷新一次
    // 失败时保留上一次的数据，避免列表突然清空
    keepPreviousData: true,
  })

  // 容器资源指标（CPU/内存/网络）。服务端 v2.2.0 起提供；
  // 请求失败（如老服务端无此接口）时停止轮询并降级为不展示。
  const { data: statsById = {} } = useQuery({
    queryKey: ['containerStats'],
    queryFn: async () => {
      const response = await containerAPI.getContainerStats()
      if (response.data.code !== 0) {
        throw new Error(response.data.msg)
      }
      const map = {}
      for (const stats of response.data.data || []) {
        map[stats.id] = stats
      }
      return map
    },
    refetchInterval: (query) => (query.state.error ? false : 5000),
    retry: false,
    staleTime: 4000,
  })

  const handleContainerAction = async (containerId, action) => {
    try {
      // 设置操作状态为加载中
      setContainerActions(prev => ({
        ...prev,
        [containerId]: { action, loading: true }
      }))
      
      switch (action) {
        case 'start':
          await containerAPI.startContainer(containerId)
          break
        case 'stop':
          await containerAPI.stopContainer(containerId)
          break
        case 'restart':
          await containerAPI.restartContainer(containerId)
          break
        default:
          break
      }

      // 立即更新本地状态，提供即时反馈
      queryClient.setQueryData(['containers'], (oldData) => {
        if (!oldData) return oldData

        return oldData.map(container => {
          if (container.id === containerId) {
            let newStatus = container.status
            switch (action) {
              case 'start':
                newStatus = 'running'
                break
              case 'stop':
                newStatus = 'stopped'
                break
              case 'restart':
                newStatus = 'running'
                break
              default:
                break
            }
            return { ...container, status: newStatus }
          }
          return container
        })
      })

      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 延迟刷新以获取最新数据
      setTimeout(() => {
        refetch()
      }, 1500)

    } catch (error) {
      console.error('操作失败:', error)
      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      
      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`操作超时，请稍后手动刷新页面查看操作结果`)
      } else {
        console.error(`操作失败: ${error.response?.data?.msg || error.message}`)
      }
    }
  }

  // 批量操作处理函数
  const handleBatchAction = async (action) => {
    try {
      // 为所有选中的容器设置加载状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => ({
          ...prev,
          [containerId]: { action, loading: true }
        }))
      })
      
      // 立即更新本地状态提供即时反馈
      if (action === 'start' || action === 'stop' || action === 'restart') {
        queryClient.setQueryData(['containers'], (oldData) => {
          if (!oldData) return oldData
          
          return oldData.map(container => {
            if (selectedContainers.includes(container.id)) {
              let newStatus = container.status
              switch (action) {
                case 'start':
                  newStatus = 'running'
                  break
                case 'stop':
                  newStatus = 'stopped'
                  break
                case 'restart':
                  newStatus = 'running'
                  break
                default:
                  break
              }
              return { ...container, status: newStatus }
            }
            return container
          })
        })
      }
      
      // 对每个选中的容器执行操作
      for (const containerId of selectedContainers) {
        try {
          const container = containers.find(c => c.id === containerId)
          
          switch (action) {
            case 'start':
              await containerAPI.startContainer(containerId)
              break
            case 'stop':
              await containerAPI.stopContainer(containerId)
              break
            case 'restart':
              await containerAPI.restartContainer(containerId)
              break
            case 'update':
              if (container) {
                const response = await containerAPI.updateContainer(
                  containerId,
                  container.name,
                  container.usingImage,
                  true
                )
                
                if (response.data.code === 200 || response.data.code === 0) {
                  const taskID = response.data.data?.taskID
                  if (taskID) {
                    // 保存任务ID并开始轮询进度
                    setUpdateTasks(prev => ({
                      ...prev,
                      [containerId]: taskID
                    }))
                    // 调用轮询进度函数
                    pollProgress(containerId, taskID)
                  }
                }
              }
              break
            default:
              break
          }
        } finally {
          // 对于非更新操作，立即清除操作状态
          if (action !== 'update') {
            setContainerActions(prev => {
              const newState = { ...prev }
              delete newState[containerId]
              return newState
            })
          }
        }
      }

      // 如果不是更新操作，延迟刷新以获取最新数据
      if (action !== 'update') {
        setTimeout(() => {
          refetch()
        }, 1500)
      }
      
      // 清除选中状态
      setSelectedContainers([])
      setIsBatchMode(false)
    } catch (error) {
      console.error('批量操作失败:', error)
      // 清除所有操作状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => {
          const newState = { ...prev }
          delete newState[containerId]
          return newState
        })
      })
      
      // 使用自定义弹窗显示错误信息
      setConfirmModal({
        isOpen: true,
        title: '操作失败',
        message: '批量操作失败: ' + (error.response?.data?.msg || error.message || '未知错误'),
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      });
    }
  }

  const handleRenameContainer = async (containerId, newName) => {
    try {
      const response = await containerAPI.renameContainer(containerId, newName)
      if (response.data.code === 200 || response.data.code === 0) {
        await refetch()
        console.log('重命名成功')
      }
    } catch (error) {
      console.error('重命名容器失败:', error)
      console.error(`重命名失败: ${error.response?.data?.msg || error.message}`)
    }
  }

  const handleUpdateContainer = async (containerId) => {
    try {
      const container = containers.find(c => c.id === containerId)
      if (!container) {
        console.error('容器未找到')
        return
      }

      console.log(`开始更新容器 "${container.name}"，使用镜像: ${container.usingImage}`)

      setContainerActions(prev => ({
        ...prev,
        [containerId]: { action: 'update', loading: true, progress: '正在准备更新...', percentage: 0 }
      }))

      // 注意参数顺序: id, containerName, imageNameAndTag, delOldContainer
      const response = await containerAPI.updateContainer(
        containerId,
        container.name,
        container.usingImage,
        true
      )

      console.log('更新容器响应:', response.data)

      if (response.data.code === 200 || response.data.code === 0) {
        const taskID = response.data.data?.taskID

        if (taskID) {
          console.log('开始轮询进度, taskID:', taskID)
          // 保存任务ID并开始轮询进度
          setUpdateTasks(prev => ({
            ...prev,
            [containerId]: taskID
          }))

          pollProgress(containerId, taskID)
        } else {
          // 如果没有返回taskID,说明更新可能立即完成
          setContainerActions(prev => {
            const newState = { ...prev }
            delete newState[containerId]
            return newState
          })
          await refetch()

        }
      } else {
        throw new Error(response.data.msg || '更新失败')
      }
    } catch (error) {
      console.error('更新容器失败:', error)
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      
      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
        // 即使超时也触发轮询，因为操作可能仍在进行中
        // 这里我们不知道taskID，所以无法启动轮询，只能提示用户稍后查看
      } else {
        // 针对名称冲突提供特定的解决方案
        let errorMessage = error.response?.data?.msg || error.message;
        if (errorMessage.includes('重命名') || errorMessage.includes('name conflict') || errorMessage.includes('名称冲突')) {
          errorMessage += '\n\n检测到容器名称冲突问题，建议解决方案：\n' +
                         '1. 手动删除或重命名冲突的容器\n' +
                         '2. 使用不同的容器名称进行更新\n' +
                         '3. 先停止并重命名当前容器，再进行更新操作';
        }
        
        // 使用自定义弹窗显示错误信息
        setConfirmModal({
          isOpen: true,
          title: '更新失败',
          message: errorMessage,
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        });
      }
    }
  }


  // 中断更新：下载阶段直接停止（容器未改动）；已改过容器则自动恢复原状
  const handleCancelUpdate = (containerName) => {
    setConfirmModal({
      isOpen: true,
      title: '中断更新',
      message: `确定中断 ${containerName} 的更新吗？下载中的镜像会立即停止拉取；若容器已被改动，会自动恢复到更新前的状态。`,
      confirmText: '中断',
      type: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }))
        try {
          const response = await containerAPI.cancelUpdate(containerName)
          if (response.data.code !== 0) {
            throw new Error(response.data.msg)
          }
          setConfirmModal({
            isOpen: true,
            title: '已请求中断',
            message: response.data.msg || '镜像拉取已停止，容器保持原状',
            onConfirm: () => setConfirmModal({ isOpen: false }),
            type: 'info'
          })
          queryClient.invalidateQueries(['containerUpdates'])
          setTimeout(() => refetch(), 3000)
        } catch (error) {
          setConfirmModal({
            isOpen: true,
            title: '中断失败',
            message: error.message || '未知错误',
            onConfirm: () => setConfirmModal({ isOpen: false }),
            type: 'danger'
          })
        }
      },
      onCancel: () => setConfirmModal({ isOpen: false })
    })
  }

  // 轮询进度
  const pollProgress = async (containerId, taskID) => {
    const maxAttempts = 60 // 最多轮询60次 (2分钟)
    let attempts = 0
    let pollTimer = null

    const clearPollState = () => {
      if (pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      setUpdateTasks(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
    }

    const poll = async () => {
      try {
        attempts++
        const response = await progressAPI.getProgress(taskID)
        console.log(`进度查询[${attempts}/${maxAttempts}]:`, response.data)

        const data = response.data

        // 提取进度信息
        let progressMsg = '处理中...'
        let percentage = 0

        if (data.data?.progress) {
          progressMsg = data.data.progress
        } else if (data.data?.message) {
          progressMsg = data.data.message
        } else if (data.msg) {
          progressMsg = data.msg
        }

        // 提取百分比
        if (data.data?.percentage !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percentage)))
        } else if (data.data?.percent !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percent)))
        } else {
          // 尝试从进度消息中提取百分比
          const percentMatch = progressMsg.match(/(\d+(?:\.\d+)?)\s*%/)
          if (percentMatch) {
            percentage = Math.min(100, Math.max(0, parseFloat(percentMatch[1])))
          } else {
            // 根据轮询次数估算进度
            percentage = Math.min(95, (attempts / maxAttempts) * 100)
          }
        }

        // 检查是否结束 - 服务端的 isDone 是权威信号（成功/失败/被中断都会置位）
        const isDone = data.data?.isDone === true
        const status = data.data?.status || data.status
        const isFailed = status === 'failed' ||
                        status === 'error' ||
                        (isDone && (progressMsg.includes('失败') || progressMsg.includes('错误'))) ||
                        progressMsg.includes('失败') ||
                        progressMsg.includes('错误') ||
                        data.code === 500 ||
                        data.code === 400
        const isCompleted = isDone && !isFailed ||
                          status === 'completed' ||
                          status === 'success' ||
                          status === 'done' ||
                          status === 'finish' ||
                          status === 'finished' ||
                          progressMsg.includes('完成') ||
                          progressMsg.includes('成功') ||
                          (data.code === 200 && (data.msg === 'success' || data.msg === '操作成功' || data.msg === '更新成功'))

        if (isCompleted) {
          // 任务完成 - 立即停止轮询
          console.log('容器更新完成，停止轮询')
          clearPollState()
          await refetch()
          console.log('✅ 容器更新完成!')
          return // 确保不再继续执行
        }

        if (isFailed) {
          // 任务失败 - 立即停止轮询
          console.log('容器更新失败，停止轮询')
          clearPollState()
          // 添加更详细的错误信息
          const errorMsg = data.data?.error || data.data?.message || data.msg || '更新失败'
          console.error(`❌ 更新失败: ${errorMsg}`)
          
          return // 确保不再继续执行
        }

        // 更新容器操作状态，显示进度
        setContainerActions(prev => ({
          ...prev,
          [containerId]: { 
            action: 'update', 
            loading: true,
            progress: progressMsg,
            percentage: percentage
          }
        }))

        // 继续轮询
        if (attempts < maxAttempts) {
          pollTimer = setTimeout(poll, 2000) // 2秒后再次查询
        } else {
          clearPollState()
          console.error('⏱️ 更新超时，请检查容器状态')

        }
      } catch (error) {
        console.error('查询进度失败:', error)
        clearPollState()
        console.error(`❌ 更新失败: ${error.response?.data?.msg || error.message}`)
        // 显示网络错误或其他异常情况的友好提示
        
      }
    }

    // 开始轮询
    poll()
  }

  // 容器选择处理函数
  const toggleContainerSelection = (containerId) => {
    if (selectedContainers.includes(containerId)) {
      setSelectedContainers(selectedContainers.filter(id => id !== containerId))
    } else {
      setSelectedContainers([...selectedContainers, containerId])
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedContainers.length === containers.length) {
      setSelectedContainers([])
    } else {
      setSelectedContainers(containers.map(container => container.id))
    }
  }

  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }
    
    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取状态颜色（用于小圆点）
  const getStatusColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }
    
    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bounceArrow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
      
      {/* 自定义确认弹窗 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {confirmModal.title}
              </h3>
              <button 
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-600 dark:text-gray-400">
                {confirmModal.message}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end space-x-3">
              <button
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                }}
                className={cn(
                  "btn-primary",
                  confirmModal.type === 'danger' && "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                )}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 页面标题和操作 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">容器管理</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            管理您的Docker容器，包括启动、停止、重启等操作
          </p>
        </div>
        
        {/* 批量操作按钮区域 */}
        {!isBatchMode ? (
          <div className="flex items-center space-x-3">
            <button 
              className="btn-secondary"
              onClick={() => setIsBatchMode(true)}
            >
              批量操作
            </button>

            <button 
              className="btn-primary"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button 
              className="btn-secondary px-3 sm:px-4 py-2"
              onClick={toggleSelectAll}
              title={selectedContainers.length === containers.length ? '取消全选' : '全选'}
            >
              <span className="hidden sm:inline">
                {selectedContainers.length === containers.length ? '取消全选' : '全选'}
              </span>
              <span className="sm:hidden text-sm font-semibold">
                {selectedContainers.length}/{containers.length}
              </span>
            </button>
            <button 
              className={`btn-primary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('start')}
              title="启动"
            >
              <Play className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">启动</span>
            </button>
            <button 
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('stop')}
              title="停止"
            >
              <Square className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">停止</span>
            </button>
            <button 
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('restart')}
              title="重启"
            >
              <RotateCcw className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">重启</span>
            </button>
            <button 
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('update')}
              title="更新"
            >
              <Upload className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">更新</span>
            </button>
            <button 
              className="btn-danger px-3 sm:px-4 py-2"
              onClick={() => {
                setSelectedContainers([])
                setIsBatchMode(false)
              }}
            >
              <span className="hidden sm:inline">取消</span>
              <span className="sm:hidden">✕</span>
            </button>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterStatus(null)}
          className={cn(
            "card p-4 sm:p-6 rounded-2xl text-left transition-all duration-200 cursor-pointer hover:shadow-lg",
            filterStatus === null ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/10" : ""
          )}
        >
          <div className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
            {containers.length}
          </div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">总容器数</div>
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'running' ? null : 'running')}
          className={cn(
            "card p-4 sm:p-6 rounded-2xl text-left transition-all duration-200 cursor-pointer hover:shadow-lg",
            filterStatus === 'running' ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/10" : ""
          )}
        >
          <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
            {containers.filter(c => c.status === 'running').length}
          </div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">运行中</div>
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'stopped' ? null : 'stopped')}
          className={cn(
            "card p-4 sm:p-6 rounded-2xl text-left transition-all duration-200 cursor-pointer hover:shadow-lg",
            filterStatus === 'stopped' ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/10" : ""
          )}
        >
          <div className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
            {containers.filter(c => c.status && c.status.toLowerCase() !== 'running').length}
          </div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">已停止</div>
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'update' ? null : 'update')}
          className={cn(
            "card p-4 sm:p-6 rounded-2xl text-left transition-all duration-200 cursor-pointer hover:shadow-lg",
            filterStatus === 'update' ? "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/10" : ""
          )}
        >
          <div className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-2">
            {containers.filter(c => c.haveUpdate).length}
          </div>
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">有更新</div>
        </button>
      </div>

      {/* 容器列表 */}
      <div className="px-4 sm:px-6 py-4">
        {(filterStatus || selectedContainers.length > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-1 ring-inset ring-primary-500/30">
                {filterStatus === 'running' && '运行中'}
                {filterStatus === 'stopped' && '已停止'}
                {filterStatus === 'update' && '有更新'}
                <button
                  onClick={() => { setFilterStatus(null); setIsBatchMode(false) }}
                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-primary-500/20 transition-colors"
                  aria-label="清除筛选"
                  title="清除筛选"
                >
                  ×
                </button>
              </span>
            )}
            {selectedContainers.length > 0 && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-600 dark:text-gray-300 ring-1 ring-inset ring-gray-500/30">
                已选 {selectedContainers.length} 个 · Ctrl/Cmd+点击可切换
              </span>
            )}
            {filterStatus && (
              <button
                onClick={() => {
                  const filteredContainers = containers.filter((container) => {
                    if (filterStatus === 'running') return container.status && container.status.toLowerCase() === 'running'
                    if (filterStatus === 'stopped') return container.status && container.status.toLowerCase() !== 'running'
                    if (filterStatus === 'update') return container.haveUpdate
                    return true
                  })
                  setSelectedContainers(filteredContainers.map(c => c.id))
                  setIsBatchMode(true)
                }}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-500/10 hover:bg-gray-500/20 rounded-full transition-colors"
              >
                全选结果
              </button>
            )}
          </div>
        )}

        {containers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {containers
              .filter((container) => {
                if (!filterStatus) return true
                if (filterStatus === 'running') return container.status && container.status.toLowerCase() === 'running'
                if (filterStatus === 'stopped') return container.status && container.status.toLowerCase() !== 'running'
                if (filterStatus === 'update') return container.haveUpdate
                return true
              })
              .map((container) => {
              const isSelected = selectedContainers.includes(container.id)
              return (
                <div key={container.id} className="group">
                  {/* 容器卡片 - 简化设计，点击调起详情 */}
                  <div 
                    onClick={(e) => {
                      // 如果启用批量模式，点击选择；否则打开详情
                      if (e.metaKey || e.ctrlKey || isBatchMode) {
                        e.stopPropagation()
                        toggleContainerSelection(container.id)
                      } else {
                        setSelectedContainer(container)
                      }
                    }}
                    className={cn(
                      "card relative overflow-hidden transition-all duration-200 hover:shadow-lg border rounded-2xl p-4 cursor-pointer active:scale-98",
                      isSelected
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md"
                        : "border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-600"
                    )}
                  >
                    {/* 背景进度条 */}
                    {containerActions[container.id]?.loading && containerActions[container.id]?.action === 'update' && (
                      <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden">
                        <div 
                          className="absolute top-0 left-0 bottom-0 bg-primary-500/30 transition-all duration-500 ease-out"
                          style={{
                            width: `${containerActions[container.id].percentage || 0}%`
                          }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
                               style={{
                                 backgroundSize: '200% 100%',
                                 animation: 'shimmer 2s infinite linear'
                               }} />
                        </div>
                      </div>
                    )}

                    <div className="relative z-10 flex items-center gap-2.5">
                      {/* 图标 */}
                      <div className="flex-shrink-0">
                        {(() => {
                          let iconUrl = container.iconUrl;
                          if (!iconUrl && container.usingImage) {
                            const builtInLogo = getImageLogo(container.usingImage);
                            if (builtInLogo) {
                              iconUrl = builtInLogo;
                            } else {
                              const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
                              for (const [imageName, logoUrl] of Object.entries(imageLogos)) {
                                if (container.usingImage.startsWith(imageName) || 
                                    container.usingImage.includes(`${imageName}:`)) {
                                  iconUrl = logoUrl;
                                  break;
                                }
                              }
                            }
                          }
                         
                          if (iconUrl) {
                            return (
                              <img 
                                src={iconUrl} 
                                alt={container.name} 
                                className="h-9 w-9 rounded-lg object-cover shadow-sm flex-shrink-0"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = `
                                    <div class="h-9 w-9 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-white">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                      </svg>
                                    </div>
                                  `;
                                }}
                              />
                            );
                          } else {
                            return (
                              <div className="h-9 w-9 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
                                <Package className="h-6 w-6 text-white" />
                              </div>
                            );
                          }
                        })()}
                      </div>

                      {/* 状态指示器（放在图标和信息之间） */}
                      <div className="flex-shrink-0 flex items-center">
                        <div className={cn(
                          "w-1 h-8 rounded-full",
                          getStatusIndicatorColor(container.status)
                        )} />
                      </div>

                      {/* 容器信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center">
                              <h3 className="font-semibold text-gray-900 dark:text-white truncate text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                {container.name}
                              </h3>
                              {container.haveUpdate && (
                                <span className="ml-2 inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 rounded-full bg-yellow-500 animate-pulse shadow-md flex-shrink-0" title="有新版本可更新">
                                  <img 
                                    src={icons8Img} 
                                    alt="更新" 
                                    className="h-4 w-4 flex-shrink-0"
                                    style={{ 
                                      animation: 'bounceArrow 1.5s ease-in-out infinite',
                                      filter: 'invert(1) hue-rotate(180deg) saturate(3)'
                                    }}
                                  />
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              {container.usingImage}
                            </p>
                          </div>
                        </div>

                        {/* 统一高度的信息行 - 显示运行时间或状态 */}
                        <div className="h-5 mt-1">
                          {containerActions[container.id]?.loading && containerActions[container.id]?.progress ? (
                            <p className="text-xs text-primary-600 dark:text-primary-400 truncate flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin flex-shrink-0" />
                              <span>{containerActions[container.id].progress}</span>
                            </p>
                          ) : container.status === 'running' ? (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              运行: {formatRunningTime(container.runningTime)}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              状态: 已停止
                            </div>
                          )}
                        </div>

                        {/* 资源指标行：CPU / 内存 / 网络（仅 running 且服务端支持时显示） */}
                        {container.status === 'running' && statsById[container.id] && (() => {
                          const stats = statsById[container.id]
                          return (
                            <div className="mt-2 flex items-center gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                              <span
                                className="flex items-center gap-1 shrink-0"
                                title={`CPU 占用 ${stats.cpuPercent.toFixed(2)}%`}
                              >
                                <Cpu className="h-3 w-3 text-primary-500 flex-shrink-0" />
                                <span className="font-medium tabular-nums">
                                  {stats.cpuPercent.toFixed(1)}%
                                </span>
                              </span>
                              <span
                                className="flex items-center gap-1 shrink-0"
                                title={`内存 ${formatBytes(stats.memoryUsage)} / ${formatBytes(stats.memoryLimit)}（${stats.memoryPercent.toFixed(1)}%）`}
                              >
                                <MemoryStick className="h-3 w-3 text-primary-500 flex-shrink-0" />
                                <span className="font-medium tabular-nums">
                                  {formatBytes(stats.memoryUsage)}
                                </span>
                              </span>
                              <span
                                className="flex items-center gap-1 min-w-0"
                                title={`网络 ↓${formatRate(stats.netRxRate)} ↑${formatRate(stats.netTxRate)}（累计 ↓${formatBytes(stats.netRx)} ↑${formatBytes(stats.netTx)}）`}
                              >
                                <ArrowDownUp className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                <span className="font-medium tabular-nums truncate">
                                  ↓{formatRate(stats.netRxRate)}
                                </span>
                              </span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>

                  {/* 操作按钮栏：卡片底部操作条（容器归属卡片内部，不再游离） */}
                  {!isBatchMode && (
                    <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-800/80 flex gap-1.5">
                      {containerActions[container.id]?.loading ? (
                        <div className="flex-1 flex items-center justify-center space-x-2 px-2 py-1 bg-primary-500/10 rounded-md">
                          <RefreshCw className="h-4 w-4 animate-spin text-primary-600 dark:text-primary-400" />
                          <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                            {containerActions[container.id].action === 'start' && '启动中'}
                            {containerActions[container.id].action === 'stop' && '停止中'}
                            {containerActions[container.id].action === 'restart' && '重启中'}
                            {containerActions[container.id].action === 'update' && `更新中${containerActions[container.id].percentage ? ` ${Math.round(containerActions[container.id].percentage)}%` : ''}`}
                          </span>
                          {containerActions[container.id].action === 'update' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelUpdate(container.name) }}
                              className="ml-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                              title="中断更新"
                            >
                              中断
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {container.status === 'running' ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'stop') }}
                                className="flex-1 py-1 rounded-md text-xs font-medium text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 whitespace-nowrap transition-colors"
                                title="停止"
                              >
                                停止
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'restart') }}
                                className="flex-1 py-1 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-500/10 hover:bg-gray-500/20 whitespace-nowrap transition-colors"
                                title="重启"
                              >
                                重启
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'start') }}
                              className="flex-1 py-1 rounded-md text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 whitespace-nowrap transition-colors"
                              title="启动"
                            >
                              启动
                            </button>
                          )}

                          <button
                            onClick={(e) => { e.stopPropagation(); handleUpdateContainer(container.id) }}
                            className={cn(
                              "flex-1 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                              container.haveUpdate
                                ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                                : "text-primary-600 dark:text-primary-400 bg-primary-500/10 hover:bg-primary-500/20"
                            )}
                            title="更新"
                          >
                            更新
                          </button>

                        </>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              无法加载容器列表
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')
                ? '请求超时，服务器响应较慢'
                : error?.response?.data?.msg || error?.message || '未知错误'}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              重试
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无容器</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              当前没有运行中的Docker容器
            </p>
          </div>
        )}
      </div>
      
      {/* 容器详情弹窗 */}
      {selectedContainer && (
        <ContainerDetailModal 
          container={selectedContainer} 
          onClose={() => setSelectedContainer(null)}
          onRename={handleRenameContainer}
          onUpdate={handleUpdateContainer}
          onAction={handleContainerAction}
        />
      )}
    </div>
  )
}

// 容器详情弹窗组件
function ContainerDetailModal({ container, onClose, onRename, onUpdate, onAction }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(container.name)
  const [imageNameAndTag, setImageNameAndTag] = useState(container.usingImage)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isActionProcessing, setIsActionProcessing] = useState(false)
  const [currentAction, setCurrentAction] = useState('')
  const [currentContainer, setCurrentContainer] = useState(container)
  const [showLogs, setShowLogs] = useState(false)

  // 当容器切换时，更新表单字段的值
  React.useEffect(() => {
    setName(container.name)
    setImageNameAndTag(container.usingImage)
    setCurrentContainer(container)
  }, [container])

  // 实时更新容器状态
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await containerAPI.getContainers();
        if (response.data.code === 0) {
          const containers = response.data.data;
          const updatedContainer = containers.find(c => c.id === container.id);
          if (updatedContainer) {
            // 检查是否有镜像图标
            const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
            
            // 如果容器没有自定义图标，则查找镜像图标
            if (!updatedContainer.iconUrl) {
              // 使用完整的镜像名称和标签进行匹配
              const imageFullName = updatedContainer.usingImage;
              
              // 首先尝试精确匹配（包含tag）
              if (imageLogos[imageFullName]) {
                updatedContainer.iconUrl = imageLogos[imageFullName];
              } else {
                // 如果精确匹配失败，尝试镜像名称匹配（不包含tag部分）
                const imageName = updatedContainer.usingImage.split(':')[0];
                
                // 遍历所有镜像图标，查找匹配的镜像名称
                for (const [imageId, logoUrl] of Object.entries(imageLogos)) {
                  // 检查镜像名称是否匹配（不包含tag部分）
                  const logoImageName = imageId.split(':')[0];
                  if (imageName === logoImageName) {
                    updatedContainer.iconUrl = logoUrl;
                    break;
                  }
                }
              }
            }
            
            setCurrentContainer(updatedContainer);
          }
        }
      } catch (error) {
        console.error('获取容器状态失败:', error);
      }
    }, 3000); // 每3秒获取一次最新状态

    return () => clearInterval(interval);
  }, [container.id]);

  const handleContainerAction = async (action) => {
    try {
      setIsActionProcessing(true);
      setCurrentAction(action);
      
      // 调用传入的onAction函数执行实际操作
      if (action === 'update') {
        await onUpdate(container.id);
      } else {
        await onAction(container.id, action);
      }
      
      // 无效化查询以触发重新获取数据
      await queryClient.invalidateQueries(['containers'])
      
      setIsActionProcessing(false);
      setCurrentAction('');
    } catch (error) {
      console.error('操作失败:', error);
      setIsActionProcessing(false);
      setCurrentAction('');
    }
  };

  const handleRename = async () => {
    if (name !== currentContainer.name) {
      try {
        setIsRenaming(true)
        console.log(`重命名容器: ${currentContainer.name} -> ${name}`)

        await onRename(container.id, name)

        // 无效化查询以触发重新获取数据
        await queryClient.invalidateQueries(['containers'])

        // 更新当前容器状态
        setCurrentContainer({ ...currentContainer, name: name })
        // 同时更新表单中的名称
        setName(name);

        console.log('✅ 容器重命名成功')
        setIsRenaming(false)
      } catch (error) {
        console.error('重命名失败:', error)
        setIsRenaming(false)
      }
    }
  }

  const handleSave = async () => {
    // 如果镜像tag发生变化，则更新容器
    if (imageNameAndTag !== currentContainer.usingImage) {
      try {
        setIsUpdating(true)

        console.log(`开始更新容器镜像: ${currentContainer.name}`)
        console.log(`原镜像: ${currentContainer.usingImage}`)
        console.log(`新镜像: ${imageNameAndTag}`)

        // 直接调用API更新容器
        const response = await containerAPI.updateContainer(
          container.id,
          container.name,
          imageNameAndTag,
          true // 删除旧容器
        )

        console.log('更新容器响应:', response.data)

        if (response.data.code === 200 || response.data.code === 0) {
          const taskID = response.data.data?.taskID

          if (taskID) {
            // 如果返回了taskID，我们需要触发进度轮询
            console.log('更新任务已创建，taskID:', taskID)
            
            // 关闭弹窗
            onClose()
            
            // 触发父组件中的进度轮询
            onUpdate(container.id)
            
            console.log('✅ 容器更新任务已启动，请在列表中查看进度')
          } else {
            // 没有taskID，更新完成
            await queryClient.invalidateQueries(['containers'])
            setImageNameAndTag(imageNameAndTag) // 更新本地状态
            console.log('✅ 容器镜像更新完成')
          }
        } else {
          throw new Error(response.data.msg || '更新失败')
        }

        setIsUpdating(false)
      } catch (error) {
        console.error('更新容器镜像失败:', error)
        // 增加超时错误的处理
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
          // 即使超时也关闭弹窗并触发轮询，因为操作可能仍在进行中
          onClose()
          onUpdate(container.id)
        }
        setIsUpdating(false)
      }
    }
  }





  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }
    
    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取容器图标 - 与列表显示逻辑一致
  const getContainerIcon = () => {
    let iconUrl = currentContainer.iconUrl;

    // 如果容器没有自定义图标，则查找镜像图标
    if (!iconUrl && currentContainer.usingImage) {
      // 优先使用内置logo配置（不依赖localStorage）
      const builtInLogo = getImageLogo(currentContainer.usingImage);
      if (builtInLogo) {
        iconUrl = builtInLogo;
      } else {
        // 如果没有内置logo，则尝试从用户自定义中查找
        const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
        for (const [imageName, logoUrl] of Object.entries(imageLogos)) {
          if (currentContainer.usingImage.startsWith(imageName) || 
              currentContainer.usingImage.includes(`${imageName}:`)) {
            iconUrl = logoUrl;
            break;
          }
        }
      }
    }

    // 根据图标URL显示相应内容
    if (iconUrl) {
      return (
        <img 
          src={iconUrl} 
          alt={currentContainer.name} 
          className="h-12 w-12 rounded-xl object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            const parent = e.target.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="h-12 w-12 bg-primary-600 rounded-xl flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-white">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
              `;
            }
          }}
        />
      );
    } else {
      return (
        <div className="h-12 w-12 bg-primary-600 rounded-xl flex items-center justify-center">
          <Package className="h-6 w-6 text-white" />
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden">
        {/* 弹窗头部 */}
        <div className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">容器详情</h3>
              <div className="flex items-center mt-1">
                {getContainerIcon()}
                {/* 状态指示器竖线 */}
                <div className="flex flex-col items-center justify-center h-full ml-3">
                  <div className={cn(
                    "w-1 h-8 rounded-full",
                    getStatusIndicatorColor(currentContainer.status)
                  )}></div>
                </div>
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {currentContainer.name}
                  </span>
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {currentContainer.id.substring(0, 12)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowLogs(true)}
                title="查看日志"
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <ScrollText className="h-4 w-4" />
              </button>
              <button 
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        
        {/* 弹窗内容 */}
        <div className="px-6 py-4 space-y-4">
          {/* 资源指标（仅 running 且服务端支持时显示） */}
          <ContainerStatsSection containerId={container.id} isRunning={currentContainer.status === 'running'} />

          {/* 容器名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              容器名称
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input flex-1"
                placeholder="输入容器名称"
              />
              <button
                onClick={handleRename}
                disabled={isRenaming || (name === currentContainer.name) || isActionProcessing || isUpdating}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  isRenaming || (name === currentContainer.name)
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                }`}
              >
                {isRenaming ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    重命名中
                  </>
                ) : '重命名'}
              </button>
            </div>
          </div>
          
          {/* 镜像信息 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              镜像名称和标签
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={imageNameAndTag}
                onChange={(e) => setImageNameAndTag(e.target.value)}
                className="input flex-1"
                placeholder="例如: nginx:latest"
                disabled={isActionProcessing || isUpdating}
              />
              <button
                onClick={handleSave}
                disabled={isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()}
                className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center ${
                  isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                }`}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    更新中
                  </>
                ) : (
                  '更换镜像'
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              修改镜像后点击"更换镜像"按钮将重新创建容器
            </p>
          </div>
        </div>
        
        {/* 弹窗底部操作按钮 */}
        <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-between gap-2">
            <button
              onClick={onClose}
              disabled={isActionProcessing || isUpdating}
              className="btn-secondary px-4 py-2 hidden sm:inline-block"
            >
              关闭
            </button>
            
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                onClick={() => onUpdate(container.id)}
                disabled={isActionProcessing || isUpdating}
                className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${
                  isActionProcessing && currentAction === 'update'
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                }`}
                title="更新"
              >
                {isActionProcessing && currentAction === 'update' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span className="hidden sm:inline">更新中</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">更新</span>
                  </>
                )}
              </button>
              
              {currentContainer.status === 'running' ? (
                <>
                  <button 
                    onClick={() => handleContainerAction('stop')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${
                      isActionProcessing && currentAction === 'stop'
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                    }`}
                    title="停止"
                  >
                    {isActionProcessing && currentAction === 'stop' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="hidden sm:inline">停止中</span>
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden sm:inline">停止</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => handleContainerAction('restart')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${
                      isActionProcessing && currentAction === 'restart'
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                        : 'bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600'
                    }`}
                    title="重启"
                  >
                    {isActionProcessing && currentAction === 'restart' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span className="hidden sm:inline">重启中</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 flex-shrink-0" />
                        <span className="hidden sm:inline">重启</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => handleContainerAction('start')}
                  disabled={isActionProcessing || isUpdating}
                  className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${
                    isActionProcessing && currentAction === 'start'
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
                  }`}
                  title="启动"
                >
                  {isActionProcessing && currentAction === 'start' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                      <span className="hidden sm:inline">启动中</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 flex-shrink-0" />
                      <span className="hidden sm:inline">启动</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              disabled={isActionProcessing || isUpdating}
              className="btn-secondary px-4 py-2 sm:hidden flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* 日志弹窗叠在上层 */}
      {showLogs && (
        <ContainerLogsModal
          container={currentContainer}
          onClose={() => setShowLogs(false)}
        />
      )}
    </div>
  )
}

// 容器资源指标区块（详情弹窗）：自行轮询 stats 接口。
// 老服务端没有该接口（404）时 available 置 false 并停止轮询，整块隐藏。
function ContainerStatsSection({ containerId, isRunning }) {
  const [stats, setStats] = useState(null)
  const [available, setAvailable] = useState(true)

  React.useEffect(() => {
    if (!isRunning) return undefined
    let interval = null
    const fetchStats = async () => {
      try {
        const response = await containerAPI.getContainerStats()
        if (response.data.code !== 0) {
          setAvailable(false)
          clearInterval(interval)
          return
        }
        setStats((response.data.data || []).find((s) => s.id === containerId) || null)
      } catch {
        setAvailable(false)
        clearInterval(interval)
      }
    }
    fetchStats()
    interval = setInterval(fetchStats, 5000)
    return () => clearInterval(interval)
  }, [containerId, isRunning])

  if (!isRunning || !available || !stats) return null

  const memPercent = Math.min(100, Math.max(0, stats.memoryPercent))
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        资源占用
      </label>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
        {/* CPU */}
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Cpu className="h-3.5 w-3.5 text-primary-500" /> CPU
          </span>
          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
            {stats.cpuPercent.toFixed(2)}%
          </span>
        </div>
        {/* 内存 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <MemoryStick className="h-3.5 w-3.5 text-primary-500" /> 内存
            </span>
            <span className="font-medium text-gray-900 dark:text-white tabular-nums">
              {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}（{stats.memoryPercent.toFixed(1)}%）
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                memPercent > 80 ? "bg-red-500" : memPercent > 50 ? "bg-yellow-500" : "bg-primary-500"
              )}
              style={{ width: `${Math.max(memPercent, 1)}%` }}
            />
          </div>
        </div>
        {/* 网络 */}
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <ArrowDownUp className="h-3.5 w-3.5 text-emerald-500" /> 网络
          </span>
          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
            ↓{formatRate(stats.netRxRate)} ↑{formatRate(stats.netTxRate)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>累计收发</span>
          <span className="tabular-nums">↓{formatBytes(stats.netRx)} ↑{formatBytes(stats.netTx)}</span>
        </div>
        {/* 磁盘 IO 与进程数 */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
          <span className="text-gray-400 dark:text-gray-500">磁盘 IO（累计读写）</span>
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">
            {formatBytes(stats.blockRead)} / {formatBytes(stats.blockWrite)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400 dark:text-gray-500">进程数</span>
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">{stats.pids}</span>
        </div>
      </div>
    </div>
  )
}