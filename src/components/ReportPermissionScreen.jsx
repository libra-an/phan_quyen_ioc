import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ShieldCheck, ShieldOff, BarChart3, Users, ScrollText,
  Copy, Trash2, CheckCircle2, XCircle, AlertTriangle, Search,
  Activity, ListChecks, Mail, ChevronRight, BadgeCheck, RefreshCw, Sparkles,
} from 'lucide-react'
import apiClient from '../api/axiosConfig'

/* ══════════════ Quyền trên biểu đồ báo cáo (ACL eanalysis) ══════════════ */
const ROLES = [
  { value: 'v', label: 'Người xem', perm: 'Perm: v' },
  { value: 'e', label: 'Người chỉnh sửa', perm: 'Perm: e' },
]

const INIT_LOGS = [
  { time: '09:00:00', type: 'info', msg: 'Sẵn sàng. Danh sách báo cáo được tải trực tiếp từ hệ thống.' },
]

const FILTER_BODY = { perm: ['o'], dateStart: null, dateEnd: null, textSearch: '' }
const PAGE_SIZE = 500 // hệ thống hiện ~66 báo cáo → 1 request là đủ, vẫn để vòng lặp dự phòng
const MAX_PAGES = 20
const AUTO_SYNC_MS = 60_000
const CACHE_KEY = 'ioc_report_list_cache_v1'

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const now = () => {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

// API trả về mảng thuần (không có totalElements/totalPages) nên phải quét
// từng trang tới khi gặp trang ngắn hơn PAGE_SIZE thì dừng
async function fetchAllReports() {
  const all = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await apiClient.post(
      '/services/eanalysis/api/dashboards/filter',
      FILTER_BODY,
      { params: { page, size: PAGE_SIZE, includePublic: false, sort: 'createdDate,desc' } }
    )
    const rows = Array.isArray(res.data) ? res.data : (res.data?.content ?? [])
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  // Chỉ giữ trường cần cho UI/cache để không phình localStorage
  return all.map((r) => ({
    id: r.id,
    name: r.name,
    createdBy: r.createdBy,
    createdDate: r.createdDate,
    lastModifiedDate: r.lastModifiedDate,
  }))
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY))
    if (Array.isArray(c?.items) && c.items.length) return c
  } catch { /* cache hỏng → bỏ qua, tải mới */ }
  return null
}

