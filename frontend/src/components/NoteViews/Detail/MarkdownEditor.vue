<script lang="ts">
import { defineComponent } from 'vue'
import { ModalWindow } from '@canwdev/vgo-ui'
import * as HyperMD from 'hypermd'
// 语法高亮
import 'codemirror/mode/htmlmixed/htmlmixed' // Markdown 内嵌HTML
import 'codemirror/mode/stex/stex' // TeX 数学公式
import 'codemirror/mode/yaml/yaml'

import { useModelWrapper } from '@/hooks/use-model-wrapper'
import {
  useLocalStorageBoolean,
  useLocalStorageNumber,
  useLocalStorageString,
} from '@/hooks/use-local-storage'

// CodeMirror Theme
import '@/styles/editor/keenote-dark.scss'
import '@/styles/editor/keenote-light.scss'
import 'codemirror/theme/idea.css'
import 'codemirror/theme/elegant.css'
import 'codemirror/theme/darcula.css'
import 'codemirror/theme/dracula.css'
import 'codemirror/theme/gruvbox-dark.css'
import 'codemirror/theme/monokai.css'
import 'codemirror/theme/mdn-like.css'
import 'codemirror/theme/solarized.css'
import 'codemirror/theme/the-matrix.css'
import 'codemirror/theme/base16-light.css'
import 'codemirror/theme/duotone-light.css'
import 'codemirror/theme/lucario.css'
import 'codemirror/theme/zenburn.css'
import { useMainStore } from '@/store/main'
import { useEditorSettingsStore } from '@/store/editor'

const cmThemeList = [
  'keenote-light',
  'keenote-dark',
  'hypermd-light',
  'default',
  'idea',
  'elegant',
  'darcula',
  'dracula',
  'gruvbox-dark',
  'monokai',
  'mdn-like',
  'lucario',
  'solarized dark',
  'solarized light',
  'the-matrix',
  'base16-light',
  'duotone-light',
  'zenburn',
]

// do not use vue ref for CodeMirror: https://github.com/codemirror/codemirror5/issues/6805#issuecomment-955151134
let editorInstance: any = null

export default defineComponent({
  name: 'MarkdownEditor',
  components: {
    ModalWindow,
  },
  props: {
    modelValue: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const mainStore = useMainStore()
    const mValue = useModelWrapper(props, emit)
    const textareaRef = ref()
    const editorSettingsStore = useEditorSettingsStore()

    watch(
      () => editorSettingsStore.editorFontSize,
      () => {
        setFontSize()
      }
    )
    watch(
      () => editorSettingsStore.isEditWYSIWYG,
      (val) => {
        if (val) {
          HyperMD.switchToHyperMD(editorInstance)
        } else {
          HyperMD.switchToNormal(editorInstance)
        }
        setEditorTheme(editorSettingsStore.editorTheme)
      }
    )
    watch(
      () => editorSettingsStore.editorFontFamily,
      () => {
        setFontFamily()
      }
    )
    watch(
      () => editorSettingsStore.editorTheme,
      (val) => {
        setEditorTheme(val)
      }
    )
    watch(
      () => mainStore.isAppDarkMode,
      () => {
        setEditorTheme(editorSettingsStore.editorTheme)
      }
    )

    const setEditorTheme = (theme) => {
      if (!theme) {
        theme = mainStore.isAppDarkMode ? 'keenote-dark' : 'keenote-light'
      }
      editorInstance.setOption('theme', theme)
    }

    const setFontFamily = (editor = editorInstance) => {
      const el = editorInstance.display.wrapper
      el.style.fontFamily = editorSettingsStore.editorFontFamily || null
      editor.refresh()
    }

    const setFontSize = (editor = editorInstance) => {
      const el = editor.display.wrapper
      el.style.fontSize = editorSettingsStore.editorFontSize + 'px'
      editor.refresh()
    }

    const initHyperMD = () => {
      const textarea = textareaRef.value
      const editor = HyperMD.fromTextArea(textarea, {
        lineNumbers: false,
      })
      editorInstance = editor

      if (!editorSettingsStore.isEditWYSIWYG) {
        HyperMD.switchToNormal(editor)
      }
      editor.setSize(null, '100%') // set height
      setFontFamily()
      setFontSize()
      setEditorTheme(editorSettingsStore.editorTheme)
      editor.on('change', () => {
        mValue.value = editor.getValue()
      })
      editor.setValue(mValue.value)
    }

    const handleCtrlScroll = (event) => {
      if (event.ctrlKey) {
        event.preventDefault()
        let fz = editorSettingsStore.editorFontSize
        if (editorInstance) {
          if (event.deltaY > 0) {
            if (fz <= 0) {
              return
            }
            fz -= 1
          } else {
            fz += 1
          }
          editorSettingsStore.editorFontSize = fz
          setFontSize()
          // window.$message.info(`font size: ${fz}px`, {
          //   duration: 1000,
          // })
        }
      }
    }

    onMounted(() => {
      initHyperMD()
      document.addEventListener('wheel', handleCtrlScroll, { passive: false })
    })
    onBeforeUnmount(() => {
      document.removeEventListener('wheel', handleCtrlScroll)
    })

    const isShowEditorSettings = ref(false)

    return {
      mainStore,
      textareaRef,
      isShowEditorSettings,
      editorSettingsStore,
      editorThemeOptions: [
        { label: 'Auto (Follow System)', value: '' },
        ...cmThemeList.map((i) => ({
          label: i,
          value: i,
        })),
      ],
      showSettings() {
        isShowEditorSettings.value = true
      },
    }
  },
})
</script>

<template>
  <div class="markdown-editor" :class="{ _dark: mainStore.isAppDarkMode }">
    <textarea ref="textareaRef"></textarea>

    <ModalWindow v-model:visible="isShowEditorSettings" title="HyperMD Editor Settings"
      :init-win-options="{ width: '520px' }">
      <div class="editor-settings">
        <div class="editor-settings__row">
          <span>Font Size</span>
          <div class="vgo-u-flex-wrap-center">
            <el-input-number v-model="editorSettingsStore.editorFontSize" style="width: 120px" :controls="false" />
            <span>px</span>
          </div>
        </div>
        <div class="editor-settings__row">
          <span>Enable WYSIWYG</span>
          <el-switch v-model="editorSettingsStore.isEditWYSIWYG" />
        </div>
        <div class="editor-settings__row">
          <span>Font Family</span>
          <el-input v-model="editorSettingsStore.editorFontFamily" style="width: 260px"
            placeholder="CSS font-family value" />
        </div>
        <div class="editor-settings__row">
          <span>Editor Theme</span>
          <el-select v-model="editorSettingsStore.editorTheme" style="width: 260px">
            <el-option v-for="item in editorThemeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="editor-settings__row">
          <div>
            <div>Turn Off HyperMD</div>
            <small>Back to basic editor</small>
          </div>
          <el-button @click="$emit('turnOff')">Turn Off</el-button>
        </div>
      </div>
    </ModalWindow>
  </div>
</template>

<style lang="scss" scoped>
.markdown-editor {
  overflow: auto;
  flex: 1;
  min-height: 50px;
  border-radius: 4px;
  border: 1px solid rgb(224, 224, 230);

  @media screen and (max-height: 500px) {
    height: calc(100vh - 30px);
  }

  &._dark {
    border-color: transparent;
  }
}

.editor-settings {
  display: flex;
  flex-direction: column;
  gap: var(--vgo-space-3);

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vgo-space-3);
  }
}
</style>
