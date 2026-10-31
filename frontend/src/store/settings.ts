import {LdThemeType} from '@/enum/settings'

interface IStore {
  ldTheme: LdThemeType
  // 主题色
  themeColor: string

  // 是否保存数据库打开历史（加密快照、key file、文件引用）
  isSaveHistory: boolean

  // 是否启用日历
  isCalendarView: boolean
  // 一周开始的第一天index，-1表示自动
  calendarWeekIndex: number
  // 是否显示农历
  calendarShowLunar: boolean
  calendarShowTitle: boolean

  isSidebarCollapsed: boolean

  // 自动保存
  enableAutoSave: boolean
}

export const useSettingsStore = defineStore('settingsStore', {
  state: (): IStore => {
    return {
      ldTheme: LdThemeType.SYSTEM,
      themeColor: '#189BA0',

      isSaveHistory: true,

      isCalendarView: true,
      calendarWeekIndex: -1,
      calendarShowLunar: true,
      calendarShowTitle: true,

      isSidebarCollapsed: false,

      enableAutoSave: true,
    }
  },
  actions: {},
  persist: {
    key: 'ls_key_keenote_settings',
  },
})
