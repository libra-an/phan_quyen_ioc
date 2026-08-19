import { Users, Construction, CloudDownload, ShieldCheck } from 'lucide-react'

export default function UserPermissionScreen() {
  return (
    <div className="flex flex-1 flex-col bg-gov-bg">

      {/* ══ Banner phân hệ ══ */}
      <header className="relative overflow-hidden bg-gov-navy-deep text-white">
        <div className="relative mx-auto flex max-w-[1600px] items-center gap-5 px-6 py-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gov-gold/70 bg-gov-navy">
            <Users className="h-8 w-8 text-gov-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.2em] text-white/60 uppercase">
              Bộ Tư pháp — Trung tâm dữ liệu IOC
            </p>
            <h1 className="truncate text-lg font-bold tracking-wide text-white uppercase">
              Phân quyền Người dùng vào IOC
            </h1>
            <p className="mt-0.5 text-xs text-white/50">
              Cấp và gỡ quyền truy cập hệ thống IOC cho tài khoản người dùng
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 border border-gov-gold/50 bg-gov-gold/10 px-3 py-1.5 text-[11px] font-semibold tracking-wider text-gov-gold uppercase md:flex">
            <Construction className="h-3.5 w-3.5" />
            Đang phát triển
          </span>
        </div>
        <div className="relative h-1 bg-gov-gold" />
      </header>

      {/* ══ Nội dung placeholder ══ */}
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 items-center justify-center px-6 py-10">
        <section className="w-full max-w-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b-2 border-gov-navy bg-gray-50 px-5 py-3">
            <h2 className="text-sm font-bold tracking-wider text-gov-navy uppercase">
              Mô-đun Phân quyền người dùng vào IOC
            </h2>
          </div>

          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center border-2 border-gov-gold/60 bg-gov-navy-deep">
              <Construction className="h-10 w-10 text-gov-gold" />
            </div>

            <h3 className="text-base font-bold tracking-wide text-gov-navy uppercase">
              Chức năng sắp ra mắt
            </h3>
            <p className="max-w-lg text-sm leading-relaxed text-gov-slate">
              Mô-đun này cho phép cấp hoặc gỡ quyền truy cập IOC cho từng người dùng
              (thêm tài khoản vào IOC, phân vai trò truy cập, thu hồi quyền) —
              bổ trợ cho phân quyền biểu mẫu hiện có. Giao diện và API sẽ được
              cập nhật trong phiên bản tới.
            </p>

            <div className="mt-2 flex w-full max-w-lg items-start gap-3 border-l-4 border-gov-gold bg-gov-navy/5 px-4 py-3 text-left">
              <CloudDownload className="mt-0.5 h-5 w-5 shrink-0 text-gov-navy" />
              <p className="text-xs leading-relaxed text-gov-slate">
                Khi mô-đun này hoàn tất và được phát hành trên GitHub, ứng dụng sẽ
                tự động thông báo có bản mới. Bạn bấm{' '}
                <span className="font-semibold text-gov-navy">«Kiểm tra cập nhật»</span>{' '}
                trên thanh công cụ phía trên, tải về và cài đặt để dùng chức năng mới.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t-2 border-gov-navy bg-gov-navy px-5 py-2.5 text-white">
            <span className="flex items-center gap-2 text-xs font-medium tracking-wider uppercase opacity-80">
              <ShieldCheck className="h-4 w-4 text-gov-gold" />
              Trạng thái mô-đun
            </span>
            <span className="font-mono text-xs font-bold text-gov-gold uppercase">
              Chờ phiên bản cập nhật
            </span>
          </div>
        </section>
      </main>
    </div>
  )
}
