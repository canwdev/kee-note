/** 未保存修改的标记：显示在标题前 / 标题后 */
export const UNSAVED_MARK = '•'

type DbInfo = {
  header: {
    compression: number
    crsAlgorithm: number
    endPos: number
    versionMajor: number
    versionMinor: number
  }
  dbPath: string
  meta: {
    name: string
    recycleBinEnabled: boolean
    recycleBinUuid: {
      id: string | null
    }
  }
}

type KeeStore = {
  // 数据库是否已解锁
  isDbOpened: boolean
  // 内存中是否有尚未写入文件的修改（唯一需要保存的依据）
  isDirty: boolean
  // 数据库信息
  dbInfo: DbInfo | null
}

/**
 * 数据库会话状态。真正的数据由 `@/core/database` 的内存对象持有，
 * 这里只保存 UI 需要的响应式副本。
 */
export const useKeeStore = defineStore('keeStore', {
  state: (): KeeStore => {
    return {
      isDbOpened: false,
      isDirty: false,
      dbInfo: null,
    }
  },
  getters: {
    recycleBinUuid: (state): string | null => {
      return state.dbInfo?.meta?.recycleBinUuid?.id || null
    },
  },
  actions: {},
})
