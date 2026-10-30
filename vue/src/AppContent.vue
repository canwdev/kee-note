<script lang="ts">
import GlobalSettings from '@/components/Settings/GlobalSettings.vue'
import globalEventBus, {GlobalEvents} from '@/utils/bus'
import {kService} from '@/api'
import {useSettingsStore} from '@/store/settings'
import {useKeeStore} from '@/store/kee-store'
import {useBeforeUnload} from '@/hooks/use-changed'
import dialog from '@/utils/dialog'
import {ElMessage, ElNotification} from 'element-plus'
import NProgress from 'nprogress'

NProgress.configure({
  showSpinner: true,
})

export default defineComponent({
  components: {
    GlobalSettings,
  },
  setup() {
    const settingsStore = useSettingsStore()
    const keeStore = useKeeStore()

    window.$message = ElMessage
    window.$dialog = dialog
    window.$notification = ElNotification
    window.$loadingBar = NProgress

    const settingsVisible = ref(false)
    const handleShowSettings = () => {
      settingsVisible.value = true
    }

    const saveAction = async (options: any = {}) => {
      const {resolve, reject} = options
      try {
        if (settingsStore.enableAutoSave) {
          await kService.saveDatabase()
          console.info('Database saved!')
        } else {
          // 如果是手动保存，需要用户手动点击保存按钮，才能写入文件
          keeStore.isNotSave = true
          console.info('Auto save disabled')
        }
        resolve()
      } catch (e) {
        reject(e)
      }
    }

    onMounted(() => {
      globalEventBus.on(GlobalEvents.SHOW_SETTINGS, handleShowSettings)
      globalEventBus.on(GlobalEvents.SAVE_DATABASE, saveAction)
    })
    onBeforeUnmount(() => {
      globalEventBus.off(GlobalEvents.SHOW_SETTINGS, handleShowSettings)
      globalEventBus.off(GlobalEvents.SAVE_DATABASE, saveAction)
    })

    // 提示用户不要直接关闭页面
    useBeforeUnload(() => keeStore.isNotSave)

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
