import {useKeeStore} from '@/store/kee-store'
import {db} from '@/core/database'
import globalEventBus, {GlobalEvents} from '@/utils/bus'
import {VgoOptionType} from '@canwdev/vgo-ui'
import type {VgoOptionItem} from '@canwdev/vgo-ui'
import {showInputPrompt} from '@/components/CommonUI/input-prompt'

export const useKdbxOptions = (mVisible) => {
  const keeStore = useKeeStore()

  const kdbxConfigOption = computed((): VgoOptionItem => {
    if (!keeStore.dbInfo) {
      return {
        label: 'Kdbx Config',
        key: 'kdbx',
        hidden: true,
      }
    }
    const dbVersion = keeStore.dbInfo.header.versionMajor

    return {
      label: 'Kdbx Config',
      key: 'kdbx',
      children: [
        {
          label: 'Database Info',
          subtitle: `KDBX Version: ${dbVersion}`,
          key: 'info',
          type: VgoOptionType.BUTTON,
          value: 'View',
          props: {
            onClick: () => {
              window.$dialog({
                title: 'Database Info',
                message: h('textarea', {
                  cols: 46,
                  rows: 20,
                  class: 'vgo-u-font-code',
                  readonly: true,
                  value: JSON.stringify(keeStore.dbInfo, null, 2),
                }),
              })
            },
          },
        },
        {
          label: 'Database Password',
          key: 'change_password',
          type: VgoOptionType.BUTTON,
          value: 'Change...',
          props: {
            onClick: async () => {
              const password = await showInputPrompt({
                title: '1. Input new database password',
                placeholder: '',
                value: '',
                type: 'password',
              })
              const password2 = await showInputPrompt({
                title: '2. Confirm new password',
                placeholder: '',
                value: '',
                type: 'password',
                validateFn: (value) => {
                  if (value !== password) {
                    return 'password not match'
                  }
                },
              })
              if (password2) {
                await db.changeCredentials({password: password2})
                window.$message.success('Database password changed!')
                globalEventBus.emit(GlobalEvents.CLOSE_DATABASE)
                mVisible.value = false
              }
            },
          },
        },
      ].filter(Boolean),
    }
  })

  return {
    kdbxConfigOption,
  }
}
