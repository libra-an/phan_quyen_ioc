import { useEffect, useRef, useState } from 'react'
import {
  RefreshCw, Rocket, CheckCircle2, AlertTriangle, DownloadCloud, Tag,
} from 'lucide-react'

/**
 * Trình kiểm tra cập nhật — chỉ hoạt động khi chạy trong Electron.
 * Web mode (vite dev / trình duyệt): component trả về null.
 */
export default function UpdateChecker() {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  const hasUpdater = !!api?.updates

  // idle | checking | none | available | downloading | ready | error
  const [status, setStatus] = useState('idle')
  const [version, setVersion] = useState('')
  const [newVersion, setNewVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!hasUpdater) return undefined

    api.appInfo?.().then((info) => setVersion(info?.version ?? ''))

    unsubRef.current = api.onUpdateStatus((s) => {
      switch (s.event) {
        case 'checking':
          setStatus('checking')
          break
        case 'available':
          setStatus('available')
          setNewVersion(s.version ?? '')
          setErrorMsg('')
          break
        case 'not-available':
          setStatus('none')
          break
        case 'downloading':
          setStatus('downloading')
          setPercent(Math.round(s.percent ?? 0))
          break
        case 'downloaded':
          setStatus('ready')
          setPercent(100)
          setNewVersion(s.version ?? newVersion)
          break
        case 'error':
          setStatus('error')
          setErrorMsg(s.message ?? 'Lỗi không xác định')
          break
        default:
          break
      }
    })

    // Tự kiểm tra cập nhật khi mở ứng dụng
    const timer = setTimeout(() => api.updates.check().catch(() => {}), 3000)
    return () => {
      clearTimeout(timer)
      unsubRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hasUpdater) return null

  const btnBase =
    'flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] font-semibold tracking-wider uppercase'

  /* ── Đang tải cập nhật: thanh tiến trình ── */
  if (status === 'downloading') {
    return (
      <div className="flex items-center gap-2.5" title={`Đang tải bản cập nhật ${newVersion || ''}`}>
        <DownloadCloud className="h-4 w-4 animate-none text-gov-gold" />
        <span className="text-[10px] font-semibold tracking-wider text-white/80 uppercase">
          Đang tải {percent}%
        </span>
        <div className="h-1.5 w-28 overflow-hidden bg-white/15">
          <div className="h-full bg-gov-gold" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  /* ── Tải xong: nút cài đặt & khởi động lại ── */
  if (status === 'ready') {
    return (
      <button
        onClick={() => api.updates.install()}
        className={`${btnBase} border-gov-gold bg-gov-gold font-bold text-gov-navy-deep hover:bg-gov-gold/90`}
      >
        <Rocket className="h-3.5 w-3.5" />
        Cài đặt{newVersion ? ` v${newVersion}` : ''} &amp; khởi động lại
      </button>
    )
  }

  /* ── Có bản mới: nút tải xuống ── */
  if (status === 'available') {
    return (
      <button
        onClick={() => api.updates.download().catch(() => {})}
        className={`${btnBase} border-gov-gold bg-gov-gold/15 font-bold text-gov-gold hover:bg-gov-gold/25`}
      >
        <DownloadCloud className="h-3.5 w-3.5" />
        Tải bản mới{newVersion ? ` v${newVersion}` : ''}
      </button>
    )
  }

  /* ── Đang kiểm tra ── */
  if (status === 'checking') {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-white/60 uppercase">
        <RefreshCw className="h-3.5 w-3.5" />
        Đang kiểm tra…
      </span>
    )
  }

  /* ── Đã dùng bản mới nhất ── */
  if (status === 'none') {
    return (
      <span
        className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-green-400 uppercase"
        title="Ứng dụng đã là phiên bản mới nhất"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {version ? `v${version} · mới nhất` : 'Đã mới nhất'}
      </span>
    )
  }

  /* ── Lỗi ── */
  if (status === 'error') {
    return (
      <span
        className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-red-400 uppercase"
        title={errorMsg}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Lỗi cập nhật
      </span>
    )
  }

  /* ── Mặc định: nút kiểm tra thủ công ── */
  return (
    <button
      onClick={() => api.updates.check().catch(() => {})}
      className={`${btnBase} border-white/25 bg-white/5 text-white/80 hover:border-white/40 hover:bg-white/10`}
      title="Kiểm tra bản cập nhật mới trên GitHub"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">Kiểm tra cập nhật</span>
      {version && (
        <span className="hidden items-center gap-1 font-mono text-white/50 xl:flex">
          <Tag className="h-3 w-3" />
          {version}
        </span>
      )}
    </button>
  )
}
