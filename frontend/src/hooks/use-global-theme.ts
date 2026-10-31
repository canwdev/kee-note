import {usePreferredDark} from '@vueuse/core'
import {syncPrimaryColor, useElementPlusTheme} from '@canwdev/vgo-ui'
import {useSettingsStore} from '@/store/settings'
import {LdThemeType} from '@/enum/settings'
import {useMainStore} from '@/store/main'
import {hexToRgb} from '@/utils/color'

/**
 * 明暗 / 主题色，参考 vgo-ui docs 的实现：
 * - 暗色：在 <html> 上切换 `dark` 类（vgo-ui 与 Element Plus 共用）
 * - 主题色：写 `--vgo-primary-rgb`，并由 Element Plus 生成色阶
 */
export const useGlobalTheme = () => {
  const mainStore = useMainStore()
  const settingsStore = useSettingsStore()

  const preferredDark = usePreferredDark()

  const isDark = computed(() => {
    if (settingsStore.ldTheme === LdThemeType.LIGHT) {
      return false
    }
    if (settingsStore.ldTheme === LdThemeType.DARK) {
      return true
    }
    return preferredDark.value
  })

  watch(
    isDark,
    (val) => {
      document.documentElement.classList.toggle('dark', val)
      mainStore.isAppDarkMode = val
    },
    {immediate: true},
  )

  const {changeTheme} = useElementPlusTheme()

  watch(
    () => settingsStore.themeColor,
    (hex) => {
      const rgb = hexToRgb(hex)
      if (!rgb) {
        return
      }
      syncPrimaryColor(`${rgb.r}, ${rgb.g}, ${rgb.b}`, changeTheme)
    },
    {immediate: true},
  )

  return {
    isAppDarkMode: isDark,
  }
}
