import Vue from 'vue'
import VueRouter from 'vue-router'
import Login from '@/views/Login.vue'
import Default from "@/layout/Default"
import store from '@/store'

const validateUnlock = (to, from, next) => {
  if (store.getters.isUnlocked) {
    next()
  } else {
    router.replace({name: 'Login'})
  }
}

Vue.use(VueRouter)

  const routes = [
  {
    path: '/',
    name: 'Root',
    component: Default,
    redirect: {
      name: 'Login'
    },
    children: [
      {
        path: 'login',
        name: 'Login',
        component: Login
      },
      {
        path: 'list',
        name: 'DbListView',
        beforeEnter: validateUnlock,
        component: () => import('@/views/DbListView.vue')
      }
    ]
  },
  {
    path: '/about',
    component: () => import('@/views/About.vue')
  }
]

const router = new VueRouter({
  routes
})

export default router
