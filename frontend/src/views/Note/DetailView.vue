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
import { copyText } from '@/utils/clipboard'
import { generatePassword } from '@/utils/password'
import { ElMessageBox } from 'element-plus'
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

    // ---------------- 复制 Username / Password / URL ----------------
    type CopyableField = 'UserName' | 'Password' | 'URL'

    const copyFieldLabels: Record<CopyableField, string> = {
      UserName: 'Username',
      Password: 'Password',
      URL: 'URL',
    }

    // 记录刚刚复制成功的字段，用于短暂显示对勾图标
    const copiedField = ref<CopyableField | ''>('')
    let copiedTimer: ReturnType<typeof setTimeout> | null = null

    const clearCopiedTimer = () => {
      if (copiedTimer !== null) {
        clearTimeout(copiedTimer)
        copiedTimer = null
      }
    }

    onBeforeUnmount(clearCopiedTimer)

    const copyField = async (field: CopyableField) => {
      const label = copyFieldLabels[field]
      const value = entryDetail.value?.fieldsV2?.[field] || ''
      if (!value) {
        window.$message?.warning(`${label} is empty`)
        return
      }

      const ok = await copyText(value)
      if (!ok) {
        window.$message?.error(`Failed to copy ${label}`)
        return
      }

      copiedField.value = field
      window.$message?.success(`${label} copied`)
      clearCopiedTimer()
      copiedTimer = setTimeout(() => {
        copiedField.value = ''
        copiedTimer = null
      }, 1500)
    }

    // ---------------- 生成密码 / 访问网址 ----------------
    const handleGeneratePassword = async () => {
      const fields = entryDetail.value?.fieldsV2
      if (!fields) {
        return
      }

      // 避免误点覆盖已有密码
      if (fields.Password) {
        try {
          await ElMessageBox.confirm(
            'Overwrite the current password with a new random one?',
            'Generate password',
            {
              type: 'warning',
              confirmButtonText: 'Generate',
              cancelButtonText: 'Cancel',
            },
          )
        } catch {
          return
        }
      }

      fields.Password = generatePassword()
      window.$message?.success('Strong password generated')
    }

    /** 规范化用户输入的网址，只允许 http(s)/mailto，其他协议直接拒绝 */
    const normalizeUrl = (raw: string) => {
      const url = raw.trim()
      if (!url) {
        return ''
      }
      if (/^(https?:\/\/|mailto:)/i.test(url)) {
        return url
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
        return ''
      }
      return `https://${url}`
    }

    const handleVisitUrl = () => {
      const url = normalizeUrl(entryDetail.value?.fieldsV2?.URL || '')
      if (!url) {
        window.$message?.warning('Please input a valid URL first')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
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
      copiedField,
      copyField,
      handleGeneratePassword,
      handleVisitUrl,
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
            <div class="detail-title-row">
              <button class="vgo-button vgo-button--icon vgo-button--text vgo-entry-icon-button"
                title="Change Icon & Color" @click="isShowIconEdit = true">
                <IconDisplay :icon="entryDetail.icon" :bg-color="entryDetail.bgColor" :fg-color="entryDetail.fgColor"
                  :size="20" />
              </button>

              <el-input ref="titleInputRef" v-model="entryDetail.fieldsV2.Title" type="text" placeholder="Title"
                class="detail-title-input" />

              <div class="detail-info-actions">
                <button class="vgo-button vgo-button--icon vgo-button--text" @click="isShowPreviewModal = true"
                  title="Preview (Ctrl+/)">
                  <span class="mdi mdi-eye-outline" />
                </button>

                <button class="vgo-button vgo-button--icon vgo-button--text"
                  @click="editorSettingsStore.isShowMore = !editorSettingsStore.isShowMore" title="Toggle more details">
                  <span v-if="editorSettingsStore.isShowMore" class="mdi mdi-dots-horizontal-circle" />
                  <span v-else class="mdi mdi-dots-horizontal-circle-outline" />
                </button>

                <button v-if="editorSettingsStore.isAdvancedEditor" class="vgo-button vgo-button--icon vgo-button--text"
                  @click="showEditorSettings" title="Editor Settings">
                  <span class="mdi mdi-cog-outline" />
                </button>

                <button v-if="!editorSettingsStore.isAdvancedEditor" class="vgo-button vgo-button--icon vgo-button--text"
                  @click="editorSettingsStore.isAdvancedEditor = true" title="Enable HyperMD Editor">
                  <span class="mdi mdi-text-box-edit-outline" />
                </button>
              </div>
            </div>

            <div class="detail-dates">
              <div class="date-item">
                <label class="date-label">Created</label>
                <el-date-picker v-model="creationTime" type="datetime" size="small" format="YYYY-MM-DD HH:mm"
                  title="Create Time" aria-label="Create Time" />
              </div>

              <div class="date-item">
                <label class="date-label">Updated</label>
                <el-date-picker :model-value="lastModTime" type="datetime" size="small" format="YYYY-MM-DD HH:mm"
                  disabled title="Update Time" aria-label="Update Time" />
              </div>
            </div>

            <el-collapse-transition>
              <div v-show="entryDetail && editorSettingsStore.isShowMore" class="detail-more">
                <div class="extra-info">
                  <div class="extra-item">
                    <label class="extra-label">Username</label>
                    <el-input v-model="entryDetail.fieldsV2.UserName" placeholder="Username" aria-label="Username">
                      <template #append>
                        <button type="button" class="field-button" :class="{ 'is-copied': copiedField === 'UserName' }"
                          :disabled="!entryDetail.fieldsV2.UserName" title="Copy username" aria-label="Copy username"
                          @click="copyField('UserName')">
                          <span class="mdi" :class="copiedField === 'UserName' ? 'mdi-check' : 'mdi-content-copy'" />
                        </button>
                      </template>
                    </el-input>
                  </div>

                  <div class="extra-item">
                    <label class="extra-label">Password</label>
                    <el-input v-model="entryDetail.fieldsV2.Password" type="password" show-password class="vgo-u-font-code"
                      placeholder="Password" aria-label="Password">
                      <template #append>
                        <button type="button" class="field-button" title="Generate strong password"
                          aria-label="Generate strong password" @click="handleGeneratePassword">
                          <span class="mdi mdi-dice-5" />
                        </button>
                        <button type="button" class="field-button" :class="{ 'is-copied': copiedField === 'Password' }"
                          :disabled="!entryDetail.fieldsV2.Password" title="Copy password" aria-label="Copy password"
                          @click="copyField('Password')">
                          <span class="mdi" :class="copiedField === 'Password' ? 'mdi-check' : 'mdi-content-copy'" />
                        </button>
                      </template>
                    </el-input>
                  </div>

                  <div class="extra-item extra-item--full">
                    <label class="extra-label">URL</label>
                    <el-input v-model="entryDetail.fieldsV2.URL" placeholder="URL" aria-label="URL">
                      <template #append>
                        <button type="button" class="field-button" :disabled="!entryDetail.fieldsV2.URL"
                          title="Visit website" aria-label="Visit website" @click="handleVisitUrl">
                          <span class="mdi mdi-open-in-new" />
                        </button>
                        <button type="button" class="field-button" :class="{ 'is-copied': copiedField === 'URL' }"
                          :disabled="!entryDetail.fieldsV2.URL" title="Copy URL" aria-label="Copy URL"
                          @click="copyField('URL')">
                          <span class="mdi" :class="copiedField === 'URL' ? 'mdi-check' : 'mdi-content-copy'" />
                        </button>
                      </template>
                    </el-input>
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
      min-height: 0;
      overflow: auto;
      box-sizing: border-box;
      padding: 12px 16px 6px;

      @media screen and (max-width: 600px) {
        padding: 8px 8px 4px;
      }

      @media screen and (max-height: 500px) {
        padding-top: 0;
      }
    }

    .detail-card {
      width: 100%;
      max-width: 800px;
      height: 100%;
      margin: 0 auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .detail-infos {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;

        .detail-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          min-height: var(--vgo-control-md);

          .detail-title-input {
            flex: 1 1 auto;
            min-width: 0;
          }

          .detail-info-actions {
            display: flex;
            align-items: center;
            flex-shrink: 0;
            gap: 2px;
          }

          .vgo-entry-icon-button {
            flex-shrink: 0;
            padding: 0;
            line-height: 0;
            cursor: pointer;
          }

          // 窄屏：图标、标题、操作按钮仍保持同一行，只收缩间距
          @media screen and (max-width: 600px) {
            gap: 4px;

            .detail-info-actions {
              gap: 0;
            }
          }
        }

        // 统一表单标签：extra-item / date-item 共用同一套样式
        .extra-label,
        .date-label {
          flex: 0 0 auto;
          width: 64px;
          text-align: right;
          font-size: var(--vgo-font-sm);
          line-height: 1.3;
          color: var(--vgo-text-secondary);
          white-space: nowrap;
          user-select: none;
        }

        // 创建/更新时间：与 extra-info 一致的两列「标签 + 控件」布局
        .detail-dates {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          min-width: 0;

          .date-item {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }

          :deep(.el-date-editor) {
            flex: 1 1 auto;
            width: auto;
            min-width: 0;

            .el-input__wrapper,
            .el-input__inner {
              min-width: 0;
            }
          }

          @media screen and (max-width: 720px) {
            grid-template-columns: minmax(0, 1fr);
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

        .detail-title-input {
          :deep(.el-input__inner) {
            font-size: var(--vgo-font-lg);
            font-weight: 600;
          }
        }

        .detail-more {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 4px;
        }

        .extra-info {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: auto;
          gap: 8px;

          .extra-item {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;

            &--full {
              grid-column: 1 / -1;
            }

            :deep(.el-input) {
              flex: 1 1 auto;
              min-width: 0;
            }

            :deep(.el-input-group__append) {
              padding: 0;
              overflow: hidden;
            }

            .field-button {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100%;
              min-height: 30px;
              min-width: 26px;
              padding: 0 4px;
              border: 0;
              background: transparent;
              color: var(--vgo-text-secondary);
              font-size: var(--vgo-icon-sm);
              line-height: 1;
              cursor: pointer;
              transition: color var(--vgo-duration-fast), background-color var(--vgo-duration-fast);

              &:hover:not(:disabled) {
                color: var(--vgo-primary);
              }

              &:active:not(:disabled) {
                background: var(--vgo-hover);
              }

              &:disabled {
                cursor: not-allowed;
                opacity: 0.4;
              }

              &.is-copied {
                color: var(--vgo-success);
              }

              // 同一输入框内的多个按钮之间加一条细分隔线
              & + & {
                box-shadow: inset 1px 0 0 var(--vgo-border);
              }
            }
          }

          // 窄屏：单列堆叠，标签仍然在输入框左侧
          @media screen and (max-width: 720px) {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      }
    }
  }
}
</style>
