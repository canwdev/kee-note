/**
 * 纯浏览器端 KDBX 后端。
 *
 * 完全运行在浏览器中，使用 kdbxweb 读写数据库；
 * 文件优先通过 FileLite SDK 读写，其次回退到 File System Access API，
 * 数据不会离开本机。
 */
import * as kdbxweb from 'kdbxweb'
import type {Kdbx, KdbxEntry, KdbxGroup} from 'kdbxweb'
import type {EntryItem, GroupItem} from '@/enum/kdbx'
import {
  clearActiveHistoryId,
  getActiveHistorySnapshot,
  getSnapshotForFileRef,
  rememberOpenedDatabase,
  updateActiveHistoryKeyFile,
  updateActiveHistorySnapshot,
} from '@/utils/db-history'
import { acquireDatabaseFileLock, getDatabaseLockName, releaseDatabaseFileLock } from './db-lock'
import { beginGlobalLoading, endGlobalLoading, showError } from '@/utils/feedback'
import './argon2'
import {
  isFileSystemAccessSupported,
  onExternalFileOpen,
  pickOpenFile,
  pickSaveFile,
  readFileBytes,
  writeFileBytes,
  type FileRef,
} from './file-access'

export {
  getFileLiteSdk,
  isFileLiteSdkAvailable,
  isFileSystemAccessSupported,
  onExternalFileOpen,
  getExternalFile,
  setFileAccessHooks,
  requestFileRefPermission,
} from './file-access'
export type {
  FileRef,
  FileAccessHooks,
  PickFileOptions,
  PickSaveOptions,
} from './file-access'

/* -------------------------------------------------------------------------- */
/*                                 file access                                */
/* -------------------------------------------------------------------------- */

let dbFileRef: FileRef | null = null
let lastKeyFile: ArrayBuffer | null = null
let hasOpenedDatabase = false

export const setDatabaseFileRef = (ref: FileRef | null) => {
  dbFileRef = ref
}
export const setDatabaseFileHandle = (handle: FileSystemFileHandle | null) => {
  dbFileRef = handle ? {kind: 'handle', handle, name: handle.name} : null
}
export const getDatabaseFileRef = () => dbFileRef
export const getDatabaseFileHandle = () =>
  dbFileRef?.kind === 'handle' ? dbFileRef.handle : null
export const hasDatabaseFileHandle = () => Boolean(dbFileRef)
export const hasDatabaseFile = hasDatabaseFileHandle
export const getDatabaseFileName = () => dbFileRef?.name || ''
export const getDatabaseFilePath = () => {
  if (!dbFileRef) {
    return ''
  }
  return dbFileRef.kind === 'sdk' ? dbFileRef.path : dbFileRef.name
}
export const setLastKeyFile = (buffer: ArrayBuffer | null) => {
  lastKeyFile = buffer
}
export const getLastKeyFile = () => lastKeyFile

/** 打开已存在的 kdbx 文件，记住文件引用用于后续保存 */
export async function pickDatabaseFile(): Promise<FileRef> {
  const ref = await pickOpenFile({
    title: 'Open KeePass Database',
    extensions: ['.kdbx'],
  })
  dbFileRef = ref
  return ref
}

/** 新建 kdbx 文件（选择保存位置），记住文件引用 */
export async function pickDatabaseSaveFile(
  suggestedName = `KeeNote-${new Date().toISOString().slice(0, 10)}.kdbx`,
): Promise<FileRef> {
  const ref = await pickSaveFile({
    title: 'Save KeePass Database',
    extensions: ['.kdbx'],
    defaultName: suggestedName,
  })
  dbFileRef = ref
  return ref
}

/** 选择 key file，返回其二进制内容 */
export async function pickKeyFile(): Promise<{name: string; buffer: ArrayBuffer}> {
  const ref = await pickOpenFile({title: 'Choose key file', writable: false})
  return {name: ref.name, buffer: await readFileBytes(ref)}
}

