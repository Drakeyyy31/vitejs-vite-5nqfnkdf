import { useState, useEffect, useMemo, useCallback } from 'react';

// ── CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026";
const BREAK_LIMIT_MS  = 60 * 60 * 1000;
const SHIFT_TARGET_MS = 8  * 60 * 60 * 1000;

const getLegacyPay = (name) => {
  const seniors = ['Eli','Mary','Robert','Porsha','Gio','Giah','Art','Jon','Koko','Hawuki','John','Eunice'];
  if (['Egar','Drakeyyy'].includes(name)) return 600;
  if (['Lasgna','Sinclair'].includes(name)) return 400;
  if (seniors.includes(name)) return 360;
  return 260;
};

const PLATFORM_COLORS = {
  META:'#2979ff', KANAL:'#ffab00', Helpwave:'#f97316',
  Chargeback:'#ff1744', DMCA:'#94a3b8', MANAGER:'#c084fc'
};

const STATUS = {
  ACTIVE:  { label:'ON SHIFT',    color:'#00e676', pulse:true  },
  BREAK:   { label:'ON BREAK',    color:'#ffab00', pulse:true  },
  OUT:     { label:'CLOCKED OUT', color:'#6b7280', pulse:false },
  PENDING: { label:'NOT IN',      color:'#374151', pulse:false },
};

const ACTION_LABELS = {
  clockIn:'Clock In', clockOut:'Clock Out',
  breakStart:'Break Start', breakEnd:'Resume Work'
};
const ACTION_COLORS = {
  clockIn:'#00e676', clockOut:'#ff1744',
  breakStart:'#ffab00', breakEnd:'#2979ff'
};

// ── HELPERS ──
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
const deriveStatus = (logs, name, records) => {
  const rec = records[name] || {};
  if (rec.onBreak) return STATUS.BREAK;
  if (rec.clockIn && !rec.clockedOut) return STATUS.ACTIVE;
  const today = new Date(); today.setHours(0,0,0,0);
  const sorted = logs
    .filter(l => l.agent === name && l.timestamp >= today.getTime())
    .sort((a,b) => a.timestamp - b.timestamp);
  const last = sorted[sorted.length - 1];
  if (!last) return STATUS.PENDING;
  if (last.action === 'clockIn')    return STATUS.ACTIVE;
  if (last.action === 'breakStart') return STATUS.BREAK;
  if (last.action === 'clockOut')   return STATUS.OUT;
  return STATUS.PENDING;
};

// ── CROSS-DEVICE CSS ──
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Bebas+Neue&display=swap');

:root {
  --bg:#040610; --surface:#0b0f1e; --card:#0f1525;
  --border:#1e2d45; --glow:#1e4d8c;
  --blue:#2979ff; --cyan:#00e5ff; --green:#00e676;
  --red:#ff1744; --amber:#ffab00; --text:#e8eaf0; --muted:#4a5578;
  --r:14px;
  --safe-t: env(safe-area-inset-top,    0px);
  --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left,   0px);
  --safe-r: env(safe-area-inset-right,  0px);
  --tap: 48px;
}

/* ── RESET ── */
*, *::before, *::after {
  box-sizing: border-box; margin: 0; padding: 0;
  -webkit-tap-highlight-color: transparent;
}

html {
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  background: var(--bg); color: var(--text);
  font-family: 'IBM Plex Mono', monospace;
  -webkit-overflow-scrolling: touch;
  overflow-x: hidden;
  min-height: 100vh; min-height: 100dvh;
}

/* ── SHELL ── */
.shell {
  width: 100%; max-width: 1500px; margin: 0 auto;
  min-height: 100vh; min-height: 100dvh;
  display: flex; flex-direction: column; align-items: center;
  padding: 0
    calc(16px + var(--safe-r))
    calc(32px + var(--safe-b))
    calc(16px + var(--safe-l));
}

/* ── TOP BAR ── */
.top-bar {
  width: 100%; display: flex; justify-content: space-between;
  align-items: center; padding: 16px 0 12px;
  border-bottom: 1px solid var(--border); margin-bottom: 24px;
  flex-wrap: wrap; gap: 8px;
}
.logo {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(20px, 5vw, 32px); letter-spacing: 4px;
  color: var(--cyan); text-shadow: 0 0 20px rgba(0,229,255,.4);
}
.logo span { color: var(--text); }
.top-clock { font-size: 11px; color: var(--muted); text-align: right; line-height: 1.7; }
.clock-time {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(18px, 4vw, 26px); letter-spacing: 3px; color: var(--text);
}

/* ── LOADER ── */
.loading-bar {
  position: fixed; top: 0; left: 0; width: 100%; height: 2px;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
  z-index: 9999; animation: scan 1.2s linear infinite;
}
@keyframes scan {
  0%   { transform: scaleX(0); transform-origin: left;  }
  50%  { transform: scaleX(1); transform-origin: left;  }
  51%  { transform: scaleX(1); transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
}

/* ── CARDS ── */
.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: var(--r); padding: 20px; width: 100%;
}
.card-glow { box-shadow: 0 0 0 1px var(--glow), 0 8px 32px rgba(41,121,255,.1); }

