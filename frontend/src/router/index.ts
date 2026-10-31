import {createRouter, createWebHashHistory} from 'vue-router'
import UnlockView from '@/views/Home/UnlockView.vue'
import {isDatabaseOpen} from '@/utils/backend'
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

export const formatSiteTitle = (t?: string) => {
  const title = `KeeNote v${pkg.version}`
  if (!t) {
    return title
  }
  return `${t} - ${title}`
}

router.afterEach((to) => {
  document.title = formatSiteTitle(to?.meta?.title as string)
})

export default router
