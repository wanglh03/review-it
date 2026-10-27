import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * 把 Markdown 渲染成安全的 HTML。
 * 原始 Markdown 存在 R2，渲染前的 HTML 一律经过 DOMPurify 清洗，防止 XSS。
 */
export function renderMarkdown(source) {
  if (!source) return ''
  const html = marked.parse(source, { async: false })
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  })
}

/** 列表页的纯文字摘要 */
export function plainSummary(source, max = 90) {
  if (!source) return ''
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}
