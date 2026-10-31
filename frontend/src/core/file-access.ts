/**
 * 文件访问适配层。
 *
 * 优先使用 FileLite 注入的 window.fileLiteSDK（文件由宿主读写），
 * 否则回退到浏览器 File System Access API（FileSystemFileHandle）。
 *
 * 读写与打开/保存对话框都通过 hooks 暴露，便于外部替换实现。
 */

import { isProxy, toRaw } from 'vue'

export type FileRef =
  | {kind: 'sdk'; path: string; name: string}
  | {kind: 'handle'; handle: FileSystemFileHandle; name: string}

/**
 * 复制出一份原始 FileRef，并解开 Vue 的响应式代理。
 *
 * Proxy 无法被结构化克隆，直接写入 IndexedDB / 通过 postMessage 传递会抛出
 * `DataCloneError: #<Object> could not be cloned`。所以 FileRef 可能在 store、
 * 列表渲染结果里被代理包裹，凡是跨边界（持久化、跨标签页）前都必须先转成原始对象。
 */
export function toPlainFileRef(ref: FileRef | null | undefined): FileRef | null {
  if (!ref) {
    return null
  }
  const raw = (isProxy(ref) ? toRaw(ref) : ref) as FileRef
  if (raw.kind === 'sdk') {
    return {kind: 'sdk', path: String(raw.path), name: String(raw.name)}
  }
  if (raw.kind === 'handle') {
    const handle = isProxy(raw.handle) ? (toRaw(raw.handle) as FileSystemFileHandle) : raw.handle
    return {kind: 'handle', handle, name: String(raw.name)}
  }
  return null
}

export interface PickFileOptions {
  title?: string
  /** 包含点号，例如 ['.kdbx'] */
  extensions?: string[]
  /** File System Access API 下是否申请写权限，默认 true；选择 key file 时可设为 false */
  writable?: boolean
}

export interface PickSaveOptions extends PickFileOptions {
  defaultName?: string
}

export interface FileAccessHooks {
  pickOpen?: (options: PickFileOptions) => Promise<FileRef | null>
  pickSave?: (options: PickSaveOptions) => Promise<FileRef | null>
  read?: (ref: FileRef) => Promise<ArrayBuffer>
  write?: (ref: FileRef, data: ArrayBuffer) => Promise<void>
}

interface FileLiteEntry {
  name: string
  path: string
  size: number | null
  isDirectory: boolean
}

interface FileLitePickResult {
  items: FileLiteEntry[]
  directory: string
  path: string
  name: string
}

export interface FileLiteSdk {
  version: number
  pick(options?: {
    mode?: 'file' | 'files' | 'folder' | 'save'
    title?: string
    extensions?: string[]
    defaultName?: string
    startPath?: string
  }): Promise<FileLitePickResult | null>
  readFile(path: string): Promise<ArrayBuffer | Uint8Array | Blob>
  writeFile(
    path: string,
    data: ArrayBuffer | Uint8Array | Blob,
    options?: {conflict?: 'error' | 'overwrite' | 'keep-both' | 'skip'; charset?: string},
  ): Promise<{path: string; name: string}>
  getLaunch(): Promise<{path?: string; filename?: string} | null>
  onOpen(callback: (file: {path: string; filename: string; directory: string} | undefined) => void): void
}

let hooks: FileAccessHooks = {}

/** 注册文件访问 hooks；未设置的项继续使用默认实现 */
export const setFileAccessHooks = (next: FileAccessHooks) => {
  hooks = {...hooks, ...next}
}
export const resetFileAccessHooks = () => {
  hooks = {}
}

export const getFileLiteSdk = (): FileLiteSdk | null => {
  const sdk = (window as any).fileLiteSDK as FileLiteSdk | undefined
  if (sdk && typeof sdk.pick === 'function' && typeof sdk.readFile === 'function') {
    return sdk
  }
  return null
}

export const isFileLiteSdkAvailable = () => Boolean(getFileLiteSdk())

const basename = (path: string) => path.split(/[\\/]/).pop() || path

const abortError = () => new DOMException('The user aborted a request.', 'AbortError')

