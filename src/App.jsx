import { useState, useEffect, useMemo } from 'react';

// Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6
const AGENTS = [
  // ── 9am-5pm ──
  { name: 'Eli', pin: '2674', shiftStart: 9, dayOff: 0, platform: 'DMCA', pColor: '#94a3b8' }, 
  { name: 'Mary', pin: '5819', shiftStart: 9, dayOff: 6, platform: 'Chargeback', pColor: '#f43f5e' }, 
  { name: 'Robert', pin: '7342', shiftStart: 9, dayOff: 5, platform: 'Chargeback', pColor: '#f43f5e' }, 

  // ── 7am-3pm ──
  { name: 'Jon', pin: '8495', shiftStart: 7, dayOff: 0, platform: 'KANAL', pColor: '#eab308' }, 
  { name: 'Porsha', pin: '6148', shiftStart: 7, dayOff: 6, platform: 'KANAL / Trustpilot', pColor: '#22c55e' }, 
  { name: 'Hawuki', pin: '9507', shiftStart: 7, dayOff: 1, platform: 'Helpwave', pColor: '#f97316' }, 
  { name: 'Chris', pin: '5834', shiftStart: 7, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Icho', pin: '1537', shiftStart: 7, dayOff: 3, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Chin', pin: '3256', shiftStart: 7, dayOff: 4, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Marc', pin: '8364', shiftStart: 7, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Art', pin: '9031', shiftStart: 7, dayOff: 2, platform: 'META', pColor: '#3b82f6' }, 
  { name: 'Charles', pin: '8237', shiftStart: 7, dayOff: 1, platform: 'META', pColor: '#3b82f6' },
  { name: 'Luna', pin: '1472', shiftStart: 7, dayOff: 3, platform: 'META', pColor: '#3b82f6' },

  // ── 3pm-11pm ──
  { name: 'Giah', pin: '4587', shiftStart: 15, dayOff: 4, platform: 'META', pColor: '#3b82f6' },
  { name: 'Bulad', pin: '5682', shiftStart: 15, dayOff: 5, platform: 'META', pColor: '#3b82f6' },
  { name: 'Trellix', pin: '8609', shiftStart: 15, dayOff: 0, platform: 'META', pColor: '#3b82f6' },
  { name: 'Aljane', pin: '4863', shiftStart: 15, dayOff: 2, platform: 'META', pColor: '#3b82f6' },
  { name: 'Koko', pin: '3726', shiftStart: 15, dayOff: 2, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Aruchi', pin: '3485', shiftStart: 15, dayOff: 1, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Seyan', pin: '5091', shiftStart: 15, dayOff: 4, platform: 'KANAL', pColor: '#eab308' },
  { name: 'John', pin: '2893', shiftStart: 15, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Kisses', pin: '7241', shiftStart: 15, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Dani', pin: '4015', shiftStart: 15, dayOff: 0, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Ryujo', pin: '9740', shiftStart: 15, dayOff: 1, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Jiro', pin: '7483', shiftStart: 15, dayOff: 6, platform: 'Helpwave', pColor: '#f97316' },

  // ── 11pm-7am ──
  { name: 'Eunice', pin: '4361', shiftStart: 23, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Kemuel', pin: '6892', shiftStart: 23, dayOff: 3, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Daniel', pin: '6325', shiftStart: 23, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Juliana', pin: '3958', shiftStart: 23, dayOff: 6, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Venellope', pin: '2748', shiftStart: 23, dayOff: 5, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Pea', pin: '9163', shiftStart: 23, dayOff: 3, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Lanie', pin: '1954', shiftStart: 23, dayOff: 0, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Gio', pin: '1263', shiftStart: 23, dayOff: 0, platform: 'META', pColor: '#3b82f6' },
  { name: 'Kate', pin: '2167', shiftStart: 23, dayOff: 5, platform: 'META', pColor: '#3b82f6' },
  { name: 'Juan', pin: '7014', shiftStart: 23, dayOff: 6, platform: 'META', pColor: '#3b82f6' },
  { name: 'Kat', pin: '6720', shiftStart: 23, dayOff: 2, platform: 'META', pColor: '#3b82f6' }
];

const MANAGERS = [
  { name: 'Suley', password: 'fndr-suley-2026' },
  { name: 'Egar', password: 'mgr-Egar-2026' },
  { name: 'Lasgna', password: 'mgr-Lasgna-2026' },
  { name: 'Sinclair', password: 'mgr-Sinclair-2026' },
  { name: 'Drakeyyy', password: 'mgr-Drakeyyy-2026' }
];

const BREAK_LIMIT_MS = 60 * 60 * 1000;
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';

const fmt = (d) => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0m';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

async function logToSheets(payload) {
  if (!SHEETS_WEBHOOK || SHEETS_WEBHOOK.includes('PASTE_YOUR_NEW_URL_HERE')) return;
  try {
    await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Sheets log failed:', e);
  }
}

// ── Shared styles ──
const card = { width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 14 };
const inputBase = { background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8, padding: '10px 14px', fontFamily: "'DM Mono',monospace" };
const labelStyle = { fontSize: 10, color: '#8b949e', letterSpacing: 2, display: 'block', marginBottom: 6 };

export default function AttendanceApp() {
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [records, setRecords] = useState({});
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState('clock');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  const [globalLogs, setGlobalLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [mgrAuthed, setMgrAuthed] = useState(false);
  const [mgrInput, setMgrInput] = useState('');
  const [mgrError, setMgrError] = useState('');
  const [mgrName, setMgrName] = useState('');

  const [overriddenAgents, setOverriddenAgents] = useState({});
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);

  // ── New Features State ──
  const [isHandoverMode, setIsHandoverMode] = useState(false);
  const [handoverNote, setHandoverNote] = useState('');
  
  const [swapA1, setSwapA1] = useState('');
  const [swapD1, setSwapD1] = useState('');
  const [swapA2, setSwapA2] = useState('');
  const [swapD2, setSwapD2] = useState('');
  const [reportData, setReportData] = useState('');

  // ── Sync & Failsafe Timers ──
  useEffect(() => {
    const s = localStorage.getItem('cellumove_att');
    if (s) setRecords(JSON.parse(s));

    const handleStorageChange = (e) => {
      if (e.key === 'cellumove_att' && e.newValue) setRecords(JSON.parse(e.newValue));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      // FIX: 10.5-Hour Failsafe Auto-Checkout
      Object.keys(records).forEach(agentName => {
        const rec = records[agentName];
        if (rec.clockIn && !rec.clockOut && (ts - rec.clockIn > 10.5 * 60 * 60 * 1000)) {
           processAction('autoClockOut', agentName, 'AUTO-CHECKOUT: FORGOT PUNCH');
        }
      });
    }, 60000); // Check every minute
    return () => clearInterval(t);
  }, [records]);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch(SHEETS_WEBHOOK);
      const data = await response.json();
      setGlobalLogs(data.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) { console.error("Failed to fetch logs"); }
    setIsLoadingLogs(false);
  };

  useEffect(() => { if (tab === 'log' || tab === 'manager') fetchLogs(); }, [tab]);

  // ── Shift Swap Parsing Logic ──
  const activeSwaps = useMemo(() => {
    const swaps = [];
    globalLogs.forEach(l => {
      if (l.action === 'SWAP_DAY_OFF') {
        try { swaps.push(JSON.parse(l.device)); } catch (e) {}
      }
    });
    return swaps;
  }, [globalLogs]);

  const checkIsDayOff = (agentName, timestamp) => {
    const agent = AGENTS.find(a => a.name === agentName);
    if (!agent) return false;
    const dObj = new Date(timestamp);
    const dStr = dObj.toDateString();
    let isOff = dObj.getDay() === agent.dayOff;

    activeSwaps.forEach(swap => {
      if (agentName === swap.a1) {
        if (dStr === swap.d1) isOff = false; // Working on normal day off
        if (dStr === swap.d2) isOff = true;  // Taking temporary day off
      }
      if (agentName === swap.a2) {
        if (dStr === swap.d2) isOff = false;
        if (dStr === swap.d1) isOff = true;
      }
    });
    return isOff;
  };

  // ── Core Action Logic ──
  const save = (r) => {
    setRecords(r);
    localStorage.setItem('cellumove_att', JSON.stringify(r));
  };
  const getRec = (n) => records[n] || null;
  const getStatus = (rec) => {
    if (!rec?.clockIn) return 'idle';
    if (rec.clockOut) return 'clocked_out';
    if (rec.onBreak) return 'on_break';
    return 'clocked_in';
  };
  const breakLeft = (rec) => {
    let u = rec?.breakUsedMs || 0;
    if (rec?.onBreak && rec?.breakStart) u += now - rec.breakStart;
    return Math.max(0, BREAK_LIMIT_MS - u);
  };

  const processAction = async (actionType, agentName, specialNote = '') => {
    const agent = AGENTS.find((x) => x.name === agentName);
    const rec = getRec(agentName) || {};
    const status = getStatus(rec);
    const ts = Date.now();
    const todayStr = new Date().toDateString();
    let next = { ...rec };
    let logActionStr = actionType;
    let finalDeviceLog = navigator.userAgent.slice(0, 100);

    if (actionType === 'clockIn') {
      if (rec.date && rec.date !== todayStr) next = { history: rec.history || [] }; 
      let lateness = "ON TIME";
      if (!checkIsDayOff(agentName, ts)) {
         let exp = new Date(ts);
         exp.setHours(agent.shiftStart, 0, 0, 0);
         if (agent.shiftStart === 23 && new Date(ts).getHours() < 12) exp.setDate(exp.getDate() - 1);
         if (ts > exp.getTime() + (5 * 60 * 1000)) lateness = ts > exp.getTime() + (30 * 60 * 1000) ? "VERY LATE" : "LATE";
      } else { lateness = "DAY OFF OT"; }
      
      logActionStr = `clockIn [${lateness}]`;
      next = { ...next, clockIn: ts, date: todayStr, clockOut: null, onBreak: false, breakUsedMs: 0, breakStart: null, latenessStr: lateness };
      setSuccess(`✅ Clocked in at ${fmt(ts)}`);

    } else if (actionType === 'breakStart') {
      next = { ...next, onBreak: true, breakStart: ts };
      setSuccess(`☕ Break started`);
    } else if (actionType === 'breakEnd') {
      const used = (rec.breakUsedMs || 0) + (ts - rec.breakStart);
      next = { ...next, onBreak: false, breakStart: null, breakUsedMs: used };
      setSuccess(`💼 Back to work`);
    } else if (actionType === 'clockOut' || actionType === 'autoClockOut') {
      let used = rec.breakUsedMs || 0;
      if (rec.onBreak && rec.breakStart) {
        used += (ts - rec.breakStart);
        next = { ...next, onBreak: false, breakStart: null, breakUsedMs: used };
      }
      
      // FIX: Calculate based on inclusive 8-hour shift
      const totalElapsedMs = ts - rec.clockIn; 
      
      let quotaStatus = checkIsDayOff(agentName, ts) ? `REST DAY OT: ${fmtDur(totalElapsedMs)}` : "";
      if (!quotaStatus) {
         const quota = 8 * 60 * 60 * 1000;
         quotaStatus = totalElapsedMs >= quota 
           ? (totalElapsedMs - quota < 60000 ? "QUOTA MET" : `OT: ${fmtDur(totalElapsedMs - quota)}`) 
           : `UNDERTIME: ${fmtDur(quota - totalElapsedMs)}`;
      }
      
      logActionStr = `clockOut [${quotaStatus}]${specialNote ? ` [${specialNote}]` : ''}`;
      if (handoverNote) finalDeviceLog = `Note: ${handoverNote}`;
      
      next = { ...next, clockOut: ts, quotaStr: quotaStatus };
      setSuccess(`🏁 Clocked out! Total Shift Time: ${fmtDur(totalElapsedMs)}`);
    }

    const entry = { date: fmtDate(ts), time: fmt(ts), action: logActionStr, agent: agentName, device: finalDeviceLog, timestamp: ts };
    next.history = [...(rec.history || []), entry];
    save({ ...records, [agentName]: next });
    await logToSheets(entry);
    
    setPin(''); setHandoverNote(''); setIsHandoverMode(false);
    setTimeout(() => setSuccess(''), 5000); 
  };

  const attemptAction = (action) => {
    if (!selected) return setError('Select your name.');
    const a = AGENTS.find(x => x.name === selected);
    if (a.pin !== pin.trim()) return setError('Incorrect PIN.');
    setError('');
    
    if (action === 'clockOut') return setIsHandoverMode(true);
    processAction(action, selected);
  };

  // ── Manager Systems ──
  const handleMgrLogin = () => {
    const mgr = MANAGERS.find(m => m.password === mgrInput.trim());
    if (mgr) { setMgrAuthed(true); setMgrName(mgr.name); setMgrError(''); }
    else setMgrError('Incorrect password.');
  };

  const processShiftSwap = async () => {
    if (!swapA1 || !swapA2 || !swapD1 || !swapD2) return alert('Fill all swap fields.');
    const d1Str = new Date(swapD1 + 'T12:00:00').toDateString();
    const d2Str = new Date(swapD2 + 'T12:00:00').toDateString();
    
    const entry = {
      date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'SWAP_DAY_OFF', agent: mgrName,
      device: JSON.stringify({ a1: swapA1, a2: swapA2, d1: d1Str, d2: d2Str }), timestamp: Date.now()
    };
    await logToSheets(entry);
    alert(`Swap Approved! ${swapA1} & ${swapA2} schedules updated.`);
    fetchLogs();
  };

  const generateDailyReport = () => {
    const today = new Date().toDateString();
    const logsToday = globalLogs.filter(l => new Date(l.timestamp).toDateString() === today);
    
    let present = new Set(); let lates = []; let ots = [];
    logsToday.forEach(l => {
      if (l.action.startsWith('clockIn')) present.add(l.agent);
      if (l.action.includes('LATE')) lates.push(l.agent);
      if (l.action.includes('[OT:') || l.action.includes('REST DAY OT')) ots.push(`${l.agent} (${l.action.split('[')[1].replace(']','')})`);
    });

    const activeAgents = AGENTS.filter(a => !checkIsDayOff(a.name, Date.now()));
    const missing = activeAgents.filter(a => {
       const shiftMs = new Date().setHours(a.shiftStart, 0, 0, 0);
       return Date.now() > shiftMs && !present.has(a.name);
    }).map(a => a.name);

    setReportData(
      `📅 DAILY OPERATIONS REPORT: ${today}\n` +
      `-----------------------------------------\n` +
      `👥 TOTAL PRESENT: ${present.size}\n` +
      `⚠️ LATE: ${lates.length > 0 ? lates.join(', ') : 'None'}\n` +
      `🚨 ABSENT/MISSING: ${missing.length > 0 ? missing.join(', ') : 'None'}\n` +
      `⏱️ OVERTIME: ${ots.length > 0 ? ots.join(', ') : 'None'}\n` +
      `-----------------------------------------`
    );
  };

  const checkCloudOverride = async () => {
    setIsCheckingCloud(true); setError('');
    try {
      await fetchLogs();
      const hasOverride = globalLogs.some(l => l.agent === selected && l.action === 'Manager Override' && new Date(l.timestamp).toDateString() === new Date().toDateString());
      if (hasOverride) { setOverriddenAgents(p => ({ ...p, [selected]: true })); setSuccess('✅ Cloud authorization found!'); }
      else setError('No authorization found yet.');
    } catch (e) { setError('Network error.'); }
    setIsCheckingCloud(false);
  };

  const curRec = selected ? getRec(selected) : null;
  const curStatus = getStatus(curRec);
  const selectedAgent = AGENTS.find(a => a.name === selected);
  const isDayOff = selectedAgent ? checkIsDayOff(selectedAgent.name, Date.now()) : false;
  const needsOverride = isDayOff && curStatus === 'idle' && !overriddenAgents[selected];

  // ── Render Utilities ──
  const Badge = ({ status }) => {
    const map = { idle: ['#64748b', 'IDLE'], clocked_in: ['#22c55e', 'CLOCKED IN'], on_break: ['#f59e0b', 'ON BREAK'], clocked_out: ['#3b82f6', 'CLOCKED OUT'], day_off: ['#a78bfa', 'DAY OFF'] };
    const [color, label] = map[status] || map.idle;
    return <span style={{ background: color+'22', color, border: `1px solid ${color}55`, borderRadius: 6, padding: '3px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>{label}</span>;
  };

  const renderAction = (str) => {
    if (str === 'Manager Override') return <span style={{ color: '#c084fc', fontWeight: 600 }}>🔓 Override Granted</span>;
    if (str === 'SWAP_DAY_OFF') return <span style={{ color: '#ec4899', fontWeight: 600 }}>🔄 Shift Swap Approved</span>;
    if (str.startsWith('clockIn')) return <span style={{ color: str.includes('LATE') ? '#f87171' : '#4ade80', fontWeight: 600 }}>▶ Clock In {str.match(/\[(.*?)\]/)?.[0] || ''}</span>;
    if (str.startsWith('clockOut')) return <span style={{ color: str.includes('UNDER') ? '#f87171' : str.includes('OT') ? '#fbbf24' : '#a78bfa', fontWeight: 600 }}>⏹ Clock Out {str.match(/\[(.*?)\]/)?.[0] || ''}</span>;
    if (str === 'breakStart') return <span style={{ color: '#fbbf24', fontWeight: 600 }}>☕ Break Start</span>;
    if (str === 'breakEnd') return <span style={{ color: '#60a5fa', fontWeight: 600 }}>💼 Break End</span>;
    return <span style={{ color: '#e6edf3' }}>{str}</span>;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', fontFamily: "'DM Mono',monospace", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px 80px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-track{background:#161b22} ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        select,input,textarea{outline:none} select option{background:#161b22;color:#e6edf3}
        .btn{cursor:pointer;transition:all .15s;border:none;font-family:'DM Mono',monospace;font-weight:500;letter-spacing:.5px}
        .btn:hover:not(:disabled){filter:brightness(1.18);transform:translateY(-1px)} .btn:active:not(:disabled){transform:translateY(0)} .btn:disabled{cursor:not-allowed;opacity:.4}
        .tab-btn{background:none;border:none;cursor:pointer;padding:8px 20px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:1.2px;text-transform:uppercase}
        .fade-in{animation:fadeIn .3s ease} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header & Tabs */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: '#58a6ff', marginBottom: 8 }}>CELLUMOVE · WEAVNONO LLC</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 'clamp(26px,5vw,42px)', color: '#e6edf3', margin: 0, letterSpacing: -1 }}>ATTENDANCE <span style={{ color: '#58a6ff' }}>SYSTEM</span></h1>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>{new Date(now).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &nbsp; <span style={{ color: '#58a6ff', fontWeight: 500 }}>{new Date(now).toLocaleTimeString('en-PH')}</span></div>
      </div>

      <div style={{ display: 'flex', marginBottom: 28, border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
        {[['clock', '⏱ Clock'], ['log', '📋 Log'], ['manager', '👔 Manager'], ['pins', '🔑 PINs']].map(([t, l], i) => (
          <button key={t} className="tab-btn" onClick={() => setTab(t)} style={{ color: tab === t ? '#58a6ff' : '#8b949e', background: tab === t ? '#161b22' : 'transparent', borderRight: i < 3 ? '1px solid #30363d' : 'none' }}>{l}</button>
        ))}
      </div>

      {/* ── CLOCK TAB ── */}
      {tab === 'clock' && (
        <div className="fade-in" style={{ ...card, maxWidth: 460, padding: '32px 28px' }}>
          <label style={labelStyle}>SELECT AGENT</label>
          <select value={selected} onChange={(e) => { setSelected(e.target.value); setPin(''); setError(''); setSuccess(''); setIsHandoverMode(false); }} style={{ ...inputBase, width: '100%', fontSize: 14, marginBottom: 18 }}>
            <option value="">— Choose your name —</option>
            {AGENTS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>

          {selected && (
            <div style={{ background: '#0d1117', borderRadius: 8, padding: '12px 14px', marginBottom: 18, border: `1px solid ${needsOverride ? '#a78bfa' : '#21262d'}`, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div><div style={labelStyle}>STATUS</div><Badge status={needsOverride ? 'day_off' : curStatus} /></div>
                {selectedAgent?.platform && (
                  <div><div style={labelStyle}>PLATFORM</div><span style={{ background: selectedAgent.pColor+'22', color: selectedAgent.pColor, border: `1px solid ${selectedAgent.pColor}55`, borderRadius: 6, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>{selectedAgent.platform}</span></div>
                )}
              </div>
            </div>
          )}

          {!isHandoverMode && (
            <>
              <label style={labelStyle}>ENTER PIN</label>
              <input type="password" maxLength={6} value={pin} onChange={(e) => {setPin(e.target.value); setError('');}} placeholder="· · · ·" disabled={needsOverride} style={{ ...inputBase, width: '100%', fontSize: 24, marginBottom: 20, letterSpacing: 10, textAlign: 'center', opacity: needsOverride ? 0.4 : 1 }} />
              
              {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 14, textAlign: 'center' }}>{error}</div>}
              {success && <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>{success}</div>}

              {needsOverride ? (
                <div style={{ background: '#1c1626', padding: 20, borderRadius: 8, border: '1px solid #6b21a8', textAlign: 'center' }}>
                  <div style={{ color: '#c084fc', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🔒 SCHEDULED DAY OFF</div>
                  <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 16 }}>Request OT approval from a manager, then click below.</div>
                  <button className="btn" onClick={checkCloudOverride} disabled={isCheckingCloud} style={{ width: '100%', padding: 12, borderRadius: 6, background: '#7e22ce', color: '#fff', fontSize: 12 }}>
                    {isCheckingCloud ? '↻ CHECKING CLOUD...' : '☁️ CHECK CLOUD APPROVAL'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button className="btn" onClick={() => attemptAction('clockIn')} disabled={curStatus === 'clocked_in' || curStatus === 'on_break'} style={{ gridColumn: '1/-1', padding: 13, borderRadius: 8, background: curStatus === 'idle' || curStatus === 'clocked_out' ? '#238636' : '#21262d', color: '#fff' }}>▶ CLOCK IN</button>
                  <button className="btn" onClick={() => attemptAction('breakStart')} disabled={curStatus !== 'clocked_in'} style={{ padding: 13, borderRadius: 8, background: curStatus === 'clocked_in' ? '#9a3412' : '#21262d', color: '#fff' }}>☕ BREAK START</button>
                  <button className="btn" onClick={() => attemptAction('breakEnd')} disabled={curStatus !== 'on_break'} style={{ padding: 13, borderRadius: 8, background: curStatus === 'on_break' ? '#1d4ed8' : '#21262d', color: '#fff' }}>💼 BREAK END</button>
                  <button className="btn" onClick={() => attemptAction('clockOut')} disabled={curStatus !== 'clocked_in' && curStatus !== 'on_break'} style={{ gridColumn: '1/-1', padding: 13, borderRadius: 8, background: curStatus === 'clocked_in' || curStatus === 'on_break' ? '#6e40c9' : '#21262d', color: '#fff' }}>⏹ CLOCK OUT</button>
                </div>
              )}
            </>
          )}

          {isHandoverMode && (
            <div className="fade-in" style={{ background: '#0d1117', padding: 20, borderRadius: 8, border: '1px solid #30363d' }}>
              <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Shift Handover Notes</div>
              <textarea value={handoverNote} onChange={e => setHandoverNote(e.target.value)} placeholder="Note pending escalations, issues, etc..." style={{ ...inputBase, width: '100%', height: 80, resize: 'none', marginBottom: 16, fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={() => setIsHandoverMode(false)} style={{ flex: 1, padding: 10, borderRadius: 6, background: '#21262d', color: '#e6edf3' }}>Cancel</button>
                <button className="btn" onClick={() => processAction('clockOut', selected)} style={{ flex: 2, padding: 10, borderRadius: 6, background: '#6e40c9', color: '#fff' }}>CONFIRM CLOCK OUT</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MANAGER DASHBOARD ── */}
      {(tab === 'manager' || tab === 'pins') && !mgrAuthed && (
        <div className="fade-in" style={{ ...card, maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 20, color: '#e6edf3', marginBottom: 24 }}>Manager Access Only</div>
          <input type="password" value={mgrInput} onChange={e => {setMgrInput(e.target.value); setMgrError('');}} placeholder="Password" onKeyDown={e => e.key === 'Enter' && handleMgrLogin()} style={{ ...inputBase, width: '100%', marginBottom: 12, textAlign: 'center' }} />
          {mgrError && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{mgrError}</div>}
          <button className="btn" onClick={handleMgrLogin} style={{ width: '100%', padding: 12, borderRadius: 8, background: '#1f6feb', color: '#fff' }}>UNLOCK DASHBOARD</button>
        </div>
      )}

      {tab === 'manager' && mgrAuthed && (
        <div className="fade-in" style={{ width: '100%', maxWidth: 860, display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
          
          {/* Missing Agents Panel */}
          <div style={{ ...card, padding: 24 }}>
             <h3 style={{ margin: '0 0 16px 0', color: '#e6edf3', fontSize: 15 }}>🚨 Live Absence Tracker</h3>
             {(() => {
                const present = new Set(globalLogs.filter(l => l.action.startsWith('clockIn') && new Date(l.timestamp).toDateString() === new Date().toDateString()).map(l => l.agent));
                const missing = AGENTS.filter(a => {
                  if (checkIsDayOff(a.name, Date.now())) return false;
                  return Date.now() > new Date().setHours(a.shiftStart, 0, 0, 0) && !present.has(a.name);
                });
                if (missing.length === 0) return <div style={{ color: '#4ade80', fontSize: 13 }}>All scheduled agents are present!</div>;
                return missing.map(a => <div key={a.name} style={{ background: '#450a0a', border: '1px solid #7f1d1d', padding: '8px 12px', borderRadius: 6, color: '#fca5a5', fontSize: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>{a.name}</span><span>{a.shiftStart}:00 Shift</span></div>);
             })()}
          </div>

          {/* Daily Report Generator */}
          <div style={{ ...card, padding: 24 }}>
             <h3 style={{ margin: '0 0 16px 0', color: '#e6edf3', fontSize: 15 }}>📊 Daily Operations Report</h3>
             <button className="btn" onClick={generateDailyReport} style={{ width: '100%', padding: 10, borderRadius: 6, background: '#238636', color: '#fff', marginBottom: 16 }}>GENERATE TODAY'S REPORT</button>
             {reportData && <textarea readOnly value={reportData} style={{ ...inputBase, width: '100%', height: 140, resize: 'none', fontSize: 11 }} />}
          </div>

          {/* Shift Swapper */}
          <div style={{ ...card, padding: 24, gridColumn: '1/-1' }}>
             <h3 style={{ margin: '0 0 8px 0', color: '#e6edf3', fontSize: 15 }}>🔄 Temporary Shift Swapper</h3>
             <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 16 }}>Select two agents and the dates they are taking off. This automatically syncs to their clock-in screens.</div>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
               <div>
                 <label style={labelStyle}>AGENT 1</label>
                 <select value={swapA1} onChange={e => setSwapA1(e.target.value)} style={{ ...inputBase, width: '100%', marginBottom: 8, fontSize: 13 }}><option value="">Select</option>{AGENTS.map(a => <option key={a.name}>{a.name}</option>)}</select>
                 <input type="date" value={swapD1} onChange={e => setSwapD1(e.target.value)} style={{ ...inputBase, width: '100%', fontSize: 13 }} />
                 <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>Date Agent 1 will be OFF</div>
               </div>
               <div>
                 <label style={labelStyle}>AGENT 2</label>
                 <select value={swapA2} onChange={e => setSwapA2(e.target.value)} style={{ ...inputBase, width: '100%', marginBottom: 8, fontSize: 13 }}><option value="">Select</option>{AGENTS.map(a => <option key={a.name}>{a.name}</option>)}</select>
                 <input type="date" value={swapD2} onChange={e => setSwapD2(e.target.value)} style={{ ...inputBase, width: '100%', fontSize: 13 }} />
                 <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>Date Agent 2 will be OFF</div>
               </div>
             </div>
             <button className="btn" onClick={processShiftSwap} style={{ width: '100%', padding: 12, borderRadius: 6, background: '#7e22ce', color: '#fff' }}>APPROVE & SYNC SWAP</button>
          </div>
        </div>
      )}

      {/* ── LOG & PIN TABS (Unchanged layout structure, dynamically populated) ── */}
      {tab === 'log' && (
        <div className="fade-in" style={{ ...card, maxWidth: 900, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #21262d', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontFamily: "'Syne'", fontWeight: 700, color: '#e6edf3', fontSize: 15, marginRight: 'auto' }}>Attendance Log</div>
            {isLoadingLogs && <span style={{ color: '#58a6ff', fontSize: 12 }}>Syncing...</span>}
            <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={{ ...inputBase, padding: '6px 10px', fontSize: 12 }}><option value="all">All</option>{AGENTS.map(a => <option key={a.name}>{a.name}</option>)}</select>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 600 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#0d1117' }}>{['Date', 'Time', 'Agent', 'Action', 'Notes / Device'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8b949e', fontWeight: 500, borderBottom: '1px solid #21262d' }}>{h}</th>)}</tr></thead>
              <tbody>
                {globalLogs.slice(0,400).filter(l => filterAgent === 'all' || l.agent === filterAgent).map((l, i) => (
                  <tr key={i} className="row-hover" style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '10px 16px', color: '#8b949e', whiteSpace: 'nowrap' }}>{l.date}</td>
                    <td style={{ padding: '10px 16px', color: '#e6edf3' }}>{l.time}</td>
                    <td style={{ padding: '10px 16px', color: '#e6edf3', fontWeight: 500 }}>{l.agent}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{renderAction(l.action)}</td>
                    <td style={{ padding: '10px 16px', color: l.device.startsWith('Note:') ? '#58a6ff' : '#484f58', fontStyle: l.device.startsWith('Note:') ? 'italic' : 'normal', fontSize: 11, maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.device}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'pins' && mgrAuthed && (
        <div className="fade-in" style={{ ...card, maxWidth: 500, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontFamily: "'Syne'", fontWeight: 700, color: '#e6edf3', fontSize: 15 }}>Agent PINs</div></div>
            <button className="btn" onClick={handleMgrLogout} style={{ background: '#21262d', color: '#f87171', borderRadius: 6, padding: '6px 12px', fontSize: 11 }}>🔒 Lock</button>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {AGENTS.map((a, i) => (
              <div key={a.name} className="row-hover" style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 24px', borderBottom: '1px solid #21262d' }}>
                <span style={{ color: '#e6edf3', fontSize: 13 }}>{a.name}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#58a6ff', letterSpacing: 5 }}>{a.pin}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}