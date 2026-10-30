<script lang="ts">
import {defineComponent} from 'vue'
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import {Search20Filled, Settings20Filled} from '@vicons/fluent'
import {kService} from '@/api'
import {EntryItem} from '@/enum/kdbx'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import {formatDate} from '@/utils'
import DialogEntryPreview from '@/components/NoteViews/Dialogs/DialogEntryPreview.vue'

export default defineComponent({
  name: 'DialogSearch',
  components: {
    DialogEntryPreview,
    IconDisplay,
    Settings20Filled,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: Number,
      default: null,
    },
  },
  setup(props, {emit}) {
    const mVisible = useModelWrapper(props, emit, 'visible')
    const searchKeyword = ref('')
    const isLoading = ref(false)
    const isShowSearchSettings = ref(false)
    const isShowPreviewModal = ref(false)
    const previewItem = ref<EntryItem | null>(null)
    const resultList = ref<EntryItem[]>([])

    const handleSearch = async () => {
      if (isLoading.value) {
        return
      }
      if (!searchKeyword.value) {
        resultList.value = []
        return
      }
      try {
        isLoading.value = true

        const list = await kService.searchDatabase({
          keyword: searchKeyword.value,
        })
        resultList.value = list || []
      } catch (e) {
        resultList.value = []
      } finally {
        isLoading.value = false
      }
    }

    const handlePreview = (item) => {
      previewItem.value = item
      isShowPreviewModal.value = true
    }

    return {
      mVisible,
      dialogIconRender: () => h(Search20Filled),
      searchKeyword,
      handleSearch,
      resultList,
      formatDate,
      isShowPreviewModal,
      previewItem,
      handlePreview,
      isLoading,
      isShowSearchSettings,
    }
  },
})
</script>

<template>
  <el-dialog
    v-model="mVisible"
    title="Search Database"
    width="620px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="search-bar">
      <el-button @click="isShowSearchSettings = !isShowSearchSettings">
        <el-icon><Settings20Filled /></el-icon>
      </el-button>
      <el-input
        placeholder="Search keyword in title or notes"
        clearable
        v-model="searchKeyword"
        @keyup.enter="handleSearch"
      />
      <el-button :disabled="isLoading" type="primary" @click="handleSearch">Search</el-button>
    </div>

    <el-collapse-transition>
      <div v-show="isShowSearchSettings" class="search-settings">TBD</div>
    </el-collapse-transition>

    <div class="search-results">
      <el-empty v-if="!resultList.length" description="No Data" />
      <div v-else class="search-result-list">
        <div
          class="vgo-list-item search-result-item"
          v-for="item in resultList"
          :key="item.uuid"
          @click="handlePreview(item)"
        >
          <IconDisplay
            :icon="item.icon"
            :size="28"
            :bg-color="item.bgColor"
            :fg-color="item.fgColor"
          />
          <div class="search-result-item__content">
            <div class="search-result-item__title">{{ item.title }}</div>
            <el-tag size="small" type="info">
              CT: {{ formatDate(item.creationTime) }}
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>

  <DialogEntryPreview
    v-model:visible="isShowPreviewModal"
    :uuid="previewItem?.uuid"
  />
</template>

<style lang="scss" scoped>
.search-bar {
  display: flex;
  align-items: center;
  gap: var(--vgo-space-2);

  .el-input {
    flex: 1;
  }
}

.search-settings {
  padding: var(--vgo-space-2) 0;
  color: var(--vgo-text-secondary);
}

.search-results {
  margin-top: var(--vgo-space-3);
  max-height: 55vh;
  overflow: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: var(--vgo-space-2);
  cursor: pointer;

  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--vgo-space-1);
    align-items: flex-start;
  }

  &__title {
    font-weight: 500;
  }
}
</style>
