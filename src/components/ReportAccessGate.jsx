import { useState, useRef, useEffect } from 'react'
import { Lock, KeyRound, ShieldCheck, ChevronLeft, AlertTriangle } from 'lucide-react'
import { REPORT_ACCESS_CODE } from '../data/accessConfig'

const MAX_FAILS = 5
const LOCKOUT_S = 30

/* ══════════════ Cửa kiểm tra mã khóa trước khi vào màn biểu đồ báo cáo ══════════════
   Nhập sai 5 lần liên tiếp → tạm khóa 30 giây chống dò mã */
export default function ReportAccessGate({ onUnlock, onBack }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [fails, setFails] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Đếm ngược giây còn lại của thời gian tạm khóa
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const submit = () => {
    if (cooldown > 0) return
    if (code.trim() === REPORT_ACCESS_CODE) {
      sessionStorage.setItem('report_unlocked', '1')
      onUnlock()
      return
    }
    const next = fails + 1
    setFails(next)
    setCode('')
    inputRef.current?.focus()
    if (next >= MAX_FAILS) {
      setCooldown(LOCKOUT_S)
      setFails(0)
      setError(`Nhập sai ${MAX_FAILS} lần liên tiếp — tạm khóa ${LOCKOUT_S} giây.`)
    } else {
      setError('Mã khóa không đúng. Vui lòng kiểm tra lại.')
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gov-bg px-6">
      <div className="w-[440px] max-w-full border border-gov-navy bg-white shadow-2xl">

        <div className="flex items-center gap-3 border-b-2 border-gov-gold bg-gov-navy px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-gov-gold/70">
            <Lock className="h-5 w-5 text-gov-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.2em] text-white/60 uppercase">
              Khu vực hạn chế
            </p>
            <h2 className="truncate text-sm font-bold tracking-wide text-white uppercase">
              Phân quyền biểu đồ báo cáo
            </h2>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed text-gov-slate">
            Chức năng này được bảo vệ bằng mã khóa truy cập. Chỉ người sở hữu mã khóa
            mới có thể sử dụng.
          </p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-gray-600 uppercase">
              Mã khóa truy cập
            </label>
            <div className="flex items-center gap-2 border border-gray-300 bg-gray-50 px-3 py-2.5 focus-within:border-gov-navy focus-within:ring-2 focus-within:ring-gov-navy/20">
              <KeyRound className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                disabled={cooldown > 0}
                placeholder="Nhập mã khóa..."
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-transparent font-mono text-sm tracking-widest text-gov-slate outline-none placeholder:tracking-normal placeholder:text-gray-400 disabled:opacity-50"
              />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 border-l-4 border-red-700 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold tracking-wider text-gov-slate uppercase hover:bg-gray-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Quay lại
            </button>
            <button
              onClick={submit}
              disabled={cooldown > 0 || !code.trim()}
              className="flex flex-1 items-center justify-center gap-2 border border-gov-navy-dark bg-gov-navy px-4 py-2.5 text-sm font-bold tracking-wider text-white uppercase hover:bg-gov-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ShieldCheck className="h-4 w-4" />
              {cooldown > 0 ? `Tạm khóa (${cooldown}s)` : 'Mở khóa'}
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-5 py-2.5 text-[11px] text-gray-500">
          Mỗi lần khởi động ứng dụng cần nhập lại mã khóa.
        </div>
      </div>
    </div>
  )
}
