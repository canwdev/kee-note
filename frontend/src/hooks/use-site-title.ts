import { useRoute } from 'vue-router'
import { formatSiteTitle } from '@/router'
import { db } from '@/core/database'
import { getFileLiteSdk } from '@/core/file-access'
import { UNSAVED_MARK, useKeeStore } from '@/store/kee-store'

/** FileLite 宿主在没有打开文件时使用的窗口标题 */
const DEFAULT_HOST_TITLE = 'KeeNote'

/**
 * 同步浏览器标签页标题与 FileLite 宿主窗口标题。
 *
 * 内存中有未保存修改时，在标题前加一个圆点（`• `）；
 * FileLite 的窗口标题不是 `document.title`，需要通过 SDK 的 `setTitle` 设置。
 */
export const useSiteTitle = () => {
  const route = useRoute()
  const keeStore = useKeeStore()

  const updateSiteTitle = () => {
    const siteTitle = formatSiteTitle(route.meta.title as string | undefined, keeStore.isDirty)
    document.title = siteTitle

    // 数据库未打开时不要覆盖宿主设置的标题（例如启动时传入的文件名）
    const sdk = getFileLiteSdk()
    if (!keeStore.isDbOpened || typeof sdk?.setTitle !== 'function') {
      return
    }
    const hostTitle = db.getFileName() || DEFAULT_HOST_TITLE
    const title = keeStore.isDirty ? `${UNSAVED_MARK} ${hostTitle}` : hostTitle
    void sdk.setTitle(title).catch((e) => {
      console.warn('[title] failed to set FileLite window title', e)
    })
  }

  watch(
    [() => route.meta.title, () => keeStore.isDirty, () => keeStore.isDbOpened],
    updateSiteTitle,
    { immediate: true },
  )
}