const normalizeBytes = async (data: ArrayBuffer | Uint8Array | Blob): Promise<ArrayBuffer> => {
  if (data instanceof ArrayBuffer) {
    return data
  }
  if (data instanceof Blob) {
    return data.arrayBuffer()
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  }
  return new Blob([data as any]).arrayBuffer()
}

/* -------------------------------------------------------------------------- */
/*                                File System API                             */
/* -------------------------------------------------------------------------- */

const pickerTypes = (extensions?: string[]) =>
  extensions && extensions.length
    ? [{description: 'Files', accept: {'application/octet-stream': extensions}}]
    : undefined

async function requestHandlePermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite',
): Promise<boolean> {
  const anyHandle = handle as any
  if (typeof anyHandle.queryPermission !== 'function') {
    return true
  }
  try {
    let permission = await anyHandle.queryPermission({mode})
    if (permission !== 'granted' && typeof anyHandle.requestPermission === 'function') {
      permission = await anyHandle.requestPermission({mode})
    }
    return permission === 'granted'
  } catch (e) {
    console.warn('[file] failed to request file permission', e)
    return false
  }
}

/** 重新申请文件权限（需在用户手势中调用），SDK 路径无需权限 */
export async function requestFileRefPermission(
  ref: FileRef | null | undefined,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  if (!ref || ref.kind !== 'handle') {
    return true
  }
  return requestHandlePermission(ref.handle, mode)
}

async function ensureWritable(handle: FileSystemFileHandle) {
  if (!(await requestHandlePermission(handle, 'readwrite'))) {
    throw new Error('Write permission for the database file was denied')
  }
}

async function pickOpenWithFileSystem(options: PickFileOptions): Promise<FileRef | null> {
  const picker = (window as any).showOpenFilePicker
  if (!picker) {
    throw new Error('Current browser does not support File System Access API')
  }
  const writable = options.writable !== false
  const [handle] = await picker({
    multiple: false,
    mode: writable ? 'readwrite' : 'read',
    excludeAcceptAllOption: false,
    types: pickerTypes(options.extensions),
  })
  if (writable) {
    try {
      await ensureWritable(handle)
    } catch (e) {
      console.warn('[file] read/write permission not granted yet', e)
    }
  }
  return {kind: 'handle', handle, name: handle.name}
}

async function pickSaveWithFileSystem(options: PickSaveOptions): Promise<FileRef | null> {
  const picker = (window as any).showSaveFilePicker
  if (!picker) {
    throw new Error('Current browser does not support File System Access API')
  }
  const handle = await picker({
    suggestedName: options.defaultName,
    types: pickerTypes(options.extensions),
  })
  try {
    await ensureWritable(handle)
  } catch (e) {
    console.warn('[file] write permission not granted yet', e)
  }
  return {kind: 'handle', handle, name: handle.name}
}

/* -------------------------------------------------------------------------- */
/*                                  dialogs                                   */
/* -------------------------------------------------------------------------- */

export async function pickOpenFile(options: PickFileOptions = {}): Promise<FileRef> {
  if (hooks.pickOpen) {
    const ref = await hooks.pickOpen(options)
    if (!ref) throw abortError()
    return ref
  }

  const sdk = getFileLiteSdk()
  if (sdk) {
    const result = await sdk.pick({
      mode: 'file',
      title: options.title,
      extensions: options.extensions,
    })
    if (!result) throw abortError()
    const entry = result.items?.[0]
    const path = result.path || entry?.path
    if (!path) throw abortError()
    return {
      kind: 'sdk',
      path,
      name: result.name || entry?.name || basename(path),
    }
  }

  const ref = await pickOpenWithFileSystem(options)
  if (!ref) throw abortError()
  return ref
}

