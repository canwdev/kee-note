/**
 * 跨标签页的数据库文件独占锁。
 *
 * 同一个 kdbx 文件同时只允许一个标签页打开并写入，
 * 避免两个标签页各自持有旧内容、保存时互相覆盖。
 *
 * 基于 Web Locks API（Chromium/Electron 支持）；
 * 不支持时退化为“不跨标签页加锁”，但单标签页逻辑不受影响。
 */
import type { FileRef } from './file-access'

type LockHandle = {
  name: string
  release: () => void
}

let currentLock: LockHandle | null = null

export const getDatabaseLockName = (fileRef: FileRef) => {
  const identity = fileRef.kind === 'sdk' ? fileRef.path : fileRef.name
  return `kee-note-db:${identity}`
}

export const releaseDatabaseFileLock = () => {
  if (!currentLock) {
    return
  }
  currentLock.release()
  currentLock = null
}

/**
 * 获取当前文件在本 origin 下的独占锁。
 * @returns true 获取成功；false 表示已有其他标签页打开该文件
 */
export async function acquireDatabaseFileLock(fileRef: FileRef): Promise<boolean> {
  const name = getDatabaseLockName(fileRef)
  if (currentLock?.name === name) {
    return true
  }
  releaseDatabaseFileLock()

  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : null
  if (!locks || typeof locks.request !== 'function') {
    // 无法跨标签页协调时保持原有行为
    currentLock = { name, release: () => {} }
    return true
  }

  let releaseHold!: () => void
  const hold = new Promise<void>((resolve) => {
    releaseHold = resolve
  })
  let settle!: (acquired: boolean) => void
  const acquired = new Promise<boolean>((resolve) => {
    settle = resolve
  })

  locks
    .request(name, { mode: 'exclusive', ifAvailable: true }, async (lock: any) => {
      if (!lock) {
        settle(false)
        return
      }
      settle(true)
      // 一直持有到 close / 页面关闭
      await hold
    })
    .catch((e: any) => {
      console.warn('[db-lock] failed to acquire database lock', e)
      settle(false)
    })

  if (!(await acquired)) {
    return false
  }

  currentLock = { name, release: () => releaseHold() }
  return true
}
