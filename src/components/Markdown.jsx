import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown'

export default function Markdown({ source, className = '' }) {
  const html = useMemo(() => renderMarkdown(source), [source])
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
