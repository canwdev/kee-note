<script lang="ts">
import { defineComponent } from 'vue'
import { useModelWrapper } from '@/hooks/use-model-wrapper'
import { kService } from '@/api'
import { EntryItem } from '@/enum/kdbx'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import { formatDate } from '@/utils'
import { ModalWindow } from '@canwdev/vgo-ui'
import { openDetailWindow } from '@/hooks/use-detail-windows'

export default defineComponent({
  name: 'DialogSearch',
  components: {
    ModalWindow,
    IconDisplay,
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
  setup(props, { emit }) {
    const mVisible = useModelWrapper(props, emit, 'visible')
    const searchKeyword = ref('')
    const isLoading = ref(false)
    const isShowSearchSettings = ref(false)
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

    const handleOpenDetail = (item: EntryItem) => {
      openDetailWindow(item.uuid, item.title)
    }

    return {
      mVisible,
      searchKeyword,
      handleSearch,
      resultList,
      formatDate,
      handleOpenDetail,
      isLoading,
      isShowSearchSettings,
    }
  },
})
</script>

<template>
  <ModalWindow v-model:visible="mVisible" title="Search Database" :mask-closable="false"
    :init-win-options="{ width: '620px' }">
    <div class="search-bar">
      <el-button @click="isShowSearchSettings = !isShowSearchSettings">
        <el-icon><span class="mdi mdi-cog" /></el-icon>
      </el-button>
      <el-input placeholder="Search keyword in title or notes" clearable v-model="searchKeyword"
        @keyup.enter="handleSearch" />
      <el-button :disabled="isLoading" type="primary" @click="handleSearch">Search</el-button>
    </div>

    <el-collapse-transition>
      <div v-show="isShowSearchSettings" class="search-settings">TBD</div>
    </el-collapse-transition>

    <div class="search-results">
      <el-empty v-if="!resultList.length" description="No Data" />
      <div v-else class="search-result-list">
        <div class="vgo-list-item search-result-item" v-for="item in resultList" :key="item.uuid"
          @click="handleOpenDetail(item)">
          <IconDisplay :icon="item.icon" :size="28" :bg-color="item.bgColor" :fg-color="item.fgColor" />
          <div class="search-result-item__content">
            <div class="search-result-item__title">{{ item.title }}</div>
            <el-tag type="info">
              CT: {{ formatDate(item.creationTime) }}
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </ModalWindow>
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
