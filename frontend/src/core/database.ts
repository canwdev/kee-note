/**
 * 前端内存数据库。
 *
 * kdbx 由 kdbxweb 解析后以对象形式常驻内存，所有增删改查都直接操作该对象，
 * 不再经过任何“后端路由”转发。只有打开 / 保存（以 FileLite SDK 或
 * File System Access API 读写磁盘文件）才需要全局 loading 与跨标签页文件锁。
 *
 * 所有修改立即写入内存并标记为未保存，由用户通过全局保存按钮 / Ctrl+S 手动落盘。
 */
import * as kdbxweb from 'kdbxweb'
import type { Kdbx, KdbxEntry, KdbxGroup } from 'kdbxweb'
import type { EntryItem, GroupItem } from '@/enum/kdbx'
import { useKeeStore } from '@/store/kee-store'
import { beginGlobalLoading, endGlobalLoading } from '@/utils/feedback'
import {
  clearActiveHistoryId,
  getActiveHistorySnapshot,
  getSnapshotForFileRef,
  rememberOpenedDatabase,
  updateActiveHistoryKeyFile,
  updateActiveHistorySnapshot,
} from '@/utils/db-history'
import { acquireDatabaseFileLock, getDatabaseLockName, releaseDatabaseFileLock } from './db-lock'
import {
  onExternalFileOpen,
  pickOpenFile,
  pickSaveFile,
  readFileBytes,
  toPlainFileRef,
  writeFileBytes,
  type FileRef,
} from './file-access'
import './argon2'

export type { FileRef } from './file-access'

export interface OpenDatabaseParams {
  password?: string
  keyFile?: ArrayBuffer | null
  keyFileName?: string
}

export interface CreateDatabaseParams extends OpenDatabaseParams {
  name?: string
}

export interface CreateEntryConfig {
  title?: string
  icon?: number
  bgColor?: string
  fgColor?: string
  creationTime?: Date | number
  lastModTime?: Date | number
}

export interface GroupEntriesDeepParams {
  groupUuid: string
  isDayMapped?: boolean
  startDate?: number
  endDate?: number
}

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

const getMapValue = (obj: any, key: string) =>
  obj instanceof Map ? obj.get(key) : obj?.[key]

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
    const fieldsV2: Record<string, string> = {}
    for (const key of entry.fields.keys()) {
      fieldsV2[key] = getFieldString(entry, key)
    }
    item.fieldsV2 = fieldsV2 as EntryItem['fieldsV2']
  }
  return item
}

