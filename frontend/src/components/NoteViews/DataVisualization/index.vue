<script lang="ts">
import {defineComponent, PropType} from 'vue'
import AnnualHeatMap from '@/components/NoteViews/DataVisualization/AnnualHeatMap.vue'
import {CalendarData, useKeeNoteEntryList} from '@/hooks/use-keenote'
import moment from 'moment'

export default defineComponent({
  name: 'DataVisualization',
  components: {AnnualHeatMap},
  props: {
    show: {type: Boolean, default: true},
  },
  setup(props, {emit}) {
    const {show} = toRefs(props)

    const {calendarData, getEntryList} = useKeeNoteEntryList({
      isCalendar: true,
    })

    const isRenderContent = ref(false)
    watch(
      show,
      async (val) => {
        // 只在第一次show时渲染，节约资源
        if (val && !isRenderContent.value) {
          await getEntryList()
          setTimeout(() => {
            isRenderContent.value = true
          })
        }
      },
      {immediate: true}
    )

    return {
      isRenderContent,
      getEntryList,
      calendarData,
    }
  },
})
</script>

<template>
  <div v-show="show" class="data-visualization">
    <div class="nav-header">
      <div class="vgo-u-flex-wrap-center">
        <el-button text @click="$emit('onBack')">
          <span class="mdi mdi-arrow-left"></span>
        </el-button>
        <span class="nav-title">Data Visualization</span>
      </div>
      <el-button text size="small" @click="getEntryList">Refresh</el-button>
    </div>
    <div v-if="isRenderContent" class="visualization-content">
      <AnnualHeatMap
        :calendar-data="calendarData"
        @onSeriesClick="(data) => $emit('onSeriesClick', data)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.data-visualization {
  height: 100%;
  width: 100%;
  overflow: auto;
  padding: 0 16px;
  position: relative;
  box-sizing: border-box;
  .nav-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--vgo-surface);
    padding: 10px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vgo-space-2);

    .nav-title {
      font-size: var(--vgo-font-lg);
      font-weight: 600;
    }
  }
  .visualization-content {
    margin-top: 16px;
    width: 100%;
  }
}
</style>
