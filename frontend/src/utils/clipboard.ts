/**
 * 复制文本到剪贴板。
 *
 * 优先使用异步 Clipboard API；在非安全上下文（例如通过局域网 http 访问、
 * 部分移动端浏览器）下会回退到 `document.execCommand('copy')`，
 * 因此移动端也能正常复制。
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false
  }

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒绝等情况，继续尝试回退方案
    }
  }

  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // 避免页面滚动/闪烁，并防止 iOS 自动放大
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.padding = '0'
  textarea.style.border = 'none'
  textarea.style.outline = 'none'
  textarea.style.boxShadow = 'none'
  textarea.style.background = 'transparent'
  textarea.style.opacity = '0'

  const selection = document.getSelection()
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const activeElement = document.activeElement as HTMLElement | null

  document.body.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    if (previousRange && selection) {
      selection.removeAllRanges()
      selection.addRange(previousRange)
    }
    activeElement?.focus?.({ preventScroll: true })
  }
}
