import test from 'node:test'
import assert from 'node:assert/strict'
import { fileModifiedAfterDeploy, sha256Hex, shortFingerprint } from '../src/utils/fingerprint.js'

test('sha256Hex computes lowercase hex via WebCrypto', async () => {
  if (!globalThis.crypto?.subtle?.digest) return // 无 WebCrypto 的环境由下面的降级用例覆盖
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(await sha256Hex('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  const hex = await sha256Hex('services:\n  app:\n    image: nginx\n')
  assert.equal(hex, hex.toLowerCase())
  assert.equal(hex.length, 64)
})

test('sha256Hex degrades to null (hide the line) when WebCrypto is unavailable or fails', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const tryRestore = (value) => {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor)
    else Object.defineProperty(globalThis, 'crypto', { configurable: true, value })
  }
  const original = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
  try {
    assert.equal(await sha256Hex('hello'), null)
    Object.defineProperty(globalThis, 'crypto', { configurable: true,
      value: { subtle: { digest: async () => { throw new Error('boom') } } } })
    assert.equal(await sha256Hex('hello'), null)
  } finally {
    tryRestore(original)
  }
})

test('fileModifiedAfterDeploy pure comparison: same / different / missing fingerprint', () => {
  const a = 'a'.repeat(64)
  const b = 'b'.repeat(64)
  assert.equal(fileModifiedAfterDeploy(a, a), false)
  assert.equal(fileModifiedAfterDeploy(a, b), true)
  // 缺指纹（旧服务端）或本环境算不出哈希时不提示
  assert.equal(fileModifiedAfterDeploy(undefined, b), false)
  assert.equal(fileModifiedAfterDeploy('', b), false)
  assert.equal(fileModifiedAfterDeploy(a, null), false)
  assert.equal(fileModifiedAfterDeploy(a, ''), false)
  // 大小写不敏感（服务端 hex 小写，客户端同样小写，但比较不因大小写误报）
  assert.equal(fileModifiedAfterDeploy(a.toUpperCase(), a), false)
  assert.equal(fileModifiedAfterDeploy(a.slice(0, -1) + 'b', a), true)
})

test('shortFingerprint truncates for display and tolerates missing values', () => {
  assert.equal(shortFingerprint('a1b2c3d4e5f6' + '0'.repeat(52)), 'a1b2c3d4e5f6')
  assert.equal(shortFingerprint('a1b2c3d4e5f6' + '0'.repeat(52), 16), 'a1b2c3d4e5f6' + '0000')
  assert.equal(shortFingerprint('abc'), 'abc')
  assert.equal(shortFingerprint(''), '')
  assert.equal(shortFingerprint(null), '')
  assert.equal(shortFingerprint(undefined, 4), '')
  assert.equal(shortFingerprint(123), '')
})
