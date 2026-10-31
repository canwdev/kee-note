<script lang="ts">
import { kService } from '@/api'
import { EntryItem } from '@/enum/kdbx'
import keepassIcons from '@/assets/icons'
import globalEventBus, { GlobalEvents, saveDatabaseAsync } from '@/utils/bus'
import { useBeforeUnload } from '@/hooks/use-changed'
import MarkdownEditor from '@/components/NoteViews/Detail/MarkdownEditor.vue'
import DialogEntryIconColor from '@/components/NoteViews/Dialogs/DialogEntryIconColor.vue'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import DialogEntryPreview from '@/components/NoteViews/Dialogs/DialogEntryPreview.vue'
import AttachmentBox from '@/components/NoteViews/Detail/AttachmentBox.vue'
import { getEntryItemUpdateParams } from '@/utils/export-import'
import { useEditorSettingsStore } from '@/store/editor'
import { useKeeStore } from '@/store/kee-store'
import { useSettingsStore } from '@/store/settings'
import { useKeeNoteSaveClose } from '@/hooks/use-keenote'
import MenuTrigger from '@/components/CommonUI/MenuTrigger.vue'
import {
  setDetailWindowDirty,
  updateDetailWindowInfo,
  updateDetailWindowSaveState,
} from '@/hooks/use-detail-windows'

