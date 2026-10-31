<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { kService } from '@/api'
import { useKeeStore } from '@/store/kee-store'
import globalEventBus, { GlobalEvents } from '@/utils/bus'
import { AutoFormElPlus, AutoFormItemType } from '@canwdev/vgo-ui'
import type { MixedFormItems } from '@canwdev/vgo-ui'
import {
  generateKeyFile,
  getDatabaseFileName,
  getDatabaseFilePath,
  isFileSystemAccessSupported,
  onExternalFileOpen,
  pickDatabaseFile,
  pickDatabaseSaveFile,
  pickKeyFile,
  setDatabaseFileHandle,
  setLastKeyFile,
} from '@/utils/backend'
import moment from 'moment/moment'

const router = useRouter()
const keeStore = useKeeStore()

const isCreateMode = ref(false)
const isBusy = ref(false)
const isSupported = isFileSystemAccessSupported()

const fileDisplayPath = (file: {name: string; path?: string}) => file.path || file.name

const formModel = reactive({
  fileName: getDatabaseFilePath() || getDatabaseFileName(),
  dbName: 'KeeNote',
  password: '',
  keyFileName: '',
  keyFileBuffer: null as ArrayBuffer | null,
})

let stopExternalOpenListener: (() => void) | null = null

onMounted(() => {
  stopExternalOpenListener = onExternalFileOpen((file) => {
    formModel.fileName = fileDisplayPath(file)
  })
})

onBeforeUnmount(() => {
  stopExternalOpenListener?.()
})

const formItems = computed((): MixedFormItems[] => {
  return [
    {
      type: AutoFormItemType.INPUT,
      key: 'fileName',
      label: 'KDBX File',
      placeholder: isCreateMode.value
        ? 'Click the button to choose save location'
        : 'Click the button to open a .kdbx file',
      props: {
        readonly: true,
        clearable: false,
      },
      render: () => {
        return h(
          'button',
          {
            type: 'button',
            class: 'vgo-button vgo-button--text vgo-button--icon',
            title: isCreateMode.value ? 'Choose save location' : 'Open kdbx file',
            onClick: isCreateMode.value ? handleChooseCreateFile : handleChooseFile,
          },
          h('span', {
            class: `mdi ${isCreateMode.value ? 'mdi-file-document-plus-outline' : 'mdi-folder-open-outline'
              }`,
          }),
        )
      },
    },
    ...(isCreateMode.value
      ? [
        {
          type: AutoFormItemType.INPUT,
          key: 'dbName',
          label: 'Database Name',
          placeholder: 'New Database',
        } as MixedFormItems,
      ]
      : []),
    {
      type: AutoFormItemType.INPUT,
      key: 'password',
      label: 'Password',
      placeholder: 'Please input password (can be empty with key file)',
      props: {
        type: 'password',
        showPassword: true,
        clearable: true,
        onKeyup: (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            handleSubmit()
          }
        },
      },
    },
    {
      type: AutoFormItemType.INPUT,
      key: 'keyFileName',
      label: 'Key File (Optional)',
      placeholder: 'Click the button to choose key file',
      props: {
        readonly: true,
        clearable: false,
      },
      render: () => {
        return h('div', { class: 'vgo-u-flex-wrap-center' }, [
          h(
            'button',
            {
              type: 'button',
              class: 'vgo-button vgo-button--text vgo-button--icon',
              title: isCreateMode.value ? 'Generate key file' : 'Choose key file',
              onClick: isCreateMode.value ? handleGenerateKeyFile : handleChooseKeyFile,
            },
            h('span', {
              class: `mdi ${isCreateMode.value ? 'mdi-key-plus' : 'mdi-key-outline'}`,
            }),
          ),
          formModel.keyFileBuffer &&
          h(
            'button',
            {
              type: 'button',
              class: 'vgo-button vgo-button--text vgo-button--icon',
              title: 'Remove key file',
              onClick: clearKeyFile,
            },
            h('span', { class: 'mdi mdi-close' }),
          ),
        ])
      },
    },
  ]
})

const handleChooseFile = async () => {
  try {
    const file = await pickDatabaseFile()
    formModel.fileName = fileDisplayPath(file)
    formModel.password = ''
    setLastKeyFile(null)
    formModel.keyFileName = ''
    formModel.keyFileBuffer = null
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      window.$message.error(e?.message || 'Failed to open file')
    }
  }
}