/* ── INPUTS — font-size 16px prevents iOS zoom ── */
.inp {
  background: rgba(0,0,0,.4); color: var(--text);
  border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; width: 100%;
  font-family: 'IBM Plex Mono', monospace; font-size: 16px;
  outline: none;
  -webkit-appearance: none; appearance: none;
  transition: border-color .2s;
}
.inp:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(41,121,255,.15); }
.inp[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: .7; }
select.inp {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M0 0l6 8 6-8z' fill='%234a5578'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 14px center; padding-right: 38px;
}
.inp-label { font-size: 11px; letter-spacing: 2px; color: var(--muted); margin-bottom: 7px; display: block; }
.inp-gap { margin-bottom: 14px; }

/* ── BUTTONS ── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: var(--tap); padding: 12px 20px;
  border-radius: 10px; border: none;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px; font-weight: 700; letter-spacing: 2px;
  cursor: pointer; text-transform: uppercase;
  -webkit-appearance: none; appearance: none;
  transition: transform .13s, opacity .13s;
  touch-action: manipulation;
  user-select: none; -webkit-user-select: none;
}
.btn:active { transform: scale(.95); opacity: .85; }
.btn:disabled { opacity: .3; pointer-events: none; }
.btn-primary { background: var(--blue);  color: #fff; box-shadow: 0 4px 18px rgba(41,121,255,.35); }
.btn-green   { background: var(--green); color: #000; box-shadow: 0 4px 18px rgba(0,230,118,.25); }
.btn-red     { background: var(--red);   color: #fff; box-shadow: 0 4px 18px rgba(255,23,68,.25); }
.btn-amber   { background: var(--amber); color: #000; }
.btn-ghost   { background: transparent;  color: var(--muted); border: 1px solid var(--border); }
.btn-tab {
  background: transparent; color: var(--muted);
  border: none; border-bottom: 2px solid transparent;
  border-radius: 0; padding: 12px 14px; font-size: 11px;
  white-space: nowrap; min-height: 44px;
}
.btn-tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
.btn-full { width: 100%; }

/* ── ALERTS ── */
.alert {
  padding: 11px 15px; border-radius: 10px;
  font-size: 13px; display: flex; align-items: center; gap: 9px;
}
.alert-success { background: rgba(0,230,118,.08);  border: 1px solid rgba(0,230,118,.3);  color: var(--green); }
.alert-danger  { background: rgba(255,23,68,.08);   border: 1px solid rgba(255,23,68,.3);  color: var(--red);   }

/* ── BADGES ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px; white-space: nowrap;
}
.badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.25 } }

/* ── PROGRESS ── */
.prog-wrap  { margin: 8px 0; }
.prog-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
.prog-track { height: 5px; background: rgba(255,255,255,.05); border-radius: 3px; overflow: hidden; }
.prog-fill  { height: 100%; border-radius: 3px; transition: width 1s linear; }

/* ── LAYOUT GRIDS ── */
/* 2-col: stacked on mobile, side-by-side on ≥768 */
.grid-2 { display: grid; grid-template-columns: 1fr; gap: 20px; width: 100%; }
@media (min-width: 768px) { .grid-2 { grid-template-columns: 1fr 1fr; } }

/* 4 stats: 2×2 on mobile, 4×1 on ≥560 */
.grid-4 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
@media (min-width: 560px) { .grid-4 { grid-template-columns: repeat(4, 1fr); } }

