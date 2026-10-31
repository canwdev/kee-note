// using ES6 modules
import mitt from 'mitt'

const globalEventBus = mitt<Record<string, any>>()

export default globalEventBus

export const GlobalEvents = {
  SHOW_SETTINGS: 'SHOW_SETTINGS',
  REFRESH_GROUP_TREE: 'REFRESH_GROUP',
  REFRESH_ENTRY_LIST: 'REFRESH_ENTRY_LIST',
  // 详情窗口中的编辑已写入内存，通知列表/日历就地更新对应条目
  ENTRY_UPDATED: 'ENTRY_UPDATED',
  CLOSE_DATABASE: 'CLOSE_DATABASE',
}