/** 生成随机 key file，弹出保存对话框写入文件（不自动下载） */
export async function generateKeyFile(filename = 'KeeNote.key'): Promise<{
  name: string
  path: string
  buffer: ArrayBuffer
}> {
  const bytes = await kdbxweb.Credentials.createRandomKeyFile()
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const buffer = copy.buffer

  const ref = await pickSaveFile({
    title: 'Save key file',
    extensions: ['.key'],
    defaultName: filename,
  })
  await writeFileBytes(ref, buffer)

  return {
    name: ref.name,
    path: ref.kind === 'sdk' ? ref.path : ref.name,
    buffer,
  }
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

function getMapValue(obj: any, val: string) {
  return obj instanceof Map ? obj.get(val) : obj?.[val]
}

function getFieldString(entry: KdbxEntry, field: string): string {
  const val = entry.fields.get(field)
  if (!val) {
    return ''
  }
  if (val instanceof kdbxweb.ProtectedValue) {
    return val.getText()
  }
  return val.toString()
}

function setValDot(obj: any, strPath: string, val: any) {
  const path = strPath.split('.')
  let target = obj
  for (let i = 0; i < path.length - 1; i++) {
    target = target[path[i]]
  }
  if (target instanceof Map) {
    target.set(path[path.length - 1], val)
  } else {
    target[path[path.length - 1]] = val
  }
}

function toEntryItem(entry: KdbxEntry, isDetailed = false): EntryItem {
  const item: EntryItem = {
    uuid: entry.uuid.id,
    icon: entry.icon as number,
    title: getMapValue(entry.fields, 'Title') || '',
    groupName: entry.parentGroup?.name || '',
    bgColor: entry.bgColor as string,
    fgColor: entry.fgColor as string,
    creationTime: entry.times.creationTime || new Date(),
    lastModTime: entry.times.lastModTime || new Date(),
  }
  if (isDetailed) {
    item.attachmentNames = Array.from(entry.binaries.keys())
    const fieldsV2: any = {}
    for (const key of entry.fields.keys()) {
      fieldsV2[key] = getFieldString(entry, key)
    }
    item.fieldsV2 = fieldsV2
  }
  return item
}

function traverseGroupTree(groups: KdbxGroup[]): GroupItem[] {
  if (!groups || groups.length === 0) return []
  return groups.map(
    (group) =>
      ({
        uuid: group.uuid.id,
        icon: group.icon,
        title: group.name,
        children: traverseGroupTree(group.groups),
      }) as GroupItem,
  )
}

function binaryToBytes(value: any): Uint8Array {
  if (value instanceof kdbxweb.ProtectedValue) {
    return value.getBinary()
  }
  if (value instanceof Uint8Array) {
    return value
  }
  return new Uint8Array(value)
}

/* -------------------------------------------------------------------------- */
/*                              backend implementation                        */
/* -------------------------------------------------------------------------- */

class BrowserKdbx {
  db: Kdbx | null = null
  isNotSave = false
  private curEntryMap: Record<string, KdbxEntry> = {}
  // kdbxweb 的 save() 会先把数据库写成 XML，加密结束后再清空 xml。
  // 两个保存同时进行时，后完成的那个会看到已被清空的 xml，抛出 InvalidState: no xml。
  // 所有保存严格串行执行。
  private saveQueue: Promise<unknown> = Promise.resolve()

  private enqueueSave<T>(task: () => Promise<T>): Promise<T> {
    const run = this.saveQueue.then(task, task)
    this.saveQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private get fileRef(): FileRef {
    if (!dbFileRef) {
      throw new Error('No database file selected')
    }
    return dbFileRef
  }

  private get isOpen() {
    return Boolean(this.db)
  }

  private getDb(): Kdbx {
    if (!this.db) {
      throw new Error('Database is not open')
    }
    return this.db
  }

  private getEntry(uuid: string): KdbxEntry {
    if (!uuid) {
      throw new Error('uuid is required!')
    }
    const entry = this.curEntryMap[uuid]
    if (!entry) {
      throw new Error(`entry ${uuid} not found in current map (Have you open the entry list?)`)
    }
    return entry
  }

  private async writeDatabase(db: Kdbx): Promise<ArrayBuffer> {
    const fileRef = this.fileRef
    const data = await db.save()
    // 保存前先拷贝一份给历史快照：FileLite 宿主可能以 transfer 方式接收 ArrayBuffer，
    // 写入后原 buffer 会被 detach 或改动，不能再用来更新快照。
    const snapshotData = data.slice(0)
    const lockName = getDatabaseLockName(fileRef)
    await writeFileBytes(fileRef, data)
    // 宿主可能会规范化 FileLite 路径，锁需要跟随真实路径
    if (getDatabaseLockName(fileRef) !== lockName) {
      const acquired = await acquireDatabaseFileLock(fileRef)
      if (!acquired) {
        throw new Error(
          `This database is already open in another tab: ${
            fileRef.kind === 'sdk' ? fileRef.path : fileRef.name
          }`,
        )
      }
    }
    return snapshotData
  }

  private async getRecoverySnapshot(fileRef: FileRef): Promise<ArrayBuffer | null> {
    return (await getActiveHistorySnapshot()) || (await getSnapshotForFileRef(fileRef))
  }

  async open(params: any = {}) {
    // 先等上一次保存写完，避免读到写到一半的文件
    await this.saveQueue
    const fileRef = this.fileRef
    if (!(await acquireDatabaseFileLock(fileRef))) {
      throw new Error(
        `This database is already open in another tab: ${
          fileRef.kind === 'sdk' ? fileRef.path : fileRef.name
        }`,
      )
    }
    try {
      const {password, keyFile, keyFileName} = params
      const keyFileBuffer = keyFile !== undefined ? keyFile : lastKeyFile
      if (keyFileBuffer) {
        lastKeyFile = keyFileBuffer
      }
      const credentials = new kdbxweb.Credentials(
        password ? kdbxweb.ProtectedValue.fromString(String(password)) : null,
        keyFileBuffer || null,
      )
      let buffer: ArrayBuffer
      let readFromFile = false
      let loadedFromSnapshot = false
      try {
        buffer = await readFileBytes(fileRef)
        readFromFile = true
      } catch (e) {
        // 刷新后 handle 可能暂时没有权限，使用上次的加密快照兜底
        const snapshot = await this.getRecoverySnapshot(fileRef)
        if (!snapshot) {
          throw e
        }
        console.warn('[db] failed to read database file, using cached snapshot', e)
        buffer = snapshot
        loadedFromSnapshot = true
      }

      let db: Kdbx
      try {
        db = await kdbxweb.Kdbx.load(buffer, credentials)
      } catch (loadError) {
        // 文件能读到但无法解析（例如被旧版本的并发保存写坏、尾部被截断），
        // 尝试历史中的加密快照；快照是在成功保存后写入的，通常仍然可用。
        const snapshot = loadedFromSnapshot ? null : await this.getRecoverySnapshot(fileRef)
        if (!snapshot) {
          throw loadError
        }
        console.warn('[db] failed to load database file, trying cached snapshot', loadError)
        try {
          db = await kdbxweb.Kdbx.load(snapshot, credentials)
        } catch {
          // 快照也无法用同一凭据解锁时，保留原始文件错误
          throw loadError
        }
        buffer = snapshot
        loadedFromSnapshot = true
      }

      this.db = db
      this.isNotSave = false
      this.curEntryMap = {}
      hasOpenedDatabase = true

      // 文件已损坏但快照可用：立即用快照写回，修复磁盘上的数据库文件
      if (loadedFromSnapshot && readFromFile) {
        try {
          buffer = await this.writeDatabase(db)
          console.info('[db] repaired corrupted database file from cached snapshot')
        } catch (repairError) {
          // 修复失败也不影响本次解锁，但标记为未保存，避免用户以为磁盘文件已正常
          this.isNotSave = true
          console.warn('[db] failed to repair database file', repairError)
        }
      }

      await rememberOpenedDatabase({
        fileRef,
        dbData: buffer,
        keyFile: keyFileBuffer,
        keyFileName,
      })
      return true
    } catch (e) {
      releaseDatabaseFileLock()
      throw e
    }
  }

  async createDatabase(params: any = {}) {
    const fileRef = this.fileRef
    if (!(await acquireDatabaseFileLock(fileRef))) {
      throw new Error(
        `This database is already open in another tab: ${
          fileRef.kind === 'sdk' ? fileRef.path : fileRef.name
        }`,
      )
    }
    try {
      const {password, keyFile, keyFileName, name} = params
      const keyFileBuffer = keyFile !== undefined ? keyFile : lastKeyFile
      if (keyFileBuffer) {
        lastKeyFile = keyFileBuffer
      }
      const credentials = new kdbxweb.Credentials(
        password ? kdbxweb.ProtectedValue.fromString(String(password)) : null,
        keyFileBuffer || null,
      )
      const db = kdbxweb.Kdbx.create(credentials, name || 'My new db')
      const data = await this.writeDatabase(db)
      this.db = db
      this.isNotSave = false
      this.curEntryMap = {}
      hasOpenedDatabase = true
      await rememberOpenedDatabase({
        fileRef,
        dbData: data,
        keyFile: keyFileBuffer,
        keyFileName,
      })
      return true
    } catch (e) {
      releaseDatabaseFileLock()
      throw e
    }
  }

  close() {
    this.db = null
    this.curEntryMap = {}
    this.isNotSave = false
    hasOpenedDatabase = false
    clearActiveHistoryId()
    releaseDatabaseFileLock()
  }

  async save() {
    if (!this.db) {
      throw new Error('Database is not open')
    }
    return this.enqueueSave(async () => {
      const db = this.db
      if (!db) {
        throw new Error('Database is not open')
      }
      const data = await this.writeDatabase(db)
      this.isNotSave = false
      await updateActiveHistorySnapshot(data)
      return true
    })
  }

  async changeCredentials(params: any = {}) {
    const db = this.getDb()
    const {password, keyFile, keyFileName} = params
    let changed = false
    if (password !== undefined && password !== null) {
      await db.credentials.setPassword(kdbxweb.ProtectedValue.fromString(String(password)))
      changed = true
    }
    if (keyFile) {
      await db.credentials.setKeyFile(keyFile)
      lastKeyFile = keyFile
      changed = true
    }
    if (changed) {
      await this.save()
    }
    if (keyFile) {
      await updateActiveHistoryKeyFile(keyFile, keyFileName)
    }
    return true
  }

  async maintenanceDatabase(params: any = {}) {
    const db = this.getDb()
    const {cleanup = false, upgrade = false, setVersion = null} = params
    if (upgrade) {
      db.upgrade()
    } else if (setVersion) {
      db.setVersion(setVersion)
    }
    if (cleanup) {
      db.cleanup({historyRules: true, customIcons: true, binaries: true})
    }
    await this.save()
    return true
  }

  checkDatabaseIsOpen() {
    return this.isOpen
  }

  checkDatabaseIsNotSave() {
    return this.isNotSave
  }

  getMeta() {
    const db = this.getDb()
    const meta: any = db.meta || {}
    const header: any = db.header || {}
    return {
      isNotSave: this.isNotSave,
      header: {
        compression: header.compression,
        crsAlgorithm: header.crsAlgorithm,
        endPos: header.endPos,
        versionMajor: header.versionMajor,
        versionMinor: header.versionMinor,
      },
      dbPath: getDatabaseFilePath(),
      meta: {
        name: meta.name,
        recycleBinEnabled: meta.recycleBinEnabled,
        recycleBinUuid: meta.recycleBinUuid,
      },
    }
  }

  getGroupTree(groupUuid?: string) {
    const db = this.getDb()
    const groups = groupUuid ? [db.getGroup(groupUuid) as KdbxGroup] : db.groups
    return traverseGroupTree(groups.filter(Boolean))
  }

  getGroupEntries(params: any = {}) {
    const db = this.getDb()
    const {groupUuid} = params
    if (!groupUuid) {
      throw new Error('Invalid groupUuid')
    }
    this.curEntryMap = {}
    const group = db.getGroup(groupUuid)
    const list: EntryItem[] = []
    if (group) {
      for (let i = group.entries.length - 1; i >= 0; i--) {
        const entry = group.entries[i]
        this.curEntryMap[entry.uuid.id] = entry
        list.push(toEntryItem(entry))
      }
    }
    return list
  }

  getGroupEntriesDeep(params: any = {}) {
    const db = this.getDb()
    const {groupUuid, isDayMapped, startDate, endDate} = params
    this.curEntryMap = {}
    const group = groupUuid ? db.getGroup(groupUuid) : undefined
    if (!group) {
      throw new Error(`group ${groupUuid} not found`)
    }
    const list: EntryItem[] = []
    const dayMap: any = {}
    const traverse = (node: KdbxGroup) => {
      node.entries.forEach((entry) => {
        const creationTime = entry.times.creationTime || entry.times.lastModTime || new Date()
        if (startDate && creationTime.getTime() < startDate) return
        if (endDate && creationTime.getTime() > endDate) return
        if (isDayMapped) {
          const year = creationTime.getFullYear()
          const month = creationTime.getMonth() + 1
          const date = creationTime.getDate()
          dayMap[year] = dayMap[year] || {}
          dayMap[year][month] = dayMap[year][month] || {}
          dayMap[year][month][date] = dayMap[year][month][date] || []
          dayMap[year][month][date].push(toEntryItem(entry))
        } else {
          list.push(toEntryItem(entry))
        }
        this.curEntryMap[entry.uuid.id] = entry
      })
      node.groups.forEach(traverse)
    }
    traverse(group)
    return isDayMapped ? dayMap : list
  }

  getEntryDetail(params: any = {}) {
    return toEntryItem(this.getEntry(params.uuid), true)
  }

  updateEntry(params: any = {}) {
    const {uuid, updates} = params
    if (!updates) {
      throw new Error('updates is required!')
    }
    const entry = this.getEntry(uuid)
    let isAutoUpdateTime = true
    updates.forEach((obj: any) => {
      let {path, value} = obj
      if (path === 'times.creationTime') {
        value = new Date(value)
      }
      if (path === 'times.lastModTime') {
        value = new Date(value)
        isAutoUpdateTime = false
      }
      // 保持密码字段的加密存储
      if (path === 'fields.Password' && typeof value === 'string') {
        value = kdbxweb.ProtectedValue.fromString(value)
      }
      setValDot(entry, path, value)
    })
    if (isAutoUpdateTime) {
      entry.times.update()
    }
    this.isNotSave = true
    return toEntryItem(entry, true)
  }

  updateGroup(params: any = {}) {
    const db = this.getDb()
    const {uuid, updates} = params
    const group = db.getGroup(uuid)
    if (!group) {
      throw new Error(`group ${uuid} not found`)
    }
    updates.forEach((obj: any) => {
      setValDot(group, obj.path, obj.value)
    })
    this.isNotSave = true
    return {
      uuid: group.uuid.id,
      icon: group.icon,
      title: group.name,
      children: traverseGroupTree(group.groups),
    }
  }

  createEntry(params: any = {}) {
    const db = this.getDb()
    const {groupUuid, config = {}} = params
    if (!groupUuid) {
      throw new Error('groupUuid is required!')
    }
    const group = db.getGroup(groupUuid)
    if (!group) {
      throw new Error(`group ${groupUuid} not found`)
    }
    const {title = 'New Entry', icon, bgColor, fgColor, creationTime, lastModTime} = config
    const entry = db.createEntry(group)
    entry.fields.set('Title', title)
    entry.icon =
      icon === undefined ? (group.icon === 48 || group.icon === 49 ? 44 : group.icon) : icon
    if (bgColor) {
      entry.bgColor = bgColor
    }
    if (fgColor) {
      entry.fgColor = fgColor
    }
    if (creationTime) {
      entry.times.creationTime = new Date(creationTime)
    }
    if (lastModTime) {
      entry.times.lastModTime = new Date(lastModTime)
    }
    this.isNotSave = true
    this.curEntryMap[entry.uuid.id] = entry
    return toEntryItem(entry)
  }

  createGroup(params: any = {}) {
    const db = this.getDb()
    const {groupUuid, name = 'New Group'} = params
    const group = db.getGroup(groupUuid)
    if (!group) {
      throw new Error(`group ${groupUuid} not found`)
    }
    const newGroup = db.createGroup(group, name)
    this.isNotSave = true
    return {
      uuid: newGroup.uuid.id,
      icon: newGroup.icon,
      title: newGroup.name,
      children: [],
    }
  }

  private removeItems(items: any) {
    const db = this.getDb()
    const list = Array.isArray(items) ? items : [items]
    list.forEach((item) => db.remove(item))
    this.isNotSave = true
  }

  private moveItems(params: any = {}) {
    const db = this.getDb()
    const {groupUuid, items} = params
    const list = Array.isArray(items) ? items : [items]
    const target = groupUuid ? db.getGroup(groupUuid) : null
    list.forEach((item) => {
      if (groupUuid && item.uuid.id === groupUuid) {
        throw new Error('Moving to the group itself is not allowed')
      }
      db.move(item, target)
    })
    this.isNotSave = true
  }

  removeGroup(params: any = {}) {
    const db = this.getDb()
    const group = db.getGroup(params.groupUuid)
    if (group) this.removeItems(group)
    return true
  }

  removeEntry(params: any = {}) {
    const {uuid} = params
    const entries = Array.isArray(uuid) ? uuid.map((id: string) => this.getEntry(id)) : this.getEntry(uuid)
    this.removeItems(entries)
    return true
  }

  moveGroup(params: any = {}) {
    const db = this.getDb()
    const {uuid, targetUuid} = params
    const group = db.getGroup(uuid)
    if (!group) throw new Error(`group ${uuid} not found`)
    this.moveItems({groupUuid: targetUuid, items: group})
    return true
  }

  moveEntry(params: any = {}) {
    const {uuid, groupUuid} = params
    const entries = Array.isArray(uuid) ? uuid.map((id: string) => this.getEntry(id)) : this.getEntry(uuid)
    this.moveItems({groupUuid, items: entries})
    return true
  }

  getAttachment(params: any = {}) {
    const {uuid, filename} = params
    const entry = this.getEntry(uuid)
    const binary: any = entry.binaries.get(filename)
    if (!binary) {
      throw new Error('file not found')
    }
    const value = binary && 'value' in binary ? binary.value : binary
    const bytes = binaryToBytes(value)
    return new Blob([bytes as any])
  }

  removeAttachment(params: any = {}) {
    const {uuid, filename} = params
    const entry = this.getEntry(uuid)
    if (!entry.binaries.get(filename)) {
      throw new Error('file not found')
    }
    entry.binaries.delete(filename)
    this.isNotSave = true
    return true
  }

  async uploadAttachment(params: any = {}) {
    const db = this.getDb()
    const {uuid, files = []} = params
    const entry = this.getEntry(uuid)
    for (const file of files) {
      const binary = await db.createBinary(file.buffer)
      entry.binaries.set(file.name, binary)
    }
    this.isNotSave = true
    return true
  }

  renameAttachment(params: any = {}) {
    const {uuid, filename, newFilename} = params
    const entry = this.getEntry(uuid)
    const file = entry.binaries.get(filename)
    if (!file) {
      throw new Error('file not found')
    }
    entry.binaries.set(newFilename, file)
    entry.binaries.delete(filename)
    this.isNotSave = true
    return true
  }

  searchDatabase(params: any = {}) {
    const db = this.getDb()
    const {keyword = '', groupUuid} = params
    const keywordLower = String(keyword).toLowerCase()
    const result: KdbxEntry[] = []
    const traverse = (group: KdbxGroup) => {
      group.entries.forEach((entry) => {
        const title = String(getMapValue(entry.fields, 'Title') || '')
        const notes = getFieldString(entry, 'Notes')
        if (
          title.toLowerCase().includes(keywordLower) ||
          notes.toLowerCase().includes(keywordLower)
        ) {
          result.push(entry)
        }
      })
      group.groups.forEach(traverse)
    }
    const roots = groupUuid ? [db.getGroup(groupUuid)] : db.groups
    roots.filter(Boolean).forEach((group) => traverse(group as KdbxGroup))
    this.curEntryMap = {}
    return result.map((entry) => {
      this.curEntryMap[entry.uuid.id] = entry
      return toEntryItem(entry)
    })
  }
}

const backend = new BrowserKdbx()

// 宿主通过 FileLite SDK 的 onOpen 传入 .kdbx 时，未打开数据库的情况下直接采用它
onExternalFileOpen((ref) => {
  if (!hasOpenedDatabase) {
    dbFileRef = ref
  }
})

export const isDatabaseOpen = () => backend.checkDatabaseIsOpen()

const handlers: Record<string, (params?: any) => any> = {
  'open-database': (params) => backend.open(params),
  'close-database': () => backend.close(),
  'create-database': (params) => backend.createDatabase(params),
  'save-database': () => backend.save(),
  'change-credentials': (params) => backend.changeCredentials(params),
  'maintenance-database': (params) => backend.maintenanceDatabase(params),
  'check-is-open': () => backend.checkDatabaseIsOpen(),
  'check-is-not-save': () => backend.checkDatabaseIsNotSave(),
  'get-meta': () => backend.getMeta(),
  'get-group-tree': (params) => backend.getGroupTree(params?.groupUuid),
  'get-group-entries': (params) => backend.getGroupEntries(params),
  'get-group-entries-deep': (params) => backend.getGroupEntriesDeep(params),
  'get-entry-detail': (params) => backend.getEntryDetail(params),
  'update-entry': (params) => backend.updateEntry(params),
  'update-group': (params) => backend.updateGroup(params),
  'create-entry': (params) => backend.createEntry(params),
  'create-group': (params) => backend.createGroup(params),
  'remove-group': (params) => backend.removeGroup(params),
  'remove-entry': (params) => backend.removeEntry(params),
  'move-group': (params) => backend.moveGroup(params),
  'move-entry': (params) => backend.moveEntry(params),
  'get-attachment': (params) => backend.getAttachment(params),
  'remove-attachment': (params) => backend.removeAttachment(params),
  'upload-attachment': (params) => backend.uploadAttachment(params),
  'rename-attachment': (params) => backend.renameAttachment(params),
  'search-database': (params) => backend.searchDatabase(params),
}

// 这些只是廉价的状态查询，不需要全屏 loading
const noLoadingRoutes = new Set(['check-is-open', 'check-is-not-save'])

const browserService = {
  async post(url: string, params?: any, _options?: any) {
    const handler = handlers[url]
    if (!handler) {
      const error = new Error(`Unsupported browser backend route: ${url}`)
      showError(error)
      throw error
    }
    const withLoading = !noLoadingRoutes.has(url)
    if (withLoading) {
      beginGlobalLoading()
    }
    try {
      return await handler(params)
    } catch (error: any) {
      // 统一在这里提示一次，调用方 catch 里再提示会被去重
      showError(error)
      throw error
    } finally {
      if (withLoading) {
        endGlobalLoading()
      }
    }
  },
  on() {
    /* no-op in browser */
  },
  off() {
    /* no-op in browser */
  },
}

export default browserService
