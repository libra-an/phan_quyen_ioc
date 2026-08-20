/* ══════════════ Ghi log phân quyền lên Google Sheet ══════════════ */
// Gửi từng dòng (email, biểu mẫu, vai trò, thời gian) đến Google Apps Script Web App.
// Dùng GET + query params + mode no-cors (simple request, không preflight CORS)
// — Apps Script nhận dữ liệu qua doGet(e) → e.parameter.

const SHEET_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbyZtpfKpWUQVg_6TQ5ugKw1nc5gtVdgNvJ6MZTn8kLCNmy63n7-zEYobHqz5gLZUoJyQQ/exec'

const pad2 = (n) => String(n).padStart(2, '0')

const formatTime = () => {
  const d = new Date()
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

const queue = []
let flushing = false

function sendEntry(entry) {
  const params = new URLSearchParams(entry).toString()
  return fetch(`${SHEET_WEBAPP_URL}?${params}`, { method: 'GET', mode: 'no-cors' })
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

export function logPermissionGrant({ email, formName, role }) {
  queue.push({ email, formName, role, time: formatTime() })
  flushQueue()
}
