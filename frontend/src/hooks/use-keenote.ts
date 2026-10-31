import {useRoute, useRouter} from 'vue-router'
import {useKeeStore} from '@/store/kee-store'
import {EntryItem, GroupItem} from '@/enum/kdbx'
import {db} from '@/core/database'
import globalEventBus, {GlobalEvents} from '@/utils/bus'
import {updateActiveHistoryLastGroup} from '@/utils/db-history'
import {useSettingsStore} from '@/store/settings'
import {showInputPrompt} from '@/components/CommonUI/input-prompt'
import {closeAllNoteWindows, openDetailWindow} from '@/hooks/use-note-windows'
import {formatDate} from '@/utils'
import {showError} from '@/utils/feedback'
import {ElMessageBox} from 'element-plus'

export interface CalendarData {
  // year
  [key: string]: {
    // month
    [key: string]: {
      // date
      [key: string]: EntryItem[]
    }
  }
}

export const useKeeNoteGroupManage = (editingNode: Ref<GroupItem | null>) => {
  const keeStore = useKeeStore()
  const settingsStore = useSettingsStore()

  const groupTree = ref<GroupItem[]>([])

  const route = useRoute()
  const router = useRouter()

  const groupUuid = computed((): string => String(route.query.groupUuid || ''))

  const rootGroupUuid = computed(() => {
    return groupTree.value[0]?.uuid
  })

  const editingUuid = computed(() => {
    return editingNode.value ? editingNode.value.uuid : groupUuid.value
  })

  const selectedKeys = computed({
    get(): string[] {
      if (!groupUuid.value) {
        return []
      }
      return [String(groupUuid.value)]
    },
    set(val: string[]) {
      if (!val) {
        val = []
      }

      const groupUuid = val[0]

      // 如果开启了历史记录，就设置lastGroupUuid
      if (groupUuid && settingsStore.isSaveHistory) {
        void updateActiveHistoryLastGroup(groupUuid)
      }

      router.replace({
        query: {
          ...route.query,
          groupUuid,
        },
      })
    },
  })

  const getGroupTree = async () => {
    keeStore.dbInfo = db.getMeta()

    groupTree.value = db.getGroupTree()

    if (!selectedKeys.value.length && groupTree.value.length) {
      selectedKeys.value = [groupTree.value[0].uuid]
    }
  }

  /**
   * el-tree 的 allow-drop：只允许把分组拖到合法位置。
   * type: 'prev' | 'inner' | 'next'
   */
  const allowTreeDrop = (draggingNode: any, dropNode: any, type: string): boolean => {
    const dragUuid = draggingNode?.data?.uuid
    const dropUuid = dropNode?.data?.uuid
    if (!dragUuid || !dropUuid || dragUuid === dropUuid) {
      return false
    }
    // 根分组和回收站分组是系统分组，不可拖动
    if (dragUuid === rootGroupUuid.value || dragUuid === keeStore.recycleBinUuid) {
      return false
    }
    if (type === 'inner') {
      // 不能拖进自己的子孙分组
      return !db.isGroupInSubtree(dropUuid, dragUuid)
    }
    // before/after：落点为 dropNode 的父分组，顶层节点不允许重排
    const parentNode = dropNode.parent
    if (!parentNode || parentNode.level <= 0) {
      return false
    }
    const parentUuid = parentNode.data?.uuid
    return Boolean(parentUuid) && !db.isGroupInSubtree(parentUuid, dragUuid)
  }

  /**
   * el-tree 触发 node-drop 时已经在内部完成了乐观移动，
   * 这里按“最终位置”同步到数据库（inner 进入分组，before/after 同级重排）。
   */
  const handleTreeDrop = async (
    draggingNode: any,
    dropNode: any,
    dropType: 'before' | 'after' | 'inner',
  ) => {
    const dragUuid = draggingNode?.data?.uuid
    try {
      if (
        !dragUuid ||
        dragUuid === rootGroupUuid.value ||
        dragUuid === keeStore.recycleBinUuid
      ) {
        return
      }

      if (dropType === 'inner') {
        const dropUuid = dropNode?.data?.uuid
        if (!dropUuid || db.isGroupInSubtree(dropUuid, dragUuid)) {
          return
        }
        db.moveGroup(dragUuid, dropUuid)
        return
      }

      // before / after：与 dropNode 同级，索引以 el-tree 移动后的最终顺序为准
      const parentNode = dropNode?.parent
      const parentUuid = parentNode?.level > 0 ? parentNode.data?.uuid : null
      if (!parentUuid || db.isGroupInSubtree(parentUuid, dragUuid)) {
        return
      }
      const index = parentNode.childNodes.findIndex(
        (node: any) => node.data?.uuid === dragUuid,
      )
      db.moveGroup(dragUuid, parentUuid, index)
    } catch (e) {
      showError(e, 'Failed to move group')
    } finally {
      // 无论成功与否都用数据库中的真实结构重建树，
      // 抵消 el-tree 在 node-drop 前做的乐观移动。
      await getGroupTree()
    }
  }

  const showOpenDbModal = async () => {
    const password = await showInputPrompt({
      title: 'Unlock Database',
      placeholder: 'Database password',
      value: '',
      type: 'password',
      allowEmpty: true,
    })
    await handleOpenDatabase(password)
  }

  const handleOpenDatabase = async (password?) => {
    if (keeStore.isDbOpened) {
      window.$message.info('Database already opened')

      return
    } else if (!db.hasFile()) {
      await router.replace({
        name: 'HomeView',
      })
      return
    }
    try {
      await db.open({password})
    } catch (e) {
      console.error(e)
      await showOpenDbModal()

      return
    }

    window.$message.success('Database successfully opened')
    await getGroupTree()
  }

  const handleCreateEntry = async () => {
    const entry = db.createEntry(editingUuid.value, {
      title: formatDate(new Date()),
    })

    openDetailWindow(entry.uuid, entry.title)
    globalEventBus.emit(GlobalEvents.REFRESH_ENTRY_LIST)
  }

  const handleCreateGroup = async () => {
    let name: string
    try {
      name = await showInputPrompt({
        title: 'Create Group',
        placeholder: 'Group name',
        value: formatDate(new Date()),
      })
    } catch {
      // 用户取消
      return
    }
    if (!name) {
      return
    }
    db.createGroup(editingUuid.value, name)
    await getGroupTree()
  }

  const isGroupInRecycleBin = (uuid?: string | null) => db.isGroupInRecycleBin(uuid)

  const confirmRemoveGroup = (isDelete = false) => {
    window.$dialog.warning({
      title: isDelete ? 'Warning!!' : 'Confirm',
      content: isDelete
        ? 'Permanent delete selected group? (This can not be undo)'
        : 'Move selected group to recycle bin?',
      positiveText: 'OK',
      negativeText: 'Cancel',
      onPositiveClick: () => {
        handleDeleteGroup(isDelete)
      },
      onNegativeClick: () => {},
    })
  }

  const handleDeleteGroup = async (isDelete = false) => {
    if (isDelete) {
      db.moveGroup(editingUuid.value, null)
    } else {
      db.removeGroup(editingUuid.value)
    }
    await getGroupTree()
  }

  const showRenameModal = async () => {
    if (!editingNode.value) {
      return
    }
    const name = await showInputPrompt({
      title: 'Rename Group',
      placeholder: 'Group name',
      value: editingNode.value.title,
    })
    if (name !== editingNode.value.title) {
      await handleGroupEdit(name)
    }
  }

  const handleGroupEdit = async (name: string) => {
    if (!editingUuid.value) {
      return
    }

    db.renameGroup(editingUuid.value, name)
    await getGroupTree()
    editingNode.value = null
  }

  const isShowChooseIconModal = ref(false)
  const handleSelectIcon = async (icon: number) => {
    if (!editingUuid.value) {
      return
    }

    db.setGroupIcon(editingUuid.value, icon)
    await getGroupTree()
    editingNode.value = null
    isShowChooseIconModal.value = false
  }

  const {closeDatabase} = useDatabaseSave()

  const handleCloseDatabase = async () => {
    await closeDatabase({
      cleanupFn: () => {
        groupTree.value = []
      },
    })
  }

  // 切换数据库锁定
  const handleToggleLock = async () => {
    if (keeStore.isDbOpened) {
      await handleCloseDatabase()
    } else {
      await showOpenDbModal()
    }
  }

  onMounted(async () => {
    globalEventBus.on(GlobalEvents.REFRESH_GROUP_TREE, getGroupTree)
    globalEventBus.on(GlobalEvents.CLOSE_DATABASE, handleCloseDatabase)
  })
  onBeforeUnmount(() => {
    globalEventBus.off(GlobalEvents.REFRESH_GROUP_TREE, getGroupTree)
    globalEventBus.off(GlobalEvents.CLOSE_DATABASE, handleCloseDatabase)
  })

  return {
    groupTree,
    keeStore,
    getGroupTree,
    selectedKeys,
    groupUuid,
    rootGroupUuid,
    editingUuid,
    handleOpenDatabase,
    handleCreateEntry,
    handleCreateGroup,
    confirmRemoveGroup,
    isGroupInRecycleBin,
    handleTreeDrop,
    allowTreeDrop,
    handleDeleteGroup,
    showRenameModal,
    handleGroupEdit,
    isShowChooseIconModal,
    handleSelectIcon,
    handleCloseDatabase,
    showOpenDbModal,
    handleToggleLock,
  }
}

