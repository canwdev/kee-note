# KeeNote (Browser)

A secure, local-first note app powered by [kdbxweb](https://github.com/keeweb/kdbxweb) and Vue 3.
Everything runs in the browser — there is no server and no Electron backend. Your `.kdbx`
database never leaves your machine.

Tech stack: Vue 3 + Element Plus + [vgo-ui](https://github.com/canwdev/vgo-ui) + Vite 8.

## Features

- Open / create KDBX4 databases directly from the browser (File System Access API)
- Read & write the same file through a `FileSystemFileHandle`
- The whole database lives in memory: edits are applied instantly and written
  to disk only when you save (global save button / `Ctrl+S`), so interactive
  operations never touch the file
- **FileLite integration**: when `window.fileLiteSDK` is present it is preferred for
  open/save dialogs, file reads and writes, and `onOpen` / `getLaunch` launches
- Password and key-file support (generate a random key file)
- Groups, entries, Markdown notes, attachments, search, calendar & heatmap views
- Unsaved-change guard: `beforeunload` confirmation and a save prompt before locking

## Requirements

- Chrome / Edge 86+ on `https://` or `http://localhost` (File System Access API),
  or a FileLite host page that injects the plugin SDK
- KDBX 3 / KDBX 4 databases

## Development

```bash
bun install
bun run dev      # http://localhost:3030
```

## Build

```bash
bun run build    # output: dist/
bun run preview
```

Serve `dist/` with any static file server over HTTPS (or localhost). Opening
`index.html` from `file://` will not work because the File System Access API
requires a secure context.

## CI: pre-releases & GitHub Pages

`.github/workflows/build-release-pages.yml` runs on every push to `master`
(and manually via `workflow_dispatch`):

1. `bun install --frozen-lockfile` + `bun run build`
2. Creates a **pre-release** tagged `v<package.json version>-pre.<run>` with
   `kee-note-web.zip` (containing `dist/`) attached
3. Publishes `dist/` to GitHub Pages

One-time repo setup: **Settings → Pages → Build and deployment → Source:
GitHub Actions**, and allow `contents: write` + `pages: write` for the workflow
(the permissions are already declared in the workflow file).

## Notes

- `src/core/database.ts` owns the in-memory `Kdbx` object and exposes a typed
  API (`db.getGroupEntries()`, `db.saveEntryDetail()`, ...). Components call it
  directly — there is no request/route layer for database operations.
- Only open / create / save read or write the file (with a global loading
  spinner and a cross-tab file lock). In-memory reads and edits are synchronous.
- File access is isolated in `src/core/file-access.ts`. It prefers
  `window.fileLiteSDK`, falls back to File System Access API, and exposes
  `setFileAccessHooks()` for tests or alternative hosts (pick/read/write hooks).
- KDBX4 Argon2 is provided by `hash-wasm` and runs in a Web Worker
  (`src/core/argon2.ts` + `argon2-worker.ts`).
- The file handle only lives for the current page session. After a reload you
  need to pick the `.kdbx` file again (the password prompt is unchanged).
