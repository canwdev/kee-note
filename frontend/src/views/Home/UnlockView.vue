<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { kService } from '@/api'
import { useKeeStore } from '@/store/kee-store'
import { useSettingsStore } from '@/store/settings'
import globalEventBus, { GlobalEvents } from '@/utils/bus'
import {
  clearActiveHistoryId,
  clearDbHistory,
  findDbHistoryByFileRef,
  getActiveHistoryId,
  listDbHistory,
  onDbHistoryChanged,
  removeDbHistory,
  setActiveHistoryId,
  type DbHistoryRecord,
} from '@/utils/db-history'
import { AutoFormElPlus, AutoFormItemType } from '@canwdev/vgo-ui'
import type { MixedFormItems } from '@canwdev/vgo-ui'
import {
  generateKeyFile,
  getDatabaseFileRef,
  getDatabaseFileName,
  getDatabaseFilePath,
  getExternalFile,
  isFileSystemAccessSupported,
  onExternalFileOpen,
  pickDatabaseFile,
  pickDatabaseSaveFile,
  pickKeyFile,
  requestFileRefPermission,
  setDatabaseFileHandle,
  setDatabaseFileRef,
  setLastKeyFile,
} from '@/utils/backend'
import moment from 'moment/moment'

const router = useRouter()
const keeStore = useKeeStore()

const isCreateMode = ref(false)
const isBusy = ref(false)
const isSupported = isFileSystemAccessSupported()

const fileDisplayPath = (file: {name: string; path?: string}) => file.path || file.name

const reSelectFileMessage = () => {
  const fileName =
    formModel.fileName || getDatabaseFilePath() || getDatabaseFileName() || '*.kdbx'
  return `Please re-select the database file: ${fileName}`
}

const formModel = reactive({
  fileName: getDatabaseFilePath() || getDatabaseFileName(),
  dbName: 'KeeNote',
  password: '',
  keyFileName: '',
  keyFileBuffer: null as ArrayBuffer | null,
})

const settingsStore = useSettingsStore()
const historyList = ref<DbHistoryRecord[]>([])
const historyActiveId = ref<string | null>(null)
const saveHistoryEnabled = computed({
  get: () => settingsStore.isSaveHistory,
  set: (value: boolean) => {
    settingsStore.isSaveHistory = value
  },
})

let stopExternalOpenListener: (() => void) | null = null
let stopHistoryChangeListener: (() => void) | null = null

onMounted(() => {
  stopExternalOpenListener = onExternalFileOpen(async (file) => {
    formModel.fileName = fileDisplayPath(file)
    // 宿主外部打开文件时，如果历史中有同一文件则自动恢复 key file
    const record = await findDbHistoryByFileRef(file)
    if (record) {
      await restoreHistoryItem(record, { requestPermission: false })
      formModel.fileName = fileDisplayPath(file)
    } else {
      formModel.keyFileName = ''
      formModel.keyFileBuffer = null
      setLastKeyFile(null)
      detachHistory()
    }
  })
  // 其他标签页新增/删除历史时同步刷新列表
  stopHistoryChangeListener = onDbHistoryChanged(() => {
    void refreshHistory()
  })
})

