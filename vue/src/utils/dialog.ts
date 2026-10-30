import {ElMessageBox} from 'element-plus'

type DialogOptions = {
  title?: string
  content?: any
  message?: any
  positiveText?: string
  negativeText?: string
  onPositiveClick?: () => void
  onNegativeClick?: () => void
  [key: string]: any
}

/**
 * 兼容旧代码的 window.$dialog 封装，
 * 底层使用 Element Plus MessageBox。
 */
const createDialog = (type: 'info' | 'warning' | 'success' | 'error') => (options: DialogOptions = {}) => {
  const {
    title = '',
    content,
    message,
    positiveText = 'OK',
    negativeText = 'Cancel',
    onPositiveClick,
    onNegativeClick,
  } = options

  ElMessageBox.confirm(content ?? message ?? '', title, {
    confirmButtonText: positiveText,
    cancelButtonText: negativeText,
    type,
    dangerouslyUseHTMLString: typeof (content ?? message) === 'string' && /<[a-z][\s\S]*>/i.test(content ?? message ?? ''),
  })
    .then(() => {
      onPositiveClick?.()
    })
    .catch(() => {
      onNegativeClick?.()
    })

  return {
    destroy: () => ElMessageBox.close(),
  }
}

const dialog: any = (options: DialogOptions = {}) => createDialog('info')(options)
dialog.info = createDialog('info')
dialog.warning = createDialog('warning')
dialog.success = createDialog('success')
dialog.error = createDialog('error')

export default dialog
