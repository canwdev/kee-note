/**
 * 内存中有未保存修改时，阻止关闭 / 刷新浏览器标签页。
 * 浏览器只允许通过 beforeunload 弹原生确认框，无法自定义文案。
 */
export const useBeforeUnload = (checkIsDirty: () => boolean) => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!checkIsDirty()) {
      return
    }
    e.preventDefault()
    e.returnValue = 'There is unsaved data.'
    return e.returnValue
  }
  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
