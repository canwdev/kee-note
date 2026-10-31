<script lang="ts">
import { db } from '@/core/database'
import { EntryItem } from '@/enum/kdbx'
import globalEventBus, { GlobalEvents } from '@/utils/bus'
import MarkdownEditor from '@/components/NoteViews/Detail/MarkdownEditor.vue'
import DialogEntryIconColor from '@/components/NoteViews/Dialogs/DialogEntryIconColor.vue'
import IconDisplay from '@/components/NoteViews/IconDisplay.vue'
import DialogEntryPreview from '@/components/NoteViews/Dialogs/DialogEntryPreview.vue'
import AttachmentBox from '@/components/NoteViews/Detail/AttachmentBox.vue'
import { useEditorSettingsStore } from '@/store/editor'
import {
  noteWindows,
  updateDetailWindowInfo,
} from '@/hooks/use-note-windows'

export default defineComponent({
  name: 'DetailView',
  components: {
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
    const editorSettingsStore = useEditorSettingsStore()

    // 载入/替换详情时避免 watcher 把数据再写回一次
    let isSyncingFromDb = false

    onMounted(() => {
      loadEntryDetail()
      window.addEventListener('keydown', listenShortcuts)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', listenShortcuts)
    })

    // 多个详情窗口同时挂载时会各自监听 window 的 keydown，
    // 只让当前激活的窗口响应，避免快捷键作用到后台窗口。
    const isActiveDetailWindow = () => {
      const win = noteWindows.findByKey(props.uuid)
      return Boolean(win && noteWindows.activeId === win.id)
    }

    const listenShortcuts = (event) => {
      if (!isActiveDetailWindow()) {
        return
      }
      if (event.ctrlKey || event.metaKey) {
        if (['/', 'Divide'].includes(event.key) || event.code === 'NumpadDivide') {
          isShowPreviewModal.value = true
          event.preventDefault()
        }
      } else if (event.code === 'Escape') {
        if (isShowPreviewModal.value || isShowIconEdit.value) {
          return
        }
        handleBack()
      }
    }

    const updateWindowInfo = () => {
      const detail = entryDetail.value
      if (!detail) {
        return
      }

      // 标题编辑发生在 fieldsV2.Title，窗口标题需要跟随
      const title = detail.fieldsV2?.Title || detail.title || 'Note'
      updateDetailWindowInfo(props.uuid, {
        title: detail.groupName ? `${detail.groupName}/${title}` : title,
        icon: detail.icon,
        bgColor: detail.bgColor,
        fgColor: detail.fgColor,
      })
    }

    /** 从内存数据库读取（或重新读取）详情 */
    const loadEntryDetail = () => {
      isSyncingFromDb = true
      entryDetail.value = db.getEntryDetail(props.uuid)
      updateWindowInfo()
      nextTick(() => {
        isSyncingFromDb = false
      })
    }

    // 任何编辑都立即写回内存数据库（不落盘），由全局 Ctrl+S 统一保存
    watch(
      entryDetail,
      (val) => {
        if (!val || isSyncingFromDb) {
          return
        }
        const updated = db.saveEntryDetail(val)
        globalEventBus.emit(GlobalEvents.ENTRY_UPDATED, updated)
        updateWindowInfo()
      },
      { deep: true },
    )

    // 保持 Date 对象引用稳定，避免每次渲染都生成新的 Date 触发控件更新
    const creationTime = computed({
      get: () => entryDetail.value?.creationTime || new Date(),
      set: (value: Date | null) => {
        if (entryDetail.value && value) {
          entryDetail.value.creationTime = value
        }
      },
    })

    const lastModTime = computed(() => entryDetail.value?.lastModTime || new Date())

    const complexEditorRef = ref()
    const isShowIconEdit = ref(false)
    const isShowPreviewModal = ref(false)

    const titleInputRef = ref()

    const handleBack = () => {
      emit('close')
    }

    return {
      editorSettingsStore,
      entryDetail,
      handleBack,
      creationTime,
      lastModTime,
      complexEditorRef,
      showEditorSettings() {
        complexEditorRef.value.showSettings()
      },
      isShowIconEdit,
      isShowPreviewModal,
      titleInputRef,
      loadEntryDetail,
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
                <button class="vgo-button vgo-button--icon vgo-entry-icon-button" title="Change Icon & Color"
                  @click="isShowIconEdit = true">
                  <IconDisplay :icon="entryDetail.icon" :bg-color="entryDetail.bgColor" :fg-color="entryDetail.fgColor"
                    :size="20" />
                </button>
                <el-date-picker v-model="creationTime" type="datetime" title="Create Time" />
                <el-date-picker :model-value="lastModTime" type="datetime" disabled title="Update Time" />
              </div>

              <div class="vgo-u-flex-wrap-center">

                <button class="vgo-button vgo-button--icon" @click="isShowPreviewModal = true" title="Preview (Ctrl+/)">
                  <span class="mdi mdi-eye-outline" />
                </button>

                <button class="vgo-button vgo-button--icon"
                  @click="editorSettingsStore.isShowMore = !editorSettingsStore.isShowMore" title="Toggle more details">
                  <span v-if="editorSettingsStore.isShowMore" class="mdi mdi-dots-horizontal-circle" />
                  <span v-else class="mdi mdi-dots-horizontal-circle-outline" />
                </button>

                <button v-if="editorSettingsStore.isAdvancedEditor" class="vgo-button vgo-button--icon"
                  @click="showEditorSettings" title="Editor Settings">
                  <span class="mdi mdi-cog-outline" />
                </button>

                <button v-if="!editorSettingsStore.isAdvancedEditor" class="vgo-button vgo-button--icon"
                  @click="editorSettingsStore.isAdvancedEditor = true" title="Enable HyperMD Editor">
                  <span class="mdi mdi-text-box-edit-outline" />
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

                <AttachmentBox :entry-detail="entryDetail" @dataUpdated="loadEntryDetail" />
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

          .vgo-entry-icon-button {
            padding: 0;
            line-height: 0;
            cursor: pointer;
          }
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
              font-size: 12px;
            }
          }
        }
      }
    }
  }
}
</style>
