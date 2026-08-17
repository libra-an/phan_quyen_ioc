import { useState, useRef, useEffect } from 'react'
import apiClient from '../api/axiosConfig'
import { DASHBOARD_LIST } from '../data/dashboards'

const ROLES = [
  { value: '1', label: 'Người nhập', perm: 'Perm: 1', icon: '✎' },
  { value: '2', label: 'Quản trị viên', perm: 'Perm: 2', icon: '⬡' },
]

const INIT_LOGS = [
  { time: '09:14:32', type: 'info', msg: 'System initialized. Ready for Batch Processing.' },
]

const now = () => {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

export default function PermissionScreen() {
  const [selected, setSelected] = useState([])
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('1')
  const [logs, setLogs] = useState(INIT_LOGS)
  const [isProcessing, setIsProcessing] = useState(false)
  const logEndRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  const allSelected = selected.length === DASHBOARD_LIST.length
  const toggleAll = () => setSelected(allSelected ? [] : DASHBOARD_LIST.map((d) => d.id))
  const toggleOne = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const getEmails = () => emails.split('\n').map((e) => e.trim()).filter(Boolean)

  // LOGIC API THỰC TẾ
  const execute = async (action) => {
    const emailList = getEmails()
    if (!selected.length || !emailList.length) {
      setLogs((p) => [...p, { time: now(), type: 'error', msg: '⚠ Vui lòng chọn dashboard và nhập ít nhất 1 email.' }])
      return
    }

    setIsProcessing(true)
    const roleLabel = ROLES.find((r) => r.value === role)?.label ?? role
    const verb = action === 'grant' ? 'CẤP QUYỀN' : 'GỠ QUYỀN'
    setLogs((p) => [...p, { time: now(), type: 'info', msg: `→ Bắt đầu ${verb} | ${emailList.length} email × ${selected.length} dashboard | [${roleLabel}]` }])

    for (const email of emailList) {
      setLogs((p) => [...p, { time: now(), type: 'info', msg: `  ⏳ Đang tìm kiếm ID cho: ${email}...` }])
      let foundResourceId = null

      try {
        const searchRes = await apiClient.post('/services/uaa/api/search/userInfoModel', { q: email, resource: "table_user" })
        const userData = searchRes.data?.[0]
        if (userData && userData.resourceId) {
          foundResourceId = String(userData.resourceId)
          setLogs((p) => [...p, { time: now(), type: 'success', msg: `  ✔ Tìm thấy ID: ${foundResourceId}` }])
        } else {
          setLogs((p) => [...p, { time: now(), type: 'error', msg: `  ✘ Không tìm thấy Resource ID. Bỏ qua.` }])
          continue
        }
      } catch (error) {
        setLogs((p) => [...p, { time: now(), type: 'error', msg: `  ✘ Lỗi API Search: ${error.message}` }])
        continue
      }

      const results = await Promise.all(
        selected.map(async (dashId) => {
          const dashName = DASHBOARD_LIST.find((d) => d.id === dashId)?.name || dashId
          try {
            await apiClient.post(`/services/ioc-metadata/api/assignments/${dashId}/assign`, {
              assignments: [{ assigneeId: foundResourceId, assignee: email, perm: action === 'grant' ? Number(role) : 0, permType: 0 }]
            })
            return { dashName, status: 'success' }
          } catch (err) {
            return { dashName, status: 'error', msg: err.response?.data?.message || err.message }
          }
        })
      )

      results.forEach((res) => {
        if (res.status === 'success') setLogs((p) => [...p, { time: now(), type: 'success', msg: `    ✓ ${res.dashName}` }])
        else setLogs((p) => [...p, { time: now(), type: 'error', msg: `    ✗ ${res.dashName} - ${res.msg}` }])
      })
    }
    setLogs((p) => [...p, { time: now(), type: 'success', msg: `✔ Hoàn thành. Đã xử lý ${selected.length * emailList.length} bản ghi.` }])
    setIsProcessing(false)
  }

  const logColor = (t) => t === 'success' ? '#34d399' : t === 'error' ? '#f87171' : '#475569'

  return (
    <>
      <style>{`
        /* --- CSS CHO DASHBOARD VÀNG CŨ (Đổi tên class để không bị đè) --- */
        .db-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 5px; }
        .db-item { 
          background-color: #fff9e6; border: 1px solid #f0c040; color: #8a6d00; padding: 12px; 
          border-radius: 6px; cursor: pointer; text-align: left; font-size: 13px; display: flex; 
          align-items: center; gap: 8px; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .db-item:hover { background-color: #fff3cc; transform: translateY(-1px); box-shadow: 0 4px 8px rgba(240, 192, 64, 0.4); }
        .db-item.active { background-color: #f0c040; color: #fff; font-weight: bold; border-color: #d4a017; box-shadow: 0 0 12px rgba(240, 192, 64, 0.5); }
        .db-check { font-weight: bold; font-size: 16px; }
        
        /* --- CSS CHO GIAO DIỆN DARK THEME --- */
        textarea:focus, select:focus { outline: none; }
        textarea::placeholder { color: #2d3f5a; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 99px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fade-in { animation: fadeIn 0.35s ease both; }
        @media (max-width: 860px) { .main-grid { grid-template-columns: 1fr !important; } .right-col { grid-row: auto !important; } }
      `}</style>

      {/* KHÔNG CÒN HEADER NỮA */}
      <div className="main-grid" style={{ minHeight: '100vh', padding: '24px 28px', display: 'grid', gridTemplateColumns: '400px 1fr', gridTemplateRows: 'auto 1fr', gap: 18, maxWidth: 1200, margin: '0 auto', background: '#070d1a' }}>

        {/* ── Left: Danh sách Dashboard Vàng ── */}
        <div style={{ gridRow: '1 / 3', display: 'flex', flexDirection: 'column' }}>
          <Panel className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <PanelLabel>Danh sách Biểu mẫu</PanelLabel>
              <Pill>{DASHBOARD_LIST.length}</Pill>
              <div style={{ flex: 1 }} />
              <button onClick={toggleAll} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 11px', borderRadius: 5, border: '1px solid #1e3a5f', background: 'transparent', color: '#334155', cursor: 'pointer' }}>CHỌN TẤT CẢ</button>
              <button onClick={() => setSelected([])} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 11px', borderRadius: 5, border: '1px solid #7f1d1d', background: 'transparent', color: '#f87171', cursor: 'pointer' }}>BỎ CHỌN</button>
            </div>

            <div className="db-list" style={{ flex: 1 }}>
              {DASHBOARD_LIST.map((item) => (
                <div key={item.id} className={`db-item ${selected.includes(item.id) ? 'active' : ''}`} onClick={() => toggleOne(item.id)}>
                  {selected.includes(item.id) && <span className="db-check">✓</span>}
                  {item.name}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#0a1525', border: '1px solid #0e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#334155' }}>Đã chọn</span>
              <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 12, fontWeight: 700, color: selected.length > 0 ? '#f0c040' : '#1e3a5f' }}>{selected.length} / {DASHBOARD_LIST.length}</span>
            </div>
          </Panel>
        </div>

        {/* ── Right top: Email & Actions ── */}
        <Panel className="fade-in" style={{ animationDelay: '0.05s' }}>
          <PanelLabel style={{ marginBottom: 14 }}>Nhập danh sách Email</PanelLabel>
          <textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"nguyenvana@moj.gov.vn\ntranthib@moj.gov.vn"} rows={6} style={{ width: '100%', resize: 'none', background: '#040b15', border: '1px solid #0e2d4a', borderRadius: 8, padding: '11px 13px', color: '#94a3b8', fontSize: 12, fontFamily: "'Roboto Mono', monospace", lineHeight: 1.8, transition: 'border-color 0.15s' }} onFocus={(e) => (e.target.style.borderColor = '#1d4ed8')} onBlur={(e) => (e.target.style.borderColor = '#0e2d4a')} />
          
          {getEmails().length > 0 && (<div style={{ marginTop: 6, fontSize: 11, color: '#334155', fontFamily: "'Roboto Mono', monospace" }}>{getEmails().length} email đã nhập</div>)}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Chức vụ</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {ROLES.map((r) => {
                const active = role === r.value
                return (
                  <button key={r.value} onClick={() => setRole(r.value)} style={{ flex: 1, padding: '13px 16px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${active ? '#1d4ed8' : '#0e2d4a'}`, background: active ? 'linear-gradient(160deg, #0d2554 0%, #0c1e42 100%)' : '#040b15', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, transition: 'all 0.15s', boxShadow: active ? '0 0 0 1px #1d4ed830, inset 0 1px 0 #ffffff08' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#3b82f6' : '#1e3a5f', boxShadow: active ? '0 0 8px #3b82f6aa' : 'none', transition: 'all 0.15s', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#e2e8f0' : '#334155' }}>{r.label}</span>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: "'Roboto Mono', monospace", color: active ? '#3b82f6' : '#1e3a5f', paddingLeft: 15 }}>{r.perm}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <ActionBtn label="THỰC THI CẤP QUYỀN" color1="#065f46" color2="#064e3b" accent="#34d399" icon={<ArrowUp />} onClick={() => execute('grant')} disabled={isProcessing} />
            <ActionBtn label="THỰC THI GỠ QUYỀN" color1="#7f1d1d" color2="#6b1414" accent="#f87171" icon={<ArrowDown />} onClick={() => execute('revoke')} disabled={isProcessing} />
          </div>
        </Panel>

        {/* ── Right bottom: Log ── */}
        <div className="right-col" style={{ gridRow: 2, display: 'flex', flexDirection: 'column' }}>
          <Panel className="fade-in" style={{ flex: 1, animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 5 }}>{['#f87171', '#fbbf24', '#34d399'].map((c) => (<div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.8 }} />))}</div>
              <PanelLabel>System Log</PanelLabel>
              <div style={{ flex: 1 }} />
              <button onClick={() => setLogs(INIT_LOGS)} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 4, border: '1px solid #0e2d4a', background: 'transparent', color: '#334155', cursor: 'pointer', letterSpacing: '0.04em' }}>CLEAR</button>
            </div>

            <div style={{ background: '#040b15', borderRadius: 8, border: '1px solid #0e2d4a', padding: '12px 14px', height: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {logs.map((log, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 10, color: '#1e3a5f', flexShrink: 0, paddingTop: 1 }}>{log.time}</span>
                  <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: logColor(log.type), lineHeight: 1.55 }}>{log.msg}</span>
                </div>
              ))}
              <div style={{ height: 1 }} ref={logEndRef} />
            </div>
          </Panel>
        </div>

      </div>
    </>
  )
}

/* ── Sub-components ── */
function Panel({ children, style, className }) {
  return (<div className={className} style={{ background: 'linear-gradient(160deg, #0d1b2e 0%, #0a1525 100%)', border: '1px solid #0e2d4a', borderRadius: 14, padding: '20px', ...style }}>{children}</div>)
}
function PanelLabel({ children, style }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.07em', textTransform: 'uppercase', ...style }}>{children}</span>
}
function Pill({ children }) {
  return <span style={{ fontSize: 10, fontWeight: 700, background: '#0a1525', border: '1px solid #0e2d4a', borderRadius: 20, padding: '2px 8px', color: '#334155', fontFamily: "'Roboto Mono', monospace" }}>{children}</span>
}
function ActionBtn({ label, color1, color2, accent, icon, onClick, disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} disabled={disabled} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 9, border: `1px solid ${accent}28`, background: disabled ? '#111827' : (hov ? `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)` : `linear-gradient(135deg, ${color1}aa 0%, ${color2}aa 100%)`), cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.18s', opacity: disabled ? 0.5 : 1, boxShadow: hov ? `0 0 20px ${accent}22` : 'none' }}>
      <span style={{ color: accent }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: accent }}>{label}</span>
    </button>
  )
}
function ArrowUp() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
}
function ArrowDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
}