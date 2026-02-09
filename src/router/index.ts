import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/game'
    },
    {
      path: '/debug',
      name: 'debug',
      component: () => import('@/views/DebugView.vue'),
      meta: { title: '元音识别调试' }
    },
    {
      path: '/debug-ml',
      name: 'debug-ml',
      component: () => import('@/views/DebugMLDetector.vue'),
      meta: { title: '元音识别调试-ML' }
    },
    {
      path: '/analyzer',
      name: 'analyzer',
      component: () => import('@/views/AudioAnalyzer.vue'),
      meta: { title: '音频分析工具' }
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('@/views/GameView.vue'),
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
