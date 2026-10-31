<script lang="ts">
import { db } from '@/core/database'
import { GroupItem } from '@/enum/kdbx'
import { defineComponent } from 'vue'
import { WindowDock, WindowStack } from '@canwdev/vgo-ui'
import type { ManagedWindow } from '@canwdev/vgo-ui'
import globalEventBus, { GlobalEvents } from '@/utils/bus'
import { useContextMenu } from '@/hooks/use-context-menu'
import ListView from '@/components/NoteViews/ListView.vue'
import CalendarView from '@/components/NoteViews/Calendar/CalendarView.vue'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import DialogIconChooser from '@/components/NoteViews/Dialogs/DialogIconChooser.vue'

import { useSettingsStore } from '@/store/settings'
import { useDatabaseSave, useKeeNoteGroupManage } from '@/hooks/use-keenote'
import DetailView from '@/views/Note/DetailView.vue'
import SearchDatabaseView from '@/components/NoteViews/DataSearch/SearchDatabaseView.vue'
import MenuTrigger from '@/components/CommonUI/MenuTrigger.vue'
import type { NoteWindowData } from '@/hooks/use-note-windows'
import {
  closeAllNoteWindows,
  noteWindows,
  openSearchWindow,
} from '@/hooks/use-note-windows'

export default defineComponent({
  name: 'NoteLayout',
  components: {
    IconDisplay,
    SearchDatabaseView,
    MenuTrigger,
    WindowDock,
    WindowStack,
    DetailView,
    ListView,
    CalendarView,
    DialogIconChooser,
  },
  setup() {
    const settingsStore = useSettingsStore()

    /**
     * 分组菜单：左侧树右键菜单包含创建项；
     * 顶栏全局菜单只用分组管理项（创建入口由独立的“+”菜单提供）。
     */
    const getMenuOptions = (option, event?: MouseEvent, includeCreate = true) => {
      let isRootSelected = option
        ? option.uuid === rootGroupUuid.value
        : groupUuid.value === rootGroupUuid.value

      const isShiftPressed = event?.shiftKey
      // 已在回收站中的分组不再显示“移到回收站”，只保留永久删除
      const isPermanentDelete = isShiftPressed || isGroupInRecycleBin(
        option ? option.uuid : editingUuid.value,
      )

      return [
        includeCreate && {
          label: 'Create Note',
          icon: 'mdi-note-plus-outline',
          onClick: () => {
            nodeAction(option, () => {
              handleCreateEntry()
            })
          },
        },
        includeCreate && {
          label: 'Create Group',
          icon: 'mdi-folder-plus-outline',
          onClick: () => {
            nodeAction(option, () => {
              handleCreateGroup()
            })
          },
        },
        option && {
          label: 'Rename Group',
          icon: 'mdi-folder-edit-outline',
          onClick: () => {
            nodeAction(option, () => {
              showRenameModal()
            })
          },
        },
        option && {
          label: 'Change Icon',
          icon: 'mdi-emoticon-outline',
          onClick: () => {
            nodeAction(option, () => {
              isShowChooseIconModal.value = true
            })
          },
        },
      ].filter(Boolean)
    }

    const { editingNode, nodeAction, handleContextmenu } = useContextMenu(getMenuOptions)

    onMounted(() => {
      window.addEventListener('keydown', listenShortcuts)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', listenShortcuts)
    })
    // 全局快捷键：Ctrl+S 保存内存中的修改，Ctrl+L 锁定
    const listenShortcuts = (event) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void saveDatabase()
      } else if (key === 'l') {
        event.preventDefault()
        void handleToggleLock()
      }
    }

    const {
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
      showRenameModal,
      isShowChooseIconModal,
      handleSelectIcon,
      handleToggleLock,
    } = useKeeNoteGroupManage(editingNode)

    const { saveDatabase } = useDatabaseSave()

    onActivated(async () => {
      if (db.isOpen) {
        await getGroupTree()
      } else {
        await handleOpenDatabase()
      }
    })

    // 新建条目/分组统一放到顶栏的“+”菜单
    const createMenuOptions = computed(() => {
      if (!keeStore.isDbOpened || !editingUuid.value) {
        return []
      }
      return [
        {
          label: 'Create Note',
          icon: 'mdi-note-plus-outline',
          onClick: () => {
            // 顶栏“+”菜单始终创建在当前选中的分组中
            editingNode.value = null
            handleCreateEntry()
          },
        },
        {
          label: 'Create Group',
          icon: 'mdi-folder-plus-outline',
          onClick: () => {
            editingNode.value = null
            handleCreateGroup()
          },
        },
      ]
    })

    const menuOptionsBase = [
      {
        label: 'Settings',
        icon: 'mdi-cog-outline',
        onClick: () => {
          globalEventBus.emit(GlobalEvents.SHOW_SETTINGS)
        },
      },
    ].filter(Boolean)

    const menuOptions = computed(() => {
      const options = [
        {
          label: settingsStore.isCalendarView ? 'List View' : 'Calendar View',
          icon: settingsStore.isCalendarView
            ? 'mdi-format-list-bulleted'
            : 'mdi-calendar-month-outline',
          onClick: () => {
            settingsStore.isCalendarView = !settingsStore.isCalendarView
          },
        },
        ...menuOptionsBase,
      ]
      const groupOptions = groupUuid.value ? getMenuOptions(null, undefined, false) : []
      if (!groupOptions.length) {
        return options
      }
      return [
        ...groupOptions,
        {
          label: '',
          divided: 'self',
        },
        ...options,
      ]
    })

    const updateSidebarCollapsed = (sizes: number[]) => {
      settingsStore.isSidebarCollapsed = (sizes?.[0] ?? 0) <= 0
    }

    const handleSplitterCollapse = (_index: number, _type: string, sizes: number[]) => {
      updateSidebarCollapsed(sizes)
    }

    const handleSplitterResizeEnd = (_index: number, sizes: number[]) => {
      updateSidebarCollapsed(sizes)
    }

    const noteWindowProps = (win: ManagedWindow<NoteWindowData>) => {
      const style = {
        minWidth: '320px',
        minHeight: '200px',
        outline: 'none',
      }

      if (win.data.kind === 'search') {
        return {
          class: 'search-window',
          style,
          initWinOptions: {
            width: 'min(620px, 92vw)',
            height: 'min(640px, 80vh)',
          },
        }
      }

      // 详情窗口层叠摆放，新窗口相对旧窗口偏移，避免完全重叠。
      // 与 vgo-ui WindowManager 的“新建记事本”示例一致。
      const detailIndex = noteWindows.windows
        .filter((item) => item.data.kind === 'detail')
        .indexOf(win)
      const cascadeIndex = detailIndex === -1 ? 0 : detailIndex

      return {
        class: 'detail-window',
        style,
        initCenter: false,
        initWinOptions: {
          width: 'min(960px, 90vw)',
          height: 'min(720px, 85vh)',
          left: `${80 + cascadeIndex * 32}px`,
          top: `${80 + cascadeIndex * 32}px`,
        },
      }
    }

    onBeforeUnmount(() => {
      closeAllNoteWindows()
    })

    const handleOpenSearch = () => {
      openSearchWindow()
    }

    const treeProps = {
      children: 'children',
      label: 'title',
    }

    const handleNodeClick = (data: GroupItem) => {
      selectedKeys.value = [data.uuid]
    }

    return {
      settingsStore,
      keeStore,
      groupTree,
      selectedKeys,
      menuOptions,
      createMenuOptions,
      editingNode,
      isShowChooseIconModal,
      treeProps,
      handleNodeClick,
      handleTreeDrop,
      allowTreeDrop,
      handleSelectIcon,
      handleToggleLock,
      noteWindows,
      noteWindowProps,
      saveDatabase,
      handleOpenSearch,
      handleContextmenu,
      handleSplitterCollapse,
      handleSplitterResizeEnd,
    }
  },
})
</script>

