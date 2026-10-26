// 第四阶段「有依据的部署」：配置指纹的纯逻辑。
// 除 WebCrypto 外不依赖浏览器环境，node --test 可直接覆盖；不做任何网络请求。

/**
 * WebCrypto SHA-256 → hex 小写。
 * 环境不支持 WebCrypto 或计算失败时返回 null，调用方据此隐藏指纹行（降级不报错）。
 */
export async function sha256Hex(text) {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle?.digest) return null
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(String(text)))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** 展示用截断：取前 length 位；空值/非字符串返回空串。 */
export function shortFingerprint(fingerprint, length = 12) {
  if (typeof fingerprint !== 'string' || !fingerprint) return ''
  return fingerprint.slice(0, length)
}

/**
 * 纯函数：任务带指纹且当前缓存的内容哈希与之不同时，判定「部署后文件已修改」。
 * 任一侧缺失（旧服务端没有指纹 / 本环境无法计算）都返回 false，不提示、不伪造结论。
 */
export function fileModifiedAfterDeploy(taskFingerprint, contentHash) {
  if (typeof taskFingerprint !== 'string' || !taskFingerprint) return false
  if (typeof contentHash !== 'string' || !contentHash) return false
  return taskFingerprint.toLowerCase() !== contentHash.toLowerCase()
}
