import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
      path: '/analyzer',
      name: 'analyzer',
      component: () => import('@/views/AudioAnalyzer.vue'),
      meta: { title: '音频分析工具' }
    },
    {
      path: '/media-processor',
      name: 'media-processor',
      component: () => import('@/views/MediaProcessor.vue'),
      meta: { title: '素材加工工具' }
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