export const useKeeNoteEntryList = (options?) => {
  const {
    isCalendar = false,
    // 仅限日历视图开启：
    calendarIsMapped = true,
    getCalendarParams,
    cleanupFn,
  } = options || {}
  const route = useRoute()

  const keeStore = useKeeStore()
  const entryList = ref<EntryItem[]>([])
  const calendarData = ref<CalendarData>({})

  const groupUuid = computed((): string => String(route.query.groupUuid || ''))

  // 详情窗口编辑写回内存后，就地替换列表/日历中的条目，避免整表刷新导致
  // 分页回到第一页、选中状态被清空。
  const patchEntryItem = (target: EntryItem, source: EntryItem) => {
    target.title = source.title
    target.icon = source.icon
    target.bgColor = source.bgColor
    target.fgColor = source.fgColor
    target.groupName = source.groupName
    target.creationTime = source.creationTime
    target.lastModTime = source.lastModTime
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      getEntryList()
    }, 300)
  }

  const handleEntryUpdated = (entry: EntryItem) => {
    if (!entry) {
      return
    }
    if (!isCalendar) {
      const target = entryList.value.find((item) => item.uuid === entry.uuid)
      if (target) {
        patchEntryItem(target, entry)
      }
      return
    }
    // 日历数据按创建日期分桶，找到旧位置后判断日期是否变化
    const creation = new Date(entry.creationTime)
    const year = creation.getFullYear()
    const month = creation.getMonth() + 1
    const date = creation.getDate()
    for (const [y, months] of Object.entries(calendarData.value)) {
      for (const [m, days] of Object.entries(months)) {
        for (const [d, list] of Object.entries(days)) {
          const target = (list as EntryItem[]).find((item) => item.uuid === entry.uuid)
          if (!target) {
            continue
          }
          if (Number(y) === year && Number(m) === month && Number(d) === date) {
            patchEntryItem(target, entry)
          } else {
            // 创建时间跨天：需要重新计算日历分桶
            scheduleRefresh()
          }
          return
        }
      }
    }
  }

  onMounted(async () => {
    globalEventBus.on(GlobalEvents.REFRESH_ENTRY_LIST, getEntryList)
    globalEventBus.on(GlobalEvents.ENTRY_UPDATED, handleEntryUpdated)
  })
  onBeforeUnmount(() => {
    globalEventBus.off(GlobalEvents.REFRESH_ENTRY_LIST, getEntryList)
    globalEventBus.off(GlobalEvents.ENTRY_UPDATED, handleEntryUpdated)
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  })

  watch(
    () => keeStore.isDbOpened,
    (val) => {
      if (val) {
        getEntryList()
      } else {
        entryList.value = []
      }
    },
  )

  watch(
    () => groupUuid.value,
    () => {
      getEntryList()
    },
  )

  const getEntryList = async () => {
    if (cleanupFn) {
      cleanupFn()
    }
    if (!groupUuid.value || !keeStore.isDbOpened) {
      entryList.value = []
      return
    }
    if (isCalendar) {
      let params = {}
      if (getCalendarParams) {
        params = getCalendarParams()
      }
      calendarData.value = db.getGroupEntriesDeep({
        groupUuid: groupUuid.value,
        isDayMapped: calendarIsMapped,
        ...params,
      }) as CalendarData
    } else {
      entryList.value = db.getGroupEntries(groupUuid.value)
    }
  }

  return {
    entryList,
    calendarData,
    getEntryList,
    keeStore,
    groupUuid,
  }
}

