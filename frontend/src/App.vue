<script lang="ts">
import AppContent from './AppContent.vue'
import {useGlobalTheme} from './hooks/use-global-theme'
import {useGlobalShortcuts} from '@/hooks/use-global-shortcuts'
import {useSettingsStore} from '@/store/settings'
import moment from 'moment/moment'

export default defineComponent({
  setup() {
    const settingsStore = useSettingsStore()

    useGlobalShortcuts()
    useGlobalTheme()

    watch(
      () => settingsStore.calendarWeekIndex,
      (val) => {
        moment.updateLocale(moment.locale(), {
          week: {
            dow: val > -1 ? val : moment.localeData().firstDayOfWeek(),
          },
        })
      },
      {immediate: true},
    )
  },
  render() {
    return h(AppContent)
  },
})
</script>
