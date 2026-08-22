/* ══════════════ Ghi log phân quyền lên Google Sheet ══════════════ */
// Gửi từng dòng đến Google Apps Script Web App.
// Dùng GET + query params + mode no-cors (simple request, không preflight CORS)
// — Apps Script nhận dữ liệu qua doGet(e) → e.parameter.

const SHEET_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbyZtpfKpWUQVg_6TQ5ugKw1nc5gtVdgNvJ6MZTn8kLCNmy63n7-zEYobHqz5gLZUoJyQQ/exec'

// Web App riêng cho log phân quyền người dùng vào IOC (trang tính mới)
const USER_SHEET_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxIQwNyL9mrG2fRfdRtSYBIWspr4t3KmoabiD9sTs9kY9wFxtcPU1iW0rZKOW_Z3tRu/exec'

const pad2 = (n) => String(n).padStart(2, '0')

const formatTime = () => {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

const queue = []
let flushing = false

function sendEntry(entry) {
  const params = new URLSearchParams(entry.params).toString()
  // Thử tối đa 3 lần (cách nhau 2s, 4s) — Web App có lúc bận/đang thay phiên bản
  // khiến request fail; no-cors không đọc được lỗi nên chỉ thử lại khi fetch ném lỗi mạng
  return (async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await fetch(`${entry.url}?${params}`, { method: 'GET', mode: 'no-cors' })
        return
      } catch (err) {
        if (i === 2) throw err
        await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)))
      }
    }
  })()
}

async function flushQueue() {
  if (flushing) return
  flushing = true
  while (queue.length) {
    const entry = queue.shift()
    try {
      await sendEntry(entry)
    } catch (err) {
      // Best-effort: lỗi mạng/Apps Script không được làm gián đoạn phân quyền
      console.error('Lỗi ghi log lên Google Sheet:', err)
    }
  }
  flushing = false
}

// Log phân quyền biểu mẫu → tab đầu tiên của trang tính cũ
// Trường: email, biểu mẫu, vai trò, thời gian + họ tên/SĐT/đơn vị/mã BM
// (Apps Script dùng các cột bổ sung này để lọc báo cáo theo biểu và theo tỉnh)
export function logPermissionGrant({ email, formName, role, fullName, phone, orgName, orgIn, bm }) {
  const params = { email, formName, role, time: formatTime() }
  if (fullName) params.fullName = fullName
  if (phone) params.phone = phone
  if (orgName) params.orgName = orgName
  if (orgIn) params.orgIn = orgIn
  if (bm) params.bm = bm
  queue.push({ url: SHEET_WEBAPP_URL, params })
  flushQueue()
}

// Log phân quyền người dùng vào IOC → trang tính mới
// Trường: email, nhóm quyền, orgIn, thao tác, tài khoản thực hiện, thời gian
export function logUserPermissionGrant({ email, group, orgIn, action, account }) {
  queue.push({
    url: USER_SHEET_WEBAPP_URL,
    params: { email, group, orgIn, action, account, time: formatTime() },
  })
  flushQueue()
}
