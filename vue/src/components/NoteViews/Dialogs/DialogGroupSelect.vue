<script lang="ts">
import {ref} from 'vue'
import {useModelWrapper} from '@/hooks/use-model-wrapper'
import {GroupItem} from '@/enum/kdbx'
import {kService} from '@/api'

export default defineComponent({
  name: 'DialogGroupSelect',
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
      groupTree.value = await kService.getGroupTree()
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
  <el-dialog v-model="mVisible" title="Select Group" width="440px" append-to-body>
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
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="mVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleOK">OK</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style lang="scss" scoped>
.group-select-tree {
  max-height: 50vh;
  overflow: auto;
}
</style>
