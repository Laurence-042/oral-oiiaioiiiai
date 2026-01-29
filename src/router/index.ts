import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/debug'
    },
    {
      path: '/debug',
      name: 'debug',
      component: () => import('@/views/DebugView.vue'),
      meta: { title: '元音识别调试' }
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('@/views/DebugView.vue'), // 暂时指向 DebugView
      meta: { title: 'OIIAIOIIIAI' }
    }
  ]
});

// 更新页面标题
router.beforeEach((to) => {
  const title = to.meta.title as string;
  document.title = title ? `${title} | OIIAIOIIIAI` : 'OIIAIOIIIAI';
});

export default router;