export async function pickSaveFile(options: PickSaveOptions = {}): Promise<FileRef> {
  if (hooks.pickSave) {
    const ref = await hooks.pickSave(options)
    if (!ref) throw abortError()
    return ref
  }

  const sdk = getFileLiteSdk()
  if (sdk) {
    const result = await sdk.pick({
      mode: 'save',
      title: options.title,
      extensions: options.extensions,
      defaultName: options.defaultName,
    })
    if (!result) throw abortError()
    const entry = result.items?.[0]
    const path = result.path || entry?.path
    if (!path) throw abortError()
    return {
      kind: 'sdk',
      path,
      name: result.name || entry?.name || basename(path),
    }
  }

  const ref = await pickSaveWithFileSystem(options)
  if (!ref) throw abortError()
  return ref
}

/* -------------------------------------------------------------------------- */
/*                                 read/write                                 */
/* -------------------------------------------------------------------------- */

export async function readFileBytes(ref: FileRef): Promise<ArrayBuffer> {
  if (hooks.read) {
    return hooks.read(ref)
  }

  if (ref.kind === 'sdk') {
    const sdk = getFileLiteSdk()
    if (!sdk) {
      throw new Error('FileLite SDK is no longer available')
    }
    return normalizeBytes(await sdk.readFile(ref.path))
  }

  const file = await ref.handle.getFile()
  return file.arrayBuffer()
}

export async function writeFileBytes(ref: FileRef, data: ArrayBuffer): Promise<void> {
  if (hooks.write) {
    return hooks.write(ref, data)
  }

  if (ref.kind === 'sdk') {
    const sdk = getFileLiteSdk()
    if (!sdk) {
      throw new Error('FileLite SDK is no longer available')
    }
    if (typeof sdk.writeFile !== 'function') {
      throw new Error('FileLite SDK does not support writing files')
    }
    const result = await sdk.writeFile(ref.path, data, {conflict: 'overwrite'})
    // 宿主可能会规范化路径（例如自动补全扩展名），同步回引用以便后续保存仍指向真实文件
    if (result?.path && result.path !== ref.path) {
      ref.path = result.path
    }
    if (result?.name) {
      ref.name = result.name
    }
    return
  }

  const writable = await (ref.handle as any).createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (e) {
    // 避免 close 提交半写入的文件，保留原文件内容
    try {
      await writable.abort()
    } catch (abortError) {
      console.warn('[file] failed to abort incomplete write', abortError)
    }
    throw e
  }
}

/* -------------------------------------------------------------------------- */
/*                            FileLite open events                           */
/* -------------------------------------------------------------------------- */

let externalFile: FileRef | null = null
const externalOpenListeners = new Set<(ref: FileRef) => void>()

export const getExternalFile = () => externalFile

/** 监听宿主（FileLite）通过 onOpen 打开的文件；会在注册时补发最近一次 */
export function onExternalFileOpen(callback: (ref: FileRef) => void): () => void {
  externalOpenListeners.add(callback)
  if (externalFile) {
    callback(externalFile)
  }
  return () => {
    externalOpenListeners.delete(callback)
  }
}

function notifyExternalFile(path: string | undefined) {
  if (!path || !/\.kdbx$/i.test(path)) {
    return
  }
  const ref: FileRef = {kind: 'sdk', path, name: basename(path)}
  externalFile = ref
  externalOpenListeners.forEach((callback) => callback(ref))
}

let sdkHooksRegistered = false

function registerFileLiteHooks() {
  const sdk = getFileLiteSdk()
  if (!sdk || sdkHooksRegistered) {
    return
  }
  sdkHooksRegistered = true
  try {
    sdk.onOpen((file) => notifyExternalFile(file?.path))
  } catch (e) {
    console.warn('[file] failed to register FileLite onOpen', e)
  }
  Promise.resolve(sdk.getLaunch?.())
    .then((launch) => notifyExternalFile(launch?.path))
    .catch(() => {})
}

if (typeof window !== 'undefined') {
  registerFileLiteHooks()
  // 兼容 SDK 脚本稍后注入的情况
  if (!sdkHooksRegistered) {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      registerFileLiteHooks()
      if (sdkHooksRegistered || attempts >= 25) {
        window.clearInterval(timer)
      }
    }, 200)
  }
}

export const isFileSystemAccessSupported = () =>
  isFileLiteSdkAvailable() || typeof (window as any).showOpenFilePicker === 'function'
