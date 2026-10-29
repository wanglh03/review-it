import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  ListIcon,
  Loader2,
  MapPin,
  NotebookPen,
  Pencil,
  Quote,
  Save,
  X,
} from 'lucide-react'
import { api } from '../lib/api'
import { todayStr, weekdayShort } from '../lib/date'
import { compressImage, imageUrl } from '../lib/image'
import { MAX_IMAGES_PER_ENTRY } from '../lib/constants'
import Markdown from './Markdown'
import LocationPicker from './LocationPicker'
import { Modal, TagPill } from './ui'

const emptyDraft = (date) => ({
  date,
  title: '',
  content: '',
  images: [],
  tags: [],
  location: { name: '', address: '', mapUrl: '', lat: null, lng: null },
})

export default function EntryEditor({
  open,
  mode,
  entry,
  defaultDate,
  tags,
  token,
  onClose,
  onSaved,
  onRequestEditAuth,
  onManageTags,
}) {
  const isEdit = mode === 'edit'
  const [draft, setDraft] = useState(() => emptyDraft(defaultDate || todayStr()))
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (isEdit && entry) {
      setDraft({
        date: entry.date,
        title: entry.title || '',
        content: entry.content || '',
        images: (entry.images || []).map((image) => ({ ...image })),
        tags: [...(entry.tags || [])],
        location: {
          name: entry.location?.name || '',
          address: entry.location?.address || '',
          mapUrl: entry.location?.mapUrl || '',
          lat: Number.isFinite(Number(entry.location?.lat)) ? Number(entry.location.lat) : null,
          lng: Number.isFinite(Number(entry.location?.lng)) ? Number(entry.location.lng) : null,
        },
      })
    } else {
      setDraft(emptyDraft(defaultDate || todayStr()))
    }
    setPreview(false)
    setError('')
    setBusy(false)
    setUploading(0)
  }, [open, isEdit, entry, defaultDate])

  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])
  const location = draft.location

  const patch = (next) => setDraft((current) => ({ ...current, ...next }))
  const patchLocation = (next) =>
    setDraft((current) => ({ ...current, location: { ...current.location, ...next } }))

  const toggleTag = (id) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(id)
        ? current.tags.filter((tagId) => tagId !== id)
        : [...current.tags, id],
    }))

  const wrapSelection = (before, after = before, placeholder = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, selectionEnd, value } = textarea
    const selected = value.slice(selectionStart, selectionEnd) || placeholder
    const next = `${value.slice(0, selectionStart)}${before}${selected}${after}${value.slice(selectionEnd)}`
    patch({ content: next })
    requestAnimationFrame(() => {
      textarea.focus()
      const start = selectionStart + before.length
      textarea.setSelectionRange(start, start + selected.length)
    })
  }

  const prefixLine = (prefix) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const { selectionStart, value } = textarea
    const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    patch({ content: `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}` })
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length)
    })
  }

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const room = MAX_IMAGES_PER_ENTRY - draft.images.length
    if (room <= 0) {
      setError(`最多上传 ${MAX_IMAGES_PER_ENTRY} 张图片`)
      return
    }
    const accepted = files.slice(0, room)
    if (files.length > room) setError(`最多上传 ${MAX_IMAGES_PER_ENTRY} 张图片，多余的已忽略`)
    else setError('')

    setUploading((count) => count + accepted.length)
    for (const file of accepted) {
      try {
        const { file: processed, width, height } = await compressImage(file)
        const result = await api.upload(processed, token)
        setDraft((current) => ({
          ...current,
          images: [...current.images, { key: result.key, w: width, h: height }],
        }))
      } catch (err) {
        setError(err.message || '图片上传失败')
      } finally {
        setUploading((count) => Math.max(0, count - 1))
      }
    }
  }

  const removeImage = (key) =>
    setDraft((current) => ({
      ...current,
      images: current.images.filter((image) => image.key !== key),
    }))

  const save = async () => {
    if (busy || uploading > 0) return
    if (!draft.content.trim() && draft.images.length === 0) {
      setError('写点什么，或者至少放一张照片吧')
      return
    }

    setBusy(true)
    setError('')
    const payload = {
      date: draft.date,
      title: draft.title.trim(),
      content: draft.content,
      images: draft.images,
      tags: draft.tags,
      location: {
        name: location.name.trim(),
        address: location.address.trim(),
        mapUrl: location.mapUrl,
        lat: location.lat,
        lng: location.lng,
      },
    }

    try {
      const result = isEdit
        ? await api.updateEntry(draft.date, payload, token)
        : await api.createEntry(payload, token)
      onSaved(result.entry, isEdit)
    } catch (err) {
      if (err.status === 401) {
        setError('登录状态已过期，请重新验证密码')
        onRequestEditAuth?.()
      } else {
        setError(err.message || '保存失败，请重试')
      }
      setBusy(false)
    }
  }

  const dateLabel = `${draft.date.slice(0, 4)} 年 ${Number(draft.date.slice(5, 7))} 月 ${Number(
    draft.date.slice(8, 10),
  )} 日 · ${weekdayShort(draft.date)}`

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? '编辑这一天的记录' : '添加记录'}
      subtitle={dateLabel}
      icon={isEdit ? <Pencil size={20} /> : <NotebookPen size={20} />}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-line bg-white px-6 py-3 text-base font-bold text-ink transition hover:bg-cream disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || uploading > 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral px-5 py-3 text-base font-bold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-deep disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={17} />}
            {busy ? '正在保存…' : isEdit ? '保存修改' : '发布记录'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 日期 */}
        <section>
          <FieldLabel>日期</FieldLabel>
          {isEdit ? (
            <div className="rounded-2xl border border-line bg-cream px-4 py-3 text-base font-bold text-ink">
              {dateLabel}
              <span className="ml-2 text-xs font-medium text-muted">日期不可修改</span>
            </div>
          ) : (
            <input
              type="date"
              value={draft.date}
              min="2000-01-01"
              max="2999-12-31"
              onChange={(event) => patch({ date: event.target.value || todayStr() })}
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base font-semibold outline-none transition focus:border-coral focus:ring-4 focus:ring-coral/10"
            />
          )}
        </section>

        {/* 标题 */}
        <section>
          <FieldLabel>标题（可选）</FieldLabel>
          <input
            value={draft.title}
            onChange={(event) => patch({ title: event.target.value })}
            maxLength={80}
            placeholder="比如：巷子里的那家拉面"
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base font-semibold outline-none transition placeholder:font-normal placeholder:text-muted/55 focus:border-coral focus:ring-4 focus:ring-coral/10"
          />
        </section>

        {/* 正文 */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <FieldLabel className="mb-0">正文 · 支持 Markdown</FieldLabel>
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                preview ? 'bg-ink text-white' : 'bg-cream text-muted hover:text-ink'
              }`}
            >
              {preview ? <Pencil size={13} /> : <Eye size={13} />}
              {preview ? '继续写' : '预览'}
            </button>
          </div>

          {preview ? (
            <div className="min-h-[190px] rounded-2xl border border-line bg-cream/60 px-4 py-3.5">
              {draft.content.trim() ? (
                <Markdown source={draft.content} />
              ) : (
                <p className="text-base text-muted/70">还没有内容</p>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-white transition focus-within:border-coral focus-within:ring-4 focus-within:ring-coral/10">
              <div className="flex flex-wrap items-center gap-0.5 border-b border-line/70 bg-cream/50 px-2 py-1.5">
                <ToolButton label="加粗" onClick={() => wrapSelection('**', '**', '加粗文字')}>
                  <Bold size={16} />
                </ToolButton>
                <ToolButton label="斜体" onClick={() => wrapSelection('*', '*', '斜体文字')}>
                  <Italic size={16} />
                </ToolButton>
                <ToolButton label="小标题" onClick={() => prefixLine('## ')}>
                  <Heading2 size={16} />
                </ToolButton>
                <ToolButton label="列表" onClick={() => prefixLine('- ')}>
                  <ListIcon size={16} />
                </ToolButton>
                <ToolButton label="引用" onClick={() => prefixLine('> ')}>
                  <Quote size={16} />
                </ToolButton>
                <ToolButton
                  label="链接"
                  onClick={() => wrapSelection('[', '](https://)', '链接文字')}
                >
                  <Link2 size={16} />
                </ToolButton>
              </div>
              <textarea
                ref={textareaRef}
                value={draft.content}
                onChange={(event) => patch({ content: event.target.value })}
                rows={8}
                maxLength={30000}
                placeholder={'今天吃了什么？\n\n**好吃指数**：★★★★★\n- 汤头浓郁\n- 面条弹牙'}
                className="w-full resize-y bg-transparent px-4 py-3.5 text-base leading-relaxed outline-none placeholder:text-muted/50"
              />
            </div>
          )}
          <p className="mt-1.5 text-right text-xs text-muted/70">{draft.content.length} / 30000</p>
        </section>

        {/* 图片 */}
        <section>
          <FieldLabel>照片（最多 {MAX_IMAGES_PER_ENTRY} 张，自动压缩）</FieldLabel>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {draft.images.map((image) => (
              <div
                key={image.key}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-line bg-cream"
              >
                <img src={imageUrl(image.key)} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(image.key)}
                  aria-label="移除这张图片"
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur transition hover:bg-[#b4453a]"
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {Array.from({ length: uploading }).map((_, index) => (
              <div
                key={`uploading-${index}`}
                className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-line bg-cream"
              >
                <Loader2 size={20} className="animate-spin text-coral" />
              </div>
            ))}

            {draft.images.length + uploading < MAX_IMAGES_PER_ENTRY && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line bg-cream/60 text-muted transition hover:border-peach hover:text-coral-deep"
              >
                <ImagePlus size={22} />
                <span className="text-xs font-bold">添加照片</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
        </section>

        {/* 标签 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel className="mb-0">标签（可多选，可不选）</FieldLabel>
            <button
              type="button"
              onClick={onManageTags}
              className="text-xs font-bold text-muted transition hover:text-coral-deep"
            >
              维护标签
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagPill
                key={tag.id}
                tag={tag}
                selected={draft.tags.includes(tag.id)}
                onClick={() => toggleTag(tag.id)}
                className="px-3 py-1.5 text-[13px]"
              />
            ))}
            {!tags.length && (
              <p className="text-sm text-muted">还没有标签，点右上角「维护标签」加一个吧</p>
            )}
          </div>
        </section>

        {/* 地点 */}
        <section>
          <FieldLabel>
            地点 · 在地图上选个点
            <span className="ml-1 font-normal text-muted/70">（选填）</span>
          </FieldLabel>
          <LocationPicker
            value={{ lat: location.lat, lng: location.lng }}
            onChange={(coords) => patchLocation(coords)}
            onPick={(place) =>
              patchLocation({
                lat: place.lat,
                lng: place.lng,
                name: place.name || location.name,
                address: place.address || location.address,
              })
            }
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              value={location.name}
              onChange={(event) => patchLocation({ name: event.target.value })}
              maxLength={60}
              placeholder="地点名称，比如：一兰拉面"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none transition placeholder:text-muted/55 focus:border-coral focus:ring-4 focus:ring-coral/10"
            />
            <input
              value={location.address}
              onChange={(event) => patchLocation({ address: event.target.value })}
              maxLength={160}
              placeholder="详细地址，比如：南京东路 100 号"
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none transition placeholder:text-muted/55 focus:border-coral focus:ring-4 focus:ring-coral/10"
            />
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            <MapPin size={12} className="text-coral" />
            点地图放一个标记，名称和地址可以留空；地图页会显示所有标记点。
          </p>
        </section>

        {error && (
          <p className="rounded-2xl bg-rose/30 px-4 py-3 text-sm font-semibold text-[#a53f35]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

function FieldLabel({ children, className = '' }) {
  return (
    <div className={`mb-2 flex items-center gap-1 text-sm font-black text-ink/80 ${className}`}>
      {children}
    </div>
  )
}

function ToolButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-coral-deep"
    >
      {children}
    </button>
  )
}
