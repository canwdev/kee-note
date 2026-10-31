<script lang="ts">
import {defineComponent, PropType} from 'vue'
import {EntryItem} from '@/enum/kdbx'
import {getAttachment, removeAttachment, renameAttachment, uploadAttachment} from '@/api/keepass'
import AttachmentPreview from '@/components/NoteViews/Detail/AttachmentPreview.vue'
import DialogInput from '@/components/NoteViews/Dialogs/DialogInput.vue'

export default defineComponent({
  name: 'AttachmentBox',
  components: {
    DialogInput,
    AttachmentPreview,
  },
  props: {
    entryDetail: {
      type: Object as PropType<EntryItem>,
      required: true,
    },
  },
  setup(props, {emit}) {
    const {entryDetail} = toRefs(props)
    const isShowPreview = ref(false)

    const previewIndex = ref(0)
    const handlePreviewItem = async (filename, index) => {
      previewIndex.value = index
      isShowPreview.value = true
    }

    const handleRemoveItem = async (filename) => {
      await removeAttachment({
        uuid: entryDetail.value.uuid,
        filename,
      })

      emit('dataUpdated')
    }

    const handleAddAttachment = async () => {
      // @ts-ignore
      const handles = await window.showOpenFilePicker({
        multiple: true,
      })

      const files: File[] = []
      for (let i = 0; i < handles.length; i++) {
        const handle = handles[i]
        const file = await handle.getFile()
        files.push(file)
      }

      await uploadAttachment(entryDetail.value.uuid, files)
      emit('dataUpdated')
    }

    const handleMenuCommand = (item: any) => {
      item?.props?.onClick?.()
    }

    const editingFilename = ref(null)
    const getMenuOptions = (item) => {
      return [
        {
          label: '✒️ Rename',
          props: {
            onClick: () => {
              editingFilename.value = item
              isShowRenameDialog.value = true
            },
          },
        },
        {
          label: '❌ Delete',
          props: {
            onClick: () => {
              if (confirm('Confirm delete attached file?')) {
                handleRemoveItem(item)
              }
            },
          },
        },
      ]
    }

    const isShowRenameDialog = ref(false)
    const handleRename = async (name) => {
      await renameAttachment({
        uuid: entryDetail.value.uuid,
        filename: editingFilename.value,
        newFilename: name,
      })
      emit('dataUpdated')
    }

    return {
      isShowPreview,
      previewIndex,
      handlePreviewItem,
      handleRemoveItem,
      handleAddAttachment,
      handleMenuCommand,
      getMenuOptions,
      isShowRenameDialog,
      handleRename,
      editingFilename,
    }
  },
})
</script>

<template>
  <div class="attachment-box">
    <div class="vgo-u-flex-wrap-center">
      <span>Attachments</span>
      <el-button-group v-for="(item, index) in entryDetail.attachmentNames" :key="item">
        <el-button size="small" @click="handlePreviewItem(item, index)">{{ item }}</el-button>

        <el-dropdown trigger="click" @command="handleMenuCommand">
          <el-button size="small" title="More">
            <el-icon><span class="mdi mdi-dots-vertical" /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="(opt, i) in getMenuOptions(item)"
                :key="i"
                :command="opt"
              >
                {{ opt.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-button-group>

      <el-button title="Add file" size="small" @click="handleAddAttachment">
        <el-icon><span class="mdi mdi-paperclip" /></el-icon>
      </el-button>
    </div>

    <AttachmentPreview
      v-model:visible="isShowPreview"
      :uuid="entryDetail.uuid"
      :attachment-names="entryDetail.attachmentNames"
      :index="previewIndex"
      @dataUpdated="$emit('dataUpdated')"
    />

    <DialogInput
      v-model:visible="isShowRenameDialog"
      :value="editingFilename || ''"
      dialog-title="Rename File"
      input-label="Filename"
      @onSubmit="handleRename"
    />
  </div>
</template>

<style lang="scss" scoped>
.attachment-box {
  margin-top: 8px;
  margin-bottom: 8px;
}
</style>
