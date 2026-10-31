import {ElLoading, ElMessage} from 'element-plus'

/* -------------------------------------------------------------------------- */
/*                            global loading spinner                          */
/* -------------------------------------------------------------------------- */

// 所有 kdbx 读写/异步操作共用同一个全屏 loading。
// 使用计数器 + 最短展示时间，避免连续操作时闪烁。
const MIN_VISIBLE_MS = 250
const LOADING_TEXT = 'Loading...'

let pending = 0
let visibleSince = 0
let loadingInstance: ReturnType<typeof ElLoading.service> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const clearHideTimer = () => {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

const openLoading = () => {
  loadingInstance = ElLoading.service({
    fullscreen: true,
    lock: true,
    text: LOADING_TEXT,
    background: 'rgba(0, 0, 0, 0.3)',
    customClass: 'kee-global-loading',
  })
  visibleSince = Date.now()
}

const closeLoading = () => {
  hideTimer = null
  loadingInstance?.close()
  loadingInstance = null
}

export const beginGlobalLoading = () => {
  pending++
  clearHideTimer()
  if (!loadingInstance) {
    openLoading()
  }
}

export const endGlobalLoading = () => {
  if (pending > 0) {
    pending--
  }
  if (pending > 0 || !loadingInstance || hideTimer !== null) {
    return
  }
  const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - visibleSince))
  hideTimer = setTimeout(closeLoading, remaining)
}

/* -------------------------------------------------------------------------- */
/*                              error reporting                               */
/* -------------------------------------------------------------------------- */

// 同一个错误只提示一次（例如 backend 已经提示过，调用方 catch 中不再重复提示）。
// 相同文案在短时间内也只提示一次。
const ERROR_DEDUPE_MS = 1500
const notifiedErrors = new WeakSet<object>()
let lastErrorText = ''
let lastErrorAt = 0

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error) {
    return error
  }
  const message = (error as any)?.message
  if (typeof message === 'string' && message) {
    return message
  }
  return fallback
}

export const showError = (error: unknown, fallback = 'Operation failed') => {
  const isObject = typeof error === 'object' && error !== null
  if (isObject && notifiedErrors.has(error as object)) {
    return
  }
  if (isObject) {
    notifiedErrors.add(error as object)
  }

  const message = resolveErrorMessage(error, fallback)
  const now = Date.now()
  if (message === lastErrorText && now - lastErrorAt < ERROR_DEDUPE_MS) {
    return
  }
  lastErrorText = message
  lastErrorAt = now

  ElMessage.error({
    message,
    grouping: true,
    duration: 4000,
    // 高于全屏 loading，避免提示被遮罩挡住
    zIndex: 4000,
  })
}
