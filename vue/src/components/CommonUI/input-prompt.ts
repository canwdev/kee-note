import {ElMessageBox} from 'element-plus'

/**
 * 通用输入弹窗（Element Plus 实现），兼容原有调用签名。
 */
export const showInputPrompt = (options: any = {}): Promise<string> => {
  const {
    title = '',
    value = '',
    placeholder = '',
    validateFn,
    type = 'text',
    allowEmpty = false,
  } = options

  return ElMessageBox.prompt(placeholder, title, {
    inputValue: value,
    inputType: type,
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    inputValidator: (val: string) => {
      if (!allowEmpty && !val) {
        return 'input value is required'
      }
      if (typeof validateFn === 'function') {
        return validateFn(val)
      }
      return true
    },
  }).then(({value: result}) => result)
}
