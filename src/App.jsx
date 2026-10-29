import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { api } from './lib/api'
import { clearEditSession, loadEditSession, saveEditSession } from './lib/auth'
import { dateFromHash, dateParts, hashOf } from './lib/date'
import Header from './components/Header'
import Timeline from './components/Timeline'
import Album from './components/Album'
import EntryMap from './components/EntryMap'
import Sidebar from './components/Sidebar'
import Calendar from './components/Calendar'
import TagFilter from './components/TagFilter'
import Lightbox from './components/Lightbox'
import EntryEditor from './components/EntryEditor'
import AuthDialog from './components/AuthDialog'
import TagManager from './components/TagManager'
import { ConfirmDialog, Modal, Toast } from './components/ui'

const topOffset = () =>
  typeof window === 'undefined' ? 150 : Math.max(140, Math.min(window.innerHeight * 0.34, 280))

export default function App() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [loadError, setLoadError] = useState('')

  const [mode, setMode] = useState('timeline')
  const [activeTag, setActiveTag] = useState(null)
  const [activeDate, setActiveDate] = useState(null)

  const [addToken, setAddToken] = useState(null)
  const [editSession, setEditSession] = useState(() => loadEditSession())

  const [authState, setAuthState] = useState({ open: false, scope: 'add' })
  const [editorState, setEditorState] = useState({
    open: false,
    mode: 'create',
    entry: null,
    date: null,
  })
  const [lightbox, setLightbox] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)
  const [calendarModalOpen, setCalendarModalOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [showTop, setShowTop] = useState(false)
  const [pendingJump, setPendingJump] = useState(null)

  const pendingAction = useRef(null)
  const suppressHash = useRef(false)
  const releaseTimer = useRef(0)
  const toastTimer = useRef(null)

  const editToken = editSession?.token || null

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const load = useCallback(async () => {
    setStatus('loading')
    setLoadError('')
    try {
      const result = await api.list()
      setData(result)
      setStatus('ready')
    } catch (error) {
      setLoadError(error.message || '加载失败')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const entries = data?.entries || []
  const tags = data?.tags || []
  const tagMap = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const filteredEntries = useMemo(
    () => (activeTag ? entries.filter((entry) => entry.tags?.includes(activeTag)) : entries),
    [entries, activeTag],
  )

  /* ---------------- 滚动 → URL hash ---------------- */
  const setHash = useCallback((date) => {
    const next = `#${hashOf(date).slice(1)}`
    if (window.location.hash === next) return
    window.history.replaceState(null, '', next)
  }, [])

  /** 跳到某一天：无论在相册、地图还是时间轴，都会切回时间轴再定位 */
  const jumpTo = useCallback((date) => {
    setPendingJump({ date, nonce: Date.now() })
    setMode('timeline')
  }, [])

  useEffect(() => {
    if (!pendingJump || mode !== 'timeline' || status !== 'ready') return undefined

    const timer = window.setTimeout(() => {
      const element = document.querySelector(`[data-entry="${pendingJump.date}"]`)
      if (!element) {
        setPendingJump(null)
        return
      }
      setActiveDate(pendingJump.date)
      setHash(pendingJump.date)
      suppressHash.current = true
      window.clearTimeout(releaseTimer.current)
      releaseTimer.current = window.setTimeout(() => {
        suppressHash.current = false
      }, 320)
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingJump(null)
    }, 80)

    return () => window.clearTimeout(timer)
  }, [pendingJump, mode, status, setHash])

  useEffect(() => {
    if (status !== 'ready' || mode !== 'timeline') return undefined

    let timer = 0
    const update = () => {
      window.clearTimeout(timer)
      timer = 0
      if (suppressHash.current) return
      const cards = document.querySelectorAll('[data-entry]')
      if (!cards.length) return
      // 默认取最上面一篇（日期最新），再沿 DOM 顺序找最后一个越过阈值的那篇
      const limit = topOffset()
      let current = cards[0].dataset.entry
      for (const card of cards) {
        if (card.getBoundingClientRect().top <= limit) current = card.dataset.entry
        else break
      }
      if (current) {
        // 划到最底部时，让最后一天的日期成为当前值
        const scrolledToBottom =
          window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
        if (scrolledToBottom) current = cards[cards.length - 1].dataset.entry
        setActiveDate(current)
        setHash(current)
      }
    }
    // 用 setTimeout 而不是 rAF：后台标签页或某些环境下 rAF 会被节流到几乎不触发
    const onScroll = () => {
      setShowTop(window.scrollY > 700)
      if (suppressHash.current) {
        // 平滑滚动还在继续：把释放时间往后推，停下来之后再放开跟随
        window.clearTimeout(releaseTimer.current)
        releaseTimer.current = window.setTimeout(() => {
          suppressHash.current = false
          update()
        }, 190)
        return
      }
      if (timer) return
      timer = window.setTimeout(update, 90)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    const initial = window.setTimeout(update, 320)
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(initial)
      window.clearTimeout(timer)
      window.clearTimeout(releaseTimer.current)
    }
  }, [status, mode, filteredEntries.length, setHash])

  /* 首次进入：按 hash 定位 */
  useEffect(() => {
    if (status !== 'ready' || !entries.length) return
    const hashDate = dateFromHash(window.location.hash)
    if (!hashDate) return
    if (!entries.some((entry) => entry.date === hashDate)) return
    setPendingJump({ date: hashDate, nonce: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    const onHashChange = () => {
      const hashDate = dateFromHash(window.location.hash)
      if (!hashDate) return
      setPendingJump({ date: hashDate, nonce: Date.now() })
      setMode('timeline')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  /* ---------------- 鉴权 ---------------- */
  const ensureScope = useCallback(
    (scope, action) => {
      const token = scope === 'add' ? addToken : editToken
      if (token) {
        action(token)
        return
      }
      pendingAction.current = action
      setAuthState({ open: true, scope })
    },
    [addToken, editToken],
  )

  const handleVerify = async (secret) => {
    const scope = authState.scope
    const result = await api.auth(scope, secret)
    if (scope === 'add') {
      setAddToken(result.token)
    } else {
      const session = { token: result.token, expiresAt: result.expiresAt }
      setEditSession(session)
      saveEditSession(session)
    }
    setAuthState({ open: false, scope })
    notify(scope === 'add' ? 'PIN 验证通过，可以添加记录啦' : '密码验证通过')

    const action = pendingAction.current
    pendingAction.current = null
    if (action) window.setTimeout(() => action(result.token), 60)
  }

  const requestEditAuth = useCallback(
    (action) => {
      setEditSession(null)
      clearEditSession()
      ensureScope('edit', action)
    },
    [ensureScope],
  )

  /* ---------------- 动作 ---------------- */
  const openCreate = () =>
    ensureScope('add', () =>
      setEditorState({ open: true, mode: 'create', entry: null, date: new Date() }),
    )

  const openEdit = (entry) =>
    ensureScope('edit', () => setEditorState({ open: true, mode: 'edit', entry, date: null }))

  const requestDelete = (entry) => ensureScope('edit', () => setDeleteTarget(entry))

  const handleSaved = (entry, isEdit) => {
    setEditorState({ open: false, mode: 'create', entry: null, date: null })
    setData((current) => {
      if (!current) return current
      const rest = current.entries.filter((item) => item.id !== entry.id)
      const nextEntries = [...rest, entry].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1
        return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1
      })
      return { ...current, entries: nextEntries }
    })
    notify(isEdit ? '修改好啦' : '记录已发布')
    setActiveTag(null)
    jumpTo(entry.date)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await api.deleteEntry(deleteTarget.id, editToken)
      setData((current) =>
        current
          ? {
              ...current,
              entries: current.entries.filter((item) => item.id !== deleteTarget.id),
            }
          : current,
      )
      setDeleteTarget(null)
      notify('已删除这条记录')
    } catch (error) {
      if (error.status === 401) {
        setDeleteTarget(null)
        notify('登录已过期，请重新验证密码', 'error')
        requestEditAuth(() => {})
      } else {
        notify(error.message || '删除失败', 'error')
      }
    } finally {
      setDeleting(false)
    }
  }

  const handleTagsSaved = (nextTags) => {
    setData((current) => {
      if (!current) return current
      const validIds = new Set(nextTags.map((tag) => tag.id))
      return {
        ...current,
        tags: nextTags,
        entries: current.entries.map((entry) => ({
          ...entry,
          tags: (entry.tags || []).filter((id) => validIds.has(id)),
        })),
      }
    })
    setTagManagerOpen(false)
    notify('标签已更新')
  }

  const openImage = (entry, index) => setLightbox({ entry, index })

  const navigateLightbox = (delta) => {
    setLightbox((current) => {
      if (!current) return current
      const total = current.entry.images.length
      const next = (current.index + delta + total) % total
      return { ...current, index: next }
    })
  }

  const jumpFromOverlay = (date) => {
    setLightbox(null)
    setCalendarModalOpen(false)
    jumpTo(date)
  }

  const headerMeta = data?.meta

  return (
    <div id="top" className="min-h-dvh">
      <Header
        mode={mode}
        onModeChange={(next) => {
          if (next === mode) return
          setMode(next)
          window.scrollTo({ top: 0, behavior: 'auto' })
        }}
        onAdd={openCreate}
        onOpenCalendar={() => setCalendarModalOpen(true)}
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        {status === 'loading' && <LoadingState />}

        {status === 'error' && (
          <div className="rounded-[28px] border border-line bg-paper p-10 text-center shadow-card">
            <CloudOff size={32} className="mx-auto text-coral" />
            <h2 className="mt-3 text-lg font-black">数据没加载出来</h2>
            <p className="mt-1.5 text-sm text-muted">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white"
            >
              <RefreshCw size={16} />
              重新加载
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <section className="mb-6 flex flex-col gap-4 sm:mb-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-[28px] font-black leading-tight tracking-tight sm:text-4xl">
                    我们的测评
                    <span className="text-coral">！</span>
                  </h1>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted sm:text-[15px]">
                    {entries.length
                      ? `从 ${dateParts(entries[entries.length - 1].date).long} 开始，已经记录了 ${
                          entries.length
                        } 篇、${headerMeta?.photoCount || 0} 张照片`
                      : '美食、景点、酒店……把每一次探店都留在这里'}
                  </p>
                </div>
                {entries.length > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-line bg-white/80 px-3.5 py-2 text-xs font-bold text-muted shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-[#7ec9a4]" />
                    共 {entries.length} 篇
                  </div>
                )}
              </div>

              {entries.length > 0 && mode === 'timeline' && (
                <TagFilter tags={tags} activeTag={activeTag} onChange={setActiveTag} />
              )}
            </section>

            <div className="flex items-start gap-6">
              <div className="min-w-0 flex-1">
                {mode === 'map' ? (
                  <EntryMap
                    entries={entries}
                    tagMap={tagMap}
                    onOpenEntry={(entry) => jumpTo(entry.date)}
                    onAdd={openCreate}
                  />
                ) : mode === 'album' ? (
                  <Album entries={entries} onOpen={openImage} onAdd={openCreate} />
                ) : !entries.length ? (
                  <Timeline
                    entries={[]}
                    tagMap={tagMap}
                    onEdit={openEdit}
                    onDelete={requestDelete}
                    onImageClick={openImage}
                    onAdd={openCreate}
                  />
                ) : filteredEntries.length ? (
                  <>
                    <Timeline
                      entries={filteredEntries}
                      tagMap={tagMap}
                      onEdit={openEdit}
                      onDelete={requestDelete}
                      onImageClick={openImage}
                      onAdd={openCreate}
                    />
                    {activeTag && (
                      <p className="mt-6 text-center text-sm text-muted">
                        正在看「#{tagMap.get(activeTag)?.name}」的 {filteredEntries.length} 条记录 ·{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTag(null)}
                          className="font-bold text-coral-deep hover:underline"
                        >
                          看全部
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  <EmptyTagState onReset={() => setActiveTag(null)} onAdd={openCreate} />
                )}
              </div>

              <Sidebar entries={entries} activeDate={activeDate} onJump={jumpTo} />
            </div>
          </>
        )}
      </main>

      <Footer
        onManageTags={() => {
          ensureScope('edit', () => setTagManagerOpen(true))
        }}
      />

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="回到顶部"
          className="fixed bottom-6 right-4 z-30 flex h-11 w-11 animate-pop items-center justify-center rounded-full border border-line bg-paper/90 text-ink shadow-soft backdrop-blur transition hover:text-coral-deep sm:right-6"
        >
          <ArrowUp size={18} />
        </button>
      )}

      {data && (
        <EntryEditor
          open={editorState.open}
          mode={editorState.mode}
          entry={editorState.entry}
          defaultDate={
            editorState.date instanceof Date
              ? `${editorState.date.getFullYear()}-${String(editorState.date.getMonth() + 1).padStart(
                  2,
                  '0',
                )}-${String(editorState.date.getDate()).padStart(2, '0')}`
              : editorState.date
          }
          tags={tags}
          token={editorState.mode === 'edit' ? editToken : addToken}
          onClose={() => setEditorState({ open: false, mode: 'create', entry: null, date: null })}
          onSaved={handleSaved}
          onRequestEditAuth={() => requestEditAuth(() => {})}
          onManageTags={() => {
            setEditorState({ open: false, mode: 'create', entry: null, date: null })
            ensureScope('edit', () => setTagManagerOpen(true))
          }}
        />
      )}

      <AuthDialog
        open={authState.open}
        scope={authState.scope}
        onClose={() => {
          pendingAction.current = null
          setAuthState({ open: false, scope: authState.scope })
        }}
        onVerify={handleVerify}
      />

      <TagManager
        open={tagManagerOpen}
        tags={tags}
        token={editToken}
        onClose={() => setTagManagerOpen(false)}
        onSaved={handleTagsSaved}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这条记录？"
        description={
          deleteTarget
            ? `${dateParts(deleteTarget.date).long} 的内容和 ${
                deleteTarget.images?.length || 0
              } 张照片都会被删除，无法恢复。`
            : ''
        }
        confirmText="删除"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
      />

      <Modal
        open={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        title="选个日子"
        subtitle="有记录的日子才可以跳转哦"
        maxWidth="max-w-sm"
      >
        <Calendar
          entries={entries}
          onJump={(date) => jumpFromOverlay(date)}
          className="border-none p-0 shadow-none"
        />
      </Modal>

      <Lightbox
        state={lightbox}
        tagMap={tagMap}
        onClose={() => setLightbox(null)}
        onNavigate={navigateLightbox}
        onJump={jumpFromOverlay}
      />

      <Toast toast={toast} />
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-muted">
      <Loader2 size={28} className="animate-spin text-coral" />
      <p className="mt-3 text-base font-bold">正在翻开小本本…</p>
    </div>
  )
}

function EmptyTagState({ onReset, onAdd }) {
  return (
    <div className="rounded-[28px] border border-dashed border-line bg-paper/70 px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-peach/60 text-2xl">
        🏷️
      </div>
      <h3 className="text-lg font-black">这个标签下还没有记录</h3>
      <p className="mt-2 text-[15px] text-muted">换个标签看看，或者现在就写一条。</p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-bold text-ink"
        >
          看全部
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full bg-coral px-5 py-2.5 text-sm font-bold text-white"
        >
          添加记录
        </button>
      </div>
    </div>
  )
}

function Footer({ onManageTags }) {
  return (
    <footer className="border-t border-line/70 bg-paper/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 text-center sm:px-6 lg:px-8">
        <p className="text-xl font-black tracking-tight">我们的测评！</p>
        <button
          type="button"
          onClick={onManageTags}
          className="rounded-full border border-line bg-white px-5 py-2.5 text-sm font-bold text-muted transition hover:border-peach hover:text-coral-deep"
        >
          维护标签
        </button>
      </div>
    </footer>
  )
}
