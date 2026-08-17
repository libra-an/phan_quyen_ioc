import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Landmark, ShieldCheck, ShieldOff, FileText, Users, ScrollText,
  Copy, Trash2, CheckCircle2, XCircle, AlertTriangle, Search,
  Lock, Activity, ListChecks, Mail, ChevronRight, BadgeCheck,
} from 'lucide-react'
import apiClient from '../api/axiosConfig'
import { DASHBOARD_LIST } from '../data/dashboards'

const ROLES = [
  { value: '1', label: 'Người nhập', perm: 'Perm: 1' },
  { value: '2', label: 'Quản trị viên', perm: 'Perm: 2' },
]

const INIT_LOGS = [
  { time: '09:14:32', type: 'info', msg: 'System initialized. Ready for Batch Processing.' },
]

const now = () => {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

function parseDashboardItem(item) {
  const slashIdx = item.name.lastIndexOf('/')
  if (slashIdx !== -1) {
    return {
      code: item.name.slice(slashIdx + 1).trim(),
      label: item.name.slice(0, slashIdx).trim(),
    }
  }
  return { code: item.id, label: item.name }
}

/* ══════════════ CANVAS: hạt + lưới navy trên header ══════════════ */
function HeaderCanvas() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const N = 42
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0004,
      r: Math.random() * 1.4 + 0.6,
      gold: Math.random() < 0.18,
    }))

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h)

      // lưới tọa độ mờ — gợi hệ quy chiếu bản đồ hành chính
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      const step = 44
      const off = (t * 0.008) % step
      for (let x = -off; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = -off; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > 1) n.vx *= -1
        if (n.y < 0 || n.y > 1) n.vy *= -1
      }

      // đường nối giữa các hạt gần nhau
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h
          const d = Math.hypot(dx, dy)
          if (d < 110) {
            ctx.strokeStyle = `rgba(255,255,255,${(1 - d / 110) * 0.14})`
            ctx.beginPath()
            ctx.moveTo(a.x * w, a.y * h)
            ctx.lineTo(b.x * w, b.y * h)
            ctx.stroke()
          }
        }
      }

      for (const n of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n.x * 20)
        ctx.fillStyle = n.gold
          ? `rgba(201,162,39,${0.35 + pulse * 0.5})`
          : `rgba(255,255,255,${0.18 + pulse * 0.3})`
        ctx.beginPath()
        ctx.arc(n.x * w, n.y * h, n.r + pulse * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />
}

/* ══════════════ CANVAS: sóng quét trạng thái hệ thống ══════════════ */
function ScanCanvas({ active }) {
  const ref = useRef(null)
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect()
      w = r.width; h = r.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h)
      const mid = h / 2
      const amp = activeRef.current ? h * 0.34 : h * 0.12
      const speed = activeRef.current ? 0.006 : 0.002

      ctx.strokeStyle = activeRef.current ? '#c9a227' : '#1e3a8a'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      for (let x = 0; x <= w; x += 2) {
        const y = mid
          + Math.sin(x * 0.06 + t * speed) * amp * 0.5
          + Math.sin(x * 0.015 - t * speed * 1.6) * amp * 0.5
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return <canvas ref={ref} className="h-6 w-full" aria-hidden="true" />
}

/* ══════════════ Hộp thoại xác nhận (không transition) ══════════════ */
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

