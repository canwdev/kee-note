/**
 * 数据库打开历史（IndexedDB 持久化）。
 *
 * 保存内容：
 * - 加密后的 kdbx 二进制快照（可用于文件权限失效时仍能解锁）
 * - key file 数据与文件名（用于下次打开时自动恢复）
 * - File System Access API 的 FileSystemFileHandle 或 FileLite SDK 的路径
 *   （引用可被结构化克隆，刷新后仍可读写原文件）
 *
 * 注意：不会保存数据库密码。
 * 当 settingsStore.isSaveHistory 为 false 时，本模块不会写入任何历史数据。
 *
 * 元数据与 kdbx 快照分开存放在两个 object store 中，
 * 避免更新“最后打开的 group”等小字段时重写整份数据库。
 */
import { useSettingsStore } from '@/store/settings'
import { toPlainFileRef, type FileRef } from '@/core/file-access'

const DB_NAME = 'kee-note-history'
const DB_VERSION = 2
/** 小体积元数据 */
const META_STORE = 'databases'
/** 加密后的 kdbx 快照 */
const SNAPSHOT_STORE = 'snapshots'

export interface DbHistoryRecord {
  /** 唯一 id（UUID），不与文件名绑定 */
  id: string
  /** 展示用路径 */
  path: string
  /** 文件引用；若浏览器不支持持久化 handle 则为 null */
  fileRef: FileRef | null
  keyFileName?: string
  keyFileData?: ArrayBuffer | null
  /** 加密快照大小 */
  dbSize?: number
  createdAt: number
  lastOpenedAt: number
  lastGroupUuid?: string
}

interface DbSnapshotRecord {
  id: string
  data: ArrayBuffer
  size: number
  updatedAt: number
}

export interface RememberDatabaseOptions {
  fileRef: FileRef
  dbData: ArrayBuffer
  keyFile?: ArrayBuffer | null
  keyFileName?: string
}

let activeHistoryId: string | null = null
let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 所有历史写操作通过 Web Locks 在各标签页之间串行执行，
 * 避免 read-modify-write 互相覆盖；不支持时退化为单标签页队列。
 */
let fallbackWriteQueue: Promise<unknown> = Promise.resolve()

const withHistoryWriteLock = <T>(task: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : null
  if (locks && typeof locks.request === 'function') {
    return locks.request('kee-note-history-write', { mode: 'exclusive' }, task) as Promise<T>
  }
  const result = fallbackWriteQueue.then(task, task)
  fallbackWriteQueue = result.catch(() => {})
  return result
}

export type DbHistoryChange =
  | { type: 'changed' }
  | { type: 'deleted'; id: string }
  | { type: 'cleared' }

const historyListeners = new Set<(change: DbHistoryChange) => void>()
let historyChannel: BroadcastChannel | null = null

const getHistoryChannel = (): BroadcastChannel | null => {
  if (historyChannel || typeof BroadcastChannel === 'undefined') {
    return historyChannel
  }
  historyChannel = new BroadcastChannel('kee-note-history')
  historyChannel.onmessage = (event: MessageEvent) => {
    const change = event.data as DbHistoryChange
    if (!change) {
      return
    }
    if (change.type === 'deleted' && activeHistoryId === change.id) {
      activeHistoryId = null
    } else if (change.type === 'cleared') {
      activeHistoryId = null
    }
    historyListeners.forEach((listener) => {
      try {
        listener(change)
      } catch (e) {
        console.warn('[history] change listener failed', e)
      }
    })
  }
  return historyChannel
}

/** 监听其他标签页导致的 history 变更 */
export function onDbHistoryChanged(listener: (change: DbHistoryChange) => void): () => void {
  getHistoryChannel()
  historyListeners.add(listener)
  return () => {
    historyListeners.delete(listener)
  }
}

const notifyHistoryChanged = (change: DbHistoryChange) => {
  try {
    getHistoryChannel()?.postMessage(change)
  } catch (e) {
    console.warn('[history] failed to broadcast history change', e)
  }
}

