<script lang="ts">
import {defineComponent} from 'vue'
import keepassIcons from '@/assets/icons'

export default defineComponent({
  name: 'IconDisplay',
  props: {
    icon: {
      type: Number,
      default: 0,
    },
    size: {
      type: Number,
      default: 24,
    },
    isPixel: {
      type: Boolean,
      default: false,
    },
    bgColor: {
      type: String,
      default: null,
    },
    fgColor: {
      type: String,
      default: null,
    },
  },
  setup(props) {
    const {icon} = toRefs(props)
    const iconSrc = computed(() => {
      return String(keepassIcons[icon.value])
    })
    return {
      iconSrc,
    }
  },
})
</script>

<template>
  <div
    class="icon-display"
    :style="{
      height: size + 'px',
      width: size + 'px',
      backgroundColor: bgColor,
      '--icon-fg-color': fgColor || 'transparent',
    }"
    :title="String(icon)"
  >
    <img :src="iconSrc" :class="{'is-pixel': isPixel}" :alt="String(icon)" />
  </div>
</template>

<style lang="scss" scoped>
.icon-display {
  display: inline-block;
  position: relative;
  border-radius: 4px;
  vertical-align: bottom;

  &::before {
    box-sizing: border-box;
    position: absolute;
    inset: 0;
    border: 2px solid var(--icon-fg-color);
    border-radius: inherit;
    content: '';
    pointer-events: none;
  }

  img {
    width: 100%;
    height: 100%;
    .is-pixel {
      image-rendering: pixelated;
    }
  }
}
</style>
