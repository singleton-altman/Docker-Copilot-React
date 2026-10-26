import React, { useState, useEffect } from 'react'
import { HardDrive, Trash2, RefreshCw, Link, BrushCleaning, X, AlertCircle, CheckCircle } from 'lucide-react'
import { imageAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { getImageLogo } from '../config/imageLogos.js'

// 安全的图片组件
function SafeImage({ src, alt, className, fallback }) {
  const [hasError, setHasError] = React.useState(false)
  
  if (hasError || !src) {
    return fallback
  }
  
  return (
    <img 
      src={src} 
      alt={alt} 
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export function Images() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, image: null })
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部
  const [pruneModal, setPruneModal] = useState({ isOpen: false, type: null, images: [] })
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })

  const fetchImages = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const response = await imageAPI.getImages()
      
      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setImages(response.data.data || [])
      } else {
        const errorMsg = response.data?.msg || '获取镜像列表失败'
        setError(errorMsg)
        setImages([])
      }
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '网络错误，请检查后端服务'
      setError(errorMsg)
      setImages([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchImages()
  }, [])

  const handleDeleteImage = async (imageId, force = false) => {
    try {
      setIsLoading(true)
      setDeleteModal({ isOpen: false, image: null })
      
      await imageAPI.deleteImage(imageId, force)
      
      setSuccessModal({ isOpen: true, message: '镜像删除成功' })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '删除镜像失败'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const handlePrune = async (type) => {
    try {
      setIsLoading(true)
      setError(null)
      
      let imagesToDelete = []
      if (type === 'dangling') {
        imagesToDelete = images.filter(img => img.tag === 'None' || img.tag === '<none>')
      } else if (type === 'unused') {
        imagesToDelete = images.filter(img => !img.inUsed)
      }
      
      if (imagesToDelete.length === 0) {
        setError('没有找到需要清理的镜像')
        setIsLoading(false)
        return
      }
      
      // 批量删除
      const deletePromises = imagesToDelete.map(image => 
        imageAPI.deleteImage(image.id, false)
      )
      
      await Promise.all(deletePromises)
      
      const message = type === 'dangling' 
        ? `成功清理 ${imagesToDelete.length} 个无Tag镜像`
        : `成功清理 ${imagesToDelete.length} 个未使用的镜像`
      
      setSuccessModal({ isOpen: true, message })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '清理镜像失败'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const formatImageSize = (sizeStr) => {
    if (!sizeStr) return '0 MB'
    return sizeStr.replace(/mb/gi, 'MB')
                  .replace(/gb/gi, 'GB')
                  .replace(/kb/gi, 'KB')
  }

  const getSizeColor = (size) => {
    const sizeInMB = parseInt(size)
    if (sizeInMB < 100) return 'text-green-600 dark:text-green-400'
    if (sizeInMB < 300) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  if (isLoading && images.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="card p-6 h-48 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面头部 */}
        <div className="px-4 sm:px-6 py-2 sm:py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">镜像管理</h2>
            <p className="text-gray-600 dark:text-gray-400">查看和管理Docker镜像</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const imagesToDelete = images.filter(img => img.tag === 'None' || img.tag === '<none>')
                setPruneModal({ isOpen: true, type: 'dangling', images: imagesToDelete })
              }}
              disabled={isLoading || images.filter(img => img.tag === 'None' || img.tag === '<none>').length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <BrushCleaning className="h-4 w-4" />
              <span>无Tag</span>
            </button>
            <button
              onClick={() => {
                const imagesToDelete = images.filter(img => !img.inUsed)
                setPruneModal({ isOpen: true, type: 'unused', images: imagesToDelete })
              }}
              disabled={isLoading || images.filter(img => !img.inUsed).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500/10 text-primary-700 dark:text-primary-400 ring-1 ring-inset ring-primary-600/20 dark:ring-primary-400/20 rounded-lg hover:bg-primary-500/20 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <BrushCleaning className="h-4 w-4" />
              <span>未使用</span>
            </button>
            <button
              onClick={fetchImages}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>
      </div>

      {/* 状态消息 */}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-700 dark:text-red-300 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <span className="text-emerald-700 dark:text-emerald-300 text-sm flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 成功弹窗 */}
      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100 hover:scale-105">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-emerald-500"></div>
            
            <div className="p-8 flex flex-col items-center text-center">
              {/* 成功图标容器 - 带脉冲动画 */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 animate-bounceIn" />
                </div>
              </div>
              
              {/* 标题 */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                操作成功
              </h3>
              
              {/* 分隔线 */}
              <div className="w-12 h-1 bg-emerald-500/40 rounded-full mb-4"></div>
              
              {/* 消息内容 */}
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {successModal.message}
              </p>
              
              {/* 按钮 */}
              <button
                onClick={() => setSuccessModal({ isOpen: false, message: '' })}
                className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 shadow-lg"
              >
                完成
              </button>
            </div>
            
            {/* 底部装饰 */}
            <div className="h-0.5 bg-emerald-500/20"></div>
          </div>
        </div>
      )}

      {/* 状态筛选：紧凑分段控件（统计即筛选，替代原大卡片行） */}
      <div className="px-4 sm:px-6 mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
          {[
            { key: null, label: '全部', count: images.length },
            { key: 'used', label: '使用中', count: images.filter(img => img.inUsed).length },
            { key: 'unused', label: '未使用', count: images.filter(img => !img.inUsed).length },
            { key: 'dangling', label: '无Tag', count: images.filter(img => img.tag === 'None' || img.tag === '<none>').length },
          ].map((seg, index) => {
            const active = (filterStatus ?? null) === seg.key
            return (
              <button
                key={seg.key ?? 'all'}
                onClick={() => setFilterStatus(seg.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  index > 0 && 'border-l border-gray-200 dark:border-gray-800',
                  active
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                {seg.label}
                <span className={cn('ml-1 tabular-nums', active ? 'text-primary-200 dark:text-gray-950/60' : 'text-gray-400 dark:text-gray-500')}>
                  {seg.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 筛选提示 */}
      {filterStatus && (
        <div className="px-4 sm:px-6 pb-3 -mt-1">
          <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-1 ring-inset ring-primary-500/30">
            {filterStatus === 'used' && '使用中的镜像'}
            {filterStatus === 'unused' && '未使用的镜像'}
            {filterStatus === 'dangling' && '无Tag的镜像'}
            <button
              onClick={() => setFilterStatus(null)}
              className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-primary-500/20 transition-colors"
              aria-label="清除筛选"
              title="清除筛选"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* 镜像网格 */}
      <div className="px-4 sm:px-6 py-4">
        {images.length === 0 ? (
          <div className="card p-12 text-center rounded-2xl">
            <HardDrive className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">暂无镜像</h3>
            <p className="text-gray-500 dark:text-gray-400">您还没有任何Docker镜像</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {images
              .filter((image) => {
                if (!filterStatus) return true
                if (filterStatus === 'used') return image.inUsed
                if (filterStatus === 'unused') return !image.inUsed
                if (filterStatus === 'dangling') return image.tag === 'None' || image.tag === '<none>'
                return true
              })
              .map((image) => (
              <div key={image.id} className="group card p-4 rounded-2xl hover:shadow-lg transition-all">
                {/* 头部：图标、名字、状态指示器和大小 */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <SafeImage
                      src={getImageLogo(image.name)}
                      alt={image.name}
                      className="h-10 w-10 object-cover"
                      fallback={<HardDrive className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                    />
                  </div>
                  
                  {/* 竖线状态指示器 */}
                  <div className="flex flex-col items-center justify-center h-10">
                    {image.inUsed && (
                      <div className="w-1 h-6 bg-green-500 rounded-full flex-shrink-0" />
                    )}
                    {!image.inUsed && (
                      <div className="w-1 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex-shrink-0" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                      {image.name}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate">{image.tag}</span>
                      <span className={cn("font-semibold flex-shrink-0 whitespace-nowrap", getSizeColor(image.size))}>
                        大小: {formatImageSize(image.size)}
                      </span>
                    </p>
                  </div>

                  {/* 官网跳转按钮 - 始终显示 */}
                  <div className="flex gap-1">
                    <a
                      href={`https://hub.docker.com/r/${image.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded transition-colors active:scale-95"
                      title="在Docker Hub查看"
                    >
                      <Link className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                {/* 镜像信息 */}
                <div className="space-y-2 text-xs mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">ID:</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300 truncate text-xs">
                      {image.id}
                    </span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setDeleteModal({ isOpen: true, image, force: false })}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>删除</span>
                  </button>
                  {image.inUsed && (
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, image, force: true })}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors active:scale-95"
                      title="强制删除正在使用的镜像"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>强制删除</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 批量删除确认弹窗 */}
      {pruneModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-2xl w-full max-h-96 flex flex-col overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-red-500"></div>
            
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-start gap-4">
                <div className="relative h-12 w-12 bg-orange-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-500/20 flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {pruneModal.type === 'dangling' ? '删除无Tag镜像' : '删除未使用的镜像'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    将永久删除 <span className="font-semibold text-orange-600 dark:text-orange-400">{pruneModal.images.length} 个</span> 镜像，此操作不可恢复
                  </p>
                </div>
              </div>
            </div>

            {/* 镜像列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/50 dark:bg-gray-700/20">
              <div className="space-y-2">
                {pruneModal.images.map((img) => (
                  <div key={img.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(img.name)}
                        alt={img.name}
                        className="h-8 w-8 object-cover"
                        fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {img.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {img.tag}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
                      {formatImageSize(img.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex gap-3">
              <button
                onClick={() => setPruneModal({ isOpen: false, type: null, images: [] })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handlePrune(pruneModal.type)
                  setPruneModal({ isOpen: false, type: null, images: [] })
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    删除中...
                  </span>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-red-500"></div>
            
            <div className="p-8 flex flex-col">
              {/* 图标和标题 */}
              <div className="flex items-start gap-4 mb-6">
                <div className="relative h-12 w-12 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0 border border-red-500/20">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {deleteModal.force ? '强制删除镜像' : '删除镜像'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复</p>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="w-full h-px bg-red-500/20 mb-6"></div>

              {/* 消息内容 */}
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {deleteModal.force ? (
                  <>
                    确定要强制删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗？这将删除正在使用的镜像！
                  </>
                ) : (
                  <>
                    确定要删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗？
                  </>
                )}
              </div>

              {/* 按钮组 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, image: null })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteModal.image && handleDeleteImage(deleteModal.image.id, deleteModal.force)}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      删除中
                    </span>
                  ) : (
                    '确认删除'
                  )}
                </button>
              </div>
            </div>
            
            {/* 底部装饰 */}
            <div className="h-0.5 bg-red-500/20"></div>
          </div>
        </div>
      )}
    </div>
  )
}
