<script lang="ts">
import {defineComponent, PropType} from 'vue'
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import {EntryItem} from '@/enum/kdbx'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import {Palette} from '@/enum'
import DialogIconChooser from '@/components/NoteViews/Dialogs/DialogIconChooser.vue'

export default defineComponent({
  name: 'DialogEntryIconColor',
  components: {
    IconDisplay,
    DialogIconChooser,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    entryDetail: {
      type: Object as PropType<EntryItem | null>,
      default: null,
    },
  },
  setup(props, {emit}) {
    const {entryDetail} = toRefs(props)
    const mVisible = useModelWrapper(props, emit, 'visible')

    const isShowIconChooser = ref(false)

    return {
      mVisible,
      swatches: Palette.map((i) => i.color),
      isShowIconChooser,
      handleSelectIcon(index) {
        if (entryDetail.value) {
          entryDetail.value.icon = index
        }
        isShowIconChooser.value = false
      },
    }
  },
})
</script>

<template>
  <el-dialog v-model="mVisible" title="Edit Icon & Color" width="440px" append-to-body>
    <div v-if="entryDetail" class="icon-color-list">
      <div class="icon-color-row">
        <span>Icon</span>
        <el-button @click="isShowIconChooser = true">
          <IconDisplay
            :icon="entryDetail.icon"
            :bg-color="entryDetail.bgColor"
            :fg-color="entryDetail.fgColor"
          />
        </el-button>
      </div>
      <div class="icon-color-row">
        <span>Background Color</span>
        <el-color-picker
          v-model="entryDetail.bgColor"
          :predefine="swatches"
          show-alpha
        />
      </div>
      <div class="icon-color-row">
        <span>Foreground Color</span>
        <el-color-picker
          v-model="entryDetail.fgColor"
          :predefine="swatches"
          show-alpha
        />
      </div>
    </div>

    <DialogIconChooser v-model:visible="isShowIconChooser" @onSelectIcon="handleSelectIcon" />
  </el-dialog>
</template>

<style lang="scss" scoped>
.icon-color-list {
  display: flex;
  flex-direction: column;
  gap: var(--vgo-space-3);
}

.icon-color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--vgo-space-3);
}
</style>
