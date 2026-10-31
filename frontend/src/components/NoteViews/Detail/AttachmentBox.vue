<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { EntryItem } from '@/enum/kdbx'
import { getAttachment, removeAttachment, renameAttachment, uploadAttachment } from '@/api/keepass'
import AttachmentPreview from '@/components/NoteViews/Detail/AttachmentPreview.vue'
import DialogInput from '@/components/NoteViews/Dialogs/DialogInput.vue'
import MenuTrigger from '@/components/CommonUI/MenuTrigger.vue'

export default defineComponent({
  name: 'AttachmentBox',
  components: {
    DialogInput,
    AttachmentPreview,
    MenuTrigger,
  },
  props: {
    entryDetail: {
      type: Object as PropType<EntryItem>,
      required: true,
    },
  },
  setup(props, { emit }) {
    const { entryDetail } = toRefs(props)
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

    const editingFilename = ref(null)
    const getMenuOptions = (item) => {
      return [
        {
          label: 'Rename',
          icon: 'mdi-pencil-outline',
          onClick: () => {
            editingFilename.value = item
            isShowRenameDialog.value = true
          },
        },
        {
          label: 'Delete',
          icon: 'mdi-delete-outline',
          onClick: () => {
            if (confirm('Confirm delete attached file?')) {
              handleRemoveItem(item)
            }
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
        <el-button @click="handlePreviewItem(item, index)">{{ item }}</el-button>

        <MenuTrigger :items="getMenuOptions(item)">
          <el-button title="More">
            <el-icon><span class="mdi mdi-dots-vertical" /></el-icon>
          </el-button>
        </MenuTrigger>
      </el-button-group>

      <el-button title="Add file" @click="handleAddAttachment">
        <el-icon><span class="mdi mdi-paperclip" /></el-icon>
      </el-button>
    </div>

    <AttachmentPreview v-model:visible="isShowPreview" :uuid="entryDetail.uuid"
      :attachment-names="entryDetail.attachmentNames" :index="previewIndex" @dataUpdated="$emit('dataUpdated')" />

    <DialogInput v-model:visible="isShowRenameDialog" :value="editingFilename || ''" dialog-title="Rename File"
      input-label="Filename" @onSubmit="handleRename" />
  </div>
</template>

<style lang="scss" scoped>
.attachment-box {
  margin-top: 8px;
}
</style>