const isHistoryEnabled = () => {
  try {
    return Boolean(useSettingsStore().isSaveHistory)
  } catch {
    return false
  }
}

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'))
        return
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        const transaction = request.transaction

        if (!db.objectStoreNames.contains(META_STORE)) {
          const store = db.createObjectStore(META_STORE, { keyPath: 'id' })
          store.createIndex('lastOpenedAt', 'lastOpenedAt')
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' })
        }

        // 从 v1（meta 与 dbData 混存）迁移到 v2
        if (transaction) {
          const metaStore = transaction.objectStore(META_STORE)
          const snapshotStore = transaction.objectStore(SNAPSHOT_STORE)
          const cursorRequest = metaStore.openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) {
              return
            }
            const oldRecord = cursor.value as DbHistoryRecord & {
              dbData?: ArrayBuffer
              name?: string
              dbName?: string
            }
            const {
              dbData,
              name: legacyName,
              dbName: legacyDbName,
              ...meta
            } = oldRecord
            if (dbData) {
              snapshotStore.put({
                id: oldRecord.id,
                data: dbData,
                size: dbData.byteLength || 0,
                updatedAt: oldRecord.lastOpenedAt || Date.now(),
              })
            }
            if (dbData || legacyName !== undefined || legacyDbName !== undefined) {
              cursor.update(meta)
            }
            cursor.continue()
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB is blocked'))
    })
    dbPromise = promise.catch((e) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

const getAllRecords = async (): Promise<DbHistoryRecord[]> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll()
    request.onsuccess = () => resolve((request.result || []) as DbHistoryRecord[])
    request.onerror = () => reject(request.error)
  })
}

const getRecord = async (id: string): Promise<DbHistoryRecord | null> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(id)
    request.onsuccess = () => resolve((request.result as DbHistoryRecord) || null)
    request.onerror = () => reject(request.error)
  })
}

const putRecord = async (record: DbHistoryRecord): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
    try {
      // 不可克隆的对象会同步抛 DataCloneError，此时事务需要显式中止
      transaction.objectStore(META_STORE).put(record)
    } catch (e) {
      try {
        transaction.abort()
      } catch {
        // 事务可能已结束，忽略
      }
      reject(e)
    }
  })
}

const getSnapshot = async (id: string): Promise<DbSnapshotRecord | null> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE).get(id)
    request.onsuccess = () => resolve((request.result as DbSnapshotRecord) || null)
    request.onerror = () => reject(request.error)
  })
}

const putSnapshot = async (id: string, data: ArrayBuffer): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SNAPSHOT_STORE, 'readwrite')
    const snapshot: DbSnapshotRecord = {
      id,
      data,
      size: data.byteLength,
      updatedAt: Date.now(),
    }
    transaction.objectStore(SNAPSHOT_STORE).put(snapshot)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * 写入前把记录整理成可结构化克隆的纯数据：
 * - 解开 Vue 响应式代理（Proxy 无法克隆，会抛 DataCloneError）
 * - 只保留已知字段，避免调用方塞入其它不可克隆的值
 */
const toStorableRecord = (record: DbHistoryRecord): DbHistoryRecord => ({
  id: String(record.id),
  path: String(record.path ?? ''),
  fileRef: toPlainFileRef(record.fileRef),
  keyFileName: record.keyFileName,
  keyFileData: record.keyFileData || null,
  dbSize: record.dbSize,
  createdAt: record.createdAt,
  lastOpenedAt: record.lastOpenedAt,
  lastGroupUuid: record.lastGroupUuid,
})

const isDataCloneError = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return false
  }
  const name = (error as { name?: string }).name
  return name === 'DataCloneError'
}

/**
 * 按“字段重要性”逐级降级的写入候选：
 * 1. 完整记录  2. 去掉 fileRef  3. 去掉 keyFileData  4. 两者都去掉
 * 只有确实无法克隆时才降级，其它错误（如配额不足）原样抛出。
 */
const buildWriteCandidates = (record: DbHistoryRecord): DbHistoryRecord[] => {
  const base = toStorableRecord(record)
  const candidates: DbHistoryRecord[] = [base]
  if (base.fileRef) {
    candidates.push({ ...base, fileRef: null })
  }
  if (base.keyFileData) {
    candidates.push({ ...base, keyFileData: null })
    if (base.fileRef) {
      candidates.push({ ...base, fileRef: null, keyFileData: null })
    }
  }
  return candidates
}

