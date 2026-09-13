import { useState, useRef, useEffect } from 'react'
import {
  Users, Search, Loader2, Ban, ClipboardCopy, CheckCircle2, AlertTriangle,
  ListChecks, ShieldCheck, FileText, ScrollText, RefreshCw, Download,
} from 'lucide-react'
import apiClient from '../api/axiosConfig'
import { DASHBOARD_LIST } from '../data/dashboards'

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

// Tách mã BM từ tên "…/BM20" → "BM20" (fallback: chính tên)
const parseCode = (name) => {
  const idx = String(name).lastIndexOf('/')
  return idx !== -1 ? String(name).slice(idx + 1).trim() : String(name)
}

// Chỉ 2 vai trò trên phân quyền biểu mẫu: perm 1 = Người nhập, perm 2 = Quản trị viên
const PERM_ADMIN = 2
const PERM_ENTRY = 1

const parseEmails = (text) =>
  [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]

/**
 * Quét toàn bộ phân quyền của các biểu mẫu trong DASHBOARD_LIST:
 * GET /services/ioc-metadata/api/assignments/{surveyId}/assignments
 * → mỗi dòng: { assignee (email), assigneeId, surveyId, perm (1|2), permType (0=tk, 1=đơn vị) }
 * Chỉ xét phân quyền trực tiếp cho tài khoản (permType = 0); phân quyền theo
 * đơn vị không gắn với email nào nên bỏ qua. Trùng biểu mẫu tự động gộp lại.
 */
async function fetchFormAssignments(onProgress) {
  let done = 0
  const settled = await Promise.allSettled(
    DASHBOARD_LIST.map(async (d) => {
      try {
        const res = await apiClient.get(
          `/services/ioc-metadata/api/assignments/${d.id}/assignments`
        )
        const rows = Array.isArray(res.data) ? res.data : (res.data?.content ?? [])
        return { dashboard: d, rows }
      } finally {
        done += 1
        onProgress?.(done)
      }
    })
  )
  const ok = []
  const failed = []
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status === 'fulfilled') ok.push(s.value)
    else failed.push(DASHBOARD_LIST[i])
  }
  return { ok, failed }
}

// email (đã chuẩn hóa) → Map<mã biểu mẫu, perm cao nhất> + metadata
function buildEmailIndex(formResults) {
  const index = new Map()
  let orgRows = 0
  for (const { dashboard, rows } of formResults) {
    for (const r of rows) {
      if (Number(r?.permType) !== 0) { orgRows += 1; continue }
      const key = norm(r.assignee)
      if (!key || !key.includes('@')) continue
      const perm = Number(r.perm)
      if (perm !== PERM_ADMIN && perm !== PERM_ENTRY) continue
      let entry = index.get(key)
      if (!entry) {
        entry = { email: String(r.assignee).trim(), assigneeId: r.assigneeId, forms: new Map() }
        index.set(key, entry)
      }
      // 1 tk có thể xuất hiện nhiều lần: trùng biểu mẫu thì giữ quyền cao hơn
      const prev = entry.forms.get(dashboard.id)
      entry.forms.set(dashboard.id, prev ? Math.max(prev, perm) : perm)
    }
  }
  return { index, orgRows }
}

function classify(formsMap) {
  const perms = [...formsMap.values()]
  const admin = perms.includes(PERM_ADMIN)
  const entry = perms.includes(PERM_ENTRY)
  if (admin && entry) return 'both'
  if (admin) return 'admin'
  if (entry) return 'entry'
  return 'none'
}

/* ══════════════ Tải toàn bộ tài khoản user (phân trang) ══════════════
   POST /services/uaa/api/search/userInfoModel { q:'', resource:'table_user' }
   + query ?page=N&size=M (server giới hạn 2000 dòng/trang) → quét tới khi
   gặp trang ngắn. Trả về map theo email (đã chuẩn hóa) và theo resourceId. */
const USER_PAGE_SIZE = 2000
const MAX_USER_PAGES = 30

async function fetchAllUsers(onProgress) {
  const all = []
  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const res = await apiClient.post(
      '/services/uaa/api/search/userInfoModel',
      { q: '', resource: 'table_user' },
      { params: { page, size: USER_PAGE_SIZE } }
    )
    const rows = Array.isArray(res.data) ? res.data : (res.data?.content ?? [])
    all.push(...rows)
    onProgress?.(all.length, page + 1)
    if (rows.length < USER_PAGE_SIZE) break
  }
  const byEmail = new Map()
  const byId = new Map()
  for (const u of all) {
    const id = u?.resourceId ?? u?.id
    if (id != null && !byId.has(String(id))) byId.set(String(id), u)
    const key = norm(u?.email)
    if (key && !byEmail.has(key)) byEmail.set(key, u)
  }
  return { users: all, byEmail, byId }
}

/* ══════════════ Xuất CSV (mở tốt bằng Excel tiếng Việt) ══════════════ */
const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const buildCsv = (rows) =>
  '\uFEFF' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n')

function triggerDownload(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

const timeStamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/* Chạy song song có kiểm soát (pool) — dùng để tra cứu thông tin từng tài khoản */
async function mapPool(items, size, fn, onProgress) {
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      try { await fn(items[i], i) } catch { /* bỏ qua lỗi từng dòng */ }
      done += 1
      onProgress?.(done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
}

const STATE_META = {
  both: { label: 'Quản trị + Nhập liệu', cls: 'bg-gov-navy text-white' },
  admin: { label: 'Quản trị', cls: 'bg-green-100 text-green-800' },
  entry: { label: 'Nhập liệu', cls: 'bg-amber-100 text-amber-800' },
  none: { label: 'Không có phân quyền', cls: 'bg-gray-200 text-gray-600' },
}

/* ══════════════ KPI card ══════════════ */
function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="flex items-center gap-4 border border-gray-200 border-l-4 bg-white px-4 py-3 shadow-sm" style={{ borderLeftColor: accent }}>
      <div className="flex h-11 w-11 items-center justify-center" style={{ backgroundColor: accent + '14' }}>
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">{label}</p>
        <p className="text-xl leading-tight font-bold text-gov-navy">{value}</p>
        {sub && <p className="truncate text-xs text-gray-500" title={sub}>{sub}</p>}
      </div>
    </div>
  )
}