<template>
  <div class="note-layout">
    <div class="nav-header-content vgo-panel vgo-panel--flat">
      <div class="vgo-u-flex-wrap-center">
        <span class="logo-icon  mdi mdi-lock"> </span>
        <span class="note-title"> KeeNote {{ keeStore.isDirty ? '•' : '' }}</span>

        <button class="vgo-button vgo-button--text vgo-button--icon save-button"
          :class="{ 'is-dirty': keeStore.isDirty }" :disabled="!keeStore.isDirty"
          :title="keeStore.isDirty ? 'Save (Ctrl+S)' : 'All changes saved'" @click="saveDatabase">
          <span class="mdi vgo-u-icon-md"
            :class="keeStore.isDirty ? 'mdi-content-save' : 'mdi-content-save-check-outline'" />
        </button>
      </div>

      <div class="vgo-u-flex-wrap-center">
        <button class="vgo-button vgo-button--text vgo-button--icon" :title="keeStore.isDbOpened ? 'Lock' : 'Unlock'"
          @click="handleToggleLock">
          <span v-if="keeStore.isDbOpened" class="vgo-u-icon-md mdi mdi-lock-outline"></span>
          <span class="vgo-u-icon-md mdi mdi-key" v-else></span>
        </button>

        <button class="vgo-button vgo-button--text vgo-button--icon" title="Search" @click="handleOpenSearch">
          <span class="vgo-u-icon-md mdi mdi-magnify"></span>
        </button>

        <MenuTrigger v-if="createMenuOptions.length" :items="createMenuOptions">
          <button class="vgo-button vgo-button--text vgo-button--icon" title="Create">
            <span class="vgo-u-icon-md mdi mdi-plus"></span>
          </button>
        </MenuTrigger>

        <MenuTrigger :items="menuOptions">
          <button class="vgo-button vgo-button--text vgo-button--icon" title="Menu">
            <span class="vgo-u-icon-md mdi mdi-dots-vertical"></span>
          </button>
        </MenuTrigger>
      </div>
    </div>
    <el-splitter class="note-splitter" @collapse="handleSplitterCollapse" @resize-end="handleSplitterResizeEnd">
      <el-splitter-panel class="layout-sidebar-panel" size="240" min="160" collapsible>
        <div class="tree-wrap-outer">
          <div class="tree-wrap content-padding">
            <el-tree :data="groupTree" node-key="uuid" :props="treeProps" :current-node-key="selectedKeys[0]"
              highlight-current default-expand-all :expand-on-click-node="false" draggable :allow-drop="allowTreeDrop"
              @node-click="handleNodeClick" @node-contextmenu="(event, data) => handleContextmenu(event, data)"
              @node-drop="handleTreeDrop">
              <template #default="{ data }">
                <span class="tree-node">
                  <IconDisplay :icon="data.icon" :size="18" />
                  <span class="tree-node__title">{{ data.title }}</span>
                </span>
              </template>
            </el-tree>
          </div>
        </div>
      </el-splitter-panel>
      <el-splitter-panel class="layout-content-panel">
        <template v-if="groupTree.length">
          <CalendarView v-if="settingsStore.isCalendarView" />
          <ListView v-else />
        </template>
      </el-splitter-panel>
    </el-splitter>

    <DialogIconChooser v-model:visible="isShowChooseIconModal" @onSelectIcon="handleSelectIcon" />

  </div>

  <WindowStack :manager="noteWindows" :window-props="noteWindowProps">
    <template #title="{ win }">
      <template v-if="win.data.kind === 'detail'">
        <IconDisplay v-if="win.data.icon !== undefined" class="detail-window-title-icon" :icon="win.data.icon"
          :bg-color="win.data.bgColor ?? undefined" :fg-color="win.data.fgColor ?? undefined" :size="20"
          title="Double-click to close" @dblclick.stop="noteWindows.requestClose(win.id)" />
        <span v-else class="vgo-u-icon-md mdi mdi-note-text-outline detail-window-title-icon"
          title="Double-click to close" @dblclick.stop="noteWindows.requestClose(win.id)" />
      </template>
      <span v-else class="vgo-u-icon-md mdi mdi-magnify detail-window-title-icon" title="Double-click to close"
        @dblclick.stop="noteWindows.requestClose(win.id)" />
      <span class="detail-window-title-text">{{ win.title }}</span>
    </template>

    <template #default="{ win, close }">
      <DetailView v-if="win.data.kind === 'detail'" :uuid="win.data.uuid" @close="close" />
      <SearchDatabaseView v-else />
    </template>
  </WindowStack>

  <WindowDock :manager="noteWindows" class="detail-window-dock">
    <template #icon="{ win }">
      <span class="dock-icon-wrap vgo-panel">
        <IconDisplay v-if="win.data.kind === 'detail' && win.data.icon !== undefined" :icon="win.data.icon"
          :bg-color="win.data.bgColor ?? undefined" :fg-color="win.data.fgColor ?? undefined" :size="20" />
        <span v-else class="mdi" :class="win.data.kind === 'search' ? 'mdi-magnify' : 'mdi-note-text-outline'" />
      </span>
    </template>
  </WindowDock>
