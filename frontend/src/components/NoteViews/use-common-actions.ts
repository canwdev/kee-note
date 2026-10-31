import {useContextMenu} from '@/hooks/use-context-menu'
import {openDetailWindow} from '@/hooks/use-note-windows'
import globalEventBus, {GlobalEvents} from '@/utils/bus'
import {db} from '@/core/database'
import {useRoute} from 'vue-router'
import {EntryItem} from '@/enum/kdbx'

import {formatDate} from '@/utils'
import moment from 'moment/moment'

export const useCommonActions = (options) => {
  const route = useRoute()
  const {getEntryList, checkedRowKeys = ref([])} = options || {}
  const isShowGroupSelectModal = ref(false)
  const isShowPreviewModal = ref(false)

  const handleDeleteEntry = async (uuid: string, isDelete = false) => {
    if (isDelete) {
      db.moveEntry(uuid, null)
    } else {
      db.removeEntry(uuid)
    }
    await getEntryList()
    globalEventBus.emit(GlobalEvents.REFRESH_GROUP_TREE)
  }

  const getMenuOptions = (item: EntryItem | any): any[] => {
    const isMultiple = Boolean(checkedRowKeys.value.length)
    // 条目所在（子）分组位于回收站时，不再显示“移到回收站”
    const isInRecycleBin = item?.uuid
      ? db.isEntryInRecycleBin(item.uuid)
      : checkedRowKeys.value.length > 0 && db.isEntryInRecycleBin(checkedRowKeys.value[0])

    const handleCreateEntry = async (date: Date) => {
      const entry = db.createEntry(String(route.query.groupUuid || ''), {
        title: formatDate(date),
        creationTime: date.getTime(),
      })

      openDetailWindow(entry.uuid, entry.title)
      globalEventBus.emit(GlobalEvents.REFRESH_ENTRY_LIST)
    }

    // 如果在日期上点击右键，则显示创建按钮，item.day 是moment日期类型
    if (item && item.day) {
      return [
        {
          label: 'Create Note',
          icon: 'mdi-note-plus-outline',
          onClick: async () => {
            let d: Date
            if (item.day.isSame(moment(), 'day')) {
              d = new Date()
            } else {
              d = item.day.toDate()
            }
            await handleCreateEntry(d)
          },
        },
      ]
    }

    return [
      !isMultiple && {
        label: 'Preview',
        icon: 'mdi-eye-outline',
        onClick: () => {
          nodeAction(item, () => {
            isShowPreviewModal.value = true
          })
        },
      },
      !isMultiple && {
        label: 'Edit',
        icon: 'mdi-pencil-outline',
        onClick: () => {
          openDetailWindow(item.uuid, item.title)
        },
      },
      {
        label: 'Move to group...',
        icon: 'mdi-folder-move-outline',
        onClick: () => {
          nodeAction(item, () => {
            isShowGroupSelectModal.value = true
          })
        },
      },
      isInRecycleBin
        ? {
            label: 'Permanent Delete',
            icon: 'mdi-delete-forever-outline',
            onClick: () => {
              confirmRemoveEntry(item, true)
            },
          }
        : {
            label: 'Move to Recycle Bin',
            icon: 'mdi-trash-can-outline',
            onClick: () => {
              confirmRemoveEntry(item, false)
            },
          },
    ].filter(Boolean)
  }

  const {editingNode, nodeAction, handleContextmenu} = useContextMenu(getMenuOptions)

  const confirmRemoveEntry = (item, isDelete = false) => {
    const isMultiple = Boolean(checkedRowKeys.value.length)
    window.$dialog[isDelete ? 'warning' : 'info']({
      title: isDelete ? 'Warning!!' : 'Confirm',
      content: isDelete
        ? `Permanent delete item(s)? (This can not be undo)`
        : `Move item(s) to recycle bin?`,
      positiveText: 'OK',
      negativeText: 'Cancel',
      onPositiveClick: () => {
        handleDeleteEntry(isMultiple ? [...checkedRowKeys.value] : item.uuid, isDelete)
      },
      onNegativeClick: () => {},
    })
  }

  const handleSelectGroup = async (groupUuid: string) => {
    // console.log(groupUuid)
    if (!editingNode.value && !checkedRowKeys.value.length) {
      console.warn('no entry selected', checkedRowKeys)
      return
    }
    db.moveEntry(
      checkedRowKeys.value.length ? [...checkedRowKeys.value] : editingNode.value.uuid,
      groupUuid,
    )

    await getEntryList()
    editingNode.value = null
  }

  return {
    editingNode,
    nodeAction,
    handleContextmenu,
    isShowGroupSelectModal,
    isShowPreviewModal,
    handleSelectGroup,
    getMenuOptions,
  }
}