/* 3 mini stats: always 3 cols */
.grid-3s { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

/* ── STAT BOX ── */
.stat { padding: 16px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
.stat-val   { font-family: 'Bebas Neue', sans-serif; font-size: clamp(26px, 5vw, 40px); letter-spacing: 2px; line-height: 1; }
.stat-label { font-size: 10px; letter-spacing: 2px; color: var(--muted); margin-top: 5px; }

/* ── AGENT ROW ── */
.agent-row {
  display: flex; align-items: center; gap: 11px;
  padding: 12px 8px; border-radius: 8px;
  cursor: pointer; transition: background .13s;
}
.agent-row:active { background: rgba(41,121,255,.08); }
@media (hover: hover) { .agent-row:hover { background: rgba(41,121,255,.05); } }
.avatar {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
}
.agent-info { flex: 1; min-width: 0; }
.agent-name { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.agent-dept { font-size: 10px; color: var(--muted); letter-spacing: 1px; margin-top: 2px; }
.agent-meta { text-align: right; font-size: 10px; color: var(--muted); flex-shrink: 0; }

/* ── TIMELINE ── */
.timeline { position: relative; padding-left: 22px; }
.timeline::before { content: ''; position: absolute; left: 6px; top: 0; bottom: 0; width: 1px; background: var(--border); }
.tl-item  { position: relative; padding: 8px 0; }
.tl-dot   { position: absolute; left: -20px; top: 12px; width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--bg); }
.tl-time  { font-size: 10px; color: var(--muted); }
.tl-act   { font-size: 13px; font-weight: 600; margin-top: 2px; }

/* ── TAB BAR — horizontally scrollable on narrow screens ── */
.tab-bar {
  display: flex; border-bottom: 1px solid var(--border);
  margin-bottom: 22px; width: 100%;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tab-bar::-webkit-scrollbar { display: none; }

/* ── CENTER FORM WRAPPER ── */
.center-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; flex: 1;
  width: 100%; max-width: 440px;
  gap: 14px; padding: 28px 0;
}

/* ── MODAL — slides up from bottom on mobile ── */
.overlay {
  position: fixed; inset: 0;
  background: rgba(4,6,16,.88);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  z-index: 300;
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
}
@media (min-width: 600px) { .overlay { align-items: center; padding: 20px; } }
.modal {
  background: var(--card); border: 1px solid var(--glow);
  border-radius: 20px 20px 0 0;
  padding: 20px 18px calc(20px + var(--safe-b));
  width: 100%; max-height: 90vh; max-height: 90dvh;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
}
@media (min-width: 600px) {
  .modal { border-radius: 20px; max-width: 520px; max-height: 85vh; padding: 26px; }
}
.drag-handle { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 0 auto 18px; }

/* ── BIG TIMER ── */
.big-timer {
  font-family: 'Bebas Neue', sans-serif;
  font-size: clamp(52px, 14vw, 88px);
  letter-spacing: 4px; line-height: 1;
}

/* ── ACTION BUTTON GRID ── */
.act-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.act-span { grid-column: 1 / -1; }

/* ── TABLE — scrollable on mobile ── */
.tbl-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.data-tbl { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 560px; }
.data-tbl th {
  text-align: left; padding: 10px 13px;
  font-size: 10px; letter-spacing: 2px; color: var(--muted);
  border-bottom: 1px solid var(--border); background: var(--surface);
  white-space: nowrap;
}
.data-tbl td { padding: 11px 13px; border-bottom: 1px solid rgba(30,45,69,.5); vertical-align: middle; }
@media (hover: hover) { .data-tbl tr:hover td { background: rgba(41,121,255,.03); } }

/* ── SCROLLBAR (desktop pointer) ── */
@media (pointer: fine) {
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
}
`;

export default function AftersalesApp() {
  const [view,      setView]      = useState('landing');
  const [mgrTab,    setMgrTab]    = useState('attendance');
  const [agents,    setAgents]    = useState([]);
  const [logs,      setLogs]      = useState([]);
  const [records,   setRecords]   = useState({});
  const [user,      setUser]      = useState(null);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [now,       setNow]       = useState(Date.now());
  const [selAgent,  setSelAgent]  = useState(null);

  const [regForm,   setRegForm]   = useState({ name:'', pin:'', platform:'META' });
  const [mgrKey,    setMgrKey]    = useState('');
  const [loginForm, setLoginForm] = useState({ name:'', pin:'' });
  const [salary,    setSalary]    = useState('');
  const [range,     setRange]     = useState('today');
  const [cs,        setCs]        = useState(new Date().toISOString().split('T')[0]);
  const [ce,        setCe]        = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(SHEETS_WEBHOOK);
      const data = await res.json();
      const userRows = data.filter(i => i.action === 'USER_REGISTER' || i.action === 'USER_APPROVE');
      const logRows  = data
        .filter(i => !i.action?.startsWith('USER_'))
        .map(l => ({ ...l, timestamp: Number(l.timestamp) || new Date(`${l.date} ${l.time}`).getTime() }))
        .sort((a,b) => b.timestamp - a.timestamp);
      const map = {};
      userRows.forEach(u => {
        try {
          const d = JSON.parse(u.device);
          map[u.agent.toLowerCase()] = { ...d, name:u.agent, status: u.action==='USER_APPROVE'?'active':'pending' };
        } catch(_) {}
      });
      setAgents(Object.values(map));
      setLogs(logRows);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [view, fetchData]);

  const getAudit = async () => {
    try {
      const r = await fetch('https://ipapi.co/json/');
      const d = await r.json();
      return `${d.city}, ${d.country_code} | IP:${d.ip} | ${navigator.platform}`;
    } catch(_) { return `Audit Bypass | ${navigator.platform}`; }
  };

  const handleRegister = async () => {
    setError('');
    if (!regForm.name.trim() || regForm.pin.length < 4) return setError('Min 4 characters for password.');
    const isMgr = regForm.platform === 'MANAGER';
    if (isMgr && mgrKey !== MANAGER_ACTIVATION_KEY) return setError('Invalid Manager Key.');
    setLoading(true);
    const loc  = await getAudit();
    const data = { ...regForm, role:isMgr?'Manager':'Agent', salary:isMgr?getLegacyPay(regForm.name):0 };
    await fetch(SHEETS_WEBHOOK, { method:'POST', mode:'no-cors', body:JSON.stringify({
      date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(),
      action: isMgr?'USER_APPROVE':'USER_REGISTER',
      agent: regForm.name.trim(), device: JSON.stringify({...data, loc}), timestamp: Date.now()
    })});
    setSuccess(isMgr ? 'Manager Activated!' : 'Registration sent! Awaiting approval.');
    if (isMgr) { setUser({...data, status:'active'}); setView('mgrPortal'); }
    else setTimeout(() => setView('landing'), 2500);
    setLoading(false);
  };

  const handleLogin = () => {
    setError('');
    const found = agents.find(a =>
      a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin
    );
    if (!found) return setError('Invalid credentials.');
    if (found.status === 'pending') return setError('Account pending manager approval.');
    setUser(found);
    setView(found.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
  };

  const handleAction = async (type) => {
    setLoading(true);
    const ts    = Date.now();
    const proof = await getAudit();
    const rec   = records[user.name] || {};
    let next    = { ...rec };
    if (type === 'clockIn')    next = { clockIn:ts, breakUsedMs:0 };
    if (type === 'breakStart') { next.onBreak = true;  next.breakStart = ts; }
    if (type === 'breakEnd')   { next.onBreak = false; next.breakUsedMs = (next.breakUsedMs||0)+(ts-next.breakStart); }
    if (type === 'clockOut')   next = { clockedOut:true };
    setRecords(prev => ({ ...prev, [user.name]:next }));
    await fetch(SHEETS_WEBHOOK, { method:'POST', mode:'no-cors', body:JSON.stringify({
      date:new Date(ts).toLocaleDateString(), time:new Date(ts).toLocaleTimeString(),
      action:type, agent:user.name, device:proof, timestamp:ts
    })});
    await fetchData();
    setLoading(false);
  };

  const logout = () => { setUser(null); setRecords({}); setView('landing'); };

  // ── AGENT CALCULATIONS ──
  const rec        = user ? (records[user.name] || {}) : {};
  const bUsed      = (rec.breakUsedMs||0) + (rec.onBreak ? (now-rec.breakStart) : 0);
  const shiftMs    = rec.clockIn ? (now-rec.clockIn) : 0;
  const netWork    = Math.max(0, shiftMs - bUsed);
  const bOverLimit = bUsed > BREAK_LIMIT_MS;
  const bPct       = Math.min((bUsed/BREAK_LIMIT_MS)*100, 100);
  const sPct       = Math.min((netWork/SHIFT_TARGET_MS)*100, 100);
  const agentSt    = rec.onBreak ? STATUS.BREAK : (rec.clockIn && !rec.clockedOut) ? STATUS.ACTIVE : STATUS.PENDING;

  const todayStart = useMemo(() => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);

  const getTimeline = (name) =>
    logs.filter(l => l.agent===name && l.timestamp>=todayStart).sort((a,b)=>a.timestamp-b.timestamp);

  const filteredLogs = useMemo(() => {
    let s, e;
    const today = new Date(); today.setHours(0,0,0,0);
    if (range==='today')     { s=today.getTime(); e=s+86400000; }
    else if (range==='yesterday') { s=today.getTime()-86400000; e=today.getTime(); }
    else { s=new Date(cs).getTime(); e=new Date(ce).getTime()+86400000; }
    return logs.filter(l => l.timestamp>=s && l.timestamp<=e);
  }, [logs, range, cs, ce]);

  const attendance = useMemo(() =>
    agents.filter(a=>a.status==='active').map(agent => {
      const tl = logs.filter(l=>l.agent===agent.name&&l.timestamp>=todayStart).sort((a,b)=>a.timestamp-b.timestamp);
      let ci=null,co=null,tb=0,bs=null;
      tl.forEach(l=>{
        if (l.action==='clockIn'&&!ci) ci=l.timestamp;
        if (l.action==='breakStart')   bs=l.timestamp;
        if (l.action==='breakEnd'&&bs) { tb+=l.timestamp-bs; bs=null; }
        if (l.action==='clockOut')     co=l.timestamp;
      });
      const r=records[agent.name]||{};
      const ab=r.onBreak?(now-(r.breakStart||now)):0;
      const totalBreak=tb+(r.breakUsedMs||0)+ab;
      const sMs=ci?((co||now)-ci):0;
      const nMs=Math.max(0,sMs-totalBreak);
      return { ...agent, clockInTime:ci, clockOutTime:co, totalBreakMs:totalBreak,
        shiftMs:sMs, netMs:nMs, status:deriveStatus(logs,agent.name,records),
        todayLogs:tl, breakOverLimit:totalBreak>BREAK_LIMIT_MS,
        shiftPct:Math.min((nMs/SHIFT_TARGET_MS)*100,100) };
    })
  , [agents, logs, records, now, todayStart]);

  const exportCSV = () => {
    const rows=[['Agent','Platform','Clock In','Clock Out','Total Break','Net Work','Shift %','Status']];
    attendance.forEach(a=>rows.push([
      a.name,a.platform,
      a.clockInTime?new Date(a.clockInTime).toLocaleTimeString():'-',
      a.clockOutTime?new Date(a.clockOutTime).toLocaleTimeString():'-',
      fmtShort(a.totalBreakMs),fmtShort(a.netMs),`${a.shiftPct.toFixed(0)}%`,a.status.label
    ]));
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const pc = PLATFORM_COLORS;

  return (
    <div className="shell">
      <style>{CSS}</style>
      {loading && <div className="loading-bar"/>}

      {/* TOP BAR */}
      <div className="top-bar">
        <div className="logo">AFTER<span>SALES</span></div>
        <div className="top-clock">
          <div className="clock-time">
            {new Date(now).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
          <div>{new Date(now).toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div>
        </div>
      </div>

      {/* ══ LANDING ══ */}
      {view==='landing'&&(
        <div className="center-wrap">
          <div style={{textAlign:'center',marginBottom:4}}>
            <div style={{fontSize:'clamp(11px,3vw,14px)',color:'var(--muted)',letterSpacing:'3px'}}>WORKFORCE ATTENDANCE SYSTEM</div>
            <div style={{fontSize:'10px',color:'var(--glow)',marginTop:6,letterSpacing:'2px'}}>v2.0 — LIVE TRACKING</div>
          </div>
          <button className="btn btn-green btn-full" onClick={()=>setView('login')}>SIGN IN</button>
          <button className="btn btn-ghost btn-full" onClick={()=>setView('register')}>CREATE ACCOUNT</button>
        </div>
      )}

      {/* ══ REGISTER ══ */}
      {view==='register'&&(
        <div className="center-wrap">
          <div className="card card-glow">
            <h2 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'3px',fontSize:'26px',marginBottom:20,color:'var(--cyan)'}}>ONBOARDING</h2>
            <label className="inp-label">USERNAME</label>
            <input className="inp inp-gap" placeholder="Display name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
              onChange={e=>setRegForm({...regForm,name:e.target.value})}/>
            <label className="inp-label">PASSWORD</label>
            <input className="inp inp-gap" type="password" placeholder="Min 4 characters" autoComplete="new-password"
              onChange={e=>setRegForm({...regForm,pin:e.target.value})}/>
            <label className="inp-label">DEPARTMENT</label>
            <select className="inp" style={{marginBottom:regForm.platform==='MANAGER'?14:20}}
              onChange={e=>setRegForm({...regForm,platform:e.target.value})}>
              {Object.keys(pc).map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            {regForm.platform==='MANAGER'&&<>
              <label className="inp-label" style={{marginTop:2}}>MANAGER ACTIVATION KEY</label>
              <input className="inp" style={{marginBottom:20}} type="password" placeholder="Key"
                onChange={e=>setMgrKey(e.target.value)}/>
            </>}
            {error   &&<div className="alert alert-danger"  style={{marginBottom:12}}>⚠ {error}</div>}
            {success &&<div className="alert alert-success" style={{marginBottom:12}}>✓ {success}</div>}
            <button className="btn btn-green btn-full" onClick={handleRegister}>REGISTER</button>
            <button className="btn btn-ghost btn-full" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
          </div>
        </div>
      )}

      {/* ══ LOGIN ══ */}
      {view==='login'&&(
        <div className="center-wrap">
          <div className="card card-glow">
            <h2 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'3px',fontSize:'26px',marginBottom:20,color:'var(--cyan)'}}>SECURE ACCESS</h2>
            <label className="inp-label">USERNAME</label>
            <input className="inp inp-gap" placeholder="Your name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
              onChange={e=>setLoginForm({...loginForm,name:e.target.value})}/>
            <label className="inp-label">PASSWORD</label>
            <input className="inp" style={{marginBottom:20}} type="password" placeholder="PIN / Password" autoComplete="current-password"
              onChange={e=>setLoginForm({...loginForm,pin:e.target.value})}/>
            {error&&<div className="alert alert-danger" style={{marginBottom:12}}>⚠ {error}</div>}
            <button className="btn btn-primary btn-full" onClick={handleLogin}>ENTER WORKSPACE</button>
            <button className="btn btn-ghost btn-full" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
          </div>
        </div>
      )}

      {/* ══ AGENT PORTAL ══ */}
      {view==='agentPortal'&&user&&(
        <div className="grid-2" style={{paddingTop:8}}>

          {/* LEFT — Live Session */}
          <div className="card card-glow" style={{display:'flex',flexDirection:'column',gap:18}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:10,letterSpacing:'2px',color:'var(--muted)'}}>SIGNED IN AS</div>
                <div style={{fontSize:20,fontWeight:700,marginTop:3}}>{user.name}</div>
                <div style={{fontSize:11,color:pc[user.platform]||'var(--muted)',marginTop:2,letterSpacing:'1px'}}>◆ {user.platform}</div>
              </div>
              <div className="badge" style={{background:`${agentSt.color}22`,color:agentSt.color,border:`1px solid ${agentSt.color}44`}}>
                <div className={`badge-dot${agentSt.pulse?' pulse':''}`} style={{background:agentSt.color}}/>
                {agentSt.label}
              </div>
            </div>

            {/* Big Timer */}
            {rec.clockIn&&(
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontSize:10,letterSpacing:'3px',color:'var(--muted)',marginBottom:5}}>
                  {rec.onBreak?'CURRENT BREAK':'NET WORK TIME'}
                </div>
                <div className="big-timer" style={{color:rec.onBreak?'var(--amber)':'var(--cyan)'}}>
                  {rec.onBreak?fmt(now-rec.breakStart):fmt(netWork)}
                </div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:5}}>
                  Shift started {new Date(rec.clockIn).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )}

            {/* Progress */}
            {rec.clockIn&&(
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div className="prog-wrap">
                  <div className="prog-label">
                    <span>SHIFT PROGRESS</span>
                    <span style={{color:sPct>=100?'var(--green)':'var(--text)'}}>{fmt(netWork)} / 8h</span>
                  </div>
                  <div className="prog-track">
                    <div className="prog-fill" style={{width:`${sPct}%`,background:sPct>=100?'var(--green)':'linear-gradient(90deg,var(--blue),var(--cyan))'}}/>
                  </div>
                </div>
                <div className="prog-wrap">
                  <div className="prog-label">
                    <span style={{color:bOverLimit?'var(--red)':'inherit'}}>BREAK USED</span>
                    <span style={{color:bOverLimit?'var(--red)':'var(--text)'}}>{fmt(bUsed)} / 1h</span>
                  </div>
                  <div className="prog-track">
                    <div className="prog-fill" style={{width:`${bPct}%`,background:bOverLimit?'var(--red)':'var(--amber)'}}/>
                  </div>
                </div>
              </div>
            )}

            {bOverLimit&&<div className="alert alert-danger">⚠ Break limit exceeded by {fmtShort(bUsed-BREAK_LIMIT_MS)}</div>}
            {sPct>=100&&!rec.clockedOut&&<div className="alert alert-success">✓ 8-hour shift target reached!</div>}

            {/* Buttons */}
            <div className="act-grid">
              <button className="btn btn-green" disabled={!(!rec.clockIn||rec.clockedOut)} onClick={()=>handleAction('clockIn')}>CLOCK IN</button>
              <button className="btn btn-red"   disabled={!(rec.clockIn&&!rec.onBreak&&!rec.clockedOut)} onClick={()=>handleAction('clockOut')}>CLOCK OUT</button>
              <button className="btn btn-amber act-span"
                disabled={!(rec.clockIn&&!rec.clockedOut)}
                onClick={()=>handleAction(rec.onBreak?'breakEnd':'breakStart')}>
                {rec.onBreak?'RESUME WORK':'START BREAK'}
              </button>
            </div>

            {/* Mini Stats */}
            {rec.clockIn&&(
              <div className="grid-3s">
                {[
                  {l:'GROSS', v:fmt(shiftMs),  c:'var(--text)'},
                  {l:'BREAK', v:fmt(bUsed),    c:bOverLimit?'var(--red)':'var(--amber)'},
                  {l:'NET',   v:fmt(netWork),  c:'var(--cyan)'},
                ].map(s=>(
                  <div key={s.l} style={{textAlign:'center',padding:'10px 6px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{fontSize:'clamp(12px,3.5vw,16px)',fontWeight:700,color:s.c,fontFamily:"'Bebas Neue',sans-serif"}}>{s.v}</div>
                    <div style={{fontSize:9,letterSpacing:'1.5px',color:'var(--muted)',marginTop:3}}>{s.l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Timeline */}
          <div className="card" style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'2px',fontSize:17}}>TODAY'S TIMELINE</h3>
              <span style={{fontSize:10,color:'var(--muted)'}}>{new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</span>
            </div>
            {getTimeline(user.name).length===0
              ? <div style={{textAlign:'center',color:'var(--muted)',padding:'28px 0',fontSize:13}}>
                  No activity yet. Clock in to start.
                </div>
              : <div className="timeline">
                  {getTimeline(user.name).map((l,i)=>(
                    <div className="tl-item" key={i}>
                      <div className="tl-dot" style={{background:ACTION_COLORS[l.action]||'var(--muted)'}}/>
                      <div className="tl-time">{l.time}</div>
                      <div className="tl-act" style={{color:ACTION_COLORS[l.action]||'var(--text)'}}>{ACTION_LABELS[l.action]||l.action}</div>
                    </div>
                  ))}
                </div>
            }
            <div style={{marginTop:'auto',paddingTop:14,borderTop:'1px solid var(--border)'}}>
              <button className="btn btn-ghost btn-full" style={{color:'var(--red)',borderColor:'rgba(255,23,68,.3)'}} onClick={logout}>LOGOUT</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MANAGER PORTAL ══ */}
      {view==='mgrPortal'&&user&&(
        <div style={{width:'100%'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18,flexWrap:'wrap',gap:10}}>
            <div>
              <div style={{fontSize:10,letterSpacing:'2px',color:'var(--muted)'}}>MANAGER VIEW</div>
              <div style={{fontSize:17,fontWeight:700,marginTop:3}}>{user.name}</div>
            </div>
            <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={logout}>LOGOUT</button>
          </div>

          <div className="tab-bar">
            {['attendance','dashboard','logs','onboarding'].map(t=>(
              <button key={t} className={`btn btn-tab${mgrTab===t?' active':''}`} onClick={()=>setMgrTab(t)}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* ATTENDANCE TAB */}
          {mgrTab==='attendance'&&(
            <div style={{display:'flex',flexDirection:'column',gap:18}}>
              <div className="grid-4">
                {(()=>{
                  const on=attendance.filter(a=>a.status===STATUS.ACTIVE).length;
                  const br=attendance.filter(a=>a.status===STATUS.BREAK).length;
                  const ni=attendance.filter(a=>a.status===STATUS.OUT||a.status===STATUS.PENDING).length;
                  const ov=attendance.filter(a=>a.breakOverLimit).length;
                  return [
                    {l:'ON SHIFT',         v:on, c:'var(--green)'},
                    {l:'ON BREAK',          v:br, c:'var(--amber)'},
                    {l:'NOT IN',            v:ni, c:'var(--muted)'},
                    {l:'BREAK VIOLATIONS',  v:ov, c:'var(--red)'},
                  ].map(s=>(
                    <div key={s.l} className="stat">
                      <div className="stat-val" style={{color:s.c}}>{s.v}</div>
                      <div className="stat-label">{s.l}</div>
                    </div>
                  ));
                })()}
              </div>

              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="btn btn-ghost" style={{fontSize:11}} onClick={exportCSV}>↓ EXPORT CSV</button>
              </div>

              <div className="card" style={{padding:'6px'}}>
                {attendance.length===0
                  ? <div style={{textAlign:'center',color:'var(--muted)',padding:28}}>No active agents.</div>
                  : attendance.map(agent=>(
                    <div key={agent.name} className="agent-row" onClick={()=>setSelAgent(agent)}>
                      <div className="avatar" style={{background:`${pc[agent.platform]||'#888'}22`,color:pc[agent.platform]||'#888'}}>
                        {agent.name[0]}
                      </div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-dept">{agent.platform}</div>
                        {agent.clockInTime&&(
                          <div style={{marginTop:5}}>
                            <div style={{height:3,background:'var(--border)',borderRadius:2,overflow:'hidden',width:90}}>
                              <div style={{height:'100%',width:`${agent.shiftPct}%`,background:agent.shiftPct>=100?'var(--green)':'var(--blue)',borderRadius:2}}/>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,flexShrink:0}}>
                        <div className="badge" style={{background:`${agent.status.color}22`,color:agent.status.color,border:`1px solid ${agent.status.color}44`}}>
                          <div className={`badge-dot${agent.status.pulse?' pulse':''}`} style={{background:agent.status.color}}/>
                          {agent.status.label}
                        </div>
                        {agent.clockInTime&&(
                          <div className="agent-meta">
                            <div style={{color:agent.breakOverLimit?'var(--red)':'var(--muted)'}}>BRK {fmtShort(agent.totalBreakMs)}{agent.breakOverLimit?' ⚠':''}</div>
                            <div style={{fontSize:14,fontWeight:700,color:'var(--cyan)'}}>{fmt(agent.netMs)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {mgrTab==='dashboard'&&(
            <div style={{display:'flex',flexDirection:'column',gap:18}}>
              <div className="grid-4">
                {[
                  {l:'DAILY LABOR COST', v:`$${(agents.reduce((s,a)=>s+(a.salary||0),0)/30).toFixed(0)}`, c:'var(--green)'},
                  {l:'ACTIVE AGENTS',    v:agents.filter(a=>a.status==='active').length,  c:'var(--blue)'},
                  {l:'PENDING',          v:agents.filter(a=>a.status==='pending').length, c:'var(--amber)'},
                  {l:'DEPARTMENTS',      v:[...new Set(agents.filter(a=>a.status==='active').map(a=>a.platform))].length, c:'var(--cyan)'},
                ].map(s=>(
                  <div key={s.l} className="stat">
                    <div className="stat-val" style={{color:s.c}}>{s.v}</div>
                    <div className="stat-label">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'2px',marginBottom:16,fontSize:16}}>AGENT DIRECTORY</h3>
                {agents.filter(a=>a.status==='active').map(a=>(
                  <div key={a.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid var(--border)',gap:10,flexWrap:'wrap'}}>
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <div className="avatar" style={{background:`${pc[a.platform]||'#888'}22`,color:pc[a.platform]||'#888'}}>{a.name[0]}</div>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>{a.name}</div>
                        <div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>{a.loc||'Location unknown'}</div>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{color:pc[a.platform],fontSize:11,fontWeight:700,letterSpacing:'1px'}}>{a.platform}</div>
                      {a.salary>0&&<div style={{fontSize:10,color:'var(--muted)',marginTop:2}}>${a.salary}/mo</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOGS TAB */}
          {mgrTab==='logs'&&(
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                {['today','yesterday','custom'].map(r=>(
                  <button key={r} className={`btn ${range===r?'btn-primary':'btn-ghost'}`} style={{fontSize:11,minHeight:40,padding:'8px 14px'}} onClick={()=>setRange(r)}>
                    {r.toUpperCase()}
                  </button>
                ))}
                {range==='custom'&&(
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <input className="inp" type="date" value={cs} onChange={e=>setCs(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                    <span style={{color:'var(--muted)'}}>→</span>
                    <input className="inp" type="date" value={ce} onChange={e=>setCe(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                  </div>
                )}
                <div style={{marginLeft:'auto',fontSize:11,color:'var(--muted)'}}>{filteredLogs.length} entries</div>
              </div>
              <div className="card tbl-wrap" style={{padding:0}}>
                <table className="data-tbl">
                  <thead>
                    <tr><th>DATE</th><th>TIME</th><th>AGENT</th><th>ACTION</th><th>AUDIT PROOF</th></tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l,i)=>(
                      <tr key={i}>
                        <td style={{color:'var(--muted)',fontSize:11}}>{l.date}</td>
                        <td style={{color:'var(--cyan)',fontWeight:700,whiteSpace:'nowrap'}}>{l.time}</td>
                        <td style={{fontWeight:700}}>{l.agent}</td>
                        <td><span style={{color:ACTION_COLORS[l.action]||'var(--muted)',fontWeight:600,fontSize:12}}>{ACTION_LABELS[l.action]||l.action}</span></td>
                        <td style={{fontSize:10,color:'var(--muted)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.device}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLogs.length===0&&<div style={{padding:28,textAlign:'center',color:'var(--muted)'}}>No logs for this period.</div>}
              </div>
            </div>
          )}

          {/* ONBOARDING TAB */}
          {mgrTab==='onboarding'&&(
            <div className="card card-glow" style={{maxWidth:540}}>
              <h3 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'2px',fontSize:19,marginBottom:18}}>ACTIVATION QUEUE</h3>
              <label className="inp-label">SET MONTHLY SALARY (USD)</label>
              <input className="inp" style={{marginBottom:18}} placeholder="e.g. 260" type="number"
                inputMode="numeric" pattern="[0-9]*" onChange={e=>setSalary(e.target.value)}/>
              {agents.filter(a=>a.status==='pending').length===0
                ? <div style={{textAlign:'center',color:'var(--muted)',padding:'20px 0'}}>No pending registrations.</div>
                : agents.filter(a=>a.status==='pending').map(a=>(
                  <div key={a.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 0',borderBottom:'1px solid var(--border)',gap:10,flexWrap:'wrap'}}>
                    <div>
                      <div style={{fontWeight:700}}>{a.name}</div>
                      <div style={{fontSize:11,color:pc[a.platform]||'var(--muted)',marginTop:3,letterSpacing:'1px'}}>{a.platform}</div>
                    </div>
                    <button className="btn btn-green" style={{fontSize:11}} onClick={async()=>{
                      if(!salary) return alert('Please assign a salary first.');
                      await fetch(SHEETS_WEBHOOK,{method:'POST',mode:'no-cors',body:JSON.stringify({
                        date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString(),
                        action:'USER_APPROVE',agent:a.name,device:JSON.stringify({...a,salary:Number(salary)}),timestamp:Date.now()
                      })});
                      fetchData();
                    }}>ACTIVATE</button>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ══ AGENT DETAIL MODAL ══ */}
      {selAgent&&(
        <div className="overlay" onClick={()=>setSelAgent(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag-handle"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:'3px',color:'var(--cyan)'}}>{selAgent.name}</div>
                <div style={{fontSize:11,color:pc[selAgent.platform],letterSpacing:'1px',marginTop:3}}>◆ {selAgent.platform}</div>
              </div>
              <div className="badge" style={{background:`${selAgent.status.color}22`,color:selAgent.status.color,border:`1px solid ${selAgent.status.color}44`}}>
                <div className={`badge-dot${selAgent.status.pulse?' pulse':''}`} style={{background:selAgent.status.color}}/>
                {selAgent.status.label}
              </div>
            </div>

            <div className="grid-3s" style={{marginBottom:18}}>
              {[
                {l:'CLOCK IN', v:selAgent.clockInTime?new Date(selAgent.clockInTime).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'--:--', a:false, hi:false},
                {l:'BREAK',    v:fmtShort(selAgent.totalBreakMs), a:selAgent.breakOverLimit, hi:false},
                {l:'NET WORK', v:fmt(selAgent.netMs), a:false, hi:true},
              ].map(s=>(
                <div key={s.l} style={{background:'var(--surface)',borderRadius:10,padding:11,border:`1px solid ${s.a?'rgba(255,23,68,.3)':'var(--border)'}`,textAlign:'center'}}>
                  <div style={{fontSize:'clamp(12px,4vw,17px)',fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",
                    color:s.a?'var(--red)':s.hi?'var(--cyan)':'var(--text)'}}>{s.v}</div>
                  <div style={{fontSize:9,color:'var(--muted)',letterSpacing:'1.5px',marginTop:3}}>{s.l}</div>
                </div>
              ))}
            </div>

            <div className="prog-wrap" style={{marginBottom:18}}>
              <div className="prog-label"><span>SHIFT COMPLETION</span><span>{selAgent.shiftPct.toFixed(0)}%</span></div>
              <div className="prog-track" style={{height:6}}>
                <div className="prog-fill" style={{width:`${selAgent.shiftPct}%`,background:selAgent.shiftPct>=100?'var(--green)':'linear-gradient(90deg,var(--blue),var(--cyan))'}}/>
              </div>
            </div>

            {selAgent.breakOverLimit&&(
              <div className="alert alert-danger" style={{marginBottom:14}}>
                ⚠ Break exceeded by {fmtShort(selAgent.totalBreakMs-BREAK_LIMIT_MS)}
              </div>
            )}

            <h4 style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:'2px',fontSize:14,marginBottom:12}}>TODAY'S ACTIVITY</h4>
            {selAgent.todayLogs.length===0
              ? <div style={{color:'var(--muted)',fontSize:13,textAlign:'center',padding:'14px 0'}}>No activity today.</div>
              : <div className="timeline">
                  {selAgent.todayLogs.map((l,i)=>(
                    <div className="tl-item" key={i}>
                      <div className="tl-dot" style={{background:ACTION_COLORS[l.action]||'var(--muted)'}}/>
                      <div className="tl-time">{l.time}</div>
                      <div className="tl-act" style={{color:ACTION_COLORS[l.action]||'var(--text)'}}>{ACTION_LABELS[l.action]||l.action}</div>
                    </div>
                  ))}
                </div>
            }
            <button className="btn btn-ghost btn-full" style={{marginTop:18}} onClick={()=>setSelAgent(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}