const pad = (n) => String(n).padStart(2, '0')

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const WEEKDAY_INITIALS = ['一', '二', '三', '四', '五', '六', '日']

export function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayStr() {
  return toDateStr(new Date())
}

export function parseDate(str) {
  const [year, month, day] = String(str).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function isValidDateStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return false
  const [year, month, day] = str.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** 2026-10-27 -> #26-10-27 */
export function hashOf(dateStr) {
  return `#${dateStr.slice(2)}`
}

/** #26-10-27 -> 2026-10-27 */
export function dateFromHash(hash) {
  const match = /^#?(\d{2})-(\d{2})-(\d{2})$/.exec(String(hash || ''))
  if (!match) return null
  const full = `20${match[1]}-${match[2]}-${match[3]}`
  return isValidDateStr(full) ? full : null
}

export function dateParts(dateStr) {
  const date = parseDate(dateStr)
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday: WEEKDAYS[date.getDay()],
    short: `${date.getMonth() + 1}月${date.getDate()}日`,
    long: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
  }
}

export function weekdayShort(dateStr) {
  return WEEKDAYS[parseDate(dateStr).getDay()]
}

/** 以周一为一周开始的月历网格（42 格） */
export function buildMonthCells(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      date: toDateStr(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    })
  }
  return cells
}

export function addMonths(year, month, delta) {
  const date = new Date(year, month + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function monthOf(dateStr) {
  const date = parseDate(dateStr)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function compareMonth(a, b) {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

export function relativeDay(dateStr) {
  const today = todayStr()
  if (dateStr === today) return '今天'
  const diff = Math.round((parseDate(today) - parseDate(dateStr)) / 86400000)
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (diff === -1) return '明天'
  return ''
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
