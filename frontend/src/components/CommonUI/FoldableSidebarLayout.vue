<script setup lang="ts">
import {useVModel} from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)
const emit = defineEmits(['update:modelValue'])

const isSidebarExpand = useVModel(props, 'modelValue', emit, {passive: true})
</script>

<template>
  <div class="foldable-sidebar-layout">
    <div class="layout-sidebar" :class="{'is-expand': isSidebarExpand}">
      <slot name="sidebar"></slot>

      <button
        class="btn-toggle-expand vgo-u-button-reset"
        @click="isSidebarExpand = !isSidebarExpand"
      >
        <svg
          width="16"
          height="16"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
        >
          <g fill="none">
            <path
              d="M10.354 3.146a.5.5 0 0 1 0 .708L6.207 8l4.147 4.146a.5.5 0 0 1-.708.708l-4.5-4.5a.5.5 0 0 1 0-.708l4.5-4.5a.5.5 0 0 1 .708 0z"
              fill="currentColor"
            ></path>
          </g>
        </svg>
      </button>
    </div>
    <div class="layout-content">
      <slot></slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.foldable-sidebar-layout {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  background: var(--vgo-surface);

  .layout-sidebar {
    width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: width var(--vgo-duration-fast);

    &.is-expand {
      width: 240px;
      border-right: 1px solid var(--vgo-border);

      .btn-toggle-expand svg {
        transform: rotateY(0);
      }
    }

    .btn-toggle-expand {
      position: absolute;
      left: 100%;
      top: 50%;
      transform: translateY(-50%);
      z-index: var(--vgo-z-sticky);
      padding: 4px;
      color: var(--vgo-text-secondary);
      background: var(--vgo-surface);
      border: 1px solid var(--vgo-border);
      border-left: none;
      border-radius: 0 var(--vgo-radius) var(--vgo-radius) 0;

      svg {
        transform: rotateY(180deg);
      }
    }
  }

  .layout-content {
    flex: 1;
    flex-shrink: 0;
    overflow: hidden;
  }
}
</style>
