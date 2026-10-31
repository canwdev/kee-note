<script lang="ts">
import {defineComponent} from 'vue'
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import keepassIcons from '@/assets/icons'
import {ModalWindow} from '@canwdev/vgo-ui'

export default defineComponent({
  name: 'DialogIconChooser',
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
  setup(props, {emit}) {
    const mVisible = useModelWrapper(props, emit, 'visible')

    return {
      mVisible,
      keepassIcons,
      onSelectIcon(index) {
        emit('onSelectIcon', index)
      },
    }
  },
})
</script>

<template>
  <ModalWindow
    v-model:visible="mVisible"
    title="Choose Icon"
    :init-win-options="{width: '520px'}"
  >
    <div class="icon-chooser-grid">
      <el-button
        v-for="(item, index) in keepassIcons"
        :key="index"
        text
        @click="onSelectIcon(index)"
      >
        <IconDisplay :size="32" :icon="Number(index)" />
      </el-button>
    </div>
  </ModalWindow>
</template>

<style lang="scss" scoped>
.icon-chooser-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--vgo-space-1);
  max-height: 60vh;
  overflow: auto;
}
</style>
