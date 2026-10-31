import {createWindowManager} from '@canwdev/vgo-ui'

export type DetailWindowData = {
  kind: 'detail'
  uuid: string
  title: string
  icon?: number
  bgColor?: string | null
  fgColor?: string | null
}

export type SearchWindowData = {
  kind: 'search'
  title: string
}

export type NoteWindowData = DetailWindowData | SearchWindowData

export const SEARCH_WINDOW_KEY = 'search-database'
export const SEARCH_WINDOW_TITLE = 'Search Database'

/**
 * 详情窗口只是内存数据库的视图：关闭窗口不会丢失数据，
 * 因此不再需要“未保存确认”或窗口级保存按钮。
 *
 * 搜索窗口也由同一个管理器托管，这样它和详情窗口共用
 * 叠放顺序、任务栏与最小化行为。
 */
export const noteWindows = createWindowManager<NoteWindowData>()

export const openDetailWindow = (uuid: string, title = 'Note') => {
  // 窗口已存在时只激活，不要用新的空 data 覆盖它。
  const existing = noteWindows.findByKey(uuid)
  if (existing?.data.kind === 'detail') {
    noteWindows.activate(existing.id)
    return existing
  }

  // 仅窄屏自动全屏，宽屏保持可拖拽的窗口
  const maximized = typeof window !== 'undefined' && window.innerWidth <= 800
  return noteWindows.open(
    {
      kind: 'detail',
      uuid,
      title,
    },
    {
      key: uuid,
      title,
      maximized,
    },
  )
}

export const openSearchWindow = () => {
  const existing = noteWindows.findByKey(SEARCH_WINDOW_KEY)
  if (existing) {
    noteWindows.activate(existing.id)
    return existing
  }

  return noteWindows.open(
    {
      kind: 'search',
      title: SEARCH_WINDOW_TITLE,
    },
    {
      key: SEARCH_WINDOW_KEY,
      title: SEARCH_WINDOW_TITLE,
    },
  )
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
  const win = noteWindows.findByKey(uuid)
  if (!win || win.data.kind !== 'detail') {
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

export const closeAllNoteWindows = () => {
  ;[...noteWindows.stack].forEach((win) => noteWindows.close(win.id))
}
