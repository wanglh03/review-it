import { handleApi } from './api.js'

/**
 * Cloudflare Worker 入口：
 * - /api/* 交给 API 路由处理
 * - 其余请求交给静态资源（Vite 构建产物），未命中的路径回退到 index.html
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url)
    }

    if (!env.ASSETS) {
      return new Response('Static assets binding is missing', { status: 500 })
    }

    return env.ASSETS.fetch(request)
  },
}
