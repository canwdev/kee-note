import pkg from '../package.json'
// 全局设置moment地区语言
import moment from 'moment/moment'
import 'moment/min/locales'
const locale =
  navigator.languages && navigator.languages.length ? navigator.languages[0] : navigator.language
moment.locale(locale)

/**
 * 输出包版本信息
 */
// @ts-ignore
const timeDisplay = BUILD_TIMESTAMP ? moment(BUILD_TIMESTAMP).format('YYYY-MM-DD HH:mm:ss') : 'N/A'
console.info(
  `%c ${pkg.name} ${import.meta.env.MODE} %c ${timeDisplay} %c`,
  'background:#8F6E63; border-radius: 3px 0 0 3px; padding:2px 0; color: #f9f9f9; font-size: 10px;',
  'background:#f9f9f9; border-radius: 0 3px 3px 0; padding:2px 0; color: #8F6E63; font-size: 10px; font-weight: bold;',
  'background:transparent',
)

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
// https://pictogrammers.com/library/mdi/
import '@mdi/font/css/materialdesignicons.min.css'

// vgo-ui 结构样式 + 默认主题
import '@canwdev/vgo-ui/styles/core'
import '@canwdev/vgo-ui/themes/default'

import {createApp} from 'vue'
import 'normalize.css'
import router from './router'
import App from './App.vue'
import {createPinia} from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import {useSettingsStore} from '@/store/settings'
import {useEditorSettingsStore} from '@/store/editor'
import './styles/base.scss'

const app = createApp(App)

app.use(ElementPlus)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// 旧版本的默认值是「日历视图 + 折叠详情」，持久化数据会让新默认值失效。
// 首次运行时做一次性迁移，之后仍以用户自己的设置为准。
const UI_DEFAULTS_MIGRATION_KEY = 'kee-note-ui-defaults-v1'
try {
  if (!localStorage.getItem(UI_DEFAULTS_MIGRATION_KEY)) {
    useSettingsStore().isCalendarView = false
    useEditorSettingsStore().isShowMore = true
    localStorage.setItem(UI_DEFAULTS_MIGRATION_KEY, '1')
  }
} catch (e) {
  console.warn('[settings] failed to migrate UI defaults', e)
}

app.use(router)
app.mount('#app')
