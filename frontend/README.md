# KeeNote (Browser)

A secure, local-first note app powered by [kdbxweb](https://github.com/keeweb/kdbxweb) and Vue 3.
Everything runs in the browser — there is no server and no Electron backend. Your `.kdbx`
database never leaves your machine.

Tech stack: Vue 3 + Element Plus + [vgo-ui](https://github.com/canwdev/vgo-ui) + Vite 8.

## Features

- Open / create KDBX4 databases directly from the browser (File System Access API)
- Read & write the same file through a `FileSystemFileHandle` (save / auto-save)
- **FileLite integration**: when `window.fileLiteSDK` is present it is preferred for
  open/save dialogs, file reads and writes, and `onOpen` / `getLaunch` launches
- Password and key-file support (generate a random key file)
- Groups, entries, Markdown notes, attachments, search, calendar & heatmap views
- Import / export entries as JSON

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

## Notes

- File access is isolated in `src/utils/backend/file-access.ts`. It prefers
  `window.fileLiteSDK`, falls back to File System Access API, and exposes
  `setFileAccessHooks()` for tests or alternative hosts (pick/read/write hooks).
- KDBX4 Argon2 is provided by `hash-wasm` and runs in a Web Worker
  (`src/utils/backend/argon2.ts` + `argon2-worker.ts`).
- The file handle only lives for the current page session. After a reload you
  need to pick the `.kdbx` file again (the password prompt is unchanged).