/* ══════════════ Màn hình chính ══════════════ */
export default function FormPermissionChecker() {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [scanInfo, setScanInfo] = useState(null) // { forms: n, orgRows, failed: [], time }
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  // Xuất 2 file toàn hệ thống: tk Quản trị + tk Nhập liệu
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [exportSummary, setExportSummary] = useState(null) // { adminCount, entryCount, bothCount, userTotal, failedForms, time }

  const runIdRef = useRef(0)

  const emailList = parseEmails(text)

  async function runCheck() {
    const list = parseEmails(text)
    if (!list.length || running) return

    const runId = ++runIdRef.current
    setRunning(true)
    setError(null)
    setResults([])
    setScanInfo(null)
    setProgress(0)

    try {
      const { ok, failed } = await fetchFormAssignments((d) => {
        if (runIdRef.current === runId) setProgress(d)
      })

      if (runIdRef.current !== runId) return

      if (!ok.length) {
        setError('Không tải được danh sách phân quyền của bất kỳ biểu mẫu nào. Vui lòng thử lại.')
        setRunning(false)
        return
      }

      const { index, orgRows } = buildEmailIndex(ok)
      const rows = list.map((email) => {
        const hit = index.get(norm(email))
        if (!hit) return { email, state: 'none', forms: [] }
        const forms = DASHBOARD_LIST
          .filter((d) => hit.forms.has(d.id))
          .map((d) => ({ name: d.name, code: parseCode(d.name), perm: hit.forms.get(d.id) }))
        return { email, state: classify(hit.forms), forms }
      })

      setResults(rows)
      setScanInfo({
        forms: ok.length,
        orgRows,
        failed,
        time: new Date(),
      })
    } catch (e) {
      setError(e?.response ? `Lỗi HTTP ${e.response.status}` : (e.message ?? 'Lỗi không xác định'))
    } finally {
      if (runIdRef.current === runId) setRunning(false)
    }
  }

  /* ── Xuất toàn bộ phân quyền ra 2 file CSV (Quản trị / Nhập liệu) ──
     1. Tải toàn bộ tài khoản user (phân trang)
     2. Quét phân quyền 8 biểu mẫu
     3. Đối chiếu theo email/resourceId → mỗi tk đếm 1 lần cho mỗi vai trò
     4. Tải 2 file: danh sách tk Quản trị + danh sách tk Nhập liệu */
  async function runExport() {
    if (running || exporting) return
    const runId = ++runIdRef.current
    setExporting(true)
    setError(null)
    setExportSummary(null)

    try {
      setExportMsg('Đang tải danh sách toàn bộ tài khoản…')
      const { users, byEmail, byId } = await fetchAllUsers((n, p) => {
        if (runIdRef.current === runId)
          setExportMsg(`Đang tải danh sách toàn bộ tài khoản… ${n} tk (trang ${p})`)
      })
      if (runIdRef.current !== runId) return

      setExportMsg('Đang quét phân quyền 8 biểu mẫu…')
      const { ok, failed } = await fetchFormAssignments((done) => {
        if (runIdRef.current === runId)
          setExportMsg(`Đang quét phân quyền biểu mẫu… ${done}/${DASHBOARD_LIST.length}`)
      })
      if (runIdRef.current !== runId) return

      if (!ok.length) {
        setError('Không tải được phân quyền của bất kỳ biểu mẫu nào. Vui lòng thử lại.')
        return
      }

      const { index } = buildEmailIndex(ok)

      // Bỏ qua tài khoản thử nghiệm (email có tiền tố "test_", vd test_candv.hcm@…)
      const isTestAccount = (email) => norm(email).startsWith('test_')
      const allHolders = [...index.values()]
      const testCount = allHolders.filter((h) => isTestAccount(h.email)).length

      // Lấy thông tin user (họ tên, đơn vị, SĐT) từ danh sách đã tải hàng loạt
      const holders = allHolders
        .filter((h) => !isTestAccount(h.email))
        .map((h) => ({
          ...h,
          user: byEmail.get(norm(h.email)) ?? byId.get(String(h.assigneeId)) ?? null,
        }))

      // Danh sách phân trang bị giới hạn ~10.000 dòng → với tk chưa có thông tin,
      // tra cứu trực tiếp theo email (chạy song song theo lô)
      const missing = holders.filter((h) => !h.user)
      if (missing.length) {
        await mapPool(missing, 6, async (h) => {
          const res = await apiClient.post(
            '/services/uaa/api/search/userInfoModel',
            { q: h.email, resource: 'table_user' }
          )
          const rows = Array.isArray(res.data) ? res.data : []
          h.user = rows.find((r) => norm(r?.email) === norm(h.email)) ?? rows[0] ?? null
        }, (done) => {
          if (runIdRef.current === runId)
            setExportMsg(`Đang tra cứu thông tin tài khoản… ${done}/${missing.length}`)
        })
        if (runIdRef.current !== runId) return
      }
      const matchedInfo = holders.filter((h) => h.user).length
      const byUnit = (a, b) =>
        String(a.user?.orgName ?? 'zzz').localeCompare(String(b.user?.orgName ?? 'zzz'), 'vi') ||
        a.email.localeCompare(b.email)

      const holdersWith = (perm) => holders.filter((h) => [...h.forms.values()].includes(perm))

      const header = ['STT', 'Email', 'Họ và tên', 'Đơn vị', 'SĐT', 'Trạng thái', 'Số biểu mẫu', 'Chi tiết biểu mẫu']
      const mkRow = (h, perm, i) => {
        const forms = DASHBOARD_LIST
          .filter((d) => h.forms.get(d.id) === perm)
          .map((d) => `${parseCode(d.name)}:${perm === PERM_ADMIN ? 'Quản trị' : 'Nhập liệu'}`)
        const st = h.user
          ? (String(h.user.status) === '0' ? 'Hoạt động' : `Khóa (status=${h.user.status})`)
          : 'Không tìm thấy tk'
        return [
          i + 1, h.email, h.user?.personalName ?? '', h.user?.orgName ?? '',
          h.user?.phone ?? '', st, forms.length, forms.join(' | '),
        ]
      }

      const adminHolders = holdersWith(PERM_ADMIN).sort(byUnit)
      const entryHolders = holdersWith(PERM_ENTRY).sort(byUnit)
      const bothCount = holders.filter((h) => {
        const p = [...h.forms.values()]
        return p.includes(PERM_ADMIN) && p.includes(PERM_ENTRY)
      }).length

      const stamp = timeStamp()
      const adminFile = `TK_Quan_tri_BM_${stamp}.csv`
      const entryFile = `TK_Nhap_lieu_BM_${stamp}.csv`
      triggerDownload(adminFile, buildCsv([header, ...adminHolders.map((h, i) => mkRow(h, PERM_ADMIN, i))]))
      // Giãn 2 lần tải để trình duyệt/Electron không chặn download thứ 2
      await new Promise((r) => setTimeout(r, 500))
      if (runIdRef.current !== runId) return
      triggerDownload(entryFile, buildCsv([header, ...entryHolders.map((h, i) => mkRow(h, PERM_ENTRY, i))]))

      setExportSummary({
        adminCount: adminHolders.length,
        entryCount: entryHolders.length,
        bothCount,
        holderTotal: holders.length,
        testCount,
        matchedInfo,
        userTotal: users.length,
        failedForms: failed.length,
        time: new Date(),
        adminFile,
        entryFile,
      })
    } catch (e) {
      setError(e?.response ? `Lỗi HTTP ${e.response.status}` : (e.message ?? 'Lỗi không xác định'))
    } finally {
      if (runIdRef.current === runId) {
        setExporting(false)
        setExportMsg('')
      }
    }
  }

  /* ── Thống kê: 1 tk đếm 1 lần cho mỗi vai trò (trùng biểu mẫu bỏ qua) ── */
  const adminCount = results.filter((r) => r.state === 'admin' || r.state === 'both').length
  const entryCount = results.filter((r) => r.state === 'entry' || r.state === 'both').length
  const bothCount = results.filter((r) => r.state === 'both').length
  const noneCount = results.filter((r) => r.state === 'none').length

  const copyResults = () => {
    const lines = results.map((r) => {
      const detail = r.forms.map((f) => `${f.code}:${f.perm === PERM_ADMIN ? 'Quản trị' : 'Nhập liệu'}`).join('; ')
      return `${r.email}\t${STATE_META[r.state].label}${detail ? `\t${r.forms.length} BM\t${detail}` : '\t0 BM\t—'}`
    })
    const summary = [
      `TỔNG CỘNG: ${results.length} tài khoản`,
      `Vai trò Quản trị: ${adminCount} tk`,
      `Vai trò Nhập liệu: ${entryCount} tk`,
      `Cả 2 vai trò: ${bothCount} tk`,
      `Không có phân quyền: ${noneCount} tk`,
      '',
    ]
    navigator.clipboard?.writeText([...summary, ...lines].join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const roleBadge = (state) => {
    const meta = STATE_META[state]
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold ${meta.cls}`}>
        {state === 'admin' || state === 'both' ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
        {state === 'entry' ? <FileText className="h-3.5 w-3.5" /> : null}
        {state === 'none' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
        {meta.label}
      </span>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gov-bg">
      {/* ══ Banner ══ */}
      <header className="shrink-0 bg-gov-navy-deep px-6 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gov-gold/70 bg-gov-navy">
            <ListChecks className="h-7 w-7 text-gov-gold" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-wide uppercase">
              Kiểm tra phân quyền biểu mẫu
            </h1>
            <p className="mt-0.5 truncate text-xs tracking-wider text-white/60 uppercase">
              Xác định vai trò Quản trị / Nhập liệu của từng tài khoản trên {DASHBOARD_LIST.length} biểu mẫu
            </p>
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-2 border border-gov-gold/40 bg-gov-gold/10 px-3 py-1.5 md:flex">
            <ShieldCheck className="h-4 w-4 text-gov-gold" />
            <span className="text-[10px] font-bold tracking-wider text-gov-gold uppercase">
              Chỉ đọc — không thay đổi quyền
            </span>
          </div>
        </div>
      </header>

      <div className="relative h-1 shrink-0 bg-gov-gold" />

      {/* ══ Nội dung ══ */}
      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          {/* Nhập danh sách tài khoản */}
          <section className="border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
              <Users className="h-4 w-4 text-gov-navy" />
              <h2 className="text-xs font-bold tracking-wider text-gov-navy uppercase">
                Nhập danh sách tài khoản cần kiểm tra
              </h2>
              <span className="ml-auto hidden text-[10px] tracking-wider text-gray-400 uppercase sm:inline">
                Cách nhau bởi dấu cách, dấu phẩy hoặc mỗi tài khoản một dòng
              </span>
            </div>
            <div className="px-4 py-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  runCheck()
                }}
                className="flex flex-col gap-3 lg:flex-row"
              >
                <textarea
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={running || exporting}
                  placeholder={'aaa@moj.gov.vn\nbbb@moj.gov.vn\nccc@moj.gov.vn'}
                  className="min-h-[110px] flex-1 resize-y border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm text-gov-slate placeholder:text-gray-400 focus:border-gov-navy focus:outline-none disabled:bg-gray-100"
                />
                <div className="flex shrink-0 flex-col gap-2 lg:w-44">
                  <button
                    type="submit"
                    disabled={running || exporting || !text.trim()}
                    className="flex items-center justify-center gap-2 border border-gov-navy bg-gov-navy px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Kiểm tra
                  </button>
                  {running && (
                    <p className="text-center text-[11px] font-semibold text-gov-navy">
                      Đang quét… {progress}/{DASHBOARD_LIST.length} biểu mẫu
                    </p>
                  )}
                  {!running && emailList.length > 0 && (
                    <p className="text-center text-[11px] text-gray-500">
                      {emailList.length} tài khoản (đã lọc trùng)
                    </p>
                  )}
                </div>
              </form>
              <p className="mt-3 border-l-2 border-gov-gold bg-gov-gold/5 px-3 py-2 text-xs leading-relaxed text-gov-slate">
                <strong className="text-gov-navy">Cách tính:</strong> hệ thống quét toàn bộ phân quyền của{' '}
                <strong>{DASHBOARD_LIST.length} biểu mẫu</strong> trong danh mục, đối chiếu với từng tài khoản.
                Một tk được phân nhiều biểu mẫu thì <strong>biểu mẫu trùng tự bỏ qua</strong> — mỗi tk chỉ đếm
                1 lần cho mỗi vai trò: <strong>Quản trị</strong> (Perm: 2) và <strong>Nhập liệu</strong> (Perm: 1).
                Phân quyền gán cho cả <strong>đơn vị</strong> (không gắn email) không được tính cho tk.
              </p>
            </div>
          </section>

          {/* Xuất toàn bộ phân quyền ra 2 file */}
          <section className="border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
              <Download className="h-4 w-4 text-gov-navy" />
              <h2 className="text-xs font-bold tracking-wider text-gov-navy uppercase">
                Xuất danh sách phân quyền toàn hệ thống
              </h2>
              <span className="ml-auto hidden text-[10px] tracking-wider text-gray-400 uppercase sm:inline">
                Không cần nhập danh sách — tự quét tất cả tài khoản
              </span>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center">
              <button
                type="button"
                onClick={runExport}
                disabled={running || exporting}
                className="flex shrink-0 items-center justify-center gap-2 border border-gov-navy bg-gov-navy px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Xuất 2 file (Quản trị / Nhập liệu)
              </button>
              <div className="min-w-0 text-xs leading-relaxed text-gov-slate">
                {exporting ? (
                  <p className="font-semibold text-gov-navy">{exportMsg}</p>
                ) : (
                  <p>
                    Tự động tải <strong>toàn bộ tài khoản</strong> của hệ thống, quét phân quyền{' '}
                    <strong>{DASHBOARD_LIST.length} biểu mẫu</strong> rồi xuất ra <strong>2 file CSV</strong>:
                    danh sách tài khoản vai trò <strong>Quản trị</strong> và danh sách tài khoản vai trò{' '}
                    <strong>Nhập liệu</strong> (kèm họ tên, đơn vị, SĐT, chi tiết từng biểu mẫu).
                    Tài khoản email có tiền tố <code className="font-mono">test_</code> tự động bỏ qua.
                  </p>
                )}
              </div>
            </div>

            {exportSummary && (
              <div className="border-t border-gray-200 bg-gov-gold/5 px-4 py-3">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gov-slate">
                  <span className="flex items-center gap-1.5 font-bold text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Đã xuất lúc {exportSummary.time.toLocaleTimeString('vi-VN')}
                  </span>
                  <span>Phân quyền: <strong>{exportSummary.holderTotal}</strong> tk (có thông tin: {exportSummary.matchedInfo}/{exportSummary.holderTotal})</span>
                  {exportSummary.testCount > 0 && (
                    <span>Bỏ qua <strong>{exportSummary.testCount}</strong> tk test_</span>
                  )}
                  <span className="font-semibold text-green-800">Quản trị: <strong>{exportSummary.adminCount}</strong> tk</span>
                  <span className="font-semibold text-amber-800">Nhập liệu: <strong>{exportSummary.entryCount}</strong> tk</span>
                  <span>Cả 2 vai trò: <strong>{exportSummary.bothCount}</strong> tk</span>
                  {exportSummary.failedForms > 0 && (
                    <span className="font-semibold text-red-700">
                      ⚠ {exportSummary.failedForms} biểu mẫu lỗi khi quét
                    </span>
                  )}
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-gray-500">
                  File 1: {exportSummary.adminFile} · File 2: {exportSummary.entryFile}
                </p>
              </div>
            )}
          </section>

          {/* Lỗi toàn cục */}
          {error && (
            <div className="flex items-center gap-2 border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {/* Tiến độ quét */}
          {running && (
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden bg-gray-200">
                <div
                  className="h-full bg-gov-gold transition-all duration-300"
                  style={{ width: `${Math.round((progress / DASHBOARD_LIST.length) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-bold text-gov-navy">
                {progress}/{DASHBOARD_LIST.length}
              </span>
            </div>
          )}

          {/* KPI tổng hợp */}
          {results.length > 0 && (
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi icon={Users} label="Tổng tài khoản" value={results.length} sub="đã kiểm tra" accent="#1e3a8a" />
              <Kpi icon={ShieldCheck} label="Vai trò Quản trị" value={adminCount} sub="tk có ít nhất 1 BM vai trò Quản trị" accent="#15803d" />
              <Kpi icon={FileText} label="Vai trò Nhập liệu" value={entryCount} sub="tk có ít nhất 1 BM vai trò Nhập liệu" accent="#b45309" />
              <Kpi icon={ListChecks} label="Cả 2 vai trò" value={bothCount} sub="vừa Quản trị vừa Nhập liệu" accent="#0f766e" />
              <Kpi icon={AlertTriangle} label="Không có phân quyền" value={noneCount} sub="không có trong 8 biểu mẫu" accent="#b91c1c" />
            </section>
          )}

          {/* Thông tin lần quét */}
          {scanInfo && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <RefreshCw className="h-3.5 w-3.5" />
              Đã quét {scanInfo.forms}/{DASHBOARD_LIST.length} biểu mẫu lúc{' '}
              {scanInfo.time.toLocaleTimeString('vi-VN')}
              {scanInfo.orgRows > 0 && <> · bỏ qua {scanInfo.orgRows} dòng phân quyền theo đơn vị</>}
              {scanInfo.failed.length > 0 && (
                <span className="font-semibold text-red-700">
                  · Lỗi {scanInfo.failed.length} biểu mẫu: {scanInfo.failed.map((d) => parseCode(d.name)).join(', ')}
                </span>
              )}
            </p>
          )}

          {/* Bảng kết quả */}
          {results.length > 0 && (
            <section className="border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
                <ScrollText className="h-4 w-4 text-gov-navy" />
                <h2 className="text-xs font-bold tracking-wider text-gov-navy uppercase">
                  Kết quả kiểm tra
                </h2>
                <button
                  type="button"
                  onClick={copyResults}
                  className="ml-auto flex items-center gap-1.5 border border-gray-300 px-2.5 py-1 text-[10px] font-bold tracking-wider text-gov-slate uppercase hover:bg-gray-100"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Đã copy' : 'Copy kết quả'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-[10px] tracking-wider text-gray-500 uppercase">
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 font-semibold">Tài khoản</th>
                      <th className="px-4 py-2.5 font-semibold">Vai trò</th>
                      <th className="px-4 py-2.5 font-semibold">Số biểu mẫu</th>
                      <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Chi tiết theo biểu mẫu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((r, i) => (
                      <tr
                        key={r.email}
                        className={
                          r.state === 'both'
                            ? 'bg-gov-navy/5'
                            : r.state === 'admin'
                              ? 'bg-green-50/50'
                              : r.state === 'entry'
                                ? 'bg-amber-50/40'
                                : ''
                        }
                      >
                        <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                        <td className="max-w-[240px] truncate px-4 py-2.5 font-medium text-gov-slate" title={r.email}>
                          {r.email}
                        </td>
                        <td className="px-4 py-2.5">{roleBadge(r.state)}</td>
                        <td className="px-4 py-2.5 font-mono text-sm font-bold text-gov-navy">
                          {r.forms.length}
                        </td>
                        <td className="hidden px-4 py-2.5 md:table-cell">
                          {r.forms.length ? (
                            <div className="flex flex-wrap gap-1">
                              {r.forms.map((f) => (
                                <span
                                  key={f.code}
                                  title={f.name}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold ${
                                    f.perm === PERM_ADMIN
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {f.code} · {f.perm === PERM_ADMIN ? 'Quản trị' : 'Nhập liệu'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
