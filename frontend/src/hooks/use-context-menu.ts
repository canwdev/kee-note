import {ContextMenu} from '@canwdev/vgo-ui'
import type {MenuItem} from '@canwdev/vgo-ui'

export type ContextMenuItem = MenuItem

export const useContextMenu = (getOptions) => {
  const editingNode = ref<any | null>(null)

  const nodeAction = (node: any | null, cb) => {
    editingNode.value = node
    cb()
  }

  const handleContextmenu = (event: MouseEvent, option: any): void => {
    event.preventDefault()

    const items = (getOptions(option, event) as ContextMenuItem[]).filter(Boolean)

    ContextMenu.showContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      iconFontClass: 'mdi',
    })
  }

  return {
    editingNode,
    nodeAction,
    handleContextmenu,
  }
}
