<script lang="ts">
import {EntryItem} from '@/enum/kdbx'
import {useRouter} from 'vue-router'
import {formatDate} from '@/utils'
import DialogGroupSelect from '@/components/NoteViews/Dialogs/DialogGroupSelect.vue'
import {useKeeNoteEntryList} from '@/hooks/use-keenote'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import {useCommonActions} from '@/components/NoteViews/use-common-actions'
import DialogEntryPreview from '@/components/NoteViews/Dialogs/DialogEntryPreview.vue'
import ContextMenu from '@/components/CommonUI/ContextMenu.vue'
import {MoreVertical20Regular} from '@vicons/fluent'

export default defineComponent({
  components: {
    DialogGroupSelect,
    DialogEntryPreview,
    ContextMenu,
    IconDisplay,
    MoreVertical20Regular,
  },
  setup() {
    const router = useRouter()
    const checkedRowKeys = ref<string[]>([])
    const {entryList, getEntryList, keeStore, groupUuid} = useKeeNoteEntryList({
      cleanupFn: () => {
        checkedRowKeys.value = []
      },
    })

    const {
      editingNode,
      nodeAction,
      handleContextmenu,
      isShowGroupSelectModal,
      isShowPreviewModal,
      handleSelectGroup,
      getMenuOptions,
      ...contextMenuEtc
    } = useCommonActions({getEntryList, checkedRowKeys})

    const page = ref(1)
    const pageSize = ref(10)

    watch(
      () => entryList.value,
      () => {
        page.value = 1
      },
    )

    const pagedEntries = computed(() => {
      const start = (page.value - 1) * pageSize.value
      return entryList.value.slice(start, start + pageSize.value)
    })

    const handleMenuCommand = (item: any) => {
      item?.props?.onClick?.()
    }

    const handleRowClick = (row: EntryItem, column: any) => {
      if (column?.type === 'selection') {
        return
      }
      keeStore.detailUuid = row.uuid
    }

    const handleSelectionChange = (rows: EntryItem[]) => {
      checkedRowKeys.value = rows.map((row) => row.uuid)
    }

    const handlePreviewRow = (row: EntryItem) => {
      nodeAction(row, () => {
        isShowPreviewModal.value = true
      })
    }

    onMounted(() => {
      if (keeStore.isDbOpened) {
        getEntryList()
      }
    })

    return {
      entryList,
      pagedEntries,
      page,
      pageSize,
      groupUuid,
      editingNode,
      nodeAction,
      handleContextmenu,
      ...contextMenuEtc,
      isShowGroupSelectModal,
      isShowPreviewModal,
      handleSelectGroup,
      checkedRowKeys,
      handleSelectionChange,
      handleRowClick,
      handleMenuCommand,
      handlePreviewRow,
      getMenuOptions,
      formatDate,
    }
  },
})
</script>

<template>
  <div class="note-list-view">
    <div class="content-padding">
      <el-table
        size="small"
        class="note-list-table"
        :data="pagedEntries"
        row-key="uuid"
        max-height="72vh"
        @selection-change="handleSelectionChange"
        @row-click="handleRowClick"
        @row-contextmenu="(row, column, event) => handleContextmenu(event, row)"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column width="60" align="center">
          <template #default="{row}">
            <IconDisplay
              :icon="row.icon"
              :bg-color="row.bgColor"
              :fg-color="row.fgColor"
              :size="24"
              @click.stop="handlePreviewRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="Title" sortable min-width="160" show-overflow-tooltip />
        <el-table-column prop="creationTime" label="Created" sortable width="180" show-overflow-tooltip>
          <template #default="{row}">{{ formatDate(new Date(row.creationTime)) }}</template>
        </el-table-column>
        <el-table-column prop="lastModTime" label="Updated" sortable width="180" show-overflow-tooltip>
          <template #default="{row}">{{ formatDate(new Date(row.lastModTime)) }}</template>
        </el-table-column>
        <el-table-column label="Action" width="70" align="center" fixed="right">
          <template #default="{row}">
            <el-dropdown trigger="click" @command="handleMenuCommand">
              <el-button text size="small" @click.stop>
                <el-icon :size="20"><MoreVertical20Regular /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="(opt, index) in getMenuOptions(row)"
                    :key="index"
                    :command="opt"
                  >
                    {{ opt.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="note-list-pagination"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[5, 10, 20, 50, 100, 200, 500, 1000]"
        :total="entryList.length"
        layout="total, sizes, prev, pager, next"
        size="small"
        background
      />
    </div>

    <el-dropdown v-if="checkedRowKeys.length" trigger="click" @command="handleMenuCommand">
      <el-button type="primary" size="small" class="batch-actions-button">
        Batch Actions ({{ checkedRowKeys.length }})
      </el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="(opt, index) in getMenuOptions(null)"
            :key="index"
            :command="opt"
          >
            {{ opt.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <ContextMenu
      :show="showRightMenu"
      :x="xRef"
      :y="yRef"
      :options="rightMenuOptions"
      @select="handleSelect"
      @close="handleClickOutside"
    />

    <DialogGroupSelect
      v-model:visible="isShowGroupSelectModal"
      :value="groupUuid"
      @onSubmit="handleSelectGroup"
    />

    <DialogEntryPreview
      v-model:visible="isShowPreviewModal"
      :uuid="editingNode && editingNode.uuid"
    />
  </div>
</template>

<style lang="scss" scoped>
.note-list-view {
  position: relative;
  height: 100%;
  overflow: auto;
  user-select: none;

  .note-list-pagination {
    margin-top: var(--vgo-space-2);
    justify-content: flex-end;
  }

  .batch-actions-button {
    position: absolute;
    top: 5px;
    left: 34px;
    z-index: 10;
  }
}
</style>
