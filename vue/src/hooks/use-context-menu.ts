export type ContextMenuItem = {
  label: string
  split?: boolean
  disabled?: boolean
  props?: {
    onClick?: () => void
    [key: string]: any
  }
}

export const useContextMenu = (getOptions) => {
  const rightMenuOptions = ref<ContextMenuItem[]>([])
  const showRightMenu = ref(false)
  const xRef = ref(0)
  const yRef = ref(0)

  const editingNode = ref<any | null>(null)
  const nodeAction = (node: any | null, cb) => {
    // console.log(node)
    editingNode.value = node
    cb()
  }

  return {
    editingNode,
    nodeAction,
    rightMenuOptions,
    showRightMenu,
    xRef,
    yRef,
    handleSelect: (option?: ContextMenuItem) => {
      showRightMenu.value = false
      option?.props?.onClick?.()
    },
    handleClickOutside: () => {
      showRightMenu.value = false
      nodeAction(null, () => {})
    },
    handleContextmenu(event: MouseEvent, option: any): void {
      rightMenuOptions.value = getOptions(option, event)
      showRightMenu.value = true
      xRef.value = event.clientX
      yRef.value = event.clientY
      event.preventDefault()
    },
  }
}
