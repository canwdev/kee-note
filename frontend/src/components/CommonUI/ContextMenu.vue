<script setup lang="ts">
import {onBeforeUnmount, ref, watch} from 'vue'
import type {ContextMenuItem} from '@/hooks/use-context-menu'

const props = defineProps<{
  show: boolean
  x: number
  y: number
  options: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'select', item: ContextMenuItem): void
  (e: 'close'): void
}>()

const menuEl = ref<HTMLElement | null>(null)

const handleDocumentClick = (e: MouseEvent) => {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      setTimeout(() => document.addEventListener('mousedown', handleDocumentClick, true))
    } else {
      document.removeEventListener('mousedown', handleDocumentClick, true)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show && options.length"
      ref="menuEl"
      class="common-context-menu vgo-panel vgo-u-scrollbar"
      :style="{left: `${x}px`, top: `${y}px`}"
    >
      <template v-for="(item, index) in options" :key="index">
        <div v-if="item.split" class="common-context-menu__split" />
        <div
          v-else
          class="vgo-list-item common-context-menu__item"
          @click="emit('select', item)"
        >
          {{ item.label }}
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.common-context-menu {
  position: fixed;
  z-index: var(--vgo-z-menu);
  min-width: 180px;
  max-height: 70vh;
  overflow: auto;
  padding: var(--vgo-space-1);

  &__item {
    cursor: pointer;
    white-space: nowrap;
  }

  &__split {
    height: 1px;
    margin: var(--vgo-space-1) 0;
    background: var(--vgo-border);
  }
}
</style>
