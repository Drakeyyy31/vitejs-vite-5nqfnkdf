import { useState, useEffect, useMemo } from 'react';

// ── CONFIG & LEGACY DATA ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026";
const BREAK_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const SHIFT_TARGET_MS = 8 * 60 * 60 * 1000; // 8 hours

const getLegacyPay = (name) => {
  const seniors = ['Eli', 'Mary', 'Robert', 'Porsha', 'Gio', 'Giah', 'Art', 'Jon', 'Koko', 'Hawuki', 'John', 'Eunice'];
  if (['Egar', 'Drakeyyy'].includes(name)) return 600;
  if (['Lasgna', 'Sinclair'].includes(name)) return 400;
  if (seniors.includes(name)) return 360;
  return 260;
};

const platformColors = {
  META: '#3b82f6', KANAL: '#eab308', Helpwave: '#f97316',
  Chargeback: '#f43f5e', DMCA: '#94a3b8', MANAGER: '#a78bfa'
};

const fmt = (ms) => {
  if (!ms || ms < 0) return '00:00:00';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const fmtShort = (ms) => {
  if (!ms || ms < 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const STATUS = {
  ACTIVE: { label: 'ON SHIFT', color: '#10b981', pulse: true },
  BREAK: { label: 'ON BREAK', color: '#f59e0b', pulse: true },
  OUT: { label: 'CLOCKED OUT', color: '#6b7280', pulse: false },
  PENDING: { label: 'NOT IN', color: '#374151', pulse: false },
};

// Derive attendance status for an agent from their logs today
const getAgentStatus = (logs, agentName, records, now) => {
  const todayLogs = logs
    .filter(l => l.agent === agentName)
    .filter(l => {
      const d = new Date(l.timestamp);
      const today = new Date(); today.setHours(0,0,0,0);
      return d >= today;
    })
    .sort((a,b) => a.timestamp - b.timestamp);

  const rec = records[agentName] || {};

  if (rec.onBreak) return STATUS.BREAK;
  if (rec.clockIn && !rec.clockedOut) return STATUS.ACTIVE;

  // Derive from logs if records not in state
  const lastLog = todayLogs[todayLogs.length - 1];
  if (!lastLog) return STATUS.PENDING;
  if (lastLog.action === 'clockIn') return STATUS.ACTIVE;
  if (lastLog.action === 'breakStart') return STATUS.BREAK;
  if (lastLog.action === 'clockOut') return STATUS.OUT;
  return STATUS.PENDING;
};

export default function AftersalesApp() {
  const [view, setView] = useState('landing');
  const [mgrTab, setMgrTab] = useState('attendance');
  const [dynamicAgents, setDynamicAgents] = useState([]);
  const [globalLogs, setGlobalLogs] = useState([]);
  const [records, setRecords] = useState({});
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [regForm, setRegForm] = useState({ name: '', pin: '', platform: 'META' });
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [approvalSalary, setApprovalSalary] = useState('');
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
  const [reportRange, setReportRange] = useState('today');
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(SHEETS_WEBHOOK);
      const data = await response.json();
      const users = data.filter(item => item.action === 'USER_REGISTER' || item.action === 'USER_APPROVE');
      const logs = data.filter(item => !item.action?.startsWith('USER_')).map(l => ({
        ...l, timestamp: Number(l.timestamp) || new Date(`${l.date} ${l.time}`).getTime()
      })).sort((a,b) => b.timestamp - a.timestamp);

      const agentMap = {};
      users.forEach(u => {
        try {
          const details = JSON.parse(u.device);
          agentMap[u.agent.toLowerCase()] = { ...details, name: u.agent, status: u.action === 'USER_APPROVE' ? 'active' : 'pending' };
        } catch (e) {}
      });
      setDynamicAgents(Object.values(agentMap));
      setGlobalLogs(logs);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [view]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const userRec = loggedInUser ? (records[loggedInUser.name] || {}) : {};
  const bUsed = (userRec.breakUsedMs || 0) + (userRec.onBreak ? (now - userRec.breakStart) : 0);
  const shiftElapsed = userRec.clockIn ? (now - userRec.clockIn) : 0;
  const netWork = shiftElapsed - bUsed;
  const breakOverLimit = bUsed > BREAK_LIMIT_MS;
  const breakPct = Math.min((bUsed / BREAK_LIMIT_MS) * 100, 100);
  const shiftPct = Math.min((netWork / SHIFT_TARGET_MS) * 100, 100);

  const filteredLogs = useMemo(() => {
    let startTs, endTs;
    const today = new Date(); today.setHours(0,0,0,0);
    if (reportRange === 'today') { startTs = today.getTime(); endTs = today.getTime() + 86400000; }
    else if (reportRange === 'yesterday') { startTs = today.getTime() - 86400000; endTs = today.getTime(); }
    else { startTs = new Date(customStart).getTime(); endTs = new Date(customEnd).getTime() + 86400000; }
    return globalLogs.filter(l => l.timestamp >= startTs && l.timestamp <= endTs);
  }, [globalLogs, reportRange, customStart, customEnd]);

  // Per-agent attendance summary for manager view
  const agentAttendanceSummary = useMemo(() => {
    return dynamicAgents.filter(a => a.status === 'active').map(agent => {
      const today = new Date(); today.setHours(0,0,0,0);
      const todayLogs = globalLogs
        .filter(l => l.agent === agent.name && l.timestamp >= today.getTime())
        .sort((a,b) => a.timestamp - b.timestamp);

      let clockInTime = null, clockOutTime = null, totalBreak = 0, breakStart = null;
      todayLogs.forEach(l => {
        if (l.action === 'clockIn' && !clockInTime) clockInTime = l.timestamp;
        if (l.action === 'breakStart') breakStart = l.timestamp;
        if (l.action === 'breakEnd' && breakStart) { totalBreak += l.timestamp - breakStart; breakStart = null; }
        if (l.action === 'clockOut') clockOutTime = l.timestamp;
      });

      const rec = records[agent.name] || {};
      const activeBrk = rec.onBreak ? (now - (rec.breakStart || now)) : 0;
      const totalBreakMs = totalBreak + (rec.breakUsedMs || 0) + activeBrk;
      const shiftMs = clockInTime ? ((clockOutTime || now) - clockInTime) : 0;
      const netMs = Math.max(0, shiftMs - totalBreakMs);
      const status = getAgentStatus(globalLogs, agent.name, records, now);

      return {
        ...agent,
        clockInTime,
        clockOutTime,
        totalBreakMs,
        shiftMs,
        netMs,
        status,
        todayLogs,
        breakOverLimit: totalBreakMs > BREAK_LIMIT_MS,
        shiftPct: Math.min((netMs / SHIFT_TARGET_MS) * 100, 100),
      };
    });
  }, [dynamicAgents, globalLogs, records, now]);

  const getAuditProof = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      return `${data.city}, ${data.country_code} | IP: ${data.ip} | ${navigator.platform}`;
    } catch (e) { return `Audit Bypass | ${navigator.platform}`; }
  };

  const handleRegister = async () => {
    setError('');
    if (!regForm.name || regForm.pin.length < 4) return setError("Min 4 characters for PIN.");
    setIsLoading(true);
    const isMgr = regForm.platform === 'MANAGER' && activationKeyInput === MANAGER_ACTIVATION_KEY;
    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) {
      setIsLoading(false); return setError("Invalid Manager Key.");
    }
    const loc = await getAuditProof();
    const finalData = { ...regForm, role: isMgr ? 'Manager' : 'Agent', salary: isMgr ? getLegacyPay(regForm.name) : 0 };
    const payload = { date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), action: isMgr ? 'USER_APPROVE' : 'USER_REGISTER', agent: regForm.name.trim(), device: JSON.stringify({ ...finalData, loc }), timestamp: now };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess(isMgr ? "Manager Activated!" : "Registration Sent! Awaiting approval.");
    if (isMgr) { setLoggedInUser({ ...finalData, status: 'active' }); setView('mgrPortal'); }
    else { setTimeout(() => setView('landing'), 2500); }
    setIsLoading(false);
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const ts = Date.now();
    const proof = await getAuditProof();
    let next = { ...userRec };
    if (type === 'clockIn') next = { clockIn: ts, breakUsedMs: 0 };
    if (type === 'breakStart') { next.onBreak = true; next.breakStart = ts; }
    if (type === 'breakEnd') { next.onBreak = false; next.breakUsedMs = (next.breakUsedMs || 0) + (ts - next.breakStart); }
    if (type === 'clockOut') { next = { clockedOut: true }; }
    setRecords({ ...records, [loggedInUser.name]: next });

    const entry = { date: new Date(ts).toLocaleDateString(), time: new Date(ts).toLocaleTimeString(), action: type, agent: loggedInUser.name, device: proof, timestamp: ts };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    await fetchData();
    setIsLoading(false);
  };

  const exportAttendanceCSV = () => {
    const rows = [['Agent','Platform','Clock In','Clock Out','Total Break','Net Work','Shift %','Status']];
    agentAttendanceSummary.forEach(a => {
      rows.push([
        a.name, a.platform,
        a.clockInTime ? new Date(a.clockInTime).toLocaleTimeString() : '-',
        a.clockOutTime ? new Date(a.clockOutTime).toLocaleTimeString() : '-',
        fmtShort(a.totalBreakMs),
        fmtShort(a.netMs),
        `${a.shiftPct.toFixed(0)}%`,
        a.status.label,
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  // Agent timeline for detail view
  const getAgentTimeline = (agentName) => {
    const today = new Date(); today.setHours(0,0,0,0);
    return globalLogs
      .filter(l => l.agent === agentName && l.timestamp >= today.getTime())
      .sort((a,b) => a.timestamp - b.timestamp);
  };

  const actionLabel = { clockIn: '🟢 Clock In', clockOut: '🔴 Clock Out', breakStart: '🟡 Break Start', breakEnd: '🔵 Break End' };

  return (
    <div className="shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Bebas+Neue&display=swap');
        :root {
          --bg: #040610;
          --surface: #0b0f1e;
          --card: #0f1525;
          --border: #1e2d45;
          --border-glow: #1e4d8c;
          --blue: #2979ff;
          --cyan: #00e5ff;
          --green: #00e676;
          --red: #ff1744;
          --amber: #ffab00;
          --purple: #d500f9;
          --text: #e8eaf0;
          --muted: #4a5578;
          --font: 'IBM Plex Mono', monospace;
          --display: 'Bebas Neue', sans-serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: var(--font); }
        .shell { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 0 20px 60px; width: 100%; max-width: 1500px; margin: 0 auto; }

        /* HEADER */
        .top-bar { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 24px 0 16px; border-bottom: 1px solid var(--border); margin-bottom: 40px; }
        .logo { font-family: var(--display); font-size: clamp(22px, 4vw, 36px); letter-spacing: 4px; color: var(--cyan); text-shadow: 0 0 20px rgba(0,229,255,0.4); }
        .logo span { color: var(--text); }
        .top-clock { font-size: 13px; color: var(--muted); text-align: right; line-height: 1.6; }

        /* LOADING BAR */
        .loading-bar { position: fixed; top: 0; left: 0; width: 100%; height: 2px; background: linear-gradient(90deg, var(--blue), var(--cyan)); z-index: 9999; animation: scan 1.2s linear infinite; }
        @keyframes scan { 0% { transform: scaleX(0); transform-origin: left; } 50% { transform: scaleX(1); transform-origin: left; } 51% { transform: scaleX(1); transform-origin: right; } 100% { transform: scaleX(0); transform-origin: right; } }

        /* CARDS */
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
        .card-glow { box-shadow: 0 0 0 1px var(--border-glow), 0 8px 32px rgba(41,121,255,0.1); }

        /* BUTTONS */
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 24px; border-radius: 10px; border: none; font-family: var(--font); font-size: 12px; font-weight: 700; letter-spacing: 2px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; }
        .btn:hover { transform: translateY(-2px); }
        .btn-primary { background: var(--blue); color: #fff; box-shadow: 0 4px 20px rgba(41,121,255,0.4); }
        .btn-primary:hover { background: #448aff; box-shadow: 0 6px 28px rgba(41,121,255,0.6); }
        .btn-green { background: var(--green); color: #000; box-shadow: 0 4px 20px rgba(0,230,118,0.3); }
        .btn-green:hover { box-shadow: 0 6px 28px rgba(0,230,118,0.5); }
        .btn-red { background: var(--red); color: #fff; box-shadow: 0 4px 20px rgba(255,23,68,0.3); }
        .btn-red:hover { box-shadow: 0 6px 28px rgba(255,23,68,0.5); }
        .btn-amber { background: var(--amber); color: #000; }
        .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
        .btn-ghost:hover { border-color: var(--blue); color: var(--text); }
        .btn-tab { background: transparent; color: var(--muted); border-bottom: 2px solid transparent; border-radius: 0; padding: 12px 20px; }
        .btn-tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
        .btn-full { width: 100%; }

        /* INPUTS */
        .inp { background: rgba(0,0,0,0.4); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; width: 100%; font-family: var(--font); font-size: 14px; outline: none; transition: border-color 0.2s; }
        .inp:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(41,121,255,0.15); }
        .inp-label { font-size: 11px; letter-spacing: 2px; color: var(--muted); margin-bottom: 8px; display: block; }

        /* STATUS BADGE */
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
        .badge-dot { width: 7px; height: 7px; border-radius: 50%; }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* PROGRESS BARS */
        .progress-wrap { margin: 8px 0; }
        .progress-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 6px; }
        .progress-track { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width 1s linear; }

        /* GRID */
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 24px; width: 100%; }
        .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; width: 100%; }

        /* STAT BOX */
        .stat { padding: 20px 24px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
        .stat-val { font-family: var(--display); font-size: 42px; letter-spacing: 2px; line-height: 1; }
        .stat-label { font-size: 11px; letter-spacing: 2px; color: var(--muted); margin-top: 6px; }

        /* AGENT CARD */
        .agent-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; border-radius: 8px; padding: 14px 12px; }
        .agent-row:hover { background: rgba(41,121,255,0.06); }
        .agent-avatar { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0; }
        .agent-info { flex: 1; min-width: 0; }
        .agent-name { font-weight: 700; font-size: 14px; }
        .agent-dept { font-size: 11px; color: var(--muted); letter-spacing: 1px; margin-top: 2px; }
        .agent-meta { text-align: right; font-size: 11px; color: var(--muted); }
        .agent-time { font-size: 18px; font-weight: 700; color: var(--cyan); }

        /* TIMELINE */
        .timeline { position: relative; padding-left: 24px; }
        .timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 1px; background: var(--border); }
        .tl-item { position: relative; padding: 10px 0; }
        .tl-dot { position: absolute; left: -21px; top: 14px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--bg); }
        .tl-time { font-size: 11px; color: var(--muted); }
        .tl-action { font-size: 13px; font-weight: 600; margin-top: 2px; }

        /* TABS */
        .tab-bar { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 28px; width: 100%; gap: 4px; }

        /* CENTERED */
        .center-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; width: 100%; max-width: 440px; gap: 16px; padding: 40px 0; }

        /* MODAL OVERLAY */
        .overlay { position: fixed; inset: 0; background: rgba(4,6,16,0.85); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal { background: var(--card); border: 1px solid var(--border-glow); border-radius: 20px; padding: 32px; width: 100%; max-width: 520px; max-height: 85vh; overflow-y: auto; }

        /* BIG TIMER */
        .big-timer { font-family: var(--display); font-size: clamp(56px, 12vw, 96px); letter-spacing: 4px; line-height: 1; }

        /* ALERT */
        .alert { padding: 12px 18px; border-radius: 10px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
        .alert-warn { background: rgba(255,171,0,0.12); border: 1px solid rgba(255,171,0,0.3); color: var(--amber); }
        .alert-success { background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.3); color: var(--green); }
        .alert-danger { background: rgba(255,23,68,0.1); border: 1px solid rgba(255,23,68,0.3); color: var(--red); }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        /* TABLE */
        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th { text-align: left; padding: 12px 16px; font-size: 11px; letter-spacing: 2px; color: var(--muted); border-bottom: 1px solid var(--border); background: var(--surface); }
        .data-table td { padding: 14px 16px; border-bottom: 1px solid rgba(30,45,69,0.6); vertical-align: middle; }
        .data-table tr:hover td { background: rgba(41,121,255,0.04); }
      `}</style>

      {isLoading && <div className="loading-bar" />}

      {/* TOP BAR */}
      <div className="top-bar">
        <div className="logo">AFTER<span>SALES</span></div>
        <div className="top-clock">
          <div style={{ fontSize: '22px', fontFamily: 'Bebas Neue', letterSpacing: '3px', color: 'var(--text)' }}>
            {new Date(now).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div>{new Date(now).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {/* LANDING */}
      {view === 'landing' && (
        <div className="center-wrap">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: 'clamp(14px, 3vw, 18px)', color: 'var(--muted)', letterSpacing: '3px' }}>WORKFORCE ATTENDANCE SYSTEM</div>
            <div style={{ fontSize: '11px', color: 'var(--border-glow)', marginTop: '8px', letterSpacing: '2px' }}>v2.0 — LIVE TRACKING ENABLED</div>
          </div>
          <button className="btn btn-green btn-full" onClick={() => setView('login')}>▶ SIGN IN</button>
          <button className="btn btn-ghost btn-full" onClick={() => setView('register')}>CREATE ACCOUNT</button>
        </div>
      )}

      {/* REGISTER */}
      {view === 'register' && (
        <div className="center-wrap">
          <div className="card card-glow" style={{ width: '100%' }}>
            <h2 style={{ fontFamily: 'var(--display)', letterSpacing: '3px', fontSize: '28px', marginBottom: '28px', color: 'var(--cyan)' }}>ONBOARDING</h2>
            <label className="inp-label">USERNAME</label>
            <input className="inp" style={{ marginBottom: '16px' }} placeholder="Your display name" onChange={e => setRegForm({...regForm, name: e.target.value})} />
            <label className="inp-label">PASSWORD</label>
            <input className="inp" style={{ marginBottom: '16px' }} placeholder="Min 4 characters" type="password" onChange={e => setRegForm({...regForm, pin: e.target.value})} />
            <label className="inp-label">DEPARTMENT</label>
            <select className="inp" style={{ marginBottom: regForm.platform === 'MANAGER' ? '16px' : '24px' }} onChange={e => setRegForm({...regForm, platform: e.target.value})}>
              {Object.keys(platformColors).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {regForm.platform === 'MANAGER' && (
              <>
                <label className="inp-label">MANAGER ACTIVATION KEY</label>
                <input className="inp" style={{ marginBottom: '24px' }} type="password" placeholder="Enter key" onChange={e => setActivationKeyInput(e.target.value)} />
              </>
            )}
            {error && <div className="alert alert-danger" style={{ marginBottom: '16px' }}>⚠ {error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: '16px' }}>✓ {success}</div>}
            <button className="btn btn-green btn-full" onClick={handleRegister}>REGISTER</button>
            <button className="btn btn-ghost btn-full" style={{ marginTop: '12px' }} onClick={() => setView('landing')}>← BACK</button>
          </div>
        </div>
      )}

      {/* LOGIN */}
      {view === 'login' && (
        <div className="center-wrap">
          <div className="card card-glow" style={{ width: '100%' }}>
            <h2 style={{ fontFamily: 'var(--display)', letterSpacing: '3px', fontSize: '28px', marginBottom: '28px', color: 'var(--cyan)' }}>SECURE ACCESS</h2>
            <label className="inp-label">USERNAME</label>
            <input className="inp" style={{ marginBottom: '16px' }} placeholder="Your name" onChange={e => setLoginForm({...loginForm, name: e.target.value})} />
            <label className="inp-label">PASSWORD</label>
            <input className="inp" style={{ marginBottom: '24px' }} placeholder="PIN / Password" type="password" onChange={e => setLoginForm({...loginForm, pin: e.target.value})} />
            {error && <div className="alert alert-danger" style={{ marginBottom: '16px' }}>⚠ {error}</div>}
            <button className="btn btn-primary btn-full" onClick={() => {
              const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
              if (!user) return setError("Invalid credentials.");
              if (user.status === 'pending') return setError("Account pending approval.");
              setLoggedInUser(user); setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
            }}>ENTER WORKSPACE</button>
            <button className="btn btn-ghost btn-full" style={{ marginTop: '12px' }} onClick={() => setView('landing')}>← BACK</button>
          </div>
        </div>
      )}

      {/* AGENT PORTAL */}
      {view === 'agentPortal' && loggedInUser && (() => {
        const agentStatus = userRec.onBreak ? STATUS.BREAK : userRec.clockIn ? STATUS.ACTIVE : STATUS.PENDING;
        const canClockIn = !userRec.clockIn;
        const canBreak = userRec.clockIn && !userRec.onBreak && !userRec.clockedOut;
        const canResume = userRec.onBreak;
        const canClockOut = userRec.clockIn && !userRec.onBreak && !userRec.clockedOut;

        return (
          <div className="grid-2" style={{ width: '100%', paddingTop: '20px' }}>
            {/* LEFT — Live Status */}
            <div className="card card-glow" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--muted)' }}>SIGNED IN AS</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text)', marginTop: '4px' }}>{loggedInUser.name}</div>
                  <div style={{ fontSize: '12px', color: platformColors[loggedInUser.platform] || 'var(--muted)', marginTop: '2px', letterSpacing: '1px' }}>◆ {loggedInUser.platform}</div>
                </div>
                <div className="badge" style={{ background: `${agentStatus.color}22`, color: agentStatus.color, border: `1px solid ${agentStatus.color}55` }}>
                  <div className={`badge-dot ${agentStatus.pulse ? 'pulse' : ''}`} style={{ background: agentStatus.color }} />
                  {agentStatus.label}
                </div>
              </div>

              {/* Big Timer */}
              {userRec.clockIn && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '11px', letterSpacing: '3px', color: 'var(--muted)', marginBottom: '8px' }}>
                    {userRec.onBreak ? 'BREAK TIME' : 'NET WORK TIME'}
                  </div>
                  <div className="big-timer" style={{ color: userRec.onBreak ? 'var(--amber)' : 'var(--cyan)' }}>
                    {userRec.onBreak ? fmt(now - userRec.breakStart) : fmt(netWork)}
                  </div>
                  {userRec.clockIn && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>
                      Shift started {new Date(userRec.clockIn).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              )}

              {/* Progress Meters */}
              {userRec.clockIn && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="progress-wrap">
                    <div className="progress-label">
                      <span>SHIFT PROGRESS</span>
                      <span style={{ color: shiftPct >= 100 ? 'var(--green)' : 'var(--text)' }}>{fmt(netWork)} / 8:00:00</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${shiftPct}%`, background: shiftPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--blue), var(--cyan))' }} />
                    </div>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-label">
                      <span style={{ color: breakOverLimit ? 'var(--red)' : 'inherit' }}>BREAK USED</span>
                      <span style={{ color: breakOverLimit ? 'var(--red)' : 'var(--text)' }}>{fmt(bUsed)} / 1:00:00</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${breakPct}%`, background: breakOverLimit ? 'var(--red)' : 'var(--amber)' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {breakOverLimit && (
                <div className="alert alert-danger">⚠ Break limit exceeded by {fmtShort(bUsed - BREAK_LIMIT_MS)}</div>
              )}
              {shiftPct >= 100 && !userRec.clockedOut && (
                <div className="alert alert-success">✓ 8-hour shift target reached!</div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button className="btn btn-green" disabled={!canClockIn} onClick={() => handleAction('clockIn')}
                  style={{ opacity: canClockIn ? 1 : 0.3, cursor: canClockIn ? 'pointer' : 'not-allowed' }}>
                  ▶ CLOCK IN
                </button>
                <button className="btn btn-red" disabled={!canClockOut} onClick={() => handleAction('clockOut')}
                  style={{ opacity: canClockOut ? 1 : 0.3, cursor: canClockOut ? 'pointer' : 'not-allowed' }}>
                  ◼ CLOCK OUT
                </button>
                <button className="btn btn-amber" disabled={!canBreak && !canResume} onClick={() => handleAction(canResume ? 'breakEnd' : 'breakStart')}
                  style={{ gridColumn: '1 / -1', opacity: (canBreak || canResume) ? 1 : 0.3, cursor: (canBreak || canResume) ? 'pointer' : 'not-allowed' }}>
                  {canResume ? '▶ RESUME WORK' : '⏸ START BREAK'}
                </button>
              </div>

              {/* Stats Row */}
              {userRec.clockIn && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'GROSS SHIFT', val: fmt(shiftElapsed), color: 'var(--text)' },
                    { label: 'BREAK USED', val: fmt(bUsed), color: breakOverLimit ? 'var(--red)' : 'var(--amber)' },
                    { label: 'NET WORK', val: fmt(netWork), color: 'var(--cyan)' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', padding: '14px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: s.color, fontFamily: 'Bebas Neue', letterSpacing: '1px' }}>{s.val}</div>
                      <div style={{ fontSize: '9px', letterSpacing: '1.5px', color: 'var(--muted)', marginTop: '4px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — Today's Timeline */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontFamily: 'Bebas Neue', letterSpacing: '2px', fontSize: '20px' }}>TODAY'S TIMELINE</h3>
                <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px' }}>
                  {new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </div>
              </div>

              {getAgentTimeline(loggedInUser.name).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0', fontSize: '13px' }}>
                  No activity recorded today.<br/>Clock in to start tracking.
                </div>
              ) : (
                <div className="timeline">
                  {getAgentTimeline(loggedInUser.name).map((l, i) => {
                    const colors = { clockIn: 'var(--green)', clockOut: 'var(--red)', breakStart: 'var(--amber)', breakEnd: 'var(--blue)' };
                    return (
                      <div className="tl-item" key={i}>
                        <div className="tl-dot" style={{ background: colors[l.action] || 'var(--muted)' }} />
                        <div className="tl-time">{l.time}</div>
                        <div className="tl-action" style={{ color: colors[l.action] || 'var(--text)' }}>{actionLabel[l.action] || l.action}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-full" style={{ color: 'var(--red)', borderColor: 'rgba(255,23,68,0.3)' }}
                  onClick={() => { setLoggedInUser(null); setRecords({}); setView('landing'); }}>
                  LOGOUT
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MANAGER PORTAL */}
      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--muted)' }}>MANAGER VIEW</div>
              <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '4px' }}>{loggedInUser.name}</div>
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={() => { setLoggedInUser(null); setView('landing'); }}>LOGOUT</button>
          </div>

          {/* TABS */}
          <div className="tab-bar">
            {['attendance', 'dashboard', 'logs', 'onboarding'].map(t => (
              <button key={t} className={`btn btn-tab ${mgrTab === t ? 'active' : ''}`} onClick={() => setMgrTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* ── ATTENDANCE TAB ── */}
          {mgrTab === 'attendance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Summary Stats */}
              <div className="grid-3">
                {(() => {
                  const onShift = agentAttendanceSummary.filter(a => a.status === STATUS.ACTIVE).length;
                  const onBreak = agentAttendanceSummary.filter(a => a.status === STATUS.BREAK).length;
                  const out = agentAttendanceSummary.filter(a => a.status === STATUS.OUT || a.status === STATUS.PENDING).length;
                  const overBreak = agentAttendanceSummary.filter(a => a.breakOverLimit).length;
                  return [
                    { label: 'ON SHIFT', val: onShift, color: 'var(--green)' },
                    { label: 'ON BREAK', val: onBreak, color: 'var(--amber)' },
                    { label: 'NOT IN', val: out, color: 'var(--muted)' },
                    { label: 'BREAK VIOLATIONS', val: overBreak, color: 'var(--red)' },
                  ].map(s => (
                    <div key={s.label} className="stat">
                      <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ));
                })()}
              </div>

              {/* Export */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={exportAttendanceCSV} style={{ fontSize: '11px' }}>
                  ↓ EXPORT CSV
                </button>
              </div>

              {/* Agent Cards */}
              <div className="card" style={{ padding: '8px 8px' }}>
                {agentAttendanceSummary.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>No active agents registered.</div>
                ) : (
                  agentAttendanceSummary.map(agent => (
                    <div key={agent.name} className="agent-row" onClick={() => setSelectedAgent(agent)}>
                      <div className="agent-avatar" style={{ background: `${platformColors[agent.platform] || '#888'}22`, color: platformColors[agent.platform] || '#888' }}>
                        {agent.name[0]}
                      </div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-dept">{agent.platform}</div>
                        {/* Mini progress bar */}
                        {agent.clockInTime && (
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden', width: '120px' }}>
                              <div style={{ height: '100%', width: `${agent.shiftPct}%`, background: agent.shiftPct >= 100 ? 'var(--green)' : 'var(--blue)', borderRadius: '2px' }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div className="badge" style={{ background: `${agent.status.color}22`, color: agent.status.color, border: `1px solid ${agent.status.color}44` }}>
                          <div className={`badge-dot ${agent.status.pulse ? 'pulse' : ''}`} style={{ background: agent.status.color }} />
                          {agent.status.label}
                        </div>
                        {agent.clockInTime && (
                          <div className="agent-meta">
                            <div style={{ color: agent.breakOverLimit ? 'var(--red)' : 'var(--muted)' }}>BRK {fmtShort(agent.totalBreakMs)}{agent.breakOverLimit ? ' ⚠' : ''}</div>
                            <div style={{ color: 'var(--cyan)', fontWeight: '700' }}>{fmt(agent.netMs)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── DASHBOARD TAB ── */}
          {mgrTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="grid-3">
                <div className="stat">
                  <div className="stat-val" style={{ color: 'var(--green)' }}>
                    ${(dynamicAgents.reduce((s, a) => s + (a.salary || 0), 0) / 30).toFixed(0)}
                  </div>
                  <div className="stat-label">EST. DAILY LABOR COST (USD)</div>
                </div>
                <div className="stat">
                  <div className="stat-val" style={{ color: 'var(--blue)' }}>{dynamicAgents.filter(a => a.status === 'active').length}</div>
                  <div className="stat-label">ACTIVE AGENTS</div>
                </div>
                <div className="stat">
                  <div className="stat-val" style={{ color: 'var(--amber)' }}>{dynamicAgents.filter(a => a.status === 'pending').length}</div>
                  <div className="stat-label">PENDING APPROVAL</div>
                </div>
              </div>
              <div className="card">
                <h3 style={{ fontFamily: 'Bebas Neue', letterSpacing: '2px', marginBottom: '20px', fontSize: '18px' }}>AGENT DIRECTORY</h3>
                {dynamicAgents.filter(a => a.status === 'active').map(a => (
                  <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div className="agent-avatar" style={{ background: `${platformColors[a.platform] || '#888'}22`, color: platformColors[a.platform] || '#888' }}>{a.name[0]}</div>
                      <div>
                        <div style={{ fontWeight: '700' }}>{a.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{a.loc || 'Location unknown'}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: platformColors[a.platform], fontSize: '12px', fontWeight: '700', letterSpacing: '1px' }}>{a.platform}</div>
                      {a.salary > 0 && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>${a.salary}/mo</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── LOGS TAB ── */}
          {mgrTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {['today', 'yesterday', 'custom'].map(r => (
                  <button key={r} className={`btn ${reportRange === r ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '11px' }} onClick={() => setReportRange(r)}>{r.toUpperCase()}</button>
                ))}
                {reportRange === 'custom' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="inp" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ width: 'auto', padding: '10px 14px' }} />
                    <span style={{ color: 'var(--muted)' }}>→</span>
                    <input className="inp" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ width: 'auto', padding: '10px 14px' }} />
                  </div>
                )}
                <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>{filteredLogs.length} entries</div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>DATE</th><th>TIME</th><th>AGENT</th><th>ACTION</th><th>AUDIT PROOF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((l, i) => {
                        const colors = { clockIn: 'var(--green)', clockOut: 'var(--red)', breakStart: 'var(--amber)', breakEnd: 'var(--blue)' };
                        return (
                          <tr key={i}>
                            <td style={{ color: 'var(--muted)', fontSize: '12px' }}>{l.date}</td>
                            <td style={{ color: 'var(--cyan)', fontWeight: '700' }}>{l.time}</td>
                            <td style={{ fontWeight: '700' }}>{l.agent}</td>
                            <td>
                              <span style={{ color: colors[l.action] || 'var(--muted)', fontSize: '12px', fontWeight: '600' }}>
                                {actionLabel[l.action] || l.action}
                              </span>
                            </td>
                            <td style={{ fontSize: '10px', color: 'var(--muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.device}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredLogs.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No logs for this period.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── ONBOARDING TAB ── */}
          {mgrTab === 'onboarding' && (
            <div className="card card-glow" style={{ maxWidth: '600px' }}>
              <h3 style={{ fontFamily: 'Bebas Neue', letterSpacing: '2px', fontSize: '22px', marginBottom: '24px' }}>ACTIVATION QUEUE</h3>
              <label className="inp-label">SET MONTHLY SALARY (USD)</label>
              <input className="inp" style={{ marginBottom: '24px' }} placeholder="e.g. 260" type="number" onChange={e => setApprovalSalary(e.target.value)} />
              {dynamicAgents.filter(a => a.status === 'pending').length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px 0' }}>No pending registrations.</div>
              ) : (
                dynamicAgents.filter(a => a.status === 'pending').map(a => (
                  <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: '700' }}>{a.name}</div>
                      <div style={{ fontSize: '11px', color: platformColors[a.platform] || 'var(--muted)', marginTop: '3px', letterSpacing: '1px' }}>{a.platform}</div>
                    </div>
                    <button className="btn btn-green" style={{ fontSize: '11px' }} onClick={async () => {
                      if (!approvalSalary) return alert("Please assign a salary first.");
                      const payload = { date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), action: 'USER_APPROVE', agent: a.name, device: JSON.stringify({ ...a, salary: Number(approvalSalary) }), timestamp: now };
                      await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
                      await fetchData();
                    }}>ACTIVATE</button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* AGENT DETAIL MODAL */}
      {selectedAgent && (
        <div className="overlay" onClick={() => setSelectedAgent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '28px', letterSpacing: '3px', color: 'var(--cyan)' }}>{selectedAgent.name}</div>
                <div style={{ fontSize: '12px', color: platformColors[selectedAgent.platform], letterSpacing: '1px', marginTop: '4px' }}>◆ {selectedAgent.platform}</div>
              </div>
              <div className="badge" style={{ background: `${selectedAgent.status.color}22`, color: selectedAgent.status.color, border: `1px solid ${selectedAgent.status.color}44` }}>
                <div className={`badge-dot ${selectedAgent.status.pulse ? 'pulse' : ''}`} style={{ background: selectedAgent.status.color }} />
                {selectedAgent.status.label}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: 'CLOCK IN', val: selectedAgent.clockInTime ? new Date(selectedAgent.clockInTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '--:--' },
                { label: 'BREAK', val: fmtShort(selectedAgent.totalBreakMs), alert: selectedAgent.breakOverLimit },
                { label: 'NET WORK', val: fmt(selectedAgent.netMs), highlight: true },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface)', borderRadius: '10px', padding: '14px', border: `1px solid ${s.alert ? 'rgba(255,23,68,0.3)' : 'var(--border)'}`, textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'Bebas Neue', color: s.alert ? 'var(--red)' : s.highlight ? 'var(--cyan)' : 'var(--text)', letterSpacing: '1px' }}>{s.val}</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', marginTop: '4px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Shift Progress */}
            <div className="progress-wrap" style={{ marginBottom: '24px' }}>
              <div className="progress-label">
                <span>SHIFT COMPLETION</span>
                <span>{selectedAgent.shiftPct.toFixed(0)}%</span>
              </div>
              <div className="progress-track" style={{ height: '8px' }}>
                <div className="progress-fill" style={{ width: `${selectedAgent.shiftPct}%`, background: selectedAgent.shiftPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--blue), var(--cyan))' }} />
              </div>
            </div>

            {/* Warnings */}
            {selectedAgent.breakOverLimit && (
              <div className="alert alert-danger" style={{ marginBottom: '16px' }}>
                ⚠ Break exceeded by {fmtShort(selectedAgent.totalBreakMs - BREAK_LIMIT_MS)}
              </div>
            )}

            {/* Timeline */}
            <h4 style={{ fontFamily: 'Bebas Neue', letterSpacing: '2px', fontSize: '16px', marginBottom: '16px' }}>TODAY'S ACTIVITY</h4>
            {selectedAgent.todayLogs.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No activity today.</div>
            ) : (
              <div className="timeline">
                {selectedAgent.todayLogs.map((l, i) => {
                  const colors = { clockIn: 'var(--green)', clockOut: 'var(--red)', breakStart: 'var(--amber)', breakEnd: 'var(--blue)' };
                  return (
                    <div className="tl-item" key={i}>
                      <div className="tl-dot" style={{ background: colors[l.action] || 'var(--muted)' }} />
                      <div className="tl-time">{l.time}</div>
                      <div className="tl-action" style={{ color: colors[l.action] || 'var(--text)' }}>{actionLabel[l.action] || l.action}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="btn btn-ghost btn-full" style={{ marginTop: '24px' }} onClick={() => setSelectedAgent(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}