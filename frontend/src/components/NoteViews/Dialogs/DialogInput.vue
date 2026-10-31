<script lang="ts">
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import type {FormInstance, FormRules} from 'element-plus'
import {ref} from 'vue'

export default defineComponent({
  name: 'DialogInput',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    value: {
      type: String,
      default: '',
    },
    dialogTitle: {
      type: String,
      default: 'Input',
    },
    inputLabel: {
      type: String,
      default: 'Input',
    },
    isPassword: {
      type: Boolean,
      default: false,
    },
    required: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['onSubmit', 'update:visible'],
  setup(props, {emit}) {
    const {value: propValue, inputLabel, required} = toRefs(props)
    const mVisible = useModelWrapper(props, emit, 'visible')
    const formRef = ref<FormInstance | null>(null)
    const inputRef = ref<any>(null)
    const modelRef = reactive<{name: string}>({
      name: '',
    })
    const rules = computed<FormRules>(() => ({
      name: [
        {
          required: required.value,
          message: `${inputLabel.value} is required`,
          trigger: ['blur'],
        },
      ],
    }))

    watch(mVisible, (val) => {
      if (val) {
        modelRef.name = propValue.value
        nextTick(() => {
          inputRef.value?.focus()
        })
      } else {
        setTimeout(() => {
          modelRef.name = ''
        }, 1000)
      }
    })

    const handleOK = async () => {
      try {
        await formRef.value?.validate()
      } catch (e) {
        return
      }
      emit('onSubmit', modelRef.name)
      mVisible.value = false
    }

    return {
      inputRef,
      formRef,
      mVisible,
      modelRef,
      rules,
      handleOK,
    }
  },
})
</script>

<template>
  <el-dialog v-model="mVisible" :title="dialogTitle" width="440px" append-to-body>
    <el-form ref="formRef" :model="modelRef" :rules="rules" @submit.prevent>
      <el-form-item prop="name" :label="inputLabel">
        <el-input
          ref="inputRef"
          v-model="modelRef.name"
          :type="isPassword ? 'password' : 'text'"
          :show-password="isPassword"
          @keyup.enter="handleOK"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="mVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleOK">OK</el-button>
      </div>
    </template>
  </el-dialog>
</template>
