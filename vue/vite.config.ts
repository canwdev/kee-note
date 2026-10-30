import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import {fileURLToPath, URL} from 'url'
import vueJsx from '@vitejs/plugin-vue-jsx'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    BUILD_TIMESTAMP: Date.now(),
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['kdbxweb'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/_variables.scss";`,
      },
    },
  },
  plugins: [
    vueJsx(),
    vue({
      reactivityTransform: true,
    }),
    AutoImport({
      dts: './src/auto-import.d.ts',
      imports: [
        'vue',
        'pinia',
        '@vueuse/core',
      ],
    }),
  ],
  server: {
    port: 3030,
  },
})
