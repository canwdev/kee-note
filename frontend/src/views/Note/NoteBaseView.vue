<script lang="ts">
import { kService } from '@/api'
import { GroupItem } from '@/enum/kdbx'
import { defineComponent } from 'vue'
import { WindowDock, WindowStack } from '@canwdev/vgo-ui'
import globalEventBus, { GlobalEvents, saveDatabaseAsync } from '@/utils/bus'
import { useContextMenu } from '@/hooks/use-context-menu'
import ListView from '@/components/NoteViews/ListView.vue'
import CalendarView from '@/components/NoteViews/Calendar/CalendarView.vue'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import DialogIconChooser from '@/components/NoteViews/Dialogs/DialogIconChooser.vue'
import { useMainStore } from '@/store/main'

import { importEntryListJson } from '@/utils/export-import'
import { useSettingsStore } from '@/store/settings'
import { useKeeNoteGroupManage, useKeeNoteSaveClose } from '@/hooks/use-keenote'
import DetailView from '@/views/Note/DetailView.vue'
import { checkDatabaseIsOpen } from '@/api/keepass'
import DialogSearch from '@/components/NoteViews/DataSearch/DialogSearch.vue'
import MenuTrigger from '@/components/CommonUI/MenuTrigger.vue'
import {
  closeAllDetailWindows,
  detailWindows,
} from '@/hooks/use-detail-windows'

