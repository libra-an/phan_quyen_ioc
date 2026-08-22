import { useRef, useState } from 'react'
import apiClient from '../api/axiosConfig'
import eaccountClient from '../api/eaccountApi'
import {
  UserCheck, Search, Loader2, CheckCircle2, AlertTriangle,
  ShieldCheck, ShieldX, ListChecks, Users, ClipboardCopy, Ban,
} from 'lucide-react'

const IOC_POLICY_NAMES = ['IOC - CẤP KHU VỰC', 'IOC - Lãnh đạo cấp tỉnh']

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

// Tên rút gọn để hiển thị: "IOC - CẤP KHU VỰC" → "CẤP KHU VỰC"
const shortLabel = (name) => String(name).replace(/^IOC\s*-\s*/i, '').trim()

// Tóm tắt trạng thái từng nhóm: "CẤP KHU VỰC: ✔ · Lãnh đạo cấp tỉnh: ✘" (— = đơn vị chưa có nhóm)
const summarizeGroups = (groups) =>
  (groups ?? [])
    .map((g) => {
      const mark = g.state === 'granted' ? '✔' : g.state === 'missing' ? '—' : '✘'
      return `${shortLabel(g.name)}: ${mark}`
    })
    .join(' · ')

// Tách danh sách tài khoản: cách nhau bằng xuống dòng, dấu phẩy, chấm phẩy hoặc khoảng trắng
const parseEmails = (text) =>
  [...new Set(text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]

/**
 * Kiểm tra hàng loạt tài khoản đã vào nhóm "IOC - CẤP KHU VỰC" / "IOC - Lãnh đạo cấp tỉnh" chưa.
 * Mỗi tài khoản chạy 3 bước:
 *  1. POST /services/uaa/api/search/userInfoModel  → resourceId + orgIn
 *  2. GET  /services/uaa/api/policies?orgIn=…       → id 2 nhóm IOC của đơn vị
 *  3. GET  /services/uaa/api/user/find-user-by-id   → đối chiếu policiesList theo từng nhóm
 */
export default function IOCPermissionChecker() {
  const [text, setText] = useState('')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])
  const [copied, setCopied] = useState(false)
  const stopRef = useRef(false)

  const update = (idx, patch) =>
    setResults(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  async function checkOne(q) {
    const res1 = await apiClient.post('/services/uaa/api/search/userInfoModel', {
      q,
      resource: 'table_user',
    })
    const rows = Array.isArray(res1.data) ? res1.data : (res1.data?.content ?? res1.data?.data ?? [])
    const exact = rows.find((r) => norm(r?.email ?? r?.userName ?? r?.login ?? '') === norm(q))
    const row = exact ?? rows[0]
    if (!row) throw new Error('Không tìm thấy tài khoản')
    const resourceId = row.resourceId ?? row.id
    const orgIn = row.orgIn
    if (!resourceId || !orgIn) throw new Error('Kết quả thiếu resourceId/orgIn')

    const res2 = await eaccountClient.get('/services/uaa/api/policies', {
      params: { page: 0, size: 200, orgIn },
    })
    const prows = Array.isArray(res2.data) ? res2.data : (res2.data?.content ?? [])

    // Tìm từng nhóm IOC của đơn vị (khớp đúng tên trước, chứa tên sau để bắt biến thể)
    const groups = IOC_POLICY_NAMES.map((name) => {
      const policy =
        prows.find((p) => norm(p?.policyName ?? p?.name) === norm(name)) ??
        prows.find((p) => norm(p?.policyName ?? p?.name ?? '').includes(norm(name)))
      return { name, policy: policy ?? null }
    })
    if (groups.every((g) => !g.policy))
      throw new Error('Đơn vị chưa có nhóm "IOC - CẤP KHU VỰC" hay "IOC - Lãnh đạo cấp tỉnh"')

    const res3 = await eaccountClient.get('/services/uaa/api/user/find-user-by-id', {
      params: { id: resourceId, orgIn },
    })
    const policiesList = res3.data?.policiesList ?? []
    const hasPolicy = (policy, name) =>
      policiesList.some(
        (p) =>
          (policy && p?.id != null && String(p.id) === String(policy.id)) ||
          norm(p?.policyName ?? p?.name ?? '') === norm(name)
      )
    const detail = groups.map((g) => ({
      name: g.name,
      state: !g.policy ? 'missing' : hasPolicy(g.policy, g.name) ? 'granted' : 'denied',
    }))
    return {
      resourceId,
      orgIn,
      groups: detail,
      granted: detail.some((g) => g.state === 'granted'),
      policiesCount: policiesList.length,
    }
  }

  async function runBatch() {
    const list = parseEmails(text)
    if (!list.length || running) return

    stopRef.current = false
    setResults(list.map((email) => ({ email, state: 'pending', note: '' })))
    setRunning(true)

    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break
      update(i, { state: 'checking' })
      try {
        const r = await checkOne(list[i])
        update(i, {
          state: r.granted ? 'granted' : 'denied',
          resourceId: r.resourceId,
          orgIn: r.orgIn,
          policiesCount: r.policiesCount,
          note: r.granted ? `Đã có trong ${r.policiesCount} quyền hiện có` : `Chưa có trong ${r.policiesCount} quyền hiện có`,
        })
      } catch (e) {
        update(i, {
          state: 'error',
          note: e?.response ? `Lỗi HTTP ${e.response.status}` : (e.message ?? 'Lỗi không xác định'),
        })
      }
      // Nghỉ nhẹ giữa các tài khoản để không dồn запрос API
      if (i < list.length - 1 && !stopRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
    setRunning(false)
  }

  const stop = () => { stopRef.current = true }

  const copyResults = () => {
    const lines = results
      .filter((r) => r.state === 'granted' || r.state === 'denied' || r.state === 'error')
      .map((r) =>
        `${r.email}\t${r.state === 'granted' ? 'ĐÃ phân quyền IOC' : r.state === 'denied' ? 'CHƯA phân quyền IOC' : `LỖI: ${r.note}`}`
      )
    navigator.clipboard?.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /* ── Thống kê ── */
  const done = results.filter((r) => r.state === 'granted' || r.state === 'denied' || r.state === 'error')
  const grantedCount = results.filter((r) => r.state === 'granted').length
  const deniedCount = results.filter((r) => r.state === 'denied').length
  const errorCount = results.filter((r) => r.state === 'error').length
  const progress = results.length ? Math.round((done.length / results.length) * 100) : 0

  const kpi = (label, value, cls, Icon) => (
    <div className={`flex items-center gap-3 border px-4 py-3 ${cls}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xl leading-none font-bold">{value}</p>
        <p className="mt-1 text-[10px] font-semibold tracking-wider uppercase opacity-80">{label}</p>
      </div>
    </div>
  )

  const badge = (state) => {
    if (state === 'checking')
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gov-navy">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra
        </span>
      )
    if (state === 'granted')
      return (
        <span className="inline-flex items-center gap-1.5 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
          <ShieldCheck className="h-3.5 w-3.5" /> ĐÃ PHÂN QUYỀN
        </span>
      )
    if (state === 'denied')
      return (
        <span className="inline-flex items-center gap-1.5 bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
          <ShieldX className="h-3.5 w-3.5" /> CHƯA PHÂN QUYỀN
        </span>
      )
    if (state === 'error')
      return (
        <span className="inline-flex items-center gap-1.5 bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-700">
          <AlertTriangle className="h-3.5 w-3.5" /> LỖI
        </span>
      )
    return <span className="text-xs text-gray-400">Chờ…</span>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gov-bg">

      {/* ══ Banner ══ */}
      <header className="shrink-0 bg-gov-navy-deep px-6 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gov-gold/70 bg-gov-navy">
            <UserCheck className="h-7 w-7 text-gov-gold" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-wide uppercase">Kiểm tra tài khoản IOC</h1>
            <p className="mt-0.5 truncate text-xs tracking-wider text-white/60 uppercase">
              FPT — Trung tâm dữ liệu IOC
            </p>
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-2 border border-gov-gold/40 bg-gov-gold/10 px-3 py-1.5 md:flex">
            <ShieldCheck className="h-4 w-4 text-gov-gold" />
            <span className="text-[10px] font-bold tracking-wider text-gov-gold uppercase">
              Chỉ đọc — không thay đổi dữ liệu
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
                Mỗi tài khoản một dòng
              </span>
            </div>
            <div className="px-4 py-4">
              <form
                onSubmit={(e) => { e.preventDefault(); runBatch() }}
                className="flex flex-col gap-3 lg:flex-row"
              >
                <textarea
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={running}
                  placeholder={'aaa@moj.gov.vn\nbbb@moj.gov.vn\nccc@moj.gov.vn'}
                  className="min-h-[110px] flex-1 resize-y border border-gray-300 bg-white px-3 py-2.5 font-mono text-sm text-gov-slate placeholder:text-gray-400 focus:border-gov-navy focus:outline-none disabled:bg-gray-100"
                />
                <div className="flex shrink-0 flex-col gap-2 lg:w-44">
                  <button
                    type="submit"
                    disabled={running || !text.trim()}
                    className="flex items-center justify-center gap-2 border border-gov-navy bg-gov-navy px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-colors hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {running
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
                    Kiểm tra
                  </button>
                  {running && (
                    <button
                      type="button"
                      onClick={stop}
                      className="flex items-center justify-center gap-2 border border-red-300 bg-white px-4 py-2 text-xs font-bold tracking-wider text-red-700 uppercase hover:bg-red-50"
                    >
                      <Ban className="h-4 w-4" />
                      Dừng lại
                    </button>
                  )}
                  {!running && text.trim() && (
                    <p className="text-center text-[11px] text-gray-500">
                      {parseEmails(text).length} tài khoản sẽ được kiểm tra
                    </p>
                  )}
                </div>
              </form>
              <p className="mt-3 border-l-2 border-gov-gold bg-gov-gold/5 px-3 py-2 text-xs leading-relaxed text-gov-slate">
                Mỗi tài khoản tra cứu 3 bước: tìm tài khoản → tìm quyền «{IOC_POLICY_NAMES.join('» / «')}» theo đơn vị →
                đối chiếu danh sách quyền. Tài khoản trùng lặp sẽ tự loại bỏ. Chức năng chỉ đọc, không phân quyền hay thu hồi.
              </p>
            </div>
          </section>

          {/* Tiến độ + thống kê */}
          {results.length > 0 && (
            <section className="flex flex-col gap-4">
              {running && (
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden bg-gray-200">
                    <div
                      className="h-full bg-gov-gold transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-bold text-gov-navy">
                    {done.length}/{results.length}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-gov-navy lg:grid-cols-4">
                {kpi('Tổng tài khoản', results.length, 'border-gov-navy/20 bg-white text-gov-navy', Users)}
                {kpi('Đã phân quyền', grantedCount, 'border-green-300 bg-green-50 text-green-800', ShieldCheck)}
                {kpi('Chưa phân quyền', deniedCount, 'border-red-300 bg-red-50 text-red-800', ShieldX)}
                {kpi('Lỗi tra cứu', errorCount, 'border-gray-300 bg-gray-100 text-gray-700', AlertTriangle)}
              </div>
            </section>
          )}

          {/* Bảng kết quả */}
          {results.length > 0 && (
            <section className="border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b-2 border-gov-navy bg-gray-50 px-4 py-3">
                <ListChecks className="h-4 w-4 text-gov-navy" />
                <h2 className="text-xs font-bold tracking-wider text-gov-navy uppercase">
                  Kết quả kiểm tra
                </h2>
                {!running && done.length > 0 && (
                  <button
                    type="button"
                    onClick={copyResults}
                    className="ml-auto flex items-center gap-1.5 border border-gray-300 px-2.5 py-1 text-[10px] font-bold tracking-wider text-gov-slate uppercase hover:bg-gray-100"
                  >
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    {copied ? 'Đã copy' : 'Copy kết quả'}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-[10px] tracking-wider text-gray-500 uppercase">
                      <th className="px-4 py-2.5 font-semibold">#</th>
                      <th className="px-4 py-2.5 font-semibold">Tài khoản</th>
                      <th className="px-4 py-2.5 font-semibold">Kết quả</th>
                      <th className="hidden px-4 py-2.5 font-semibold lg:table-cell">resourceId</th>
                      <th className="hidden px-4 py-2.5 font-semibold xl:table-cell">orgIn</th>
                      <th className="px-4 py-2.5 font-semibold">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map((r, i) => (
                      <tr key={r.email} className={r.state === 'granted' ? 'bg-green-50/50' : r.state === 'denied' ? 'bg-red-50/40' : ''}>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-gov-slate" title={r.email}>
                          {r.email}
                        </td>
                        <td className="px-4 py-2.5">{badge(r.state)}</td>
                        <td className="hidden px-4 py-2.5 font-mono text-xs text-gray-500 lg:table-cell">
                          {r.resourceId ?? '—'}
                        </td>
                        <td className="hidden max-w-[200px] truncate px-4 py-2.5 font-mono text-xs text-gray-500 xl:table-cell" title={r.orgIn}>
                          {r.orgIn ?? '—'}
                        </td>
                        <td className="max-w-[240px] truncate px-4 py-2.5 text-xs text-gray-500" title={r.note}>
                          {r.note || '—'}
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