/* ══════════════ Hộp thoại xác nhận ══════════════ */
function ConfirmDialog({ open, title, lines, confirmLabel, confirmClass, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gov-navy-deep/60">
      <div className="w-[520px] max-w-[92vw] border border-gov-navy bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b-2 border-gov-gold bg-gov-navy px-5 py-3">
          <AlertTriangle className="h-5 w-5 text-gov-gold" />
          <h3 className="font-semibold tracking-wide text-white uppercase">{title}</h3>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm text-gov-slate">
          {lines.map((l, i) => (
            <p key={i} className="flex items-start gap-2">
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gov-navy" />
              <span>{l}</span>
            </p>
          ))}
          <p className="pt-2 text-xs text-gray-500">
            Mọi thao tác đều được ghi vào Nhật ký kiểm toán và không thể hoàn tác tự động.
          </p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            onClick={onCancel}
            className="border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gov-slate hover:bg-gray-100"
          >
            Hủy bỏ
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold tracking-wide text-white uppercase ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════ Toast ══════════════ */
function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="fixed right-5 top-5 z-50 flex w-96 max-w-[90vw] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 border-l-4 bg-white px-4 py-3 shadow-xl"
          style={{
            borderColor: t.type === 'success' ? '#15803d' : t.type === 'error' ? '#b91c1c' : '#1e3a8a',
          }}
        >
          {t.type === 'success'
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            : t.type === 'error'
              ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
              : <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-gov-navy" />}
          <div className="flex-1 text-sm text-gov-slate">
            <p className="font-semibold">{t.title}</p>
            {t.msg && <p className="mt-0.5 text-xs text-gray-600">{t.msg}</p>}
          </div>
          <button onClick={() => onDismiss(t.id)} className="text-gray-400 hover:text-gray-700">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
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
        {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

/* ══════════════ Màn hình chính ══════════════ */
export default function ReportPermissionScreen() {
  const [reports, setReports] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [autoSync, setAutoSync] = useState(true)
  const [newIds, setNewIds] = useState([])

  const [selected, setSelected] = useState([])
  const [emails, setEmails] = useState('')
  const [perm, setPerm] = useState('v')
  const [logs, setLogs] = useState(INIT_LOGS)
  const [isProcessing, setIsProcessing] = useState(false)
  const [failedEmails, setFailedEmails] = useState([])
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(null) // { action }
  const [toasts, setToasts] = useState([])

  // knownIdsRef: tập id đã biết sau lần đồng bộ đầu — dùng để phát hiện báo cáo mới
  const knownIdsRef = useRef(null)
  const busyRef = useRef(false)
  const logEndRef = useRef(null)

  useEffect(() => { logEndRef.current?.scrollIntoView() }, [logs])

  const pushToast = (type, title, msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((p) => [...p, { id, type, title, msg }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000)
  }
  const dismissToast = (id) => setToasts((p) => p.filter((t) => t.id !== id))
  const addLog = (type, msg) =>
    setLogs((p) => [...p, { time: now(), type, msg }])

  const emailList = emails.split('\n').map((e) => e.trim()).filter(Boolean)

  /* ── Đồng bộ danh sách báo cáo từ hệ thống ── */
  const syncReports = useCallback(async (isInitial = false) => {
    if (busyRef.current) return
    busyRef.current = true
    setListLoading(true)
    setSyncError(null)
    try {
      const items = await fetchAllReports()

      // So với lần đồng bộ trước để gắn nhãn MỚI cho các báo cáo vừa xuất hiện
      let fresh = []
      if (knownIdsRef.current) {
        fresh = items.filter((i) => !knownIdsRef.current.has(i.id)).map((i) => i.id)
      }
      knownIdsRef.current = new Set(items.map((i) => i.id))
      setReports(items)
      setNewIds(fresh)
      setLastSync(new Date())
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), items }))
      } catch { /* localStorage đầy → bỏ qua cache */ }

      // Bỏ khỏi phạm vi chọn những báo cáo đã bị xóa khỏi hệ thống
      const alive = new Set(items.map((i) => i.id))
      setSelected((prev) => {
        const kept = prev.filter((id) => alive.has(id))
        if (!isInitial && kept.length < prev.length)
          addLog('info', `ℹ ${prev.length - kept.length} báo cáo đã bị xóa — tự loại khỏi phạm vi chọn.`)
        return kept
      })

      if (isInitial) {
        addLog('success', `✔ Đã tải ${items.length} biểu đồ báo cáo từ hệ thống.`)
      } else if (fresh.length) {
        addLog('info', `↻ Đồng bộ: phát hiện ${fresh.length} báo cáo mới, tổng ${items.length}.`)
        pushToast('info', 'Có báo cáo mới', `${fresh.length} báo cáo vừa xuất hiện trong danh sách.`)
      }
    } catch (e) {
      const msg = e?.response ? `HTTP ${e.response.status}` : e.message
      setSyncError(msg)
      addLog('error', `✘ Không tải được danh sách báo cáo (${msg})${reports.length ? ' — dùng dữ liệu lần trước.' : ''}`)
    } finally {
      setListLoading(false)
      busyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lần đầu: hiện ngay danh sách cache (nếu có) rồi kéo dữ liệu mới
  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setReports(cached.items)
      setLastSync(new Date(cached.time))
      knownIdsRef.current = new Set(cached.items.map((i) => i.id))
    }
    syncReports(true)
  }, [syncReports])

  // Tự cập nhật: mỗi 60s quét lại để báo cáo mới tự vào màn hình (bỏ qua khi
  // đang bận hoặc cửa sổ đang ẩn)
  useEffect(() => {
    if (!autoSync) return
    const t = setInterval(() => {
      if (busyRef.current || document.visibilityState !== 'visible') return
      syncReports(false)
    }, AUTO_SYNC_MS)
    return () => clearInterval(t)
  }, [autoSync, syncReports])

  const allSelected = reports.length > 0 && selected.length === reports.length
  const toggleAll = () => setSelected(allSelected ? [] : reports.map((r) => r.id))
  const toggleOne = (id) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const filteredList = reports.filter((r) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (
      String(r.name).toLowerCase().includes(q) ||
      String(r.createdBy ?? '').toLowerCase().includes(q)
    )
  })

  const copyFailedEmails = async () => {
    if (!failedEmails.length) return
    try {
      await navigator.clipboard.writeText(failedEmails.join('\n'))
    } catch {
      const ta = document.createElement('textarea')
      ta.value = failedEmails.join('\n')
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    pushToast('success', 'Đã sao chép', `${failedEmails.length} email lỗi vào clipboard`)
    setTimeout(() => setCopied(false), 2000)
  }

  const askExecute = (action) => {
    if (!selected.length || !emailList.length) {
      addLog('error', '⚠ Vui lòng chọn báo cáo và nhập ít nhất 1 email.')
      pushToast('error', 'Thiếu dữ liệu đầu vào', 'Cần chọn báo cáo và nhập email trước khi thực thi.')
      return
    }
    setConfirm({ action })
  }

  /* ── Cấp / gỡ quyền xem-sửa báo cáo qua ACL eanalysis ──
     Grant:  POST /api/acls  { resourceId, resourceType:'dashboard', aclFormList:[...] }
     Revoke: DELETE /api/acls với cùng body (giống cơ chế DELETE-kèm-body của API assignments) */
  const execute = useCallback(async (action) => {
    setConfirm(null)
    const list = emails.split('\n').map((e) => e.trim()).filter(Boolean)
    const targets = [...selected]
    const roleLabel = ROLES.find((r) => r.value === perm)?.label ?? perm
    const verb = action === 'grant' ? 'CẤP QUYỀN' : 'GỠ QUYỀN'
    setIsProcessing(true)
    busyRef.current = true
    setFailedEmails([])
    addLog('info', `→ Bắt đầu ${verb} | ${list.length} email × ${targets.length} báo cáo | [${roleLabel}]`)

    const failed = []
    let doneCount = 0

    for (const email of list) {
      addLog('info', `  ⏳ Đang tra cứu tài khoản: ${email}...`)
      let row = null
      try {
        const searchRes = await apiClient.post(
          '/services/uaa/api/search/userInfoModel',
          { q: email, resource: 'table_user' }
        )
        const rows = Array.isArray(searchRes.data) ? searchRes.data : []
        row = rows.find((r) => norm(r?.email) === norm(email)) ?? rows[0]
        if (!row?.resourceId) throw new Error('Không tìm thấy tài khoản')
        addLog('success', `  ✔ Tìm thấy ID: ${row.resourceId}${row.orgName ? ` — ${row.orgName}` : ''}`)
      } catch (error) {
        failed.push(email)
        setFailedEmails([...failed])
        addLog('error', `  ✘ Không tra cứu được "${email}": ${error?.response ? `HTTP ${error.response.status}` : error.message}`)
        continue
      }

      // Gói 10 báo cáo /lượt gọi để không dồn quá nhiều request đồng thời
      for (let i = 0; i < targets.length; i += 10) {
        const chunk = targets.slice(i, i + 10)
        const results = await Promise.all(
          chunk.map(async (reportId) => {
            const report = reports.find((r) => r.id === reportId)
            const reportName = report?.name || reportId
            const aclBody = {
              resourceId: reportId,
              resourceType: 'dashboard',
              aclFormList: [{
                assignee: row.orgName ? `${email} - ${row.orgName}` : email,
                assigneeId: row.resourceId,
                perm,
                permType: 0,
                orgIn: row.orgIn,
              }],
            }
            try {
              if (action === 'grant') {
                await apiClient.post('/services/eanalysis/api/acls', aclBody)
              } else {
                await apiClient.delete('/services/eanalysis/api/acls', { data: aclBody })
              }
              return { reportName, status: 'success' }
            } catch (err) {
              return { reportName, status: 'error', msg: err.response?.data?.message || (err.response ? `HTTP ${err.response.status}` : err.message) }
            }
          })
        )

        results.forEach((res) => {
          doneCount += 1
          if (res.status === 'success') {
            addLog('success', `    ✓ ${res.reportName}`)
          } else {
            addLog('error', `    ✗ ${res.reportName} — ${res.msg}`)
          }
        })
      }
    }

    const totalProcessed = targets.length * list.length
    addLog('success', `✔ Hoàn thành. Đã xử lý ${totalProcessed} bản ghi (${doneCount} lượt gọi).`)
    if (failed.length) {
      addLog('error', `⚠ Có ${failed.length} email không tra cứu được. Xem danh sách phía dưới để copy kiểm tra.`)
    }
    pushToast(
      failed.length ? 'error' : 'success',
      `${verb} hoàn tất`,
      `${totalProcessed} bản ghi được xử lý${failed.length ? `, ${failed.length} email lỗi` : ''}.`
    )

    setIsProcessing(false)
    busyRef.current = false
  }, [emails, perm, selected, reports])

  const roleLabel = ROLES.find((r) => r.value === perm)?.label ?? perm
  const verb = confirm?.action === 'revoke' ? 'GỠ QUYỀN' : 'CẤP QUYỀN'

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gov-bg">

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        open={!!confirm}
        title={`Xác nhận ${verb} biểu đồ báo cáo`}
        lines={[
          `Đối tượng: ${emailList.length} tài khoản email`,
          `Phạm vi: ${selected.length} báo cáo được chọn`,
          `Quyền áp dụng: ${roleLabel} (Perm: ${perm})`,
        ]}
        confirmLabel={` Đồng ý ${verb}`}
        confirmClass={confirm?.action === 'revoke' ? 'bg-red-800 hover:bg-red-900' : 'bg-gov-navy hover:bg-gov-navy-dark'}
        onConfirm={() => execute(confirm.action)}
        onCancel={() => setConfirm(null)}
      />

      {/* ══ KPI strip ══ */}
      <section className="mx-auto grid w-full max-w-[1600px] grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
        <Kpi icon={BarChart3} label="Tổng số báo cáo" value={listLoading && !reports.length ? '…' : reports.length} sub={lastSync ? `đồng bộ lúc ${lastSync.toLocaleTimeString('vi-VN')}` : 'chưa đồng bộ'} accent="#1e3a8a" />
        <Kpi icon={ListChecks} label="Đã chọn phạm vi" value={`${selected.length} / ${reports.length}`} accent="#c9a227" />
        <Kpi icon={Users} label="Tài khoản chờ xử lý" value={emailList.length} sub="email đã nhập" accent="#0f766e" />
        <Kpi icon={ScrollText} label="Bản ghi nhật ký" value={logs.length} sub="kiểm toán phiên làm việc" accent="#b45309" />
      </section>

      {/* ══ Main: Danh sách (trái) — Chi tiết (phải) ══ */}
      <main className="mx-auto grid w-full max-w-[1600px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(380px,2fr)_minmax(420px,3fr)]">

        {/* ── Trái: danh sách báo cáo (tải trực tiếp từ hệ thống) ── */}
        <section className="flex min-h-0 flex-col overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
            <BarChart3 className="h-4 w-4 text-gov-navy" />
            <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">
              Danh mục biểu đồ báo cáo
            </h2>
            <span className="border border-gov-navy/30 bg-gov-navy/5 px-2 py-0.5 text-xs font-semibold text-gov-navy">
              {reports.length}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => syncReports(false)}
              disabled={listLoading || isProcessing}
              className="flex items-center gap-1.5 border border-gov-navy bg-gov-navy px-3 py-1.5 text-[11px] font-semibold tracking-wider text-white uppercase hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
            <button
              onClick={() => setAutoSync((p) => !p)}
              className={`flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase ${
                autoSync
                  ? 'border-green-700 bg-green-50 text-green-800 hover:bg-green-100'
                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-100'
              }`}
              title="Tự quét lại danh sách mỗi 60 giây — báo cáo mới tự xuất hiện trên màn"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Tự cập nhật: {autoSync ? 'BẬT' : 'TẮT'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gov-navy-deep px-4 py-1.5 text-[11px] text-white/70">
            <span className="flex items-center gap-1.5">
              <Activity className={`h-3 w-3 ${listLoading ? 'text-gov-gold' : syncError ? 'text-red-400' : 'text-green-400'}`} />
              {listLoading
                ? 'Đang đồng bộ từ hệ thống...'
                : syncError
                  ? `Lỗi đồng bộ (${syncError}) — dữ liệu lần trước`
                  : lastSync
                    ? `Đã đồng bộ lúc ${lastSync.toLocaleTimeString('vi-VN')} · quét lại mỗi 60s`
                    : 'Chưa có dữ liệu'}
            </span>
            {newIds.length > 0 && (
              <span className="flex items-center gap-1 font-semibold text-gov-gold">
                <Sparkles className="h-3 w-3" />
                {newIds.length} mới
              </span>
            )}
          </div>

          <div className="border-b border-gray-200 p-3">
            <div className="flex items-center gap-2 border border-gray-300 bg-gray-50 px-3 py-2 focus-within:border-gov-navy focus-within:ring-2 focus-within:ring-gov-navy/20">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tra cứu theo tên báo cáo hoặc người tạo..."
                className="w-full bg-transparent text-sm text-gov-slate outline-none placeholder:text-gray-400"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gov-navy">
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
            <button
              onClick={toggleAll}
              disabled={!reports.length}
              className="border border-gov-navy bg-gov-navy px-3 py-1.5 text-[11px] font-semibold tracking-wider text-white uppercase hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              Chọn tất cả
            </button>
            <button
              onClick={() => setSelected([])}
              className="border border-red-800 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-wider text-red-800 uppercase hover:bg-red-50"
            >
              Bỏ chọn
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredList.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                {listLoading ? 'Đang tải danh sách báo cáo...' : 'Không tìm thấy báo cáo khớp với từ khóa.'}
              </p>
            )}
            {filteredList.map((item) => {
              const isActive = selected.includes(item.id)
              const isNew = newIds.includes(item.id)
              return (
                <div
                  key={item.id}
                  onClick={() => toggleOne(item.id)}
                  title={`${item.name}${item.createdBy ? `\nNgười tạo: ${item.createdBy}` : ''}${item.createdDate ? `\nNgày tạo: ${new Date(item.createdDate).toLocaleString('vi-VN')}` : ''}`}
                  className={`flex cursor-pointer items-center gap-3 border-b border-gray-100 px-4 py-2.5 ${
                    isActive ? 'border-l-4 border-l-gov-gold bg-gov-navy/5' : 'border-l-4 border-l-transparent hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center border ${
                      isActive
                        ? 'border-gov-navy bg-gov-navy text-white'
                        : 'border-gray-300 bg-white text-transparent'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gov-slate">
                    {item.name}
                  </span>
                  {isNew && (
                    <span className="flex shrink-0 items-center gap-1 border border-gov-gold bg-gov-gold/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-[#8a6f14] uppercase">
                      <Sparkles className="h-3 w-3" />
                      Mới
                    </span>
                  )}
                  {isActive && <BadgeCheck className="h-4 w-4 shrink-0 text-gov-gold" />}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t-2 border-gov-navy bg-gov-navy px-4 py-2 text-white">
            <span className="text-xs font-medium tracking-wider uppercase opacity-80">
              Phạm vi đang chọn
            </span>
            <span className="font-mono text-sm font-bold text-gov-gold">
              {selected.length} / {reports.length}
            </span>
          </div>
        </section>

        {/* ── Phải: tác vụ + nhật ký ── */}
        <div className="flex min-h-0 flex-col gap-4">

          {/* Tác vụ */}
          <section className="border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
              <Mail className="h-4 w-4 text-gov-navy" />
              <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">
                Đối tượng và thẩm quyền
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-600 uppercase">
                  Danh sách email tài khoản
                </label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder={'nguyenvana@moj.gov.vn\ntranthib@moj.gov.vn'}
                  rows={7}
                  spellCheck={false}
                  className="w-full resize-y border border-gray-300 bg-gray-50 p-3 font-mono text-sm text-gov-slate outline-none placeholder:text-gray-400 focus:border-gov-navy focus:bg-white focus:ring-2 focus:ring-gov-navy/20"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Mỗi email một dòng — {emailList.length} tài khoản hợp lệ đã nhập.
                </p>
              </div>

              <div className="flex flex-col">
                <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-600 uppercase">
                  Quyền áp dụng trên báo cáo
                </label>
                <div className="space-y-2">
                  {ROLES.map((r) => {
                    const active = perm === r.value
                    return (
                      <button
                        key={r.value}
                        onClick={() => setPerm(r.value)}
                        className={`flex w-full items-center gap-3 border px-4 py-3 text-left ${
                          active
                            ? 'border-gov-navy bg-gov-navy text-white'
                            : 'border-gray-300 bg-white text-gov-slate hover:border-gov-navy/50 hover:bg-gray-50'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            active ? 'border-gov-gold' : 'border-gray-400'
                          }`}
                        >
                          {active && <span className="h-2 w-2 rounded-full bg-gov-gold" />}
                        </span>
                        <span className="flex-1 text-sm font-semibold">{r.label}</span>
                        <span
                          className={`border px-2 py-0.5 font-mono text-[11px] ${
                            active
                              ? 'border-white/30 bg-white/10 text-gov-gold'
                              : 'border-gray-200 bg-gray-100 text-gray-500'
                          }`}
                        >
                          {r.perm}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => askExecute('grant')}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 border border-gov-navy-dark bg-gov-navy px-4 py-3 text-sm font-bold tracking-wider text-white uppercase hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShieldCheck className="h-5 w-5" />
                    Cấp quyền
                  </button>
                  <button
                    onClick={() => askExecute('revoke')}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 border border-red-900 bg-red-800 px-4 py-3 text-sm font-bold tracking-wider text-white uppercase hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ShieldOff className="h-5 w-5" />
                    Gỡ quyền
                  </button>
                </div>
              </div>
            </div>

            {failedEmails.length > 0 && (
              <div className="border-t-4 border-red-700 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-900">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-sm font-bold tracking-wide uppercase">
                    Email không tra cứu được
                  </span>
                  <span className="border border-red-700 bg-red-700 px-2 py-0.5 text-xs font-bold text-white">
                    {failedEmails.length}
                  </span>
                </div>
                <pre className="mt-2 max-h-32 overflow-auto border border-red-200 bg-white p-3 font-mono text-xs text-red-900">
{failedEmails.join('\n')}
                </pre>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={copyFailedEmails}
                    className={`flex items-center gap-2 border px-3 py-2 text-xs font-semibold tracking-wider uppercase ${
                      copied
                        ? 'border-green-700 bg-green-700 text-white'
                        : 'border-gov-navy bg-white text-gov-navy hover:bg-gov-navy/5'
                    }`}
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? 'Đã sao chép' : 'Sao chép danh sách'}
                  </button>
                  <button
                    onClick={() => setFailedEmails([])}
                    className="flex items-center gap-2 border border-gray-400 bg-white px-3 py-2 text-xs font-semibold tracking-wider text-gray-600 uppercase hover:bg-gray-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa danh sách
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Nhật ký kiểm toán */}
          <section className="flex min-h-0 flex-1 flex-col border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
              <ScrollText className="h-4 w-4 text-gov-navy" />
              <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">
                Nhật ký kiểm toán
              </h2>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                <Activity className={`h-3.5 w-3.5 ${isProcessing ? 'text-gov-gold' : 'text-green-600'}`} />
                {isProcessing ? 'Đang ghi nhận' : 'Trực tiếp'}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setLogs(INIT_LOGS)}
                className="border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-wider text-gray-600 uppercase hover:bg-gray-100"
              >
                Xóa nhật ký
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gov-navy-deep p-3 font-mono text-xs" style={{ minHeight: 220 }}>
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 py-0.5">
                  <span className="shrink-0 text-gray-500">{log.time}</span>
                  <span
                    className={
                      log.type === 'success'
                        ? 'text-green-400'
                        : log.type === 'error'
                          ? 'text-red-400'
                          : 'text-gray-300'
                    }
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
              <div style={{ height: 1 }} ref={logEndRef} />
            </div>
          </section>
        </div>
      </main>

    </div>
  )
}