export default defineComponent({
  name: 'NoteLayout',
  components: {
    IconDisplay,
    DialogSearch,
    MenuTrigger,
    WindowDock,
    WindowStack,
    DetailView,
    ListView,
    CalendarView,
    DialogIconChooser,
  },
  setup() {
    const mainStore = useMainStore()
    const settingsStore = useSettingsStore()

    const getMenuOptions = (option, event?: MouseEvent) => {
      let isRootSelected = option
        ? option.uuid === rootGroupUuid.value
        : groupUuid.value === rootGroupUuid.value

      const isShiftPressed = event?.shiftKey

      let isEmptyRecycleBin = false
      if (option) {
        isEmptyRecycleBin = keeStore.recycleBinUuid === option.uuid
      } else {
        isEmptyRecycleBin = keeStore.recycleBinUuid === editingUuid.value
      }

      return [
        {
          label: 'Create Note',
          icon: 'mdi-note-plus-outline',
          onClick: () => {
            nodeAction(option, () => {
              handleCreateEntry()
            })
          },
        },
        {
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
        {
          label: 'Import JSON',
          icon: 'mdi-import',
          onClick: () => {
            handleImportJson()
          },
        },
        !isRootSelected && {
          label: isEmptyRecycleBin
            ? 'Empty Recycle Bin'
            : isShiftPressed
              ? 'Permanent Delete'
              : 'Move to Recycle Bin',
          icon: isEmptyRecycleBin
            ? 'mdi-delete-empty-outline'
            : isShiftPressed
              ? 'mdi-delete-forever-outline'
              : 'mdi-trash-can-outline',
          onClick: () => {
            nodeAction(option, () => {
              confirmRemoveGroup(isShiftPressed)
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
    const listenShortcuts = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'l') {
          event.preventDefault()
          if (!keeStore.isChanged) {
            handleToggleLock()
          }
        } else if (key === 's') {
          if (!detailWindows.windows.length) {
            event.preventDefault()
            if (keeStore.isNotSave) {
              // TODO: 处理快速重复按键，避免重复请求
              commonSaveDatabase()
            }
          }
        }
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
      handleTreeDrop,
      showRenameModal,
      isShowChooseIconModal,
      handleSelectIcon,
      handleToggleLock,
    } = useKeeNoteGroupManage(editingNode)

    const { commonSaveDatabase } = useKeeNoteSaveClose()

    onActivated(async () => {
      keeStore.isDbOpened = await kService.checkDatabaseIsOpen()
      if (keeStore.isDbOpened) {
        await getGroupTree()
      } else {
        await handleOpenDatabase()
      }
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
      if (groupUuid.value) {
        return [
          ...getMenuOptions(null),
          {
            label: '',
            divided: 'self',
          },
          ...options,
        ]
      }
      return options
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

    const handleImportJson = async () => {
      await importEntryListJson(editingUuid.value)
    }

    const detailWindowProps = () => ({
      class: 'detail-window',
      style: {
        minWidth: '320px',
        minHeight: '200px',
        outline: 'none',
      },
      initWinOptions: {
        width: 'min(960px, 90vw)',
        height: 'min(720px, 85vh)',
      },
    })

    const detailViewRefs = new Map<string, any>()

    const setDetailViewRef = (id: string, el: any) => {
      if (el) {
        detailViewRefs.set(id, el)
      } else {
        detailViewRefs.delete(id)
      }
    }

    const handleDetailSave = (id: string) => {
      detailViewRefs.get(id)?.handleSave?.()
    }

    onBeforeUnmount(() => {
      closeAllDetailWindows()
    })

    const isShowSearchDialog = ref(false)

    const treeProps = {
      children: 'children',
      label: 'title',
    }

    const handleNodeClick = (data: GroupItem) => {
      selectedKeys.value = [data.uuid]
    }

    return {
      mainStore,
      settingsStore,
      keeStore,
      groupTree,
      selectedKeys,
      menuOptions,
      editingNode,
      isShowChooseIconModal,
      treeProps,
      handleNodeClick,
      handleTreeDrop,
      handleSelectIcon,
      handleToggleLock,
      detailWindows,
      detailWindowProps,
      setDetailViewRef,
      handleDetailSave,
      commonSaveDatabase,
      isShowSearchDialog,
      handleContextmenu,
      handleSplitterCollapse,
      handleSplitterResizeEnd,
    }
  },
})
</script>

<template>
  <div class="note-layout">
    <div class="nav-header-content">
      <div class="vgo-u-flex-wrap-center">
        <span class="logo-icon mdi mdi-lock"> </span>
        <span class="note-title"> KeeNote {{ keeStore.isNotSave ? '*' : '' }}</span>

        <button v-if="keeStore.isNotSave" @click="commonSaveDatabase" title="Save (ctrl+s)" class="vgo-u-button-reset">
          <span class="mdi mdi-content-save"></span>
        </button>
      </div>

      <div class="vgo-u-flex-wrap-center">
        <button class="vgo-u-button-reset" :title="keeStore.isDbOpened ? 'Lock' : 'Unlock'" @click="handleToggleLock">
          <span v-if="keeStore.isDbOpened" class="mdi mdi-shield-lock"></span>
          <span class="mdi mdi-key" v-else></span>
        </button>

        <button class="vgo-u-button-reset" title="Search" @click="isShowSearchDialog = true">
          <span class="mdi mdi-magnify"></span>
        </button>

        <MenuTrigger :items="menuOptions">
          <button class="vgo-u-button-reset" title="Menu">
            <span class="mdi mdi-cog"></span>
          </button>
        </MenuTrigger>
      </div>
    </div>
    <el-splitter class="note-splitter" @collapse="handleSplitterCollapse" @resize-end="handleSplitterResizeEnd">
      <el-splitter-panel class="layout-sidebar-panel" size="240" min="160" collapsible>
        <div class="tree-wrap-outer">
          <div class="tree-wrap content-padding">
            <el-tree :data="groupTree" node-key="uuid" :props="treeProps" :current-node-key="selectedKeys[0]"
              highlight-current default-expand-all :expand-on-click-node="false" draggable @node-click="handleNodeClick"
              @node-contextmenu="(event, data) => handleContextmenu(event, data)"
              @node-drop="(dragNode, dropNode) => handleTreeDrop(dragNode.data, dropNode.data)">
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

  <WindowStack :manager="detailWindows" :window-props="detailWindowProps">
    <template #title="{ win }">
      <IconDisplay v-if="win.data.icon !== undefined" class="detail-window-title-icon" :icon="win.data.icon"
        :bg-color="win.data.bgColor" :fg-color="win.data.fgColor" :size="20" title="Double-click to close"
        @dblclick.stop="detailWindows.requestClose(win.id)" />
      <span v-else class="mdi mdi-note-text-outline detail-window-title-icon" title="Double-click to close"
        @dblclick.stop="detailWindows.requestClose(win.id)" />
      <span class="detail-window-title-text">
        <span v-if="win.data.dirty" class="detail-window-dirty">• </span>{{ win.title }}
      </span>
    </template>

    <template #controls="{ win }">
      <button class="vgo-button vgo-button--text" :class="{ 'vgo-button--primary': win.data.savePrimary }"
        :disabled="win.data.saveDisabled" @click="handleDetailSave(win.id)">
        <span class="mdi mdi-content-save" />
        {{ win.data.saveLabel }}
      </button>
    </template>

    <template #default="{ win, close }">
      <DetailView :ref="(el) => setDetailViewRef(win.id, el)" :uuid="win.data.uuid" @close="close" />
    </template>
  </WindowStack>

  <WindowDock :manager="detailWindows" class="detail-window-dock">
    <template #icon>
      <span class="dock-icon-wrap vgo-panel">
        <span class="mdi mdi-note-text-outline" />
      </span>
    </template>
  </WindowDock>

  <DialogSearch v-model:visible="isShowSearchDialog" />
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

    .vgo-u-button-reset {
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

.detail-window-dirty {
  color: var(--primary);
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
