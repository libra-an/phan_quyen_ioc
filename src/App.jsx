import { useState } from 'react'
import { FileText, Users, Landmark, UserCheck } from 'lucide-react'
import PermissionScreen from './components/PermissionScreen'
import UserPermissionScreen from './components/UserPermissionScreen'
import IOCPermissionChecker from './components/IOCPermissionChecker'
import UpdateChecker from './components/UpdateChecker'
import './index.css'

const TABS = [
  { id: 'forms', label: 'Phân quyền biểu mẫu', icon: FileText },
  { id: 'users', label: 'Phân quyền người dùng IOC', icon: Users },
  { id: 'check', label: 'Kiểm tra tài khoản IOC', icon: UserCheck },
]

function App() {
  const [tab, setTab] = useState('forms')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gov-bg">

      {/* ══ Thanh công cụ ứng dụng: logo + tab + cập nhật ══ */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gov-gold/40 bg-gov-navy-deep px-4 py-2.5 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-gov-gold/70 bg-gov-navy">
            <Landmark className="h-5 w-5 text-gov-gold" />
          </div>
          <div className="hidden min-w-0 xl:block">
            <p className="text-[10px] font-medium tracking-[0.18em] text-white/60 uppercase">
              Trung tâm dữ liệu IOC
            </p>
            <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
              Hệ thống Quản lý Phân quyền
            </p>
          </div>
        </div>

        <div className="mx-1 h-8 w-px bg-white/15" />

        <nav className="flex min-w-0 flex-wrap items-center gap-1.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 border px-3.5 py-2 text-[11px] font-semibold tracking-wider uppercase ${
                  active
                    ? 'border-gov-gold bg-gov-gold/15 text-gov-gold'
                    : 'border-transparent text-white/70 hover:border-white/20 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        <UpdateChecker />
      </div>

      {/* ══ Nội dung tab đang chọn ══ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'forms' ? <PermissionScreen />
          : tab === 'check' ? <IOCPermissionChecker />
          : <UserPermissionScreen />}
      </div>

      <footer className="shrink-0 border-t border-white/10 bg-gov-navy-deep px-6 py-2 text-center text-[10px] tracking-wider text-white/40 uppercase">
        © 2026 Trung tâm dữ liệu IOC — Hệ thống quản lý phân quyền · Mọi thao tác được ghi nhật ký kiểm toán
      </footer>
    </div>
  )
}

export default App
