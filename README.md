# KeeNote Web

**English** | [简体中文](README.zh-CN.md)

A secure, local-first note & password manager for the browser, built on
[KeePass KDBX](https://keepass.info/help/kb/kdbx_4.html) files and
[kdbxweb](https://github.com/keeweb/kdbxweb). Everything runs client-side —
no server, no telemetry. Your `.kdbx` database never leaves
your machine.

- Repository: <https://github.com/canwdev/kee-note>
- Frontend details: [frontend/README.md](frontend/README.md)

## Features

### Database & security

- **KDBX 3 / KDBX 4 support** — open existing KeePass databases, or create a new
  KDBX4 database (Argon2 via `hash-wasm` in a Web Worker).
- **Password + key file** credentials, including generating a random key file.
- **In-memory editing** — the whole database is held in memory; changes are
  written to disk only when you save (`Ctrl+S` / save button).
- **Unsaved-change guard** — `beforeunload` confirmation, and a save prompt
  before locking. `Ctrl+L` locks the database.
- **Open history (IndexedDB)** — keeps an *encrypted* KDBX snapshot, the key file
  and the file reference, so you can re-open quickly even after the file
  permission expires. Passwords are never stored; optional and toggleable.
- **Cross-tab safety** — cross-tab file lock plus a global loading state around
  the only three file operations (open / create / save).

### Notes

- Groups and entries with icons, foreground/background colors, and drag-free
  group management from the sidebar tree or the top menu.
- Entry fields: Title, UserName, Password, URL and Markdown **Notes**, plus
  attachments.
- **Markdown editing** powered by HyperMD / CodeMirror with live syntax
  highlighting, TeX math modes and a large theme list.
- **Rich preview** rendered with `marked` + KaTeX (math output as MathML).
- **Attachment preview** for images, video, audio and text-like MIME types,
  with previous/next navigation and download.
- Recycle bin support (soft delete with permanent delete on `Shift`).

### Views & navigation

- **List view** with grouped entries, search and sorting.
- **Calendar view** — month grid of note creation dates, configurable first day
  of week, optional Chinese lunar dates and holidays (`solarlunar` +
  `holiday-cn`), and a mini list for the selected day.
- **Data search** — dedicated database-wide search window.
- **Data visualization** — annual heat map of note activity (ECharts), clickable
  to jump to a day.
- **Multi-window workspace** — dock + stack window manager (`vgo-ui`), so many
  notes can be open at once and rearranged.
- Hash-based routing with a "database not open" route guard and 404 page.

### Appearance & UX

- Light / dark / system theme with a configurable accent color.
- Collapsible sidebar, persisted UI settings (Pinia + localStorage).
- Toast / dialog feedback helpers, clipboard helpers and context menus.

### Files & host integration

- **File System Access API** for real read/write access to the picked `.kdbx`
  file (Chrome/Edge 86+ over HTTPS or localhost).
- **FileLite integration** — when `window.fileLiteSDK` exists it is preferred for
  open/save dialogs, reads/writes and `onOpen` / `getLaunch` launches.
- Isolated file access layer (`src/core/file-access.ts`) with hooks for tests or
  alternative hosts.

## FileLite plugin

Can be used as a [FileLite](https://github.com/canwdev/file-lite) plugin.

1. Download `kee-note-web.zip` from [Releases](https://github.com/canwdev/kee-note/releases).
2. Unzip it and put the `dist` directory (optionally renamed to `kee-note`) into
   the FileLite plugin directory `file-lite/plugins/`.
3. Refresh FileLite and the KeeNote plugin is enabled automatically — you can
   now open and edit your `.kdbx` database.

## Links

- Source & issues: <https://github.com/canwdev/kee-note>
- Frontend / architecture notes: [frontend/README.md](frontend/README.md)
- UI kit: [vgo-ui](https://github.com/canwdev/vgo-ui)
