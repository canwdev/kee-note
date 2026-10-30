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

export default defineComponent({
  name: 'DetailView',
  components: {
    MarkdownEditor,
    DialogEntryIconColor,
    IconDisplay,
    DialogEntryPreview,
    AttachmentBox,
  },
  setup() {
    const entryDetail = ref<EntryItem | null>(null)
    const entryDetailTimes = reactive([0, 0])

    const keeStore = useKeeStore()
    const settingsStore = useSettingsStore()

    const editorSettingsStore = useEditorSettingsStore()

    const { commonSaveDatabase } = useKeeNoteSaveClose()

    onMounted(() => {
      getEntryDetail(true)
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

    const getEntryDetail = async (isFocus = false) => {
      entryDetail.value = await kService.getEntryDetail({ uuid: keeStore.detailUuid })
      nextTick(() => {
        keeStore.isChanged = false
        if (isFocus) {
          titleInputRef.value?.focus()
        }
      })
    }

    useBeforeUnload(() => keeStore.isChanged)

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
        keeStore.isChanged = true
      },
      { deep: true },
    )

    const handleSave = async () => {
      if (!entryDetail.value) {
        return
      }
      if (keeStore.isChanged) {
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
      if (settingsStore.enableAutoSave || keeStore.isChanged) {
        return {
          disabled: !keeStore.isChanged,
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
          label: '🔰 Preview (Ctrl+/)',
          props: {
            onClick: async () => {
              isShowPreviewModal.value = true
            },
          },
        },
        {
          label: '🦆 Edit Icon & Color',
          props: {
            onClick: async () => {
              isShowIconEdit.value = true
            },
          },
        },
        !editorSettingsStore.isAdvancedEditor && {
          label: '💫 Enable HyperMD Editor',
          props: {
            onClick: async () => {
              editorSettingsStore.isAdvancedEditor = true
            },
          },
        },
      ].filter(Boolean)
    })

    const handleMenuCommand = (item: any) => {
      item?.props?.onClick?.()
    }

    const titleInputRef = ref()

    const handleBack = () => {
      const back = () => {
        keeStore.detailUuid = null
        if (isBackRefresh.value) {
          globalEventBus.emit(GlobalEvents.REFRESH_ENTRY_LIST)
        }
      }
      if (keeStore.isChanged) {
        window.$dialog.warning({
          title: 'Confirm',
          content: 'Discard Changes?',
          positiveText: 'OK',
          negativeText: 'Cancel',
          onPositiveClick: () => {
            back()
          },
          onNegativeClick: () => { },
        })
        return
      }
      back()
    }

    return {
      keeStore,
      settingsStore,
      editorSettingsStore,
      entryDetail,
      handleBack,
      entryDetailTimes,
      handleSave,
      handleMenuCommand,
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
      <div class="detail-header">
        <div class="header-space">
          <el-button text @click="handleBack">
            <el-icon :size="18">
              <span class="mdi mdi-arrow-left" />
            </el-icon>&nbsp;Back
          </el-button>

          <div class="entry-title" v-if="entryDetail">
            <el-dropdown trigger="hover" @command="handleMenuCommand">
              <el-button size="small" text @click="isShowIconEdit = true">
                <IconDisplay :icon="entryDetail.icon" :bg-color="entryDetail.bgColor" :fg-color="entryDetail.fgColor" />
                <span v-if="keeStore.isChanged">* </span>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="(item, index) in menuOptions" :key="index" :command="item">
                    {{ item.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div class="vgo-u-flex-wrap-center">
            <el-button :type="saveBtnInfo.type" :text="saveBtnInfo.text" :plain="saveBtnInfo.plain"
              :disabled="saveBtnInfo.disabled" @click="handleSave">
              <el-icon :size="18">
                <span class="mdi mdi-content-save" />
              </el-icon>&nbsp;{{ saveBtnInfo.label }}
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="entryDetail && entryDetail.fieldsV2" class="detail-card-wrap">
        <div class="detail-card">
          <div class="detail-infos">
            <div class="detail-info-row">
              <div class="vgo-u-flex-wrap-center">
                <el-date-picker size="small" v-model="entryDetailTimes[0]" type="datetime"
                  @update:model-value="keeStore.isChanged = true" title="Create Time" />
                <el-date-picker size="small" v-model="entryDetailTimes[1]" type="datetime" disabled
                  title="Update Time" />
              </div>

              <div class="">
                <el-button size="small" text @click="editorSettingsStore.isShowMore = !editorSettingsStore.isShowMore"
                  title="Toggle more details">
                  <el-icon :size="18">
                    <span v-if="editorSettingsStore.isShowMore" class="mdi mdi-dots-horizontal-circle" />
                    <span v-else class="mdi mdi-dots-horizontal-circle-outline" />
                  </el-icon>
                </el-button>

                <el-button size="small" text v-if="editorSettingsStore.isAdvancedEditor" @click="showEditorSettings"
                  title="Editor Settings">
                  <el-icon :size="18">
                    <span class="mdi mdi-cog-outline" />
                  </el-icon>
                </el-button>
              </div>
            </div>

            <el-input size="small" ref="titleInputRef" autofocus v-model="entryDetail.fieldsV2.Title" type="text"
              placeholder="Title" />

            <el-collapse-transition>
              <div v-show="entryDetail && editorSettingsStore.isShowMore">
                <div class="extra-info">
                  <div class="extra-item">
                    <label>Username</label>
                    <el-input size="small" v-model="entryDetail.fieldsV2.UserName" placeholder="" />
                  </div>
                  <div class="extra-item">
                    <label>Password</label>
                    <el-input size="small" v-model="entryDetail.fieldsV2.Password" type="password" show-password
                      class="vgo-u-font-code" />
                  </div>
                  <div class="extra-item">
                    <label>URL</label>
                    <el-input size="small" v-model="entryDetail.fieldsV2.URL" placeholder="" />
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
  top: 0;
  left: 0;
  z-index: 100;
  position: absolute;
  width: 100%;
  height: 100%;
  background: var(--vgo-surface);
  $min_width: 800px;

  .detail-header {
    border-bottom: 1px solid var(--vgo-border);

    .header-space {
      width: 100%;
      height: 100%;
      padding: 6px 24px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;

      @media screen and (max-width: $min_width) {
        padding: 2px;
      }

      @media screen and (max-height: 500px) {
        height: 10px;
        overflow: hidden;
        transition: all 0.3s;
        opacity: 0;

        &:hover {
          opacity: 1;
          height: 100%;
          border: 1px dashed;
        }
      }
    }
  }

  .entry-title {
    max-width: 50vw;
    font-weight: 500;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

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
      width: $min_width;
      display: flex;
      flex-direction: column;
      gap: 8px;

      @media screen and (max-width: $min_width) {
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
          padding-top: 10px;

          @media screen and (max-width: $min_width) {
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
