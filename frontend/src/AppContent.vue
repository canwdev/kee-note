<script lang="ts">
import GlobalSettings from '@/components/Settings/GlobalSettings.vue'
import globalEventBus, {GlobalEvents} from '@/utils/bus'
import {useKeeStore} from '@/store/kee-store'
import {useBeforeUnload} from '@/hooks/use-changed'
import {useSiteTitle} from '@/hooks/use-site-title'
import dialog from '@/utils/dialog'
import {ElMessage} from 'element-plus'

export default defineComponent({
  components: {
    GlobalSettings,
  },
  setup() {
    const keeStore = useKeeStore()

    useSiteTitle()

    window.$message = ElMessage
    window.$dialog = dialog

    const settingsVisible = ref(false)
    const handleShowSettings = () => {
      settingsVisible.value = true
    }

    onMounted(() => {
      globalEventBus.on(GlobalEvents.SHOW_SETTINGS, handleShowSettings)
    })
    onBeforeUnmount(() => {
      globalEventBus.off(GlobalEvents.SHOW_SETTINGS, handleShowSettings)
    })

    // 内存中有未保存的修改时，阻止直接关闭/刷新标签页
    useBeforeUnload(() => keeStore.isDirty)

    return {
      settingsVisible,
    }
  },
})
</script>
<template>
  <router-view v-slot="{Component, route}">
    <keep-alive v-if="route.meta && route.meta.keepAlive">
      <component :is="Component" :key="route.name" />
    </keep-alive>
    <component :is="Component" v-else :key="route.name" />
  </router-view>
  <GlobalSettings v-model:visible="settingsVisible" />
</template>