function traverseGroupTree(groups: KdbxGroup[]): GroupItem[] {
  return groups.map((group) => ({
    uuid: group.uuid.id,
    icon: group.icon as number,
    title: group.name || '',
    children: traverseGroupTree(group.groups),
  }))
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

const toDate = (value: Date | number) => (value instanceof Date ? value : new Date(value))

/* -------------------------------------------------------------------------- */
/*                                 database                                   */
/* -------------------------------------------------------------------------- */

class KdbxDatabase {
  private db: Kdbx | null = null
  private fileRef: FileRef | null = null
  private lastKeyFile: ArrayBuffer | null = null
  private entryIndex: Map<string, KdbxEntry> | null = null

  /** kdbxweb 保存时会复用并清空 xml，多次保存必须严格串行 */
  private saveQueue: Promise<unknown> = Promise.resolve()
  private savePromise: Promise<boolean> | null = null

  /* ------------------------------ reactive state ---------------------------- */

  private setDirty(dirty: boolean) {
    try {
      useKeeStore().isDirty = dirty
    } catch {
      // pinia 尚未初始化（例如模块加载阶段），忽略即可
    }
  }

  private setOpened(opened: boolean) {
    try {
      const store = useKeeStore()
      store.isDbOpened = opened
      if (!opened) {
        store.dbInfo = null
      }
    } catch {
      // 同上
    }
  }

  private markDirty() {
    this.setDirty(true)
  }

  get isOpen() {
    return Boolean(this.db)
  }

  /* --------------------------------- file ---------------------------------- */

  setFileRef(ref: FileRef | null) {
    // 调用方可能传入 Vue 响应式代理（例如从历史列表里取出的 fileRef），
    // 这里统一转成原始对象，避免后续持久化时抛 DataCloneError
    this.fileRef = toPlainFileRef(ref)
  }

  getFileRef(): FileRef | null {
    return this.fileRef
  }

  hasFile() {
    return Boolean(this.fileRef)
  }

  getFileName() {
    return this.fileRef?.name || ''
  }

  getFilePath() {
    if (!this.fileRef) {
      return ''
    }
    return this.fileRef.kind === 'sdk' ? this.fileRef.path : this.fileRef.name
  }

  setLastKeyFile(buffer: ArrayBuffer | null) {
    this.lastKeyFile = buffer
  }

  /** 选择已存在的 kdbx 文件 */
  async chooseFile(): Promise<FileRef> {
    this.fileRef = await pickOpenFile({
      title: 'Open KeePass Database',
      extensions: ['.kdbx'],
    })
    return this.fileRef
  }

  /** 选择新建 kdbx 的保存位置 */
  async chooseSaveFile(
    suggestedName = `KeeNote-${new Date().toISOString().slice(0, 10)}.kdbx`,
  ): Promise<FileRef> {
    this.fileRef = await pickSaveFile({
      title: 'Save KeePass Database',
      extensions: ['.kdbx'],
      defaultName: suggestedName,
    })
    return this.fileRef
  }

  /** 选择 key file 并读取内容 */
  async chooseKeyFile(): Promise<{ name: string; buffer: ArrayBuffer }> {
    const ref = await pickOpenFile({ title: 'Choose key file', writable: false })
    const buffer = await readFileBytes(ref)
    this.lastKeyFile = buffer
    return { name: ref.name, buffer }
  }

  /** 生成随机 key file 并写入用户选择的位置 */
  async generateKeyFile(
    filename = 'KeeNote.key',
  ): Promise<{ name: string; path: string; buffer: ArrayBuffer }> {
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
    this.lastKeyFile = buffer

    return {
      name: ref.name,
      path: ref.kind === 'sdk' ? ref.path : ref.name,
      buffer,
    }
  }

  /* -------------------------------- lifecycle ------------------------------- */

  private getDb(): Kdbx {
    if (!this.db) {
      throw new Error('Database is not open')
    }
    return this.db
  }

  private get requiredFile(): FileRef {
    if (!this.fileRef) {
      throw new Error('No database file selected')
    }
    return this.fileRef
  }

  private async enqueueSave<T>(task: () => Promise<T>): Promise<T> {
    const run = this.saveQueue.then(task, task)
    this.saveQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async withLoading<T>(task: () => Promise<T>): Promise<T> {
    beginGlobalLoading()
    try {
      return await task()
    } finally {
      endGlobalLoading()
    }
  }

  /** 写入磁盘文件，返回一份用于历史快照的副本 */
  private async writeDatabase(db: Kdbx): Promise<ArrayBuffer> {
    const fileRef = this.requiredFile
    const data = await db.save()
    // FileLite 宿主可能以 transfer 方式接收 buffer，写入后原 buffer 会失效
    const snapshotData = data.slice(0)
    const lockName = getDatabaseLockName(fileRef)
    await writeFileBytes(fileRef, data)
    // 宿主可能会规范化 FileLite 路径，锁需要跟随真实路径
    if (getDatabaseLockName(fileRef) !== lockName) {
      const acquired = await acquireDatabaseFileLock(fileRef)
      if (!acquired) {
        throw new Error(`This database is already open in another tab: ${this.getFilePath()}`)
      }
    }
    return snapshotData
  }

  private createCredentials(params: OpenDatabaseParams) {
    const keyFileBuffer = params.keyFile !== undefined ? params.keyFile : this.lastKeyFile
    if (keyFileBuffer) {
      this.lastKeyFile = keyFileBuffer
    }
    return {
      keyFileBuffer,
      credentials: new kdbxweb.Credentials(
        params.password ? kdbxweb.ProtectedValue.fromString(String(params.password)) : null,
        keyFileBuffer || null,
      ),
    }
  }

  private async acquireFileLock() {
    const fileRef = this.requiredFile
    if (!(await acquireDatabaseFileLock(fileRef))) {
      throw new Error(`This database is already open in another tab: ${this.getFilePath()}`)
    }
  }

  private async getRecoverySnapshot(fileRef: FileRef): Promise<ArrayBuffer | null> {
    return (await getActiveHistorySnapshot()) || (await getSnapshotForFileRef(fileRef))
  }

  async open(params: OpenDatabaseParams = {}): Promise<boolean> {
    // 先等上一次保存写完，避免读到写到一半的文件
    await this.saveQueue
    return this.withLoading(async () => {
      const fileRef = this.requiredFile
      await this.acquireFileLock()
      try {
        const { keyFileBuffer, credentials } = this.createCredentials(params)
        const { keyFileName } = params

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
          // 文件能读到但无法解析时，尝试历史中的加密快照
          const snapshot = loadedFromSnapshot ? null : await this.getRecoverySnapshot(fileRef)
          if (!snapshot) {
            throw loadError
          }
          console.warn('[db] failed to load database file, trying cached snapshot', loadError)
          try {
            db = await kdbxweb.Kdbx.load(snapshot, credentials)
          } catch {
            throw loadError
          }
          buffer = snapshot
          loadedFromSnapshot = true
        }

        this.db = db
        this.entryIndex = null
        this.setOpened(true)
        this.setDirty(false)

        // 文件已损坏但快照可用：立即用快照写回，修复磁盘上的数据库文件
        if (loadedFromSnapshot && readFromFile) {
          try {
            buffer = await this.writeDatabase(db)
            console.info('[db] repaired corrupted database file from cached snapshot')
          } catch (repairError) {
            this.markDirty()
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
        this.db = null
        this.entryIndex = null
        this.setOpened(false)
        this.setDirty(false)
        releaseDatabaseFileLock()
        throw e
      }
    })
  }

  async createDatabase(params: CreateDatabaseParams = {}): Promise<boolean> {
    return this.withLoading(async () => {
      const fileRef = this.requiredFile
      await this.acquireFileLock()
      try {
        const { keyFileBuffer, credentials } = this.createCredentials(params)
        const db = kdbxweb.Kdbx.create(credentials, params.name || 'My new db')
        const data = await this.writeDatabase(db)
        this.db = db
        this.entryIndex = null
        this.setOpened(true)
        this.setDirty(false)
        await rememberOpenedDatabase({
          fileRef,
          dbData: data,
          keyFile: keyFileBuffer,
          keyFileName: params.keyFileName,
        })
        return true
      } catch (e) {
        releaseDatabaseFileLock()
        throw e
      }
    })
  }

  /** 锁定/关闭数据库：内存对象直接丢弃，未保存的修改随之丢失 */
  close() {
    this.db = null
    this.entryIndex = null
    this.savePromise = null
    this.setOpened(false)
    this.setDirty(false)
    clearActiveHistoryId()
    releaseDatabaseFileLock()
  }

  /* ---------------------------------- save ---------------------------------- */

  save(): Promise<boolean> {
    if (!this.db) {
      return Promise.reject(new Error('Database is not open'))
    }
    if (this.savePromise) {
      return this.savePromise
    }
    this.savePromise = this.withLoading(() =>
      this.enqueueSave(async () => {
        const db = this.getDb()
        const data = await this.writeDatabase(db)
        await updateActiveHistorySnapshot(data)
        this.setDirty(false)
        return true
      }),
    ).finally(() => {
      this.savePromise = null
    })
    return this.savePromise
  }

  async changeCredentials(params: OpenDatabaseParams = {}) {
    const db = this.getDb()
    const { password, keyFile } = params
    let changed = false
    if (password !== undefined && password !== null) {
      await db.credentials.setPassword(kdbxweb.ProtectedValue.fromString(String(password)))
      changed = true
    }
    if (keyFile) {
      await db.credentials.setKeyFile(keyFile)
      this.lastKeyFile = keyFile
      changed = true
    }
    if (changed) {
      await this.save()
    }
    if (keyFile) {
      await updateActiveHistoryKeyFile(keyFile, params.keyFileName)
    }
    return true
  }

  /* ---------------------------------- meta ---------------------------------- */

  getMeta() {
    const db = this.getDb()
    const meta: any = db.meta || {}
    const header: any = db.header || {}
    return {
      header: {
        compression: header.compression,
        crsAlgorithm: header.crsAlgorithm,
        endPos: header.endPos,
        versionMajor: header.versionMajor,
        versionMinor: header.versionMinor,
      },
      dbPath: this.getFilePath(),
      meta: {
        name: meta.name,
        recycleBinEnabled: meta.recycleBinEnabled,
        recycleBinUuid: meta.recycleBinUuid,
      },
    }
  }

  /** 分组是否位于回收站内（含回收站自身） */
  isGroupInRecycleBin(groupUuid?: string | null): boolean {
    if (!groupUuid) {
      return false
    }
    const recycleBinUuid = this.getDb().meta?.recycleBinUuid?.id
    if (!recycleBinUuid) {
      return false
    }
    let group = this.getDb().getGroup(groupUuid)
    while (group) {
      if (group.uuid.id === recycleBinUuid) {
        return true
      }
      group = group.parentGroup
    }
    return false
  }

  /** groupUuid 是否位于 ancestorUuid 的子树内（含两者相同） */
  isGroupInSubtree(groupUuid?: string | null, ancestorUuid?: string | null): boolean {
    if (!groupUuid || !ancestorUuid) {
      return false
    }
    let group = this.getDb().getGroup(groupUuid)
    while (group) {
      if (group.uuid.id === ancestorUuid) {
        return true
      }
      group = group.parentGroup
    }
    return false
  }

  /** 条目是否位于回收站内（含回收站的子分组） */
  isEntryInRecycleBin(entryUuid: string): boolean {
    if (!entryUuid) {
      return false
    }
    if (!this.entryIndex) {
      this.rebuildEntryIndex()
    }
    let entry = this.entryIndex!.get(entryUuid)
    if (!entry) {
      this.rebuildEntryIndex()
      entry = this.entryIndex!.get(entryUuid)
    }
    return entry ? this.isGroupInRecycleBin(entry.parentGroup?.uuid.id) : false
  }

  /* --------------------------------- entries -------------------------------- */

  private findEntry(uuid: string): KdbxEntry {
    if (!uuid) {
      throw new Error('uuid is required!')
    }
    if (!this.entryIndex) {
      this.rebuildEntryIndex()
    }
    let entry = this.entryIndex!.get(uuid)
    if (!entry) {
      // 索引可能因外部删除而失效，重建一次再试
      this.rebuildEntryIndex()
      entry = this.entryIndex!.get(uuid)
    }
    if (!entry) {
      throw new Error(`Entry not found: ${uuid}`)
    }
    return entry
  }

  private rebuildEntryIndex() {
    const index = new Map<string, KdbxEntry>()
    for (const group of this.getDb().groups) {
      for (const entry of group.allEntries()) {
        index.set(entry.uuid.id, entry)
      }
    }
    this.entryIndex = index
  }

  private findGroup(uuid: string): KdbxGroup {
    const group = uuid ? this.getDb().getGroup(uuid) : undefined
    if (!group) {
      throw new Error(`Group not found: ${uuid}`)
    }
    return group
  }

  getGroupTree(groupUuid?: string): GroupItem[] {
    const db = this.getDb()
    const groups = groupUuid ? [db.getGroup(groupUuid)] : db.groups
    return traverseGroupTree(groups.filter(Boolean) as KdbxGroup[])
  }

  getGroupEntries(groupUuid: string): EntryItem[] {
    const group = this.findGroup(groupUuid)
    const list: EntryItem[] = []
    for (let i = group.entries.length - 1; i >= 0; i--) {
      list.push(toEntryItem(group.entries[i]))
    }
    return list
  }

  getGroupEntriesDeep(params: GroupEntriesDeepParams) {
    const { groupUuid, isDayMapped, startDate, endDate } = params
    const group = this.findGroup(groupUuid)
    const list: EntryItem[] = []
    const dayMap: Record<string, Record<string, Record<string, EntryItem[]>>> = {}

    const traverse = (node: KdbxGroup) => {
      node.entries.forEach((entry) => {
        const creationTime = entry.times.creationTime || entry.times.lastModTime || new Date()
        if (startDate && creationTime.getTime() < startDate) return
        if (endDate && creationTime.getTime() > endDate) return
        if (!isDayMapped) {
          list.push(toEntryItem(entry))
          return
        }
        const year = creationTime.getFullYear()
        const month = creationTime.getMonth() + 1
        const date = creationTime.getDate()
        dayMap[year] = dayMap[year] || {}
        dayMap[year][month] = dayMap[year][month] || {}
        dayMap[year][month][date] = dayMap[year][month][date] || []
        dayMap[year][month][date].push(toEntryItem(entry))
      })
      node.groups.forEach(traverse)
    }
    traverse(group)
    return isDayMapped ? dayMap : list
  }

  getEntryDetail(uuid: string): EntryItem {
    return toEntryItem(this.findEntry(uuid), true)
  }

  /** 把详情面板中的编辑结果写回内存（不落盘，仅标记为未保存） */
  saveEntryDetail(detail: EntryItem): EntryItem {
    const entry = this.findEntry(detail.uuid)
    const fields = detail.fieldsV2 || {}
    for (const key of Object.keys(fields)) {
      const value = String(fields[key] ?? '')
      entry.fields.set(
        key,
        key === 'Password' ? kdbxweb.ProtectedValue.fromString(value) : value,
      )
    }
    entry.icon = detail.icon
    entry.fgColor = detail.fgColor
    entry.bgColor = detail.bgColor
    entry.times.creationTime = toDate(detail.creationTime)
    entry.times.update()
    this.markDirty()
    // 只返回列表/日历需要的摘要字段，避免把字段内容（含密码）带到 UI 层
    return toEntryItem(entry)
  }

  createEntry(groupUuid: string, config: CreateEntryConfig = {}): EntryItem {
    const db = this.getDb()
    const group = this.findGroup(groupUuid)
    const { title = 'New Entry', icon, bgColor, fgColor, creationTime, lastModTime } = config
    const entry = db.createEntry(group)
    entry.fields.set('Title', title)
    entry.icon =
      icon === undefined ? (group.icon === 48 || group.icon === 49 ? 44 : group.icon) : icon
    if (bgColor) entry.bgColor = bgColor
    if (fgColor) entry.fgColor = fgColor
    if (creationTime) entry.times.creationTime = toDate(creationTime)
    if (lastModTime) entry.times.lastModTime = toDate(lastModTime)
    this.entryIndex?.set(entry.uuid.id, entry)
    this.markDirty()
    return toEntryItem(entry)
  }

  createGroup(groupUuid: string, name = 'New Group'): GroupItem {
    const db = this.getDb()
    const group = db.createGroup(this.findGroup(groupUuid), name)
    this.markDirty()
    return {
      uuid: group.uuid.id,
      icon: group.icon as number,
      title: group.name || '',
      children: [],
    }
  }

  renameGroup(uuid: string, name: string) {
    this.findGroup(uuid).name = name
    this.markDirty()
    return true
  }

  setGroupIcon(uuid: string, icon: number) {
    this.findGroup(uuid).icon = icon
    this.markDirty()
    return true
  }

  private removeItems(items: KdbxEntry | KdbxEntry[] | KdbxGroup) {
    const db = this.getDb()
    const list = Array.isArray(items) ? items : [items]
    list.forEach((item) => db.remove(item))
    this.entryIndex = null
    this.markDirty()
  }

  removeGroup(groupUuid: string) {
    const group = this.getDb().getGroup(groupUuid)
    if (group) {
      this.removeItems(group)
    }
    return true
  }

  removeEntry(uuid: string | string[]) {
    const ids = Array.isArray(uuid) ? uuid : [uuid]
    this.removeItems(ids.map((id) => this.findEntry(id)))
    return true
  }

  private moveItems(
    items: KdbxEntry | KdbxEntry[] | KdbxGroup,
    groupUuid: string | null,
    atIndex?: number,
  ) {
    const db = this.getDb()
    const list = Array.isArray(items) ? items : [items]
    const target = groupUuid ? this.findGroup(groupUuid) : null
    list.forEach((item) => {
      if (item instanceof kdbxweb.KdbxGroup) {
        // 根分组没有父级，移动会破坏数据库结构
        if (!item.parentGroup) {
          throw new Error('The root group cannot be moved')
        }
        // 不能移动到自身或自己的子孙分组里，否则会形成环
        if (groupUuid && this.isGroupInSubtree(groupUuid, item.uuid.id)) {
          throw new Error('Cannot move a group into itself or its subgroup')
        }
      }
      db.move(item, target, atIndex)
    })
    this.markDirty()
  }

  moveGroup(uuid: string, targetUuid: string | null, atIndex?: number) {
    this.moveItems(this.findGroup(uuid), targetUuid, atIndex)
    return true
  }

  moveEntry(uuid: string | string[], groupUuid: string | null) {
    const ids = Array.isArray(uuid) ? uuid : [uuid]
    this.moveItems(ids.map((id) => this.findEntry(id)), groupUuid)
    return true
  }

  /* -------------------------------- attachments ------------------------------ */

  getAttachment(uuid: string, filename: string): Blob {
    const entry = this.findEntry(uuid)
    const binary: any = entry.binaries.get(filename)
    if (!binary) {
      throw new Error('file not found')
    }
    const value = 'value' in binary ? binary.value : binary
    return new Blob([binaryToBytes(value) as any])
  }

  removeAttachment(uuid: string, filename: string) {
    const entry = this.findEntry(uuid)
    if (!entry.binaries.get(filename)) {
      throw new Error('file not found')
    }
    entry.binaries.delete(filename)
    this.markDirty()
    return true
  }

  async uploadAttachment(uuid: string, files: File[]) {
    const db = this.getDb()
    const entry = this.findEntry(uuid)
    for (const file of files) {
      const binary = await db.createBinary(await file.arrayBuffer())
      entry.binaries.set(file.name, binary)
    }
    this.markDirty()
    return true
  }

  renameAttachment(uuid: string, filename: string, newFilename: string) {
    const entry = this.findEntry(uuid)
    const file = entry.binaries.get(filename)
    if (!file) {
      throw new Error('file not found')
    }
    entry.binaries.set(newFilename, file)
    entry.binaries.delete(filename)
    this.markDirty()
    return true
  }

  /* --------------------------------- search ---------------------------------- */

  searchDatabase(keyword: string, groupUuid?: string): EntryItem[] {
    const db = this.getDb()
    const keywordLower = String(keyword || '').toLowerCase()
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
    return result.map((entry) => toEntryItem(entry))
  }
}

export const db = new KdbxDatabase()

export const isDatabaseOpen = () => db.isOpen

// 宿主通过 FileLite SDK 的 onOpen 传入 .kdbx 时，未打开数据库的情况下直接采用它
onExternalFileOpen((ref) => {
  if (!db.isOpen) {
    db.setFileRef(ref)
  }
})
