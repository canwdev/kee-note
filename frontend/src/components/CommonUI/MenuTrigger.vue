<script setup lang="ts">
import {useContextMenuTrigger} from '@canwdev/vgo-ui'
import type {MenuItem, MenuPopDirection} from '@canwdev/vgo-ui'

const props = withDefaults(
  defineProps<{
    items: MenuItem[]
    direction?: MenuPopDirection
    gap?: number
    disabled?: boolean
  }>(),
  {
    direction: 'br',
    gap: 4,
    disabled: false,
  },
)

const {setTriggerRef, isOpen, toggle} = useContextMenuTrigger({
  items: () => props.items,
  direction: props.direction,
  gap: props.gap,
  iconFontClass: 'mdi',
})

const handleClick = (event: MouseEvent) => {
  if (props.disabled) {
    return
  }
  event.stopPropagation()
  toggle()
}
</script>

<template>
  <span
    :ref="setTriggerRef"
    class="vgo-menu-trigger"
    :class="{'is-active': isOpen, 'is-disabled': disabled}"
    @click="handleClick"
  >
    <slot :is-open="isOpen" />
  </span>
</template>

<style lang="scss" scoped>
.vgo-menu-trigger {
  display: inline-flex;
  align-items: center;

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
</style>
