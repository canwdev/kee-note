<script lang="ts" setup>
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import {useSettingsStore} from '@/store/settings'
import {ldThemeOptions} from '@/enum/settings'
import {ModalWindow, OptionUI, VgoOptionType} from '@canwdev/vgo-ui'
import type {VgoOptionItem} from '@canwdev/vgo-ui'
import moment from 'moment/moment'
import {useKdbxOptions} from '@/components/Settings/use-kdbx-options'
import {formatSiteTitle} from '@/router'

const props = withDefaults(
  defineProps<{
    visible: boolean
  }>(),
  {
    visible: true,
  },
)
const emit = defineEmits(['update:visible'])

const mVisible = useModelWrapper(props, emit, 'visible')

const settingsStore = useSettingsStore()
const {kdbxConfigOption} = useKdbxOptions(mVisible)

const optionList = computed((): VgoOptionItem[] => {
  let calendarSettings: VgoOptionItem[] = [
    {
      label: 'Enable Calendar View',
      key: 'isCalendarView',
      store: settingsStore,
      type: VgoOptionType.SWITCH,
    },
  ]
  if (settingsStore.isCalendarView) {
    calendarSettings = [
      ...calendarSettings,
      {
        label: 'Set First Day of Week',
        key: 'calendarWeekIndex',
        store: settingsStore,
        type: VgoOptionType.SELECT,
        options: [
          {
            label: 'Locale Default',
            value: -1,
          },
          ...moment.weekdays().map((item, index) => ({label: item, value: index})),
        ],
      },
      {
        label: 'Show Lunar Day',
        subtitle:
          '是否显示<a href="https://github.com/yize/solarlunar" target="_blank" rel="nofollow noopener">农历</a>和<a href="https://github.com/NateScarlet/holiday-cn" target="_blank" rel="nofollow noopener">中国节假日</a>',
        key: 'calendarShowLunar',
        store: settingsStore,
        type: VgoOptionType.SWITCH,
      },
      {
        label: 'Show Note Title',
        key: 'calendarShowTitle',
        store: settingsStore,
        type: VgoOptionType.SWITCH,
      },
    ]
  }

  return [
    kdbxConfigOption.value,
    {
      label: 'Personalization',
      key: 'personalization',
      children: [
        {
          label: 'Theme Color',
          key: 'themeColor',
          store: settingsStore,
          type: VgoOptionType.COLOR_PICKER,
        },
        {
          label: 'Light/Dark Theme',
          key: 'ldTheme',
          store: settingsStore,
          type: VgoOptionType.MULTIPLE_SWITCH,
          options: ldThemeOptions,
        },
      ],
    },
    {
      label: 'Calendar',
      key: 'calendar',
      children: calendarSettings,
    },
    {
      label: 'About',
      key: 'about',
      children: [
        {
          label: formatSiteTitle(),
          subtitle: 'https://github.com/canwdev/kee-note',
          key: 'github',
          actionRender: () =>
            h(
              'a',
              {
                href: 'https://github.com/canwdev/kee-note',
                target: '_blank',
                rel: 'nofollow noopener',
              },
              'Github',
            ),
        },
      ],
    },
  ].filter(Boolean)
})
</script>

<template>
  <ModalWindow
    v-model:visible="mVisible"
    class="global-settings"
    title="Settings"
    :init-win-options="{width: '500px'}"
  >
    <OptionUI :option-list="optionList" />
  </ModalWindow>
</template>

<style lang="scss">
.global-settings {
  max-width: 500px;
}
</style>
