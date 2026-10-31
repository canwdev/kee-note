import {createWindowManager} from '@canwdev/vgo-ui'
import {ElMessageBox} from 'element-plus'
import {useKeeStore} from '@/store/kee-store'

export type DetailWindowData = {
  uuid: string
  dirty: boolean
  title: string
  icon?: number
  bgColor?: string | null
  fgColor?: string | null
  saveDisabled: boolean
  saveLabel: string
  savePrimary: boolean
}

const syncDirtyState = () => {
  const keeStore = useKeeStore()
  keeStore.isChanged = detailWindows.stack.some(
    (win) => !win.isClosing && win.data.dirty,
  )
}

export const detailWindows = createWindowManager<DetailWindowData>({
  onClose(win) {
    win.data.dirty = false
    syncDirtyState()
  },
})

const confirmDiscardChanges = async (win: any) => {
  if (!win.data.dirty) {
    return true
  }

  try {
    await ElMessageBox.confirm('Discard changes?', 'Confirm', {
      type: 'warning',
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
    })
    return true
  } catch {
    return false
  }
}

export const openDetailWindow = (uuid: string, title = 'Note') => {
  // 窗口已存在时只激活，不要用新的空 data 覆盖它。
  // vgo-ui 的 open() 在 key 命中时会执行 existing.data = data，
  // 直接再次 open 会丢掉标题图标、颜色和保存状态，图标会退回默认值。
  const existing = detailWindows.findByKey(uuid)
  if (existing) {
    detailWindows.activate(existing.id)
    return existing
  }

  const win = detailWindows.open(
    {
      uuid,
      dirty: false,
      title,
      saveDisabled: true,
      saveLabel: 'Save',
      savePrimary: false,
    },
    {
      key: uuid,
      title,
      maximized: true,
    },
  )

  detailWindows.setCloseGuard(win.id, () => confirmDiscardChanges(win))
  return win
}

export const setDetailWindowDirty = (uuid: string, dirty: boolean) => {
  const win = detailWindows.findByKey(uuid)
  if (!win) {
    return
  }
  win.data.dirty = dirty
  syncDirtyState()
}

export const updateDetailWindowInfo = (
  uuid: string,
  info: {
    title?: string
    icon?: number
    bgColor?: string | null
    fgColor?: string | null
  },
) => {
  const win = detailWindows.findByKey(uuid)
  if (!win) {
    return
  }

  if (info.title) {
    win.title = info.title
    win.data.title = info.title
  }
  if (info.icon !== undefined) {
    win.data.icon = info.icon
  }
  if (info.bgColor !== undefined) {
    win.data.bgColor = info.bgColor
  }
  if (info.fgColor !== undefined) {
    win.data.fgColor = info.fgColor
  }
}

export const updateDetailWindowSaveState = (
  uuid: string,
  state: {disabled: boolean; label: string; primary: boolean},
) => {
  const win = detailWindows.findByKey(uuid)
  if (!win) {
    return
  }
  win.data.saveDisabled = state.disabled
  win.data.saveLabel = state.label
  win.data.savePrimary = state.primary
}

export const closeAllDetailWindows = () => {
  ;[...detailWindows.stack].forEach((win) => detailWindows.close(win.id))
  syncDirtyState()
}