const handleChooseCreateFile = async () => {
  try {
    const suggested = `${moment().format('YYYY-MM-DD')}.kdbx`
    const file = await pickDatabaseSaveFile(suggested)
    formModel.fileName = fileDisplayPath(file)
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      window.$message.error(e?.message || 'Failed to select file')
    }
  }
}

const handleChooseKeyFile = async () => {
  try {
    const { name, buffer } = await pickKeyFile()
    formModel.keyFileName = name
    formModel.keyFileBuffer = buffer
    setLastKeyFile(buffer)
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      window.$message.error(e?.message || 'Failed to read key file')
    }
  }
}

const handleGenerateKeyFile = async () => {
  try {
    const result = await generateKeyFile(`${moment().format('YYYY-MM-DD')}.key`)
    formModel.keyFileName = result.path
    formModel.keyFileBuffer = result.buffer
    setLastKeyFile(result.buffer)
    window.$message.success('Key file saved: ' + result.path)
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      window.$message.error(e?.message || 'Failed to generate key file')
    }
  }
}

const clearKeyFile = () => {
  formModel.keyFileName = ''
  formModel.keyFileBuffer = null
  setLastKeyFile(null)
}

const checkProfile = async (query = {}) => {
  if (!(await kService.checkDatabaseIsOpen())) {
    return
  }
  await router.replace({
    name: 'NoteView',
    query,
  })
}

const handleSubmit = async () => {
  if (!formModel.fileName) {
    window.$message.warning(
      isCreateMode.value ? 'Please choose a save location' : 'Please choose a .kdbx file',
    )
    return
  }
  if (!formModel.password && !formModel.keyFileBuffer) {
    window.$message.warning('Please input a password or choose a key file')
    return
  }
  if (isBusy.value) {
    return
  }
  isBusy.value = true
  try {
    if (isCreateMode.value) {
      await kService.createDatabase({
        name: formModel.dbName || 'New Database',
        password: formModel.password,
        keyFile: formModel.keyFileBuffer,
      })
      window.$message.success('Database created: ' + formModel.fileName)
    } else {
      await kService.openDatabase({
        password: formModel.password,
        keyFile: formModel.keyFileBuffer,
      })
    }
    keeStore.isDbOpened = true
    keeStore.isNotSave = false
    formModel.password = ''
    await checkProfile()
  } catch (e: any) {
    keeStore.isDbOpened = false
    console.error(e)
    // kdbxweb throws a generic error for wrong password / corrupted file
    window.$message.error(e?.message || 'Failed to open database')
  } finally {
    isBusy.value = false
  }
}

const toggleCreate = () => {
  isCreateMode.value = !isCreateMode.value
  formModel.fileName = ''
  formModel.password = ''
  clearKeyFile()
  if (isCreateMode.value) {
    setDatabaseFileHandle(null)
  } else {
    formModel.fileName = getDatabaseFilePath() || getDatabaseFileName()
  }
}

const handleSettings = () => {
  globalEventBus.emit(GlobalEvents.SHOW_SETTINGS)
}

onMounted(async () => {
  await checkProfile()
})
</script>

<template>
  <div class="login-view">
    <el-card class="card-wrap">
      <div class="title-wrapper">
        <button class="vgo-u-button-reset" :title="isCreateMode ? 'Back' : 'Create Database'" @click="toggleCreate">
          <span v-if="isCreateMode" class="mdi mdi-arrow-left"></span>
          <span v-else class="mdi mdi-plus"></span>
        </button>
        <div class="login-title">{{ `${isCreateMode ? 'Create' : 'Open'} Kdbx Database` }}</div>
        <span style="width: 20px"></span>
      </div>

      <el-alert v-if="!isSupported" type="error" :closable="false" show-icon
        title="This browser does not support the File System Access API. Please use Chrome / Edge 86+."
        style="margin-bottom: 16px" />

      <AutoFormElPlus :form-schema="{
        model: formModel,
        rules: {},
        props: {
          labelPosition: 'top',
        },
        formItems,
      }" @onSubmit="handleSubmit">
        <template #actions>
          <div class="login-actions vgo-u-flex-wrap-center">
            <button type="button" class="vgo-button" @click="handleSettings">Settings</button>
            <button type="button" class="vgo-button vgo-button--primary" :disabled="isBusy || !isSupported"
              @click="handleSubmit">
              {{ isBusy ? '...' : isCreateMode ? 'Create' : 'Unlock' }}
            </button>
          </div>
        </template>
      </AutoFormElPlus>
    </el-card>
  </div>
</template>

<style lang="scss">
@import './login';
</style>