/**
 * 全局保存 / 锁定。
 * 数据已在内存中，保存只是把内存对象加密写入磁盘文件。
 */
export const useDatabaseSave = () => {
  const keeStore = useKeeStore()
  const router = useRouter()

  const saveDatabase = async () => {
    if (!keeStore.isDbOpened || !keeStore.isDirty) {
      return false
    }
    try {
      await db.save()
      window.$message.success('Database saved')
      return true
    } catch (e) {
      showError(e, 'Failed to save database')
      return false
    }
  }

  let lockDialogOpen = false

  const closeDatabase = async (options: {cleanupFn?: () => void} = {}) => {
    const {cleanupFn} = options
    if (keeStore.isDbOpened && keeStore.isDirty) {
      // 防止重复弹窗
      if (lockDialogOpen) {
        return
      }
      lockDialogOpen = true
      let shouldSave = false
      try {
        await ElMessageBox.confirm('Save changes before locking?', 'Unsaved changes', {
          confirmButtonText: 'Save and Lock',
          cancelButtonText: 'Discard and Lock',
          distinguishCancelAndClose: true,
          showClose: true,
          type: 'warning',
        })
        shouldSave = true
      } catch (action) {
        lockDialogOpen = false
        // 关闭弹窗（X）视为取消锁定；“放弃”则继续锁定
        if (action !== 'cancel') {
          return
        }
      }
      lockDialogOpen = false
      if (shouldSave) {
        try {
          await db.save()
        } catch (e) {
          showError(e, 'Failed to save database')
          return
        }
      }
    }

    closeAllNoteWindows()
    db.close()
    window.$message.success('Database locked')

    if (typeof cleanupFn === 'function') {
      cleanupFn()
    }

    await router.replace({
      name: 'HomeView',
    })
  }

  return {
    saveDatabase,
    closeDatabase,
  }
}
