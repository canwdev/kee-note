import {createRouter, createWebHashHistory} from 'vue-router'
import UnlockView from '@/views/Home/UnlockView.vue'
import {isDatabaseOpen} from '@/core/database'
import pkg from '../../package.json'

const constantRoutes = [
  {
    name: 'HomeView',
    path: '/',
    component: UnlockView,
  },
  {
    name: 'NoteRoot',
    path: '/note',
    redirect: '/note/view',
    beforeEnter: () => {
      if (!isDatabaseOpen()) {
        // reject the navigation
        return {name: 'HomeView'}
      }
    },
    children: [
      {
        name: 'NoteView',
        path: 'view',
        component: () => import('@/views/Note/NoteBaseView.vue'),
        meta: {
          keepAlive: true,
        },
      },
    ],
  },
  {path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/PageNotFound.vue')},
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL || ''),
  routes: constantRoutes,
})

export const formatSiteTitle = (t?: string, dirty = false) => {
  const title = `KeeNote v${pkg.version}`
  const base = t ? `${t} - ${title}` : title
  return dirty ? `• ${base}` : base
}

export default router
