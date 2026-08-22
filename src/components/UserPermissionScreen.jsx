import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Users, UserPlus, UserMinus, ScrollText, Activity, Copy, Trash2,
  CheckCircle2, XCircle, AlertTriangle, Search, Ban, ListChecks,
  Mail, ChevronRight, ShieldCheck, ShieldOff,
} from 'lucide-react'
import apiClient from '../api/axiosConfig'
import eaccountClient from '../api/eaccountApi'
import { logUserPermissionGrant } from '../api/sheetLogger'
import { getOperatorAccount } from '../api/axiosConfig'

/* ══════════════ Nhóm quyền IOC đích — kiểm tra tồn tại trước khi phân quyền ══════════════ */
const IOC_GROUPS = [
  'IOC - CẤP KHU VỰC',
  'IOC - Lãnh đạo cấp tỉnh',
]

const INIT_LOGS = [
  { time: '09:00:00', type: 'info', msg: 'Sẵn sàng. Nhập danh sách tài khoản và chọn thao tác.' },
]

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

const parseEmails = (text) =>
  [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]

const now = () => {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
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
            Thao tác cập nhật trọn bộ thành viên nhóm quyền — mọi thay đổi được ghi vào Nhật ký kiểm toán.
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
              : <Search className="mt-0.5 h-5 w-5 shrink-0 text-gov-navy" />}
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
export default function UserPermissionScreen() {
  const [emails, setEmails] = useState('')
  const [targets, setTargets] = useState(IOC_GROUPS) // nhóm đích đang bật
  const [logs, setLogs] = useState(INIT_LOGS)
  const [running, setRunning] = useState(false)
  const [failedEmails, setFailedEmails] = useState([])
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(null) // { action: 'grant' | 'revoke' }
  const [toasts, setToasts] = useState([])
  const [stats, setStats] = useState({ ok: 0, skip: 0, err: 0 })

  const stopRef = useRef(false)
  const logEndRef = useRef(null)

  useEffect(() => { logEndRef.current?.scrollIntoView() }, [logs])

  const pushToast = (type, title, msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((p) => [...p, { id, type, title, msg }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000)
  }
  const dismissToast = (id) => setToasts((p) => p.filter((t) => t.id !== id))

  const emailList = parseEmails(emails)

  const toggleTarget = (name) =>
    setTargets((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]))

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
    if (!emailList.length || !targets.length) {
      pushToast('error', 'Thiếu dữ liệu đầu vào', 'Cần nhập email và chọn ít nhất 1 nhóm quyền đích.')
      return
    }
    setConfirm({ action })
  }

  /**
   * Cấp / gỡ 1 tài khoản khỏi các nhóm IOC trong đơn vị của tài khoản đó.
   * Luồng mỗi nhóm: GET /policies/{id} (lấy listUser + listPolicy hiện tại)
   * → merge listUser → PUT /policies (gửi trọn trạng thái, không đụng listPolicy).
   */
  const applyPolicy = async (action, policySummary, resourceId) => {
    const { id, policyName } = policySummary
    const detailRes = await eaccountClient.get(`/services/uaa/api/policies/${id}`)
    const detail = detailRes.data
    const members = Array.isArray(detail.listUser) ? detail.listUser : []
    const inGroup = members.some((u) => String(u.userId) === String(resourceId))

    if (action === 'grant' && inGroup) return { status: 'skip', policyName, msg: 'đã có sẵn trong nhóm' }
    if (action === 'revoke' && !inGroup) return { status: 'skip', policyName, msg: 'không nằm trong nhóm' }

    const memberIds = [...new Set(members.map((u) => Number(u.userId)))]
    const newListUser =
      action === 'grant'
        ? [...memberIds, Number(resourceId)].map((userId) => ({ userId }))
        : memberIds.filter((uid) => String(uid) !== String(resourceId)).map((userId) => ({ userId }))

    const putRes = await eaccountClient.put('/services/uaa/api/policies', {
      policyName: detail.policyName,
      policyActive: detail.policyActive ?? 1,
      listUser: newListUser,
      listPolicy: Array.isArray(detail.listPolicy) ? detail.listPolicy : [],
      policyId: detail.policyId ?? id,
      orgIn: detail.orgIn,
    })
    // Server trả về entity đã cập nhật — đối chiếu id để chắc chắn lưu đúng nhóm
    if (putRes.data?.id != null && String(putRes.data.id) !== String(detail.policyId ?? id))
      throw new Error('Phản hồi PUT không khớp policyId')
    return { status: 'ok', policyName }
  }

  const execute = useCallback(async (action) => {
    setConfirm(null)
    const list = parseEmails(emails)
    const verb = action === 'grant' ? 'CẤP QUYỀN IOC' : 'GỠ QUYỀN IOC'

    stopRef.current = false
    setRunning(true)
    setFailedEmails([])
    setStats({ ok: 0, skip: 0, err: 0 })
    const operator = await getOperatorAccount()
    setLogs(() => [{ time: now(), type: 'info', msg: `→ Bắt đầu ${verb} | ${list.length} tài khoản | Nhóm đích: ${targets.join(' · ')}` }])

    let ok = 0, skip = 0, err = 0
    const failed = []

    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) {
        setLogs((p) => [...p, { time: now(), type: 'error', msg: '⏹ Đã dừng theo yêu cầu.' }])
        break
      }
      const email = list[i]
      setLogs((p) => [...p, { time: now(), type: 'info', msg: `⏳ [${i + 1}/${list.length}] ${email} — đang tra cứu…` }])

      try {
        // 1. Tìm userId (resourceId) + đơn vị (orgIn) của tài khoản
        const searchRes = await apiClient.post('/services/uaa/api/search/userInfoModel', {
          q: email, resource: 'table_user',
        })
        const rows = Array.isArray(searchRes.data) ? searchRes.data : []
        const row = rows.find((r) => norm(r?.email) === norm(email)) ?? rows[0]
        if (!row?.resourceId || !row.orgIn) throw new Error('Không tìm thấy tài khoản')
        const resourceId = row.resourceId

        // 2. Kiểm tra đơn vị đã có nhóm IOC đích chưa
        const polRes = await eaccountClient.get('/services/uaa/api/policies', {
          params: { page: 0, size: 200, orgIn: row.orgIn },
        })
        const polRows = Array.isArray(polRes.data) ? polRes.data : (polRes.data?.content ?? [])
        const found = polRows.filter((p) => targets.some((t) => norm(p?.policyName) === norm(t)))
        const missing = targets.filter((t) => !found.some((f) => norm(f.policyName) === norm(t)))
        if (missing.length)
          setLogs((p) => [...p, { time: now(), type: 'info', msg: `  ℹ Đơn vị chưa có nhóm: ${missing.join(' · ')}` }])
        if (!found.length)
          throw new Error(`Đơn vị (${row.orgName ?? row.orgIn}) chưa có nhóm quyền IOC nào trong danh sách đích`)

        // 3. Cấp / gỡ từng nhóm
        let emailOk = 0, emailSkip = 0
        for (const policy of found) {
          try {
            const r = await applyPolicy(action, policy, resourceId)
            if (r.status === 'ok') {
              emailOk++
              setLogs((p) => [...p, { time: now(), type: 'success', msg: `  ✓ ${r.policyName}: ${action === 'grant' ? 'đã thêm vào nhóm' : 'đã gỡ khỏi nhóm'}` }])
              logUserPermissionGrant({
                email,
                group: r.policyName,
                orgIn: row.orgIn,
                action: action === 'grant' ? 'Cấp quyền (thêm vào nhóm)' : 'Gỡ quyền (gỡ khỏi nhóm)',
                account: operator,
              })
            } else {
              emailSkip++
              setLogs((p) => [...p, { time: now(), type: 'info', msg: `  → ${r.policyName}: ${r.msg} — bỏ qua` }])
            }
          } catch (e) {
            setLogs((p) => [...p, {
              time: now(), type: 'error',
              msg: `  ✗ ${policy.policyName}: ${e?.response ? `HTTP ${e.response.status}` : e.message}`,
            }])
            throw e
          }
        }
        ok += emailOk
        skip += emailSkip
        setStats({ ok, skip, err })
        setLogs((p) => [...p, { time: now(), type: 'success', msg: `  ✔ ${email}: xong (${emailOk} thay đổi, ${emailSkip} bỏ qua)` }])
      } catch (e) {
        err++
        failed.push(email)
        setFailedEmails(failed)
        setStats({ ok, skip, err })
        setLogs((p) => [...p, {
          time: now(), type: 'error',
          msg: `  ✗ ${email}: ${e?.response ? `HTTP ${e.response.status}` : (e.message ?? 'Lỗi không xác định')}`,
        }])
      }
      if (i < list.length - 1 && !stopRef.current) await new Promise((r) => setTimeout(r, 250))
    }

    setLogs((p) => [...p, {
      time: now(), type: 'success',
      msg: `✔ Hoàn thành ${verb}: ${ok} thay đổi · ${skip} bỏ qua · ${err} lỗi.`,
    }])
    pushToast(err ? 'error' : 'success', `${verb} hoàn tất`, `${ok} thay đổi, ${skip} bỏ qua, ${err} lỗi.`)
    setRunning(false)
  }, [emails, targets])

  const verbShort = confirm?.action === 'revoke' ? 'GỠ QUYỀN' : 'CẤP QUYỀN'

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-gov-bg">

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <ConfirmDialog
        open={!!confirm}
        title={`Xác nhận ${verbShort} nhóm IOC`}
        lines={[
          `Đối tượng: ${emailList.length} tài khoản email`,
          `Nhóm đích (nếu đơn vị có): ${targets.join(' · ') || '—'}`,
          confirm?.action === 'grant'
            ? 'Tài khoản chưa có trong nhóm sẽ được thêm vào; đã có thì bỏ qua.'
            : 'Tài khoản đang có trong nhóm sẽ bị gỡ ra; không có thì bỏ qua.',
        ]}
        confirmLabel={` Đồng ý ${verbShort}`}
        confirmClass={confirm?.action === 'revoke' ? 'bg-red-800 hover:bg-red-900' : 'bg-gov-navy hover:bg-gov-navy-dark'}
        onConfirm={() => execute(confirm.action)}
        onCancel={() => setConfirm(null)}
      />

      {/* ══ Banner ══ */}
      <header className="shrink-0 bg-gov-navy-deep px-6 py-4 text-white">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gov-gold/70 bg-gov-navy">
            <Users className="h-7 w-7 text-gov-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.2em] text-white/60 uppercase">
              FPT — Trung tâm dữ liệu IOC
            </p>
            <h1 className="truncate text-lg font-bold tracking-wide uppercase">Phân quyền Người dùng vào IOC</h1>
            <p className="mt-0.5 truncate text-xs text-white/50">
              Thêm / gỡ tài khoản khỏi nhóm quyền IOC theo đơn vị (kiểm tra nhóm trước khi thay đổi)
            </p>
          </div>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 border border-gov-gold/40 bg-gov-gold/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-gov-gold uppercase md:flex">
            <ShieldCheck className="h-4 w-4" />
            Ghi nhật ký kiểm toán
          </span>
        </div>
        <div className="mx-auto mt-4 h-px bg-gov-gold/30" />
      </header>

      {/* ══ KPI ══ */}
      <section className="mx-auto grid w-full max-w-[1600px] grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
        <Kpi icon={Users} label="Tài khoản chờ xử lý" value={emailList.length} sub="email đã nhập" accent="#1e3a8a" />
        <Kpi icon={UserPlus} label="Thay đổi thành công" value={stats.ok} sub="lượt thêm/gỡ nhóm" accent="#15803d" />
        <Kpi icon={ListChecks} label="Bỏ qua" value={stats.skip} sub="đã có sẵn / không nằm trong nhóm" accent="#c9a227" />
        <Kpi icon={AlertTriangle} label="Lỗi" value={stats.err} sub="không tra cứu / không có nhóm" accent="#b91c1c" />
      </section>

      {/* ══ Nội dung chính ══ */}
      <main className="mx-auto grid w-full max-w-[1600px] min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 pb-6 lg:grid-cols-[minmax(400px,2fr)_minmax(420px,3fr)]">

        {/* ── Trái: nhập liệu + cấu hình ── */}
        <section className="flex min-h-0 flex-col overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
            <Mail className="h-4 w-4 text-gov-navy" />
            <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">Đối tượng và nhóm quyền đích</h2>
          </div>

          <div className="flex flex-1 flex-col gap-4 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-600 uppercase">
                Danh sách email tài khoản
              </label>
              <textarea
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                disabled={running}
                rows={7}
                spellCheck={false}
                placeholder={'nguyenvana@moj.gov.vn\ntranthib@moj.gov.vn'}
                className="w-full resize-y border border-gray-300 bg-gray-50 p-3 font-mono text-sm text-gov-slate outline-none placeholder:text-gray-400 focus:border-gov-navy focus:bg-white focus:ring-2 focus:ring-gov-navy/20"
              />
              <p className="mt-1 text-xs text-gray-500">
                Mỗi email một dòng — {emailList.length} tài khoản hợp lệ (trùng tự loại bỏ).
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-600 uppercase">
                Nhóm quyền IOC đích (theo đơn vị của từng tài khoản)
              </label>
              <div className="space-y-2">
                {IOC_GROUPS.map((name) => {
                  const active = targets.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleTarget(name)}
                      disabled={running}
                      className={`flex w-full items-center gap-3 border px-4 py-2.5 text-left ${
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
                      <span className="flex-1 text-sm font-semibold">{name}</span>
                      {active
                        ? <ShieldCheck className="h-4 w-4 text-gov-gold" />
                        : <ShieldOff className="h-4 w-4 text-gray-400" />}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 border-l-2 border-gov-gold bg-gov-gold/5 px-3 py-2 text-xs leading-relaxed text-gov-slate">
                Với mỗi tài khoản: tra cứu đơn vị → kiểm tra đơn vị đã có nhóm đích chưa →
                chưa có nhóm nào thì bỏ qua tài khoản, có thì thêm/gỡ tài khoản khỏi nhóm.
              </p>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-3">
              <button
                onClick={() => askExecute('grant')}
                disabled={running}
                className="flex items-center justify-center gap-2 border border-gov-navy-dark bg-gov-navy px-4 py-3 text-sm font-bold tracking-wider text-white uppercase hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserPlus className="h-5 w-5" />
                Cấp quyền
              </button>
              <button
                onClick={() => askExecute('revoke')}
                disabled={running}
                className="flex items-center justify-center gap-2 border border-red-900 bg-red-800 px-4 py-3 text-sm font-bold tracking-wider text-white uppercase hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UserMinus className="h-5 w-5" />
                Gỡ quyền
              </button>
            </div>
            {running && (
              <button
                type="button"
                onClick={() => { stopRef.current = true }}
                className="flex items-center justify-center gap-2 border border-red-300 bg-white px-4 py-2 text-xs font-bold tracking-wider text-red-700 uppercase hover:bg-red-50"
              >
                <Ban className="h-4 w-4" />
                Dừng lại
              </button>
            )}
          </div>

          {failedEmails.length > 0 && (
            <div className="border-t-4 border-red-700 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-red-900">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-bold tracking-wide uppercase">Tài khoản lỗi</span>
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

        {/* ── Phải: nhật ký ── */}
        <section className="flex min-h-0 flex-1 flex-col border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
            <ScrollText className="h-4 w-4 text-gov-navy" />
            <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">Nhật ký kiểm toán</h2>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
              <Activity className={`h-3.5 w-3.5 ${running ? 'text-gov-gold' : 'text-green-600'}`} />
              {running ? 'Đang ghi nhận' : 'Trực tiếp'}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setLogs(INIT_LOGS)}
              disabled={running}
              className="border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-semibold tracking-wider text-gray-600 uppercase hover:bg-gray-100 disabled:opacity-40"
            >
              Xóa nhật ký
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gov-navy-deep p-3 font-mono text-xs" style={{ minHeight: 260 }}>
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
      </main>
    </div>
  )
}