export default defineComponent({
  name: 'DetailView',
  components: {
    MenuTrigger,
    MarkdownEditor,
    DialogEntryIconColor,
    IconDisplay,
    DialogEntryPreview,
    AttachmentBox,
  },
  props: {
    uuid: {
      type: String,
      required: true,
    },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const entryDetail = ref<EntryItem | null>(null)
    const entryDetailTimes = reactive([0, 0])
    const isChanged = ref(false)

    const keeStore = useKeeStore()
    const settingsStore = useSettingsStore()

    const editorSettingsStore = useEditorSettingsStore()

    const { commonSaveDatabase } = useKeeNoteSaveClose()

    onMounted(() => {
      getEntryDetail()
      window.addEventListener('keydown', listenShortcuts)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', listenShortcuts)
    })

    const listenShortcuts = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const key = String.fromCharCode(event.which).toLowerCase()
        switch (key) {
          case 's':
            event.preventDefault()
            handleSave()
            break
          case '¿': // Keyboard symbol: "/"
            isShowPreviewModal.value = true
            event.preventDefault()
            break
          default:
            return
        }
      } else if (event.code === 'Escape') {
        if (isShowPreviewModal.value || isShowIconEdit.value) {
          return
        }
        handleBack()
      }
    }

    const markChanged = (changed = true) => {
      isChanged.value = changed
      setDetailWindowDirty(props.uuid, changed)
    }

    const updateWindowInfo = () => {
      const detail = entryDetail.value
      if (!detail) {
        return
      }

      const title = detail.title || 'Note'
      updateDetailWindowInfo(props.uuid, {
        title: detail.groupName ? `${detail.groupName}/${title}` : title,
        icon: detail.icon,
        bgColor: detail.bgColor,
        fgColor: detail.fgColor,
      })
    }

    const getEntryDetail = async () => {
      entryDetail.value = await kService.getEntryDetail({ uuid: props.uuid })
      updateWindowInfo()
      nextTick(() => {
        markChanged(false)
      })
    }

    useBeforeUnload(() => isChanged.value)

    watch(entryDetail, (val) => {
      if (!val) {
        return
      }
      const { creationTime, lastModTime } = val
      entryDetailTimes[0] = new Date(creationTime).getTime()
      entryDetailTimes[1] = new Date(lastModTime).getTime()
    })

    watch(
      entryDetail,
      () => {
        markChanged(true)
        updateWindowInfo()
      },
      { deep: true },
    )

    const handleSave = async () => {
      if (!entryDetail.value) {
        return
      }
      if (isChanged.value) {
        entryDetail.value.creationTime = new Date(entryDetailTimes[0])

        const params = getEntryItemUpdateParams({
          uuid: entryDetail.value.uuid,
          entryDetail: entryDetail.value,
          isSetModTime: false,
        })

        await kService.updateEntry(params)
        await syncAndSave()

        return
      }
      if (keeStore.isNotSave) {
        await commonSaveDatabase()
        return
      }
    }

    // 处理不同保存条件下的按钮样式
    const saveBtnInfo = computed((): any => {
      if (settingsStore.enableAutoSave || isChanged.value) {
        return {
          disabled: !isChanged.value,
          label: settingsStore.enableAutoSave ? 'Save' : 'Done',
        }
      }
      if (keeStore.isNotSave) {
        return {
          type: 'primary',
          plain: false,
          disabled: false,
          label: 'Save',
        }
      }
      return {
        disabled: true,
        label: 'Done',
      }
    })

    watch(
      saveBtnInfo,
      (info) => {
        updateDetailWindowSaveState(props.uuid, {
          disabled: Boolean(info.disabled),
          label: info.label || 'Save',
          primary: info.type === 'primary',
        })
      },
      { immediate: true, deep: true },
    )

    const isBackRefresh = ref(false)
    const syncAndSave = async () => {
      await getEntryDetail()
      await saveDatabaseAsync()
      isBackRefresh.value = true
    }

    const complexEditorRef = ref()
    const isShowIconEdit = ref(false)
    const isShowPreviewModal = ref(false)

    const menuOptions = computed((): any[] => {
      return [
        {
          label: 'Preview (Ctrl+/)',
          icon: 'mdi-eye-outline',
          onClick: async () => {
            isShowPreviewModal.value = true
          },
        },
        {
          label: 'Edit Icon & Color',
          icon: 'mdi-palette-outline',
          onClick: async () => {
            isShowIconEdit.value = true
          },
        },
        !editorSettingsStore.isAdvancedEditor && {
          label: 'Enable HyperMD Editor',
          icon: 'mdi-text-box-edit-outline',
          onClick: async () => {
            editorSettingsStore.isAdvancedEditor = true
          },
        },
      ].filter(Boolean)
    })

    const titleInputRef = ref()

    const handleBack = () => {
      emit('close')
    }

    onBeforeUnmount(() => {
      if (isBackRefresh.value) {
        globalEventBus.emit(GlobalEvents.REFRESH_ENTRY_LIST)
      }
    })

    return {
      keeStore,
      settingsStore,
      editorSettingsStore,
      entryDetail,
      isChanged,
      markChanged,
      handleBack,
      entryDetailTimes,
      handleSave,
      commonSaveDatabase,
      keepassIcons,
      complexEditorRef,
      showEditorSettings() {
        complexEditorRef.value.showSettings()
      },
      isShowIconEdit,
      menuOptions,
      isShowPreviewModal,
      titleInputRef,
      syncAndSave,
      saveBtnInfo,
    }
  },
})
</script>

