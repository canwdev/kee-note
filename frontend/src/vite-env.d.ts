/// <reference types="vite/client" />

// 无类型声明的副作用导入（纯 JS / 纯 CSS 包）
declare module 'moment/min/locales'
declare module '@canwdev/vgo-ui/styles/core'
declare module '@canwdev/vgo-ui/themes/default'

declare module '*.vue' {
  import type {DefineComponent} from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
