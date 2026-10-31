<script lang="ts">
import { defineComponent } from 'vue'
import { db } from '@/core/database'
import { useModelWrapper } from '@/hooks/use-model-wrapper'
import mime from 'mime'
import DialogInput from '@/components/NoteViews/Dialogs/DialogInput.vue'
import { aLinkDownload } from '@/utils/download'
import { ModalWindow } from '@canwdev/vgo-ui'

export default defineComponent({
  name: 'AttachmentPreview',
  components: {
    ModalWindow,
    DialogInput,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    attachmentNames: {
      type: Array,
      default() {
        return []
      },
    },
    index: {
      type: Number,
      default: 0,
    },
    uuid: {
      type: String,
      required: true,
    },
  },
  setup(props, { emit }) {
    const { attachmentNames, index, uuid } = toRefs(props)
    const mVisible = useModelWrapper(props, emit, 'visible')

    const imgSrc = ref<string | undefined>(undefined)
    const pureText = ref<string | undefined>(undefined)
    const blobData = shallowRef<Blob | null>(null)

    watch(mVisible, (val) => {
      if (val) {
        mIndex.value = index.value
        updatePreview()
      } else {
        blobData.value = null
        imgSrc.value = undefined
        pureText.value = undefined
      }
    })

    const mIndex = ref(0)
    watch(
      index,
      (val) => {
        mIndex.value = val
      },
      { immediate: true }
    )

    const filename = computed(() => {
      return String(attachmentNames.value[mIndex.value] || '')
    })

    const fileMimeType = ref('')

    const previewType = computed(() => {
      const mimeType = fileMimeType.value || ''
      const fileSuffix = (filename.value.split('.').pop() || '').toLowerCase()
      const type0 = mimeType?.split('/')[0]

      if (type0 === 'image') {
        return 'image'
      }
      if (type0 === 'video') {
        return 'video'
      }
      if (type0 === 'audio') {
        return 'audio'
      }
      if (
        type0 === 'text' ||
        mimeType === 'application/json' ||
        mimeType === 'application/javascript' ||
        fileSuffix === 'vue' ||
        fileSuffix === 'ts'
      ) {
        if (blobData.value) {
          const reader = new FileReader()
          reader.readAsText(blobData.value)
          reader.onload = () => {
            pureText.value = String(reader.result || '')
          }
        }
        return 'text'
      }

      return null
    })

    const updatePreview = async () => {
      const blob = db.getAttachment(uuid.value, filename.value)

      fileMimeType.value = mime.getType(filename.value) ?? ''
      blobData.value = blob
      imgSrc.value = URL.createObjectURL(blob)
    }

    return {
      imgSrc,
      mVisible,
      pureText,
      mIndex,
      goNext() {
        if (mIndex.value >= attachmentNames.value.length - 1) {
          mIndex.value = 0
        } else {
          mIndex.value++
        }

        updatePreview()
      },
      goPrev() {
        if (mIndex.value <= 0) {
          mIndex.value = attachmentNames.value.length - 1
        } else {
          mIndex.value--
        }

        updatePreview()
      },
      filename,
      fileMimeType,
      previewType,
      handleDownload() {
        if (blobData.value && imgSrc.value) {
          aLinkDownload(imgSrc.value, filename.value)
        }
      },
    }
  },
})
</script>

<template>
  <ModalWindow v-model:visible="mVisible" :title="filename" class="attachment-preview-dialog"
    :init-win-options="{ width: '800px' }">
    <div class="attachment-preview">
      <div class="vgo-u-flex-wrap-center preview-actions">
        <el-button-group>
          <el-button title="Prev" @click="goPrev">
            <el-icon><span class="mdi mdi-chevron-left" /></el-icon>
          </el-button>
          <el-button title="Next" @click="goNext">
            <el-icon><span class="mdi mdi-chevron-right" /></el-icon>
          </el-button>
        </el-button-group>
        <el-button title="Download" @click="handleDownload">
          <el-icon><span class="mdi mdi-download" /></el-icon>
        </el-button>
      </div>

      <div class="image-box">
        <img v-if="previewType === 'image'" :src="imgSrc" />
        <audio controls v-else-if="previewType === 'audio'" :src="imgSrc" />
        <video controls v-else-if="previewType === 'video'" :src="imgSrc" />
        <textarea v-else-if="previewType === 'text'" disabled :value="pureText" />
        <div style="text-align: center" v-else>
          <b>Unable to preview</b> <br />
          {{ fileMimeType }}
        </div>
      </div>
      <div class="filename-title" :title="fileMimeType">
        {{ `${mIndex + 1}/${attachmentNames?.length}` }}
      </div>
    </div>
  </ModalWindow>
</template>

<style lang="scss" scoped>
.attachment-preview {
  height: 580px;
  display: flex;
  flex-direction: column;

  .image-box {
    margin-top: 10px;
    margin-bottom: 10px;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    img {
      max-width: 100%;
      max-height: 100%;
    }

    textarea {
      width: 90%;
      height: 90%;
      font-family: monospace;
    }
  }

  .filename-title {
    text-align: center;
    font-size: 14px;
  }
}
</style>