/* ══════════════ Toast (không transition) ══════════════ */
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
export default function PermissionScreen() {
  const [selected, setSelected] = useState([])
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('1')
  const [logs, setLogs] = useState(INIT_LOGS)
  const [isProcessing, setIsProcessing] = useState(false)
  const [failedEmails, setFailedEmails] = useState([])
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(null) // { action }
  const [toasts, setToasts] = useState([])
  const [clock, setClock] = useState(now())

  const logEndRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setClock(now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView()
  }, [logs])

  const pushToast = (type, title, msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((p) => [...p, { id, type, title, msg }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000)
  }
  const dismissToast = (id) => setToasts((p) => p.filter((t) => t.id !== id))

  const emailList = emails.split('\n').map((e) => e.trim()).filter(Boolean)

  const allSelected = selected.length === DASHBOARD_LIST.length
  const toggleAll = () =>
    setSelected(allSelected ? [] : DASHBOARD_LIST.map((d) => d.id))
  const toggleOne = (id) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const filteredList = DASHBOARD_LIST.filter((d) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    const { code, label } = parseDashboardItem(d)
    return (
      label.toLowerCase().includes(q) ||
      String(code).toLowerCase().includes(q)
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
      setLogs((p) => [
        ...p,
        { time: now(), type: 'error', msg: '⚠ Vui lòng chọn biểu mẫu và nhập ít nhất 1 email.' },
      ])
      pushToast('error', 'Thiếu dữ liệu đầu vào', 'Cần chọn biểu mẫu và nhập email trước khi thực thi.')
      return
    }
    setConfirm({ action })
  }

  const execute = useCallback(async (action) => {
    setConfirm(null)
    const emailCount = emails.split('\n').map((e) => e.trim()).filter(Boolean).length

    setIsProcessing(true)
    setFailedEmails([])

    const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role
    const verb = action === 'grant' ? 'CẤP QUYỀN' : 'GỠ QUYỀN'
    setLogs((p) => [
      ...p,
      {
        time: now(),
        type: 'info',
        msg: `→ Bắt đầu ${verb} | ${emailCount} email × ${selected.length} biểu mẫu | [${roleLabel}]`,
      },
    ])

    const failed = []

    for (const email of emails.split('\n').map((e) => e.trim()).filter(Boolean)) {
      setLogs((p) => [
        ...p,
        { time: now(), type: 'info', msg: `  ⏳ Đang tìm kiếm ID cho: ${email}...` },
      ])
      let foundResourceId = null

      try {
        const searchRes = await apiClient.post(
          '/services/uaa/api/search/userInfoModel',
          { q: email, resource: 'table_user' }
        )
        const userData = searchRes.data?.[0]
        if (userData && userData.resourceId) {
          foundResourceId = String(userData.resourceId)
          setLogs((p) => [
            ...p,
            { time: now(), type: 'success', msg: `  ✔ Tìm thấy ID: ${foundResourceId}` },
          ])
        } else {
          failed.push(email)
          setFailedEmails((prev) => [...prev, email])
          setLogs((p) => [
            ...p,
            {
              time: now(),
              type: 'error',
              msg: `  ✘ Không tìm thấy Resource ID cho "${email}". Đã thêm vào danh sách lỗi.`,
            },
          ])
          continue
        }
      } catch (error) {
        failed.push(email)
        setFailedEmails((prev) => [...prev, email])
        setLogs((p) => [
          ...p,
          {
            time: now(),
            type: 'error',
            msg: `  ✘ Lỗi API Search cho "${email}": ${error.message}`,
          },
        ])
        continue
      }

      const results = await Promise.all(
        selected.map(async (dashId) => {
          const dashName =
            DASHBOARD_LIST.find((d) => d.id === dashId)?.name || dashId
          try {
            await apiClient.post(
              `/services/ioc-metadata/api/assignments/${dashId}/assign`,
              {
                assignments: [
                  {
                    assigneeId: foundResourceId,
                    assignee: email,
                    perm: action === 'grant' ? Number(role) : 0,
                    permType: 0,
                  },
                ],
              }
            )
            return { dashName, status: 'success' }
          } catch (err) {
            return {
              dashName,
              status: 'error',
              msg: err.response?.data?.message || err.message,
            }
          }
        })
      )

      results.forEach((res) => {
        if (res.status === 'success')
          setLogs((p) => [
            ...p,
            { time: now(), type: 'success', msg: `    ✓ ${res.dashName}` },
          ])
        else
          setLogs((p) => [
            ...p,
            {
              time: now(),
              type: 'error',
              msg: `    ✗ ${res.dashName} - ${res.msg}`,
            },
          ])
      })
    }

    const totalProcessed = selected.length * emailCount
    setLogs((p) => [
      ...p,
      {
        time: now(),
        type: 'success',
        msg: `✔ Hoàn thành. Đã xử lý ${totalProcessed} bản ghi.`,
      },
    ])

    if (failed.length > 0) {
      setLogs((p) => [
        ...p,
        {
          time: now(),
          type: 'error',
          msg: `⚠ Có ${failed.length} email không tìm thấy ID. Xem danh sách phía dưới để copy kiểm tra.`,
        },
      ])
    }

    pushToast(
      failed.length > 0 ? 'error' : 'success',
      `${verb} hoàn tất`,
      `${totalProcessed} bản ghi được xử lý${failed.length ? `, ${failed.length} email lỗi` : ''}.`
    )

    setIsProcessing(false)
  }, [emails, role, selected])

  const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role
  const verb = confirm?.action === 'revoke' ? 'GỠ QUYỀN' : 'CẤP QUYỀN'

  return (
    <div className="flex min-h-screen flex-col bg-gov-bg">

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        open={!!confirm}
        title={`Xác nhận ${verb} phân quyền`}
        lines={[
          `Đối tượng: ${emailList.length} tài khoản email`,
          `Phạm vi: ${selected.length} biểu mẫu được chọn`,
          `Vai trò áp dụng: ${roleLabel} (Perm: ${role})`,
        ]}
        confirmLabel={` Đồng ý ${verb}`}
        confirmClass={confirm?.action === 'revoke' ? 'bg-red-800 hover:bg-red-900' : 'bg-gov-navy hover:bg-gov-navy-dark'}
        onConfirm={() => execute(confirm.action)}
        onCancel={() => setConfirm(null)}
      />

      {/* ══ Header: banner quốc hiệu-style ══ */}
      <header className="relative overflow-hidden bg-gov-navy-deep text-white">
        <HeaderCanvas />
        <div className="relative mx-auto flex max-w-[1600px] items-center gap-5 px-6 py-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gov-gold/70 bg-gov-navy">
            <Landmark className="h-8 w-8 text-gov-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.2em] text-white/60 uppercase">
              Bộ Tư pháp — Trung tâm dữ liệu IOC
            </p>
            <h1 className="truncate text-lg font-bold tracking-wide text-white uppercase">
              Hệ thống Quản lý Phân quyền Biểu mẫu Báo cáo
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/50">
              <Lock className="h-3 w-3" />
              Kênh quản trị nội bộ — Mọi truy cập đều được ghi nhận và kiểm toán
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-6 md:flex">
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-[11px] tracking-wider text-white/60 uppercase">
                <Activity className="h-3.5 w-3.5" /> Trạng thái hệ thống
              </p>
              <div className="mt-0.5 w-40"><ScanCanvas active={isProcessing} /></div>
              <p className={`text-[11px] font-semibold ${isProcessing ? 'text-gov-gold' : 'text-green-400'}`}>
                {isProcessing ? 'ĐANG THỰC THI...' : 'HOẠT ĐỘNG BÌNH THƯỜNG'}
              </p>
            </div>
            <div className="border-l border-white/15 pl-6 text-right">
              <p className="font-mono text-xl leading-tight font-bold text-gov-gold">{clock}</p>
              <p className="text-[11px] text-white/50">Giờ hệ thống</p>
            </div>
          </div>
        </div>
        <div className="relative h-1 bg-gov-gold" />
      </header>

      {/* ══ KPI strip ══ */}
      <section className="mx-auto grid w-full max-w-[1600px] grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
        <Kpi icon={FileText} label="Tổng số biểu mẫu" value={DASHBOARD_LIST.length} accent="#1e3a8a" />
        <Kpi icon={ListChecks} label="Đã chọn phạm vi" value={`${selected.length} / ${DASHBOARD_LIST.length}`} accent="#c9a227" />
        <Kpi icon={Users} label="Tài khoản chờ xử lý" value={emailList.length} sub="email đã nhập" accent="#0f766e" />
        <Kpi icon={ScrollText} label="Bản ghi nhật ký" value={logs.length} sub="kiểm toán phiên làm việc" accent="#b45309" />
      </section>

      {/* ══ Main: Danh sách (trái) — Chi tiết (phải) ══ */}
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-[minmax(380px,2fr)_minmax(420px,3fr)]">

        {/* ── Trái: danh sách biểu mẫu ── */}
        <section className="flex flex-col border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
            <FileText className="h-4 w-4 text-gov-navy" />
            <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">
              Danh mục biểu mẫu
            </h2>
            <span className="border border-gov-navy/30 bg-gov-navy/5 px-2 py-0.5 text-xs font-semibold text-gov-navy">
              {DASHBOARD_LIST.length}
            </span>
            <div className="flex-1" />
            <button
              onClick={toggleAll}
              className="border border-gov-navy bg-gov-navy px-3 py-1.5 text-[11px] font-semibold tracking-wider text-white uppercase hover:bg-gov-navy-dark"
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

          <div className="border-b border-gray-200 p-3">
            <div className="flex items-center gap-2 border border-gray-300 bg-gray-50 px-3 py-2 focus-within:border-gov-navy focus-within:ring-2 focus-within:ring-gov-navy/20">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tra cứu theo mã biểu mẫu hoặc tên..."
                className="w-full bg-transparent text-sm text-gov-slate outline-none placeholder:text-gray-400"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gov-navy">
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredList.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                Không tìm thấy biểu mẫu khớp với từ khóa.
              </p>
            )}
            {filteredList.map((item) => {
              const isActive = selected.includes(item.id)
              const { code, label } = parseDashboardItem(item)
              return (
                <div
                  key={item.id}
                  onClick={() => toggleOne(item.id)}
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
                  <span className="w-20 shrink-0 font-mono text-sm font-bold text-gov-navy">
                    {code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gov-slate" title={label}>
                    {label}
                  </span>
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
              {selected.length} / {DASHBOARD_LIST.length}
            </span>
          </div>
        </section>

        {/* ── Phải: tác vụ + nhật ký ── */}
        <div className="flex flex-col gap-4">

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
                  Vai trò áp dụng (RBAC)
                </label>
                <div className="space-y-2">
                  {ROLES.map((r) => {
                    const active = role === r.value
                    return (
                      <button
                        key={r.value}
                        onClick={() => setRole(r.value)}
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
                    Email không tìm thấy Resource ID
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
          <section className="flex flex-1 flex-col border border-gray-200 bg-white shadow-sm">
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
            <div className="h-14 shrink-0 border-b border-gray-200 bg-gov-navy-deep px-2">
              <ScanCanvas active={isProcessing} />
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

      <footer className="border-t-2 border-gov-navy bg-gov-navy-deep px-6 py-3 text-center text-[11px] tracking-wider text-white/50 uppercase">
        © 2026 Trung tâm dữ liệu IOC — Hệ thống quản lý phân quyền · Bản ghi nội bộ lưu vĩnh viễn phục vụ kiểm toán
      </footer>
    </div>
  )
}