/** 写入元数据；若存在无法结构化克隆的字段则逐个降级，保证至少能记下基本信息 */
const putRecordWithFallback = async (record: DbHistoryRecord): Promise<void> => {
  const candidates = buildWriteCandidates(record)
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    try {
      await putRecord(candidate)
      if (index > 0) {
        console.warn('[history] dropped non-cloneable fields when saving history', {
          fileRef: candidate.fileRef ? 'kept' : 'dropped',
          keyFileData: candidate.keyFileData ? 'kept' : 'dropped',
        })
      }
      return
    } catch (e) {
      if (!isDataCloneError(e) || index === candidates.length - 1) {
        throw e
      }
    }
  }
}

const deleteRecord = async (id: string): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, SNAPSHOT_STORE], 'readwrite')
    transaction.objectStore(META_STORE).delete(id)
    transaction.objectStore(SNAPSHOT_STORE).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const clearRecords = async (): Promise<void> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, SNAPSHOT_STORE], 'readwrite')
    transaction.objectStore(META_STORE).clear()
    transaction.objectStore(SNAPSHOT_STORE).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** 生成历史记录的唯一 id（同一文件复用已有记录，不同文件即使同名也互不覆盖） */
const createHistoryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `db-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** 对同一文件（SDK path 或 handle）复用同一条历史记录 */
const resolveHistoryId = async (fileRef: FileRef): Promise<string> => {
  const records = await getAllRecords()
  if (fileRef.kind === 'sdk') {
    const existing = records.find(
      (record) => record.fileRef?.kind === 'sdk' && record.fileRef.path === fileRef.path,
    )
    return existing?.id || createHistoryId()
  }
  for (const record of records) {
    if (record.fileRef?.kind !== 'handle') {
      continue
    }
    try {
      if (await record.fileRef.handle.isSameEntry(fileRef.handle)) {
        return record.id
      }
    } catch (e) {
      // isSameEntry 可能因为权限问题失败，忽略后继续匹配
    }
  }
  return createHistoryId()
}

/* -------------------------------------------------------------------------- */
/*                                  public api                                */
/* -------------------------------------------------------------------------- */

export const getActiveHistoryId = () => activeHistoryId

export const setActiveHistoryId = (id: string | null) => {
  activeHistoryId = id
}

export const clearActiveHistoryId = () => {
  activeHistoryId = null
}

export async function listDbHistory(): Promise<DbHistoryRecord[]> {
  try {
    const list = await getAllRecords()
    return list.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
  } catch (e) {
    console.warn('[history] failed to list history', e)
    return []
  }
}

export async function getDbHistory(id?: string | null): Promise<DbHistoryRecord | null> {
  if (!id) {
    return null
  }
  try {
    return await getRecord(id)
  } catch (e) {
    console.warn('[history] failed to read history', e)
    return null
  }
}

/** 按文件引用查找历史记录（用于宿主外部打开文件时恢复 key file） */
export async function findDbHistoryByFileRef(
  fileRef: FileRef,
): Promise<DbHistoryRecord | null> {
  try {
    const records = await getAllRecords()
    if (fileRef.kind === 'sdk') {
      return (
        records.find(
          (record) => record.fileRef?.kind === 'sdk' && record.fileRef.path === fileRef.path,
        ) || null
      )
    }
    for (const record of records) {
      if (record.fileRef?.kind !== 'handle') {
        continue
      }
      try {
        if (await record.fileRef.handle.isSameEntry(fileRef.handle)) {
          return record
        }
      } catch (e) {
        // 忽略权限导致的比较失败
      }
    }
    return null
  } catch (e) {
    console.warn('[history] failed to find history by file ref', e)
    return null
  }
}

export async function removeDbHistory(id: string): Promise<void> {
  let removed = false
  await withHistoryWriteLock(async () => {
    try {
      await deleteRecord(id)
      removed = true
      if (activeHistoryId === id) {
        activeHistoryId = null
      }
    } catch (e) {
      console.warn('[history] failed to delete history', e)
    }
  })
  if (removed) {
    notifyHistoryChanged({ type: 'deleted', id })
  }
}

export async function clearDbHistory(): Promise<void> {
  let cleared = false
  await withHistoryWriteLock(async () => {
    try {
      await clearRecords()
      cleared = true
      activeHistoryId = null
    } catch (e) {
      console.warn('[history] failed to clear history', e)
    }
  })
  if (cleared) {
    notifyHistoryChanged({ type: 'cleared' })
  }
}

/** 打开/创建数据库成功后记录历史；关闭历史时不写入任何数据 */
export async function rememberOpenedDatabase(options: RememberDatabaseOptions): Promise<void> {
  if (!isHistoryEnabled()) {
    activeHistoryId = null
    return
  }
  let saved = false
  await withHistoryWriteLock(async () => {
    try {
      const { fileRef, dbData } = options
      const id = await resolveHistoryId(fileRef)
      const existing = await getRecord(id)
      const now = Date.now()
      const keyFileName =
        options.keyFileName !== undefined
          ? options.keyFileName
          : options.keyFile
            ? existing?.keyFileName || ''
            : ''
      const record: DbHistoryRecord = {
        id,
        path: fileRef.kind === 'sdk' ? fileRef.path : fileRef.name,
        fileRef,
        keyFileName,
        keyFileData: options.keyFile || null,
        dbSize: dbData.byteLength,
        createdAt: existing?.createdAt || now,
        lastOpenedAt: now,
        lastGroupUuid: existing?.lastGroupUuid || '',
      }
      await putRecordWithFallback(record)
      await putSnapshot(id, dbData)
      activeHistoryId = id
      saved = true
    } catch (e) {
      console.warn('[history] failed to save history', e)
    }
  })
  if (saved) {
    notifyHistoryChanged({ type: 'changed' })
  }
}

/** 文件读取/解析失败时，用历史里的加密快照兜底解锁 */
export async function getActiveHistorySnapshot(): Promise<ArrayBuffer | null> {
  if (!activeHistoryId) {
    return null
  }
  try {
    const snapshot = await getSnapshot(activeHistoryId)
    return snapshot?.data || null
  } catch (e) {
    console.warn('[history] failed to read database snapshot', e)
    return null
  }
}

/** 按文件引用查找其加密快照，用于手动选文件时也能从历史恢复 */
export async function getSnapshotForFileRef(
  fileRef: FileRef,
): Promise<ArrayBuffer | null> {
  try {
    const record = await findDbHistoryByFileRef(fileRef)
    if (!record) {
      return null
    }
    const snapshot = await getSnapshot(record.id)
    return snapshot?.data || null
  } catch (e) {
    console.warn('[history] failed to read snapshot for file', e)
    return null
  }
}

export async function updateActiveHistorySnapshot(dbData: ArrayBuffer): Promise<void> {
  if (!isHistoryEnabled() || !activeHistoryId) {
    return
  }
  await withHistoryWriteLock(async () => {
    try {
      const id = activeHistoryId
      if (!id) {
        return
      }
      // 记录可能已被其他标签页删除，避免留下孤立 snapshot
      const record = await getRecord(id)
      if (!record) {
        activeHistoryId = null
        return
      }
      await putSnapshot(id, dbData)
      if (record.dbSize !== dbData.byteLength) {
        record.dbSize = dbData.byteLength
        await putRecordWithFallback(record)
      }
    } catch (e) {
      console.warn('[history] failed to update database snapshot', e)
    }
  })
}

export async function updateActiveHistoryKeyFile(
  keyFile: ArrayBuffer | null,
  keyFileName?: string,
): Promise<void> {
  if (!isHistoryEnabled() || !activeHistoryId) {
    return
  }
  let changed = false
  await withHistoryWriteLock(async () => {
    try {
      const id = activeHistoryId
      if (!id) {
        return
      }
      const record = await getRecord(id)
      if (!record) {
        activeHistoryId = null
        return
      }
      record.keyFileData = keyFile
      if (keyFileName !== undefined) {
        record.keyFileName = keyFileName
      }
      await putRecordWithFallback(record)
      changed = true
    } catch (e) {
      console.warn('[history] failed to update key file', e)
    }
  })
  if (changed) {
    notifyHistoryChanged({ type: 'changed' })
  }
}

export async function updateActiveHistoryLastGroup(groupUuid?: string): Promise<void> {
  if (!isHistoryEnabled() || !activeHistoryId || !groupUuid) {
    return
  }
  await withHistoryWriteLock(async () => {
    try {
      const id = activeHistoryId
      if (!id) {
        return
      }
      const record = await getRecord(id)
      if (!record) {
        activeHistoryId = null
        return
      }
      if (record.lastGroupUuid === groupUuid) {
        return
      }
      record.lastGroupUuid = groupUuid
      await putRecordWithFallback(record)
    } catch (e) {
      console.warn('[history] failed to update last group', e)
    }
  })
}
