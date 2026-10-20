// 字节与速率格式化，用于容器资源指标展示

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '-'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) break
    value /= 1024
    unit = u
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

export function formatRate(bytesPerSec) {
  if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '-'
  if (bytesPerSec < 1) return '0 B/s'
  return `${formatBytes(bytesPerSec)}/s`
}
