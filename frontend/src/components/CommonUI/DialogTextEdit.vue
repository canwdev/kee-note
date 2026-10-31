<script lang="ts">
import {defineComponent, ref} from 'vue'
import {ModalWindow} from '@canwdev/vgo-ui'
import {useModelWrapper} from '@/hooks/use-model-wrapper'

export default defineComponent({
  name: 'DialogTextEdit',
  components: {
    ModalWindow,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Text edit',
    },
    placeholder: {
      type: String,
      default: 'Input text',
    },
    // 默认文本
    text: {
      type: String,
      default: '',
    },
    isTextarea: {
      type: Boolean,
      default: false,
    },
    clearable: {
      type: Boolean,
      default: false,
    },
    // 输入框为input的type
    type: {
      type: String,
      default: 'text',
    },
  },
  emits: ['onSave', 'update:modelValue', 'update:visible'],
  setup(props, {emit}) {
    const {text} = toRefs(props)
    const mVisible = useModelWrapper(props, emit, 'visible')

    const inputRef = ref()
    const editingText = ref('')
    watch(
      text,
      (val) => {
        editingText.value = val
      },
      {immediate: true},
    )

    watch(mVisible, (val) => {
      if (val) {
        setTimeout(() => {
          inputRef.value?.focus()
        })
      }
    })

    return {
      inputRef,
      mVisible,
      editingText,
      handleSave() {
        emit('onSave', editingText.value)
      },
    }
  },
})
</script>

<template>
  <ModalWindow
    v-model:visible="mVisible"
    :title="title"
    :mask-closable="false"
    :init-win-options="{width: '700px'}"
  >
    <template v-if="mVisible">
      <!--<VueMonaco-->
      <!--  ref="inputRef"-->
      <!--  v-if="isTextarea"-->
      <!--  v-model="editingText"-->
      <!--  language="json"-->
      <!--  style="height: 500px"-->
      <!--/>-->
      <el-input
        ref="inputRef"
        :type="type"
        v-model="editingText"
        class="vgo-u-font-code"
        :rows="isTextarea ? 25 : null"
        :placeholder="placeholder"
        autofocus
        :clearable="clearable"
      ></el-input>
    </template>

    <div class="dialog-footer">
      <button class="vgo-button" @click="mVisible = false">Cancel</button>
      <button class="vgo-button vgo-button--primary" @click="handleSave()">Save</button>
    </div>
  </ModalWindow>
</template>