<template>
  <div class="detail-view">
    <div class="layout-inner-root">
      <div v-if="entryDetail && entryDetail.fieldsV2" class="detail-card-wrap">
        <div class="detail-card">
          <div class="detail-infos">
            <div class="detail-info-row">
              <div class="vgo-u-flex-wrap-center">
                <MenuTrigger :items="menuOptions">
                  <button class="vgo-button vgo-button--icon" title="Note actions">
                    <IconDisplay :icon="entryDetail.icon" :bg-color="entryDetail.bgColor"
                      :fg-color="entryDetail.fgColor" :size="20" />
                  </button>
                </MenuTrigger>
                <el-date-picker v-model="entryDetailTimes[0]" type="datetime" @update:model-value="markChanged(true)"
                  title="Create Time" />
                <el-date-picker v-model="entryDetailTimes[1]" type="datetime" disabled title="Update Time" />
              </div>

              <div class="vgo-u-flex-wrap-center">
                <button class="vgo-button vgo-button--icon"
                  @click="editorSettingsStore.isShowMore = !editorSettingsStore.isShowMore" title="Toggle more details">
                  <span v-if="editorSettingsStore.isShowMore" class="mdi mdi-dots-horizontal-circle" />
                  <span v-else class="mdi mdi-dots-horizontal-circle-outline" />
                </button>

                <button v-if="editorSettingsStore.isAdvancedEditor" class="vgo-button vgo-button--icon"
                  @click="showEditorSettings" title="Editor Settings">
                  <span class="mdi mdi-cog-outline" />
                </button>
              </div>
            </div>

            <el-input ref="titleInputRef" v-model="entryDetail.fieldsV2.Title" type="text" placeholder="Title" />

            <el-collapse-transition>
              <div v-show="entryDetail && editorSettingsStore.isShowMore">
                <div class="extra-info">
                  <div class="extra-item">
                    <label>Username</label>
                    <el-input v-model="entryDetail.fieldsV2.UserName" placeholder="" />
                  </div>
                  <div class="extra-item">
                    <label>Password</label>
                    <el-input v-model="entryDetail.fieldsV2.Password" type="password" show-password
                      class="vgo-u-font-code" />
                  </div>
                  <div class="extra-item">
                    <label>URL</label>
                    <el-input v-model="entryDetail.fieldsV2.URL" placeholder="" />
                  </div>
                </div>

                <AttachmentBox :entry-detail="entryDetail" @dataUpdated="syncAndSave" />
              </div>
            </el-collapse-transition>
          </div>

          <MarkdownEditor ref="complexEditorRef" v-if="editorSettingsStore.isAdvancedEditor"
            v-model="entryDetail.fieldsV2.Notes" @turnOff="editorSettingsStore.isAdvancedEditor = false" />
          <el-input v-else v-model="entryDetail.fieldsV2.Notes" type="textarea" placeholder="Input your Note here."
            :autosize="{ minRows: 20 }" style="background-color: inherit !important" />
        </div>
      </div>

      <DialogEntryIconColor v-model:visible="isShowIconEdit" :entry-detail="entryDetail" />

      <DialogEntryPreview v-model:visible="isShowPreviewModal" :preview-detail="entryDetail" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-view {
  width: 100%;
  height: 100%;
  background: var(--vgo-surface);
  overflow: hidden;

  .layout-inner-root {
    height: 100%;
    display: flex;
    flex-direction: column;

    .detail-card-wrap {
      flex: 1;
      overflow: auto;
      padding-top: 10px;
      padding-bottom: 5px;

      @media screen and (max-height: 500px) {
        padding-top: 0;
      }
    }

    .detail-card {
      margin-left: auto;
      margin-right: auto;
      width: 800px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;

      @media screen and (max-width: 800px) {
        width: 100%;
        padding: 0 10px;
        box-sizing: border-box;
      }

      @media screen and (max-width: 1200px) {
        margin-top: 10px;
      }

      @media screen and (max-height: 500px) {
        margin-top: 1px;
      }

      .detail-infos {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .detail-info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        @media screen and (max-height: 500px) {
          height: 10px;
          overflow: hidden;
          transition: all 0.3s;
          opacity: 0;

          &:hover {
            margin-left: -5px;
            margin-right: -5px;
            padding: 5px 5px 0;
            opacity: 1;
            outline: 1px dashed;
            height: 100%;
          }
        }

        .extra-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: auto;
          gap: 8px;

          @media screen and (max-width: 800px) {
            grid-template-columns: repeat(1, 1fr);
          }

          .extra-item {
            display: flex;
            align-items: center;

            label {
              margin-right: 5px;
              min-width: 70px;
              text-align: right;
            }
          }
        }
      }
    }
  }
}
</style>