onBeforeUnmount(() => {
  stopExternalOpenListener?.()
  stopHistoryChangeListener?.()
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
    detachHistory()
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
    detachHistory()
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

/* -------------------------------------------------------------------------- */
/*                                   history                                  */
/* -------------------------------------------------------------------------- */

const detachHistory = () => {
  clearActiveHistoryId()
  historyActiveId.value = null
}

const refreshHistory = async () => {
  historyList.value = await listDbHistory()
  historyActiveId.value = getActiveHistoryId()
}

const formatHistoryTime = (timestamp?: number) => {
  if (!timestamp) {
    return ''
  }
  return moment(timestamp).format('YYYY-MM-DD HH:mm')
}

const restoreHistoryItem = async (
  item: DbHistoryRecord,
  options: { requestPermission?: boolean } = {},
) => {
  const { requestPermission = true } = options
  isCreateMode.value = false
  formModel.password = ''
  formModel.keyFileName = item.keyFileName || ''
  formModel.keyFileBuffer = item.keyFileData || null
  setLastKeyFile(item.keyFileData || null)
  setActiveHistoryId(item.id)
  historyActiveId.value = item.id

  if (item.fileRef) {
    setDatabaseFileRef(item.fileRef)
    formModel.fileName = item.path || item.fileRef.name
    if (requestPermission && item.fileRef.kind === 'handle') {
      const granted = await requestFileRefPermission(item.fileRef)
      if (!granted) {
        window.$message.warning(
          'Write permission was not granted. Unlock will use the cached copy if the file cannot be read.',
        )
      }
    }
  } else {
    setDatabaseFileRef(null)
    formModel.fileName = item.path
    window.$message.warning(`Please re-select the database file: ${item.path}`)
  }
}

const handleHistoryClick = (item: DbHistoryRecord) => {
  restoreHistoryItem(item)
}

const handleDeleteHistory = async (item: DbHistoryRecord) => {
  await removeDbHistory(item.id)
  if (historyActiveId.value === item.id) {
    detachHistory()
  }
  await refreshHistory()
}

const handleClearHistory = () => {
  window.$dialog.warning({
    title: 'Clear History',
    content: 'Delete all saved database history? The kdbx files themselves are not affected.',
    positiveText: 'Delete',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      await clearDbHistory()
      detachHistory()
      await refreshHistory()
    },
  })
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
      isCreateMode.value ? 'Please choose a save location' : reSelectFileMessage(),
    )
    return
  }
  if (!formModel.password && !formModel.keyFileBuffer) {
    window.$message.warning('Please input a password or choose a key file')
    return
  }
  if (isCreateMode.value && !getDatabaseFileRef()) {
    window.$message.warning('Please choose a save location')
    return
  }
  if (!isCreateMode.value && !getDatabaseFileRef()) {
    window.$message.warning(reSelectFileMessage())
    return
  }
  if (isBusy.value) {
    return
  }
  isBusy.value = true
  try {
    if (!isCreateMode.value) {
      // 刷新后 handle 权限可能失效，借用户点击的手势重新申请
      await requestFileRefPermission(getDatabaseFileRef())
    }
    if (isCreateMode.value) {
      await kService.createDatabase({
        name: formModel.dbName || 'New Database',
        password: formModel.password,
        keyFile: formModel.keyFileBuffer,
        keyFileName: formModel.keyFileName,
      })
      formModel.fileName = getDatabaseFilePath() || formModel.fileName
      window.$message.success('Database created: ' + formModel.fileName)
    } else {
      await kService.openDatabase({
        password: formModel.password,
        keyFile: formModel.keyFileBuffer,
        keyFileName: formModel.keyFileName,
      })
    }
    keeStore.isDbOpened = true
    keeStore.isNotSave = false
    formModel.password = ''
    await refreshHistory()
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
  detachHistory()
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
  await refreshHistory()
  // 自动恢复最近一次的数据库文件与 key file（不保存密码）
  if (settingsStore.isSaveHistory && historyList.value.length && !getExternalFile()) {
    await restoreHistoryItem(historyList.value[0], { requestPermission: false })
  }
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

      <div class="history-section">
        <div class="history-header">
          <el-checkbox v-model="saveHistoryEnabled">Save history</el-checkbox>
          <button
            v-if="historyList.length"
            type="button"
            class="vgo-button vgo-button--text"
            @click="handleClearHistory"
          >
            Clear
          </button>
        </div>

        <div v-if="historyList.length" class="history-list">
          <div
            v-for="item in historyList"
            :key="item.id"
            class="history-item"
            :class="{ 'history-item--active': historyActiveId === item.id }"
            :title="item.path"
            @click="handleHistoryClick(item)"
          >
            <span class="mdi mdi-database-outline history-icon"></span>
            <div class="history-main">
              <div class="history-path">
                {{ item.path }}
                <span v-if="item.keyFileName" class="history-key">
                  <span class="mdi mdi-key-outline"></span>{{ item.keyFileName }}
                </span>
              </div>
              <div class="history-time">{{ formatHistoryTime(item.lastOpenedAt) }}</div>
            </div>
            <button
              type="button"
              class="vgo-button vgo-button--text vgo-button--icon history-delete"
              title="Remove from history"
              @click.stop="handleDeleteHistory(item)"
            >
              <span class="mdi mdi-close"></span>
            </button>
          </div>
        </div>
        <div v-else class="history-empty">No history</div>
        <div v-if="!saveHistoryEnabled" class="history-hint">
          History saving is off. Existing entries stay until you delete them.
        </div>
      </div>
    </el-card>
  </div>
</template>

<style lang="scss">
@use './login';
</style>