</template>

<style lang="scss" scoped>
.note-layout {
  height: 100%;
  display: flex;
  flex-direction: column;

  .nav-header-content {
    padding: 8px 24px;
    box-sizing: border-box;
    user-select: none;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--vgo-border);

    .vgo-button vgo-button--text vgo-button--icon {
      .mdi {
        font-size: 24px;
      }
    }

    .vgo-u-flex-wrap-center {
      gap: 16px;
    }

    .logo-icon {
      border: 2px solid var(--primary);
      border-radius: 50%;
      color: var(--primary);
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .note-title {
      @media screen and (max-width: 500px) {
        display: none;
      }
    }
  }

  .note-splitter {
    flex: 1;
    min-height: 0;
    background: var(--vgo-surface);
  }

  .layout-sidebar-panel {
    overflow: hidden;
    border-right: 1px solid var(--vgo-border);
  }

  .layout-content-panel {
    overflow: hidden;
  }

  .tree-wrap-outer {
    height: 100%;
    overflow: hidden;
  }

  .tree-wrap {
    height: 100%;
    overflow: auto;
    min-width: 150px;
  }

  .tree-node {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    &__title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.detail-window-title-icon {
  flex-shrink: 0;
  cursor: default;
}

.detail-window-title-text {
  overflow: hidden;
  font-size: var(--vgo-font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 全局保存按钮：有未保存修改时高亮，无修改时置灰 */
.save-button {
  .mdi {
    transition: color var(--vgo-duration-fast) ease;
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }

  &.is-dirty .mdi {
    color: var(--primary);
  }
}

.dock-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--vgo-control-md);
  height: var(--vgo-control-md);
}

.detail-window-dock {
  position: fixed;
  bottom: var(--vgo-space-1);
  left: var(--vgo-space-1);
  z-index: var(--vgo-z-sticky);
  gap: 2px;

  :deep(.vgo-window-dock__item) {
    position: relative;
    gap: 2px;
    padding: 2px var(--vgo-space-1) 3px;
    border-radius: var(--vgo-radius);
    transition: background-color var(--vgo-duration-fast) ease;

    &:hover {
      background-color: var(--vgo-hover);
    }

    &:active {
      background-color: var(--vgo-primary-opacity);
    }
  }

  :deep(.vgo-window-dock__icon) {
    font-size: var(--vgo-icon-lg);
    line-height: 1;
    color: var(--vgo-primary);
  }

  :deep(.vgo-window-dock__indicator) {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background-color: var(--vgo-text-secondary);
    transition: opacity var(--vgo-duration-fast) ease;
  }

  :deep(.vgo-window-dock__item.is-active .vgo-window-dock__indicator) {
    background-color: var(--vgo-primary);
  }

  :deep(.vgo-window-dock__item.is-minimized .vgo-window-dock__icon) {
    opacity: 0.55;
  }

  :deep(.vgo-window-dock__item.is-minimized .vgo-window-dock__indicator) {
    opacity: 0.35;
  }

  :deep(.vgo-window-dock__item.is-drag-source) {
    opacity: 0.5;
  }

  :deep(.vgo-window-dock__item.is-drop-before::after),
  :deep(.vgo-window-dock__item.is-drop-after::after) {
    content: '';
    position: absolute;
    top: var(--vgo-space-1);
    bottom: var(--vgo-space-1);
    width: 2px;
    background-color: var(--vgo-primary);
    pointer-events: none;
  }

  :deep(.vgo-window-dock__item.is-drop-before::after) {
    left: -2px;
  }

  :deep(.vgo-window-dock__item.is-drop-after::after) {
    right: -2px;
  }
}
</style>
