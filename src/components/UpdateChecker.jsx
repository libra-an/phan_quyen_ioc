import { useEffect, useRef, useState } from 'react'
import {
  RefreshCw, Rocket, CheckCircle2, AlertTriangle, DownloadCloud, Bell, Tag,
} from 'lucide-react'

/**
 * Chuông thông báo cập nhật — chỉ hoạt động khi chạy trong Electron.
 * - Chấm đỏ trên chuông khi có bản cập nhật mới / đã tải xong
 * - Bấm chuông mở panel: kiểm tra, tải, cài đặt cập nhật
 * - Web mode (vite dev / trình duyệt): trả về null
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
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
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
          setOpen(true) // tự mở panel để người dùng thấy thông báo
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
          if (s.version) setNewVersion(s.version)
          setOpen(true)
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

  // Đóng panel khi bấm ra ngoài
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!hasUpdater) return null

  // Chấm đỏ: có bản mới hoặc đã tải xong chờ cài
  const showDot = status === 'available' || status === 'ready'

  const check = () => api.updates.check().catch(() => {})
  const download = () => api.updates.download().catch(() => {})

  /* ── Nội dung panel theo trạng thái ── */
  const renderBody = () => {
    if (status === 'checking') {
      return (
        <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm text-gov-slate">
          <RefreshCw className="h-4 w-4 shrink-0 text-gov-navy" />
          Đang kiểm tra cập nhật từ GitHub…
        </div>
      )
    }

    if (status === 'downloading') {
      return (
        <div className="px-4 py-3.5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gov-slate">
            <DownloadCloud className="h-4 w-4 text-gov-navy" />
            Đang tải bản {newVersion || 'mới'}… {percent}%
          </p>
          <div className="h-2 w-full overflow-hidden bg-gray-200">
            <div className="h-full bg-gov-gold" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )
    }

    if (status === 'ready') {
      return (
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-gov-navy">
            <Rocket className="h-4 w-4 text-gov-gold" />
            Bản {newVersion || 'mới'} đã sẵn sàng
          </p>
          <p className="mt-1 mb-3 text-xs text-gray-500">
            Cài đặt và khởi động lại ứng dụng để dùng phiên bản mới.
          </p>
          <button
            onClick={() => api.updates.install()}
            className="flex w-full items-center justify-center gap-2 border border-gov-gold bg-gov-gold px-4 py-2.5 text-xs font-bold tracking-wider text-gov-navy-deep uppercase hover:bg-gov-gold/90"
          >
            <Rocket className="h-4 w-4" />
            Cài đặt &amp; khởi động lại
          </button>
        </div>
      )
    }

    if (status === 'available') {
      return (
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-gov-navy">
            <DownloadCloud className="h-4 w-4 text-gov-gold" />
            Có bản cập nhật mới {newVersion ? `v${newVersion}` : ''}
          </p>
          <p className="mt-1 mb-3 text-xs text-gray-500">
            Bạn đang dùng v{version || '?'}. Tải xuống để nhận tính năng mới.
          </p>
          <button
            onClick={download}
            className="flex w-full items-center justify-center gap-2 border border-gov-navy bg-gov-navy px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase hover:bg-gov-navy-dark"
          >
            <DownloadCloud className="h-4 w-4" />
            Tải xuống ngay
          </button>
        </div>
      )
    }

    if (status === 'none') {
      return (
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Đã là phiên bản mới nhất
          </p>
          <p className="mt-1 mb-3 text-xs text-gray-500">
            Bạn đang dùng v{version || '?'} — không có bản mới trên GitHub.
          </p>
          <button
            onClick={check}
            className="flex w-full items-center justify-center gap-2 border border-gray-300 bg-white px-4 py-2 text-xs font-semibold tracking-wider text-gov-slate uppercase hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Kiểm tra lại
          </button>
        </div>
      )
    }

    if (status === 'error') {
      return (
        <div className="px-4 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4" />
            Lỗi khi cập nhật
          </p>
          <p className="mt-1 mb-3 max-h-16 overflow-y-auto text-xs break-words text-gray-500">
            {errorMsg}
          </p>
          <button
            onClick={check}
            className="flex w-full items-center justify-center gap-2 border border-gray-300 bg-white px-4 py-2 text-xs font-semibold tracking-wider text-gov-slate uppercase hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      )
    }

    // idle
    return (
      <div className="px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-gov-navy">
          <Bell className="h-4 w-4 text-gov-navy" />
          Cập nhật ứng dụng
        </p>
        <p className="mt-1 mb-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Tag className="h-3 w-3" />
          Phiên bản hiện tại: <span className="font-mono font-semibold">{version || '—'}</span>
        </p>
        <button
          onClick={check}
          className="flex w-full items-center justify-center gap-2 border border-gov-navy bg-gov-navy px-4 py-2.5 text-xs font-bold tracking-wider text-white uppercase hover:bg-gov-navy-dark"
        >
          <RefreshCw className="h-4 w-4" />
          Kiểm tra cập nhật
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3">

      {/* Thanh tiến trình thu nhỏ khi đang tải */}
      {status === 'downloading' && (
        <div className="hidden items-center gap-2 md:flex" title={`Đang tải cập nhật ${newVersion || ''}`}>
          <span className="text-[10px] font-semibold tracking-wider text-white/80 uppercase">
            {percent}%
          </span>
          <div className="h-1.5 w-24 overflow-hidden bg-white/15">
            <div className="h-full bg-gov-gold" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {/* Nút chuông thông báo */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Thông báo cập nhật ứng dụng"
        className={`relative flex h-9 w-9 items-center justify-center border ${
          open
            ? 'border-gov-gold/60 bg-gov-gold/15 text-gov-gold'
            : 'border-white/25 bg-white/5 text-white/70 hover:border-white/40 hover:text-white'
        }`}
      >
        <Bell className="h-4 w-4" />
        {showDot && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-gov-navy-deep bg-red-500" />
        )}
      </button>

      {/* Panel thả xuống */}
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b-2 border-gov-navy bg-gray-50 px-4 py-2.5">
            <Bell className="h-3.5 w-3.5 text-gov-navy" />
            <h3 className="text-[11px] font-bold tracking-wider text-gov-navy uppercase">
              Cập nhật ứng dụng
            </h3>
            <div className="flex-1" />
            {version && (
              <span className="font-mono text-[10px] font-semibold text-gray-500">v{version}</span>
            )}
          </div>
          {renderBody()}
        </div>
      )}
    </div>
  )
}
