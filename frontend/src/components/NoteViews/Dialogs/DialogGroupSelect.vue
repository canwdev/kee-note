<script lang="ts">
import {ref} from 'vue'
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import {GroupItem} from '@/enum/kdbx'
import {db} from '@/core/database'
import {ModalWindow} from '@canwdev/vgo-ui'

export default defineComponent({
  name: 'DialogGroupSelect',
  components: {
    ModalWindow,
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    value: {
      type: String,
      default: '',
    },
  },
  emits: ['onSubmit', 'update:visible'],
  setup(props, {emit}) {
    const {value: propValue} = toRefs(props)
    const mVisible = useModelWrapper(props, emit, 'visible')
    const groupUuid = ref<string>('')

    const groupTree = ref<GroupItem[]>([])
    const getGroupTree = async () => {
      groupTree.value = db.getGroupTree()
    }

    watch(mVisible, (val) => {
      if (val) {
        groupUuid.value = propValue.value
        getGroupTree()
      } else {
        setTimeout(() => {
          groupUuid.value = ''
          groupTree.value = []
        }, 1000)
      }
    })

    const handleNodeClick = (data: GroupItem) => {
      groupUuid.value = data.uuid
    }

    return {
      groupTree,
      mVisible,
      groupUuid,
      handleNodeClick,
      treeProps: {
        children: 'children',
        label: 'title',
      },
      handleOK(e: MouseEvent) {
        e.preventDefault()

        if (!groupUuid.value) {
          return
        }
        emit('onSubmit', groupUuid.value)
        mVisible.value = false
      },
    }
  },
})
</script>

<template>
  <ModalWindow
    v-model:visible="mVisible"
    title="Select Group"
    :init-win-options="{width: '440px'}"
  >
    <div class="group-select-tree">
      <el-tree
        :data="groupTree"
        node-key="uuid"
        :props="treeProps"
        :current-node-key="groupUuid"
        highlight-current
        default-expand-all
        :expand-on-click-node="false"
        @node-click="handleNodeClick"
      />
    </div>
    <div class="dialog-footer">
      <button class="vgo-button" @click="mVisible = false">Cancel</button>
      <button class="vgo-button vgo-button--primary" @click="handleOK">OK</button>
    </div>
  </ModalWindow>
</template>

<style lang="scss" scoped>
.group-select-tree {
  max-height: 50vh;
  overflow: auto;
}
</style>
