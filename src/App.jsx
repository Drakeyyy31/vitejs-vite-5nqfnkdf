import { useState, useEffect, useMemo } from 'react';

// ── ROLE ASSIGNMENTS ──
const getAgentRole = (name) => {
  const seniors = ['Gio', 'Giah', 'Art', 'Jon', 'Koko', 'Hawuki', 'John', 'Eunice'];
  if (name === 'Eli') return 'DMCA / Senior';
  if (['Mary', 'Robert'].includes(name)) return 'Senior / Chargeback';
  if (name === 'Venellope') return 'Acting Senior';
  if (seniors.includes(name)) return 'Senior Agent';
  return 'Junior Agent';
};

const AGENTS = [
  // ── 9am-5pm ──
  { name: 'Eli', defaultPin: '2674', shiftStart: 9, dayOff: 0, platform: 'DMCA', pColor: '#94a3b8' }, 
  { name: 'Mary', defaultPin: '5819', shiftStart: 9, dayOff: 6, platform: 'Chargeback', pColor: '#f43f5e' }, 
  { name: 'Robert', defaultPin: '7342', shiftStart: 9, dayOff: 5, platform: 'Chargeback', pColor: '#f43f5e' }, 

  // ── 7am-3pm ──
  { name: 'Jon', defaultPin: '8495', shiftStart: 7, dayOff: 0, platform: 'KANAL', pColor: '#eab308' }, 
  { name: 'Porsha', defaultPin: '6148', shiftStart: 7, dayOff: 6, platform: 'KANAL / Trustpilot', pColor: '#22c55e' }, 
  { name: 'Hawuki', defaultPin: '9507', shiftStart: 7, dayOff: 1, platform: 'Helpwave', pColor: '#f97316' }, 
  { name: 'Chris', defaultPin: '5834', shiftStart: 7, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Icho', defaultPin: '1537', shiftStart: 7, dayOff: 3, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Chin', defaultPin: '3256', shiftStart: 7, dayOff: 4, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Marc', defaultPin: '8364', shiftStart: 7, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Art', defaultPin: '9031', shiftStart: 7, dayOff: 2, platform: 'META', pColor: '#3b82f6' }, 
  { name: 'Charles', defaultPin: '8237', shiftStart: 7, dayOff: 1, platform: 'META', pColor: '#3b82f6' },
  { name: 'Luna', defaultPin: '1472', shiftStart: 7, dayOff: 3, platform: 'META', pColor: '#3b82f6' },

  // ── 3pm-11pm ──
  { name: 'Giah', defaultPin: '4587', shiftStart: 15, dayOff: 4, platform: 'META', pColor: '#3b82f6' },
  { name: 'Bulad', defaultPin: '5682', shiftStart: 15, dayOff: 5, platform: 'META', pColor: '#3b82f6' },
  { name: 'Trellix', defaultPin: '8609', shiftStart: 15, dayOff: 0, platform: 'META', pColor: '#3b82f6' },
  { name: 'Aljane', defaultPin: '4863', shiftStart: 15, dayOff: 2, platform: 'META', pColor: '#3b82f6' },
  { name: 'Koko', defaultPin: '3726', shiftStart: 15, dayOff: 2, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Aruchi', defaultPin: '3485', shiftStart: 15, dayOff: 1, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Seyan', defaultPin: '5091', shiftStart: 15, dayOff: 4, platform: 'KANAL', pColor: '#eab308' },
  { name: 'John', defaultPin: '2893', shiftStart: 15, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Kisses', defaultPin: '7241', shiftStart: 15, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Dani', defaultPin: '4015', shiftStart: 15, dayOff: 0, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Ryujo', defaultPin: '9740', shiftStart: 15, dayOff: 1, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Jiro', defaultPin: '7483', shiftStart: 15, dayOff: 6, platform: 'Helpwave', pColor: '#f97316' },

  // ── 11pm-7am ──
  { name: 'Eunice', defaultPin: '4361', shiftStart: 23, dayOff: 2, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Kemuel', defaultPin: '6892', shiftStart: 23, dayOff: 3, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Daniel', defaultPin: '6325', shiftStart: 23, dayOff: 5, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Juliana', defaultPin: '3958', shiftStart: 23, dayOff: 6, platform: 'Helpwave', pColor: '#f97316' },
  { name: 'Venellope', defaultPin: '2748', shiftStart: 23, dayOff: 5, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Pea', defaultPin: '9163', shiftStart: 23, dayOff: 3, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Lanie', defaultPin: '1954', shiftStart: 23, dayOff: 0, platform: 'KANAL', pColor: '#eab308' },
  { name: 'Gio', defaultPin: '1263', shiftStart: 23, dayOff: 0, platform: 'META', pColor: '#3b82f6' },
  { name: 'Kate', defaultPin: '2167', shiftStart: 23, dayOff: 5, platform: 'META', pColor: '#3b82f6' },
  { name: 'Juan', defaultPin: '7014', shiftStart: 23, dayOff: 6, platform: 'META', pColor: '#3b82f6' },
  { name: 'Kat', defaultPin: '6720', shiftStart: 23, dayOff: 2, platform: 'META', pColor: '#3b82f6' }
].map(a => ({ ...a, role: getAgentRole(a.name) }));

const MANAGERS = [
  { name: 'Suley', role: 'Head Manager / Founder', password: 'fndr-suley-2026' },
  { name: 'Egar', role: 'Head Manager', password: 'mgr-Egar-2026' },
  { name: 'Drakeyyy', role: 'Meta Manager', password: 'mgr-Drakeyyy-2026' },
  { name: 'Lasgna', role: 'Helpwave Manager', password: 'mgr-Lasgna-2026' },
  { name: 'Sinclair', role: 'Kanal Manager', password: 'mgr-Sinclair-2026' }
];

const BREAK_LIMIT_MS = 60 * 60 * 1000;
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';

const fmt = (d) => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtInputDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0m';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

async function logToSheets(payload) {
  if (!SHEETS_WEBHOOK || SHEETS_WEBHOOK.includes('PASTE_YOUR_NEW_URL_HERE')) return;
  try {
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) { console.warn('Sheets log failed:', e); }
}

const card = { width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 14 };
const inputBase = { background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8, padding: '10px 14px', fontFamily: "'DM Mono',monospace" };
const labelStyle = { fontSize: 10, color: '#8b949e', letterSpacing: 2, display: 'block', marginBottom: 6 };

export default function AttendanceApp() {
  const [view, setView] = useState('landing'); // 'landing', 'agentLogin', 'mgrLogin', 'agentPortal', 'mgrPortal'
  const [mgrTab, setMgrTab] = useState('dashboard'); // 'dashboard', 'logs', 'pins'
  
  const [selectedAgentName, setSelectedAgentName] = useState('');
  const [pinInput, setPinInput] = useState('');
  
  const [loggedInAgent, setLoggedInAgent] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [mgrRole, setMgrRole] = useState('');
  const [mgrInput, setMgrInput] = useState('');
  const [mgrAuthed, setMgrAuthed] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [records, setRecords] = useState({});
  const [customPins, setCustomPins] = useState({});
  const [now, setNow] = useState(Date.now());
  
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterDate, setFilterDate] = useState(fmtInputDate(Date.now()));
  
  const [globalLogs, setGlobalLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [overriddenAgents, setOverriddenAgents] = useState({});
  const [overridePass, setOverridePass] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);

  const [isHandoverMode, setIsHandoverMode] = useState(false);
  const [handoverNote, setHandoverNote] = useState('');
  
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPin, setNewPin] = useState('');

  const [swapA1, setSwapA1] = useState('');
  const [swapD1, setSwapD1] = useState('');
  const [swapA2, setSwapA2] = useState('');
  const [swapD2, setSwapD2] = useState('');
  
  const [reportTimeframe, setReportTimeframe] = useState('today');
  const [reportData, setReportData] = useState('');

  useEffect(() => {
    const r = localStorage.getItem('cellumove_att');
    if (r) setRecords(JSON.parse(r));
    const p = localStorage.getItem('cellumove_pins');
    if (p) setCustomPins(JSON.parse(p));

    const handleStorageChange = (e) => {
      if (e.key === 'cellumove_att' && e.newValue) setRecords(JSON.parse(e.newValue));
      if (e.key === 'cellumove_pins' && e.newValue) setCustomPins(JSON.parse(e.newValue));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      Object.keys(records).forEach(agentName => {
        const rec = records[agentName];
        if (rec.clockIn && !rec.clockOut && !rec.onPause && (ts - rec.clockIn - (rec.pauseUsedMs || 0) > 10.5 * 60 * 60 * 1000)) {
           processAction('autoClockOut', agentName, 'AUTO-CHECKOUT: FORGOT PUNCH');
        }
      });
    }, 1000); 
    return () => clearInterval(t);
  }, [records]);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch(SHEETS_WEBHOOK);
      const rawData = await response.json();

      const cleanData = rawData.map(l => {
        let validTs = Number(l.timestamp);
        if (!validTs || isNaN(validTs)) validTs = new Date(`${l.date} ${l.time}`).getTime();
        return { ...l, timestamp: validTs };
      });

      const sortedData = cleanData.sort((a, b) => b.timestamp - a.timestamp);
      setGlobalLogs(sortedData);
      setIsLoadingLogs(false);
      return sortedData; 
    } catch (error) { 
      console.error("Failed to fetch logs"); 
      setIsLoadingLogs(false);
      return []; 
    }
  };

  useEffect(() => { if (view === 'agentPortal' || view === 'mgrPortal') fetchLogs(); }, [view]);

  const activeSwaps = useMemo(() => {
    const swaps = [];
    globalLogs.forEach(l => {
      if (l.action === 'SWAP_DAY_OFF') { try { swaps.push(JSON.parse(l.device)); } catch (e) {} }
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
      if (agentName === swap.a1) { if (dStr === swap.d1) isOff = false; if (dStr === swap.d2) isOff = true; }
      if (agentName === swap.a2) { if (dStr === swap.d2) isOff = false; if (dStr === swap.d1) isOff = true; }
    });
    return isOff;
  };

  const save = (r) => { setRecords(r); localStorage.setItem('cellumove_att', JSON.stringify(r)); };
  const savePins = (p) => { setCustomPins(p); localStorage.setItem('cellumove_pins', JSON.stringify(p)); };
  
  const getRec = (n) => records[n] || null;
  const getStatus = (rec) => {
    if (!rec?.clockIn) return 'idle';
    if (rec.clockOut) return 'clocked_out';
    if (rec.onPause) return 'paused';
    if (rec.onBreak) return 'on_break';
    return 'clocked_in';
  };
  
  const breakLeft = (rec) => {
    let u = rec?.breakUsedMs || 0;
    if (rec?.onBreak && rec?.breakStart) u += now - rec.breakStart;
    return Math.max(0, BREAK_LIMIT_MS - u);
  };

  const getActivePin = (agentName) => customPins[agentName] || AGENTS.find(a => a.name === agentName)?.defaultPin;

  // ── AUTHENTICATION ──
  const handleAgentAuth = () => {
    if (!selectedAgentName) return setError('Please select your username.');
    const activePin = getActivePin(selectedAgentName);
    if (pinInput.trim() !== activePin) return setError('Incorrect Password/PIN.');
    
    setError('');
    setPinInput('');
    setLoggedInAgent(selectedAgentName);
    setView('agentPortal');
  };

  // ── FIX: Manager Authentication and Logout ──
  const handleMgrAuth = () => {
    const mgr = MANAGERS.find(m => m.password === mgrInput.trim());
    if (mgr) { 
        setMgrAuthed(true); // Automatically flag manager as authorized
        setMgrName(mgr.name); 
        setMgrRole(mgr.role); 
        setError(''); 
        setMgrInput('');
        setView('mgrPortal'); 
        setMgrTab('dashboard');
    } else { 
        setError('Incorrect manager password.'); 
    }
  };

  const logout = () => {
    setLoggedInAgent('');
    setSelectedAgentName('');
    setView('landing');
  };

  const handleMgrLogout = () => {
    setMgrAuthed(false); 
    setMgrName(''); 
    setMgrRole(''); 
    setMgrInput(''); 
    setMgrError(''); 
    setView('landing'); // Route back to landing page on logout
  };

  // ── AGENT ACTIONS ──
  const processAction = async (actionType, agentName, specialNote = '') => {
    const agent = AGENTS.find((x) => x.name === agentName);
    const rec = getRec(agentName) || {};
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
      next = { ...next, clockIn: ts, date: todayStr, clockOut: null, onBreak: false, breakUsedMs: 0, breakStart: null, onPause: false, pauseUsedMs: 0, pauseStart: null, latenessStr: lateness };
      setSuccess(`✅ Clocked in at ${fmt(ts)}`);

    } else if (actionType === 'breakStart') {
      next = { ...next, onBreak: true, breakStart: ts };
      setSuccess(`☕ Break started`);
    } else if (actionType === 'breakEnd') {
      const used = (rec.breakUsedMs || 0) + (ts - rec.breakStart);
      next = { ...next, onBreak: false, breakStart: null, breakUsedMs: used };
      setSuccess(`💼 Back to work`);
    } else if (actionType === 'pauseStart') {
      next = { ...next, onPause: true, pauseStart: ts };
      setSuccess(`⏸ Emergency Pause activated. Timer stopped.`);
    } else if (actionType === 'pauseEnd') {
      const used = (rec.pauseUsedMs || 0) + (ts - rec.pauseStart);
      next = { ...next, onPause: false, pauseStart: null, pauseUsedMs: used };
      setSuccess(`▶ Duty Resumed.`);
    } else if (actionType === 'clockOut' || actionType === 'autoClockOut') {
      let bUsed = rec.breakUsedMs || 0;
      if (rec.onBreak && rec.breakStart) {
        bUsed += (ts - rec.breakStart);
        next = { ...next, onBreak: false, breakStart: null, breakUsedMs: bUsed };
      }
      let pUsed = rec.pauseUsedMs || 0;
      if (rec.onPause && rec.pauseStart) {
        pUsed += (ts - rec.pauseStart);
        next = { ...next, onPause: false, pauseStart: null, pauseUsedMs: pUsed };
      }
      
      const totalElapsedMs = ts - rec.clockIn - pUsed; 
      
      let quotaStatus = checkIsDayOff(agentName, ts) ? `REST DAY OT: ${fmtDur(totalElapsedMs)}` : "";
      if (!quotaStatus) {
         const quota = 8 * 60 * 60 * 1000;
         quotaStatus = totalElapsedMs >= quota 
           ? (totalElapsedMs - quota < 60000 ? "QUOTA MET" : `OT: ${fmtDur(totalElapsedMs - quota)}`) 
           : `UNDERTIME: ${fmtDur(quota - totalElapsedMs)}`;
      }
      
      logActionStr = `clockOut [${quotaStatus}]${specialNote ? ` [${specialNote}]` : ''}`;
      if (handoverNote) finalDeviceLog = `Note: ${handoverNote}`;
      if (pUsed > 0) finalDeviceLog += ` | Paused: ${fmtDur(pUsed)}`;
      
      next = { ...next, clockOut: ts, quotaStr: quotaStatus };
      setSuccess(`🏁 Clocked out! Total Billable Shift: ${fmtDur(totalElapsedMs)}`);
    }

    const entry = { date: fmtDate(ts), time: fmt(ts), action: logActionStr, agent: agentName, device: finalDeviceLog, timestamp: ts };
    next.history = [...(rec.history || []), entry];
    save({ ...records, [agentName]: next });
    await logToSheets(entry);
    
    setHandoverNote(''); setIsHandoverMode(false); setIsChangingPin(false);
    setTimeout(() => setSuccess(''), 5000); 
  };

  const attemptAction = (action) => {
    if (action === 'clockOut') return setIsHandoverMode(true);
    processAction(action, loggedInAgent);
  };

  const handleChangePin = () => {
    if (!newPin || newPin.length < 4) return setError('New PIN must be at least 4 characters.');
    savePins({ ...customPins, [loggedInAgent]: newPin });
    setNewPin('');
    setIsChangingPin(false);
    setSuccess('✅ Password/PIN successfully updated!');
    setTimeout(() => setSuccess(''), 4000);
  };

  // ── MANAGER ACTIONS ──
  const processShiftSwap = async () => {
    if (!swapA1 || !swapA2 || !swapD1 || !swapD2) return alert('Fill all swap fields.');
    const a1 = AGENTS.find(a => a.name === swapA1);
    const a2 = AGENTS.find(a => a.name === swapA2);
    
    if (a1.platform !== a2.platform || a1.shiftStart !== a2.shiftStart) {
      return alert(`❌ Swap Denied:\nAgents must have the EXACT same Platform and Shift Schedule to swap days off.`);
    }

    const d1Str = new Date(swapD1 + 'T12:00:00').toDateString();
    const d2Str = new Date(swapD2 + 'T12:00:00').toDateString();
    
    const entry = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'SWAP_DAY_OFF', agent: mgrName, device: JSON.stringify({ a1: swapA1, a2: swapA2, d1: d1Str, d2: d2Str }), timestamp: Date.now() };
    await logToSheets(entry);
    alert(`Swap Approved! ${swapA1} & ${swapA2} schedules updated.`);
    fetchLogs();
  };

  const generateReport = () => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let title = "";

    if (reportTimeframe === 'today') {
      title = "TODAY'S REPORT";
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    } else if (reportTimeframe === 'yesterday') {
      title = "YESTERDAY'S REPORT";
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0,0,0,0);
      endDate = new Date(startDate);
      endDate.setHours(23,59,59,999);
    } else if (reportTimeframe === 'week') {
      title = "THIS WEEK'S REPORT (Sun - Sat)";
      startDate.setDate(now.getDate() - now.getDay()); // Start on Sunday
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    } else if (reportTimeframe === 'month') {
      title = "THIS MONTH'S REPORT";
      startDate.setDate(1); // 1st of the month
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    }

    const logsInRange = globalLogs.filter(l => {
      const ts = new Date(l.timestamp).getTime();
      return ts >= startDate.getTime() && ts <= endDate.getTime();
    });

    let latesByDate = {};
    let otByDate = {};
    let presentDays = {}; 

    // FIX: Using Optional Chaining (?.) to prevent missing data errors
    logsInRange.forEach(l => {
      const dateStr = new Date(l.timestamp).toDateString();
      if (l.action?.startsWith('clockIn')) {
        if (!presentDays[l.agent]) presentDays[l.agent] = new Set();
        presentDays[l.agent].add(dateStr);
      }
      if (l.action?.includes('LATE')) {
        if (!latesByDate[dateStr]) latesByDate[dateStr] = [];
        latesByDate[dateStr].push(l.agent);
      }
      if (l.action?.includes('[OT:') || l.action?.includes('REST DAY OT')) {
        const otStr = l.action.match(/\[(.*?)\]/)?.[1] || 'OT';
        if (!otByDate[dateStr]) otByDate[dateStr] = [];
        otByDate[dateStr].push(`${l.agent} (${otStr})`);
      }
    });

    let latesFormatted = [];
    let absencesFormatted = [];
    let otFormatted = [];
    const loopEnd = Math.min(endDate.getTime(), now.getTime()); 
    
    for (let d = new Date(startDate); d.getTime() <= loopEnd; d.setDate(d.getDate() + 1)) {
      const dStr = d.toDateString();
      const shortDate = dStr.slice(0,10); 
      
      if (latesByDate[dStr] && latesByDate[dStr].length > 0) latesFormatted.push(`\n    --- ${shortDate} ---\n    ` + latesByDate[dStr].join('\n    '));

      let dailyMissing = [];
      AGENTS.forEach(a => {
        const checkDateTs = d.getTime() + 12*60*60*1000; 
        if (checkIsDayOff(a.name, checkDateTs)) return; 
        if (dStr === now.toDateString() && now.getTime() < new Date().setHours(a.shiftStart, 0, 0, 0)) return;
        const hasClockedIn = presentDays[a.name] && presentDays[a.name].has(dStr);
        if (!hasClockedIn) dailyMissing.push(a.name);
      });

      if (dailyMissing.length > 0) absencesFormatted.push(`\n    --- ${shortDate} ---\n    ` + dailyMissing.join('\n    '));
      if (otByDate[dStr] && otByDate[dStr].length > 0) otFormatted.push(`\n    --- ${shortDate} ---\n    ` + otByDate[dStr].join('\n    '));
    }

    setReportData(
      `📅 ${title} (${fmtDate(startDate)} - ${fmtDate(Math.min(endDate, now))})\n` +
      `-----------------------------------------\n` +
      `⚠️ LATES: ${latesFormatted.length > 0 ? latesFormatted.join('') : 'None'}\n` +
      `🚨 ABSENCES: ${absencesFormatted.length > 0 ? absencesFormatted.join('') : 'None'}\n` +
      `⏱️ OVERTIME: ${otFormatted.length > 0 ? otFormatted.join('') : 'None'}\n` +
      `-----------------------------------------`
    );
  };

  const exportFinanceCSV = () => {
    const header = "Date,Agent,Platform,Role,Clock In,Clock Out,Net Billable Hours,Status,Notes\n";
    // FIX: Using Optional Chaining (?.) for safe extraction
    const rows = globalLogs.filter(l => l.action?.startsWith('clockOut')).map(l => {
      const a = AGENTS.find(x => x.name === l.agent);
      const statusMatch = l.action?.match(/\[(.*?)\]/);
      const status = statusMatch ? statusMatch[1] : "N/A";
      return `"${l.date}","${l.agent}","${a?.platform || ''}","${a?.role || ''}","${l.date}","${l.time}","Calc in Sheets","${status}","${l.device?.replace(/"/g, '""') || ''}"`;
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + header + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Finance_Payroll_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const checkCloudOverride = async () => {
    setIsCheckingCloud(true); setError('');
    try {
      const freshLogs = await fetchLogs(); 
      const todayStr = new Date().toDateString();
      const hasOverride = freshLogs.some(l => l.agent === loggedInAgent && l.action === 'Manager Override' && new Date(l.timestamp).toDateString() === todayStr);
      if (hasOverride) { setOverriddenAgents(p => ({ ...p, [loggedInAgent]: true })); setSuccess('✅ Cloud authorization found!'); }
      else setError('No authorization found yet.'); 
    } catch (e) { setError('Network error.'); }
    setIsCheckingCloud(false);
  };

  const curRec = loggedInAgent ? getRec(loggedInAgent) : null;
  const curStatus = getStatus(curRec);
  const selectedAgent = AGENTS.find(a => a.name === loggedInAgent);
  const isDayOff = selectedAgent ? checkIsDayOff(selectedAgent.name, Date.now()) : false;
  const needsOverride = isDayOff && curStatus === 'idle' && !overriddenAgents[loggedInAgent];
  
  const bLeft = breakLeft(curRec);
  const bUsed = curRec ? (curRec.breakUsedMs || 0) + (curRec.onBreak && curRec.breakStart ? now - curRec.breakStart : 0) : 0;
  const pUsed = curRec ? (curRec.pauseUsedMs || 0) + (curRec.onPause && curRec.pauseStart ? now - curRec.pauseStart : 0) : 0;

  const Badge = ({ status }) => {
    const map = { idle: ['#64748b', 'IDLE'], clocked_in: ['#22c55e', 'CLOCKED IN'], on_break: ['#f59e0b', 'ON BREAK'], paused: ['#f97316', 'PAUSED'], clocked_out: ['#3b82f6', 'CLOCKED OUT'], day_off: ['#a78bfa', 'DAY OFF'] };
    const [color, label] = map[status] || map.idle;
    return <span style={{ background: color+'22', color, border: `1px solid ${color}55`, borderRadius: 6, padding: '3px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>{label}</span>;
  };

  // FIX: Using Optional Chaining (?.) logic for safe UI rendering
  const renderAction = (str) => {
    if (!str) return <span style={{ color: '#e6edf3' }}>—</span>;
    if (str === 'Manager Override') return <span style={{ color: '#c084fc', fontWeight: 600 }}>🔓 Override Granted</span>;
    if (str === 'SWAP_DAY_OFF') return <span style={{ color: '#ec4899', fontWeight: 600 }}>🔄 Shift Swap Approved</span>;
    if (str.startsWith('clockIn')) return <span style={{ color: str.includes('LATE') ? '#f87171' : '#4ade80', fontWeight: 600 }}>▶ Clock In {str.match(/\[(.*?)\]/)?.[0] || ''}</span>;
    if (str.startsWith('clockOut')) return <span style={{ color: str.includes('UNDER') ? '#f87171' : str.includes('OT') ? '#fbbf24' : '#a78bfa', fontWeight: 600 }}>⏹ Clock Out {str.match(/\[(.*?)\]/)?.[0] || ''}</span>;
    if (str === 'breakStart') return <span style={{ color: '#fbbf24', fontWeight: 600 }}>☕ Break Start</span>;
    if (str === 'breakEnd') return <span style={{ color: '#60a5fa', fontWeight: 600 }}>💼 Break End</span>;
    if (str === 'pauseStart') return <span style={{ color: '#f97316', fontWeight: 600 }}>⏸ Pause Duty</span>;
    if (str === 'pauseEnd') return <span style={{ color: '#4ade80', fontWeight: 600 }}>▶ Resume Duty</span>;
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

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: '#58a6ff', marginBottom: 8 }}>CELLUMOVE · WEAVNONO LLC</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 'clamp(26px,5vw,42px)', color: '#e6edf3', margin: 0, letterSpacing: -1 }}>ATTENDANCE <span style={{ color: '#58a6ff' }}>SYSTEM</span></h1>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>{new Date(now).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} &nbsp; <span style={{ color: '#58a6ff', fontWeight: 500 }}>{new Date(now).toLocaleTimeString('en-PH')}</span></div>
      </div>

      {/* ── 1. LANDING PAGE ── */}
      {view === 'landing' && (
        <div className="fade-in" style={{ display: 'flex', gap: 20, marginTop: 20 }}>
          <button className="btn" onClick={() => setView('agentLogin')} style={{ padding: '24px 32px', borderRadius: 14, background: '#238636', color: '#fff', fontSize: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
             <span style={{ fontSize: 32 }}>🧑‍💻</span> AGENT PORTAL
          </button>
          <button className="btn" onClick={() => setView('mgrLogin')} style={{ padding: '24px 32px', borderRadius: 14, background: '#1f6feb', color: '#fff', fontSize: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
             <span style={{ fontSize: 32 }}>👔</span> MANAGER PORTAL
          </button>
        </div>
      )}

      {/* ── 2A. AGENT LOGIN ── */}
      {view === 'agentLogin' && (
        <div className="fade-in" style={{ ...card, maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧑‍💻</div>
          <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 20, color: '#e6edf3', marginBottom: 24 }}>Agent Login</div>
          <select value={selectedAgentName} onChange={e => { setSelectedAgentName(e.target.value); setError(''); }} style={{ ...inputBase, width: '100%', marginBottom: 12, textAlign: 'center', fontSize: 14 }}>
            <option value="">— Select Username —</option>
            {AGENTS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <input type="password" value={pinInput} onChange={e => {setPinInput(e.target.value); setError('');}} placeholder="Password / PIN" onKeyDown={e => e.key === 'Enter' && handleAgentAuth()} style={{ ...inputBase, width: '100%', marginBottom: 12, textAlign: 'center', letterSpacing: 5, fontSize: 18 }} />
          {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <button className="btn" onClick={handleAgentAuth} style={{ width: '100%', padding: 12, borderRadius: 8, background: '#238636', color: '#fff', marginBottom: 12 }}>LOGIN TO PORTAL</button>
          <button className="btn" onClick={() => setView('landing')} style={{ width: '100%', padding: 12, borderRadius: 8, background: 'transparent', color: '#8b949e', border: '1px solid #30363d' }}>Back</button>
        </div>
      )}

      {/* ── 3A. AGENT PORTAL (Personalized Dashboard) ── */}
      {view === 'agentPortal' && loggedInAgent && (
        <div style={{ width: '100%', maxWidth: 500 }}>
          {/* Agent Portal Header */}
          <div className="fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
             <div>
                <div style={{ fontSize: 10, color: '#8b949e', letterSpacing: 2 }}>AGENT PORTAL</div>
                <div style={{ color: '#e6edf3', fontSize: 18, fontWeight: 700, fontFamily: "'Syne'" }}>Welcome, {loggedInAgent}</div>
             </div>
             <button className="btn" onClick={logout} style={{ background: '#21262d', color: '#f87171', borderRadius: 6, padding: '6px 12px', fontSize: 11 }}>Log Out</button>
          </div>

          <div className="fade-in" style={{ ...card, padding: '32px 28px', marginBottom: 20 }}>
            <div style={{ background: '#0d1117', borderRadius: 8, padding: '12px 14px', marginBottom: 18, border: `1px solid ${needsOverride ? '#a78bfa' : '#21262d'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div><div style={labelStyle}>STATUS</div><Badge status={needsOverride ? 'day_off' : curStatus} /></div>
                <div><div style={labelStyle}>ROLE / PLATFORM</div>
                  <div style={{ fontSize: 11, color: '#e6edf3', fontWeight: 500, marginBottom: 2 }}>{selectedAgent?.role}</div>
                  <span style={{ color: selectedAgent?.pColor, fontSize: 10, fontWeight: 700 }}>{selectedAgent?.platform}</span>
                </div>
              </div>
              <button className="btn" onClick={() => setIsChangingPin(!isChangingPin)} style={{ background: 'transparent', color: '#8b949e', border: '1px solid #30363d', padding: '6px 10px', borderRadius: 6, fontSize: 10 }}>⚙️ Password</button>
            </div>

            {isChangingPin && (
              <div className="fade-in" style={{ background: '#1c1626', padding: 16, borderRadius: 8, border: '1px solid #6b21a8', marginBottom: 18 }}>
                 <label style={{ ...labelStyle, color: '#c084fc' }}>ENTER NEW PASSWORD/PIN</label>
                 <input type="text" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Min 4 characters" style={{ ...inputBase, width: '100%', marginBottom: 10 }} />
                 <div style={{ display: 'flex', gap: 10 }}>
                   <button className="btn" onClick={() => setIsChangingPin(false)} style={{ flex: 1, padding: 8, borderRadius: 6, background: '#21262d', color: '#e6edf3', fontSize: 11 }}>Cancel</button>
                   <button className="btn" onClick={handleChangePin} style={{ flex: 2, padding: 8, borderRadius: 6, background: '#7e22ce', color: '#fff', fontSize: 11 }}>Save New PIN</button>
                 </div>
              </div>
            )}

            {curRec?.clockIn && !curRec?.clockOut && (
              <div className="fade-in" style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginBottom: 5 }}>
                  <span>BREAK USED</span>
                  <span style={{ color: bLeft < 60000 ? '#f87171' : '#58a6ff' }}>{fmtDur(bUsed)} / 60m &nbsp;·&nbsp; <b>{fmtDur(bLeft)} left</b></span>
                </div>
                <div style={{ background: '#21262d', borderRadius: 4, height: 7, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(100, (bUsed / BREAK_LIMIT_MS) * 100)}%`, background: bLeft < 60000 ? '#f87171' : '#58a6ff', transition: 'width 1s linear' }} />
                </div>
                {pUsed > 0 && <div style={{ fontSize: 10, color: '#f97316', textAlign: 'right' }}>⚠️ Duty Paused for: {fmtDur(pUsed)} (Unpaid)</div>}
              </div>
            )}

            {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 14, textAlign: 'center' }}>{error}</div>}
            {success && <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>{success}</div>}

            {!isHandoverMode && !isChangingPin && (
              <>
                {needsOverride ? (
                  <div className="fade-in" style={{ background: '#1c1626', padding: 20, borderRadius: 8, border: '1px solid #6b21a8', textAlign: 'center' }}>
                    <div style={{ color: '#c084fc', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>🔒 SCHEDULED DAY OFF</div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 18, lineHeight: 1.4 }}>If you have requested OT, wait for manager approval and click Check Cloud below.</div>
                    
                    <button className="btn" onClick={checkCloudOverride} disabled={isCheckingCloud} style={{ width: '100%', padding: '12px', borderRadius: 6, background: '#21262d', color: '#e6edf3', fontSize: 12, marginBottom: 16, border: '1px solid #30363d' }}>
                      {isCheckingCloud ? '↻ CHECKING CLOUD...' : '☁️ CHECK CLOUD FOR APPROVAL'}
                    </button>

                    <div style={{ fontSize: 10, color: '#484f58', marginBottom: 16, letterSpacing: 1 }}>— OR AUTHORIZE DIRECTLY (MANAGERS ONLY) —</div>
                    
                    <input type="password" value={overridePass} onChange={(e) => { setOverridePass(e.target.value); setOverrideError(''); }} placeholder="Manager Password" style={{ ...inputBase, width: '100%', marginBottom: 10, textAlign: 'center', fontSize: 14 }} />
                    {overrideError && <div style={{ color: '#f87171', fontSize: 11, marginBottom: 10 }}>{overrideError}</div>}
                    
                    <button className="btn" onClick={() => {
                        const mgr = MANAGERS.find(m => m.password === overridePass.trim());
                        if (mgr) {
                          setOverriddenAgents(p => ({ ...p, [loggedInAgent]: true }));
                          setOverridePass(''); setOverrideError('');
                          setSuccess(`✅ Override granted by ${mgr.name} and synced to cloud.`);
                          const ts = Date.now();
                          logToSheets({ date: fmtDate(ts), time: fmt(ts), action: 'Manager Override', agent: loggedInAgent, device: `Authorized by: ${mgr.name}`, timestamp: ts });
                        } else { setOverrideError('Incorrect manager password.'); }
                      }} style={{ width: '100%', padding: '12px', borderRadius: 6, background: '#7e22ce', color: '#fff', fontSize: 12 }}>
                      AUTHORIZE SHIFT & SYNC TO CLOUD
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {curStatus === 'idle' || curStatus === 'clocked_out' ? (
                       <button className="btn" onClick={() => attemptAction('clockIn')} style={{ gridColumn: '1/-1', padding: 16, borderRadius: 8, background: '#238636', color: '#fff', fontSize: 15, fontWeight: 700 }}>▶ CLOCK IN</button>
                    ) : (
                      <>
                        {curStatus === 'clocked_in' ? (
                          <>
                            <button className="btn" onClick={() => attemptAction('breakStart')} disabled={bLeft <= 0} style={{ padding: 13, borderRadius: 8, background: bLeft > 0 ? '#9a3412' : '#21262d', color: bLeft > 0 ? '#fed7aa' : '#484f58' }}>☕ BREAK START</button>
                            <button className="btn" onClick={() => attemptAction('pauseStart')} style={{ padding: 13, borderRadius: 8, background: '#ea580c', color: '#fff' }}>⏸ PAUSE DUTY</button>
                          </>
                        ) : curStatus === 'on_break' ? (
                          <button className="btn" onClick={() => attemptAction('breakEnd')} style={{ gridColumn: '1/-1', padding: 14, borderRadius: 8, background: '#1d4ed8', color: '#fff' }}>💼 END BREAK & RESUME</button>
                        ) : curStatus === 'paused' ? (
                          <button className="btn" onClick={() => attemptAction('pauseEnd')} style={{ gridColumn: '1/-1', padding: 14, borderRadius: 8, background: '#22c55e', color: '#fff' }}>▶ RESUME DUTY</button>
                        ) : null}
                        <button className="btn" onClick={() => attemptAction('clockOut')} disabled={curStatus === 'idle'} style={{ gridColumn: '1/-1', padding: 14, borderRadius: 8, background: '#6e40c9', color: '#fff', marginTop: 10 }}>⏹ CLOCK OUT</button>
                      </>
                    )}
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
                  <button className="btn" onClick={() => processAction('clockOut', loggedInAgent)} style={{ flex: 2, padding: 10, borderRadius: 6, background: '#6e40c9', color: '#fff' }}>CONFIRM CLOCK OUT</button>
                </div>
              </div>
            )}
          </div>

          {/* Personal Log Viewer for Agents */}
          <div className="fade-in" style={{ ...card, padding: 24 }}>
             <h3 style={{ margin: '0 0 16px 0', color: '#e6edf3', fontSize: 14 }}>My Recent Logs (Payslip Tracker)</h3>
             <div style={{ overflowX: 'auto', maxHeight: 250 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ background: '#0d1117' }}>{['Date', 'Time', 'Action'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#8b949e', fontWeight: 500, borderBottom: '1px solid #21262d' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {globalLogs.filter(l => l.agent === loggedInAgent).slice(0,20).map((l, i) => (
                    <tr key={i} className="row-hover" style={{ borderBottom: '1px solid #21262d' }}>
                      <td style={{ padding: '8px 10px', color: '#8b949e', whiteSpace: 'nowrap' }}>{l.date}</td>
                      <td style={{ padding: '8px 10px', color: '#e6edf3' }}>{l.time}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{renderAction(l.action)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 2B. MANAGER LOGIN ── */}
      {view === 'mgrLogin' && (
        <div className="fade-in" style={{ ...card, maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 20, color: '#e6edf3', marginBottom: 24 }}>Manager Access</div>
          <input type="password" value={mgrInput} onChange={e => {setMgrInput(e.target.value); setError('');}} placeholder="Manager Password" onKeyDown={e => e.key === 'Enter' && handleMgrAuth()} style={{ ...inputBase, width: '100%', marginBottom: 12, textAlign: 'center', fontSize: 16 }} />
          {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <button className="btn" onClick={handleMgrAuth} style={{ width: '100%', padding: 12, borderRadius: 8, background: '#1f6feb', color: '#fff', marginBottom: 12 }}>UNLOCK DASHBOARD</button>
          <button className="btn" onClick={() => setView('landing')} style={{ width: '100%', padding: 12, borderRadius: 8, background: 'transparent', color: '#8b949e', border: '1px solid #30363d' }}>Back</button>
        </div>
      )}

      {/* ── 3B. MANAGER PORTAL ── */}
      {view === 'mgrPortal' && mgrAuthed && (
        <div style={{ width: '100%', maxWidth: 900 }}>
          
          {/* Manager Navigation Tabs */}
          <div style={{ display: 'flex', marginBottom: 24, border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
            {[['dashboard', '🎛 Dashboard'], ['logs', '📋 Company Logs'], ['pins', '🔑 Master PINs']].map(([t, l], i) => (
              <button key={t} className="tab-btn" onClick={() => setMgrTab(t)} style={{ flex: 1, color: mgrTab === t ? '#58a6ff' : '#8b949e', background: mgrTab === t ? '#161b22' : 'transparent', borderRight: i < 2 ? '1px solid #30363d' : 'none' }}>{l}</button>
            ))}
          </div>

          {/* MANAGER: DASHBOARD TAB */}
          {mgrTab === 'dashboard' && (
            <div className="fade-in" style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr' }}>
              
              <div style={{ ...card, padding: 24, position: 'relative' }}>
                 <button className="btn" onClick={handleMgrLogout} style={{ position: 'absolute', top: 20, right: 20, background: '#21262d', color: '#f87171', borderRadius: 6, padding: '6px 12px', fontSize: 11 }}>🔒 Log Out</button>
                 <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 4 }}>MANAGER PORTAL</div>
                 <h3 style={{ margin: '0 0 16px 0', color: '#e6edf3', fontSize: 18 }}>{mgrName} <span style={{ fontSize: 12, color: '#58a6ff', fontWeight: 500 }}>({mgrRole})</span></h3>
                 
                 <h4 style={{ color: '#8b949e', fontSize: 12, marginTop: 24, marginBottom: 10, borderBottom: '1px solid #21262d', paddingBottom: 6 }}>🚨 Live Absence Tracker</h4>
                 {(() => {
                    const present = new Set(globalLogs.filter(l => l.action?.startsWith('clockIn') && new Date(l.timestamp).toDateString() === new Date().toDateString()).map(l => l.agent));
                    const missing = AGENTS.filter(a => {
                      if (checkIsDayOff(a.name, Date.now())) return false;
                      return Date.now() > new Date().setHours(a.shiftStart, 0, 0, 0) && !present.has(a.name);
                    });
                    if (missing.length === 0) return <div style={{ color: '#4ade80', fontSize: 13 }}>All scheduled agents are present!</div>;
                    return missing.map(a => <div key={a.name} style={{ background: '#450a0a', border: '1px solid #7f1d1d', padding: '8px 12px', borderRadius: 6, color: '#fca5a5', fontSize: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>{a.name}</span><span>{a.shiftStart}:00 Shift</span></div>);
                 })()}
              </div>

              <div style={{ ...card, padding: 24 }}>
                 <h3 style={{ margin: '0 0 16px 0', color: '#e6edf3', fontSize: 15 }}>📊 Operations & Finance Reports</h3>
                 
                 <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                   <select value={reportTimeframe} onChange={e => setReportTimeframe(e.target.value)} style={{ ...inputBase, flex: 1, fontSize: 12 }}>
                     <option value="today">Today</option>
                     <option value="yesterday">Yesterday</option>
                     <option value="week">This Week (Sun-Sat)</option>
                     <option value="month">This Month</option>
                   </select>
                   <button className="btn" onClick={generateReport} style={{ flex: 1, padding: 10, borderRadius: 6, background: '#238636', color: '#fff', fontSize: 12 }}>GENERATE TEXT REPORT</button>
                 </div>
                 {reportData && <textarea readOnly value={reportData} style={{ ...inputBase, width: '100%', minHeight: 150, resize: 'vertical', fontSize: 11, marginBottom: 16 }} />}

                 <button className="btn" onClick={exportFinanceCSV} style={{ width: '100%', padding: 12, borderRadius: 6, background: '#1d4ed8', color: '#fff', fontSize: 12 }}>📥 DOWNLOAD CSV FOR PAYROLL</button>
              </div>

              <div style={{ ...card, padding: 24, gridColumn: '1/-1' }}>
                 <h3 style={{ margin: '0 0 8px 0', color: '#e6edf3', fontSize: 15 }}>🔄 Smart Shift Swapper</h3>
                 <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 16 }}>Select Agent 1. The Agent 2 list will automatically filter to show ONLY agents with the exact same Role/Platform and Shift time.</div>
                 
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                   <div>
                     <label style={labelStyle}>AGENT 1</label>
                     <select value={swapA1} onChange={e => { setSwapA1(e.target.value); setSwapA2(''); }} style={{ ...inputBase, width: '100%', marginBottom: 8, fontSize: 13 }}>
                       <option value="">Select Agent 1</option>
                       {AGENTS.map(a => <option key={a.name}>{a.name}</option>)}
                     </select>
                     <input type="date" value={swapD1} onChange={e => setSwapD1(e.target.value)} style={{ ...inputBase, width: '100%', fontSize: 13 }} />
                     <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>Date Agent 1 will be OFF</div>
                   </div>
                   
                   <div>
                     <label style={labelStyle}>AGENT 2</label>
                     <select value={swapA2} onChange={e => setSwapA2(e.target.value)} disabled={!swapA1} style={{ ...inputBase, width: '100%', marginBottom: 8, fontSize: 13, opacity: !swapA1 ? 0.5 : 1 }}>
                       <option value="">{swapA1 ? "Select Eligible Swap Partner" : "Select Agent 1 First"}</option>
                       {swapA1 && AGENTS.filter(a => { const a1Obj = AGENTS.find(x => x.name === swapA1); return a.name !== swapA1 && a.platform === a1Obj?.platform && a.shiftStart === a1Obj?.shiftStart; }).map(a => <option key={a.name}>{a.name}</option>)}
                     </select>
                     <input type="date" value={swapD2} onChange={e => setSwapD2(e.target.value)} style={{ ...inputBase, width: '100%', fontSize: 13 }} />
                     <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>Date Agent 2 will be OFF</div>
                   </div>
                 </div>
                 <button className="btn" onClick={processShiftSwap} disabled={!swapA1 || !swapA2} style={{ width: '100%', padding: 12, borderRadius: 6, background: '#7e22ce', color: '#fff' }}>VALIDATE & SYNC SWAP</button>
              </div>
            </div>
          )}

          {/* MANAGER: LOGS TAB */}
          {mgrTab === 'logs' && (
            <div className="fade-in" style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #21262d', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: "'Syne'", fontWeight: 700, color: '#e6edf3', fontSize: 15, marginRight: 'auto' }}>Company Log Data</div>
                {isLoadingLogs && <span style={{ color: '#58a6ff', fontSize: 12 }}>Syncing...</span>}
                <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ ...inputBase, padding: '6px 10px', fontSize: 12 }} />
                <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} style={{ ...inputBase, padding: '6px 10px', fontSize: 12 }}>
                   <option value="all">All Agents</option>{AGENTS.map(a => <option key={a.name}>{a.name}</option>)}
                </select>
                <button className="btn" onClick={() => { setFilterDate(fmtInputDate(Date.now())); setFilterAgent('all'); }} style={{ background: '#21262d', color: '#e6edf3', padding: '6px 10px', borderRadius: 6, fontSize: 11 }}>Reset (Today)</button>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#0d1117' }}>{['Date', 'Time', 'Agent', 'Role', 'Action', 'Notes / Pauses'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: '#8b949e', fontWeight: 500, borderBottom: '1px solid #21262d' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {globalLogs.filter(l => {
                      if (filterAgent !== 'all' && l.agent !== filterAgent) return false;
                      if (filterDate) {
                         const logD = new Date(l.timestamp);
                         const logDStr = `${logD.getFullYear()}-${String(logD.getMonth()+1).padStart(2,'0')}-${String(logD.getDate()).padStart(2,'0')}`;
                         if (logDStr !== filterDate) return false;
                      }
                      return true;
                    }).map((l, i) => {
                      const ag = AGENTS.find(x => x.name === l.agent);
                      return (
                        <tr key={i} className="row-hover" style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '10px 16px', color: '#8b949e', whiteSpace: 'nowrap' }}>{l.date}</td>
                          <td style={{ padding: '10px 16px', color: '#e6edf3' }}>{l.time}</td>
                          <td style={{ padding: '10px 16px', color: '#e6edf3', fontWeight: 500 }}>{l.agent}</td>
                          <td style={{ padding: '10px 16px', color: '#8b949e', fontSize: 10 }}>{ag?.role || '—'}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{renderAction(l.action)}</td>
                          <td style={{ padding: '10px 16px', color: l.device?.startsWith('Note:') ? '#58a6ff' : '#484f58', fontStyle: l.device?.startsWith('Note:') ? 'italic' : 'normal', fontSize: 11, maxWidth: 250, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.device}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MANAGER: PINS TAB */}
          {mgrTab === 'pins' && (
            <div className="fade-in" style={{ ...card, maxWidth: 500, overflow: 'hidden', margin: '0 auto' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontFamily: "'Syne'", fontWeight: 700, color: '#e6edf3', fontSize: 15 }}>Agent Master Passwords</div></div>
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {AGENTS.map((a, i) => {
                  const currentPin = getActivePin(a.name);
                  const isCustom = customPins[a.name] !== undefined;
                  return (
                    <div key={a.name} className="row-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 24px', borderBottom: i < AGENTS.length - 1 ? '1px solid #21262d' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#8b949e' }}>{i + 1}</span>
                        <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {isCustom && <div style={{ fontSize: 9, color: '#4ade80', marginBottom: 2 }}>Custom PIN</div>}
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#58a6ff', letterSpacing: 2, background: '#0d1117', padding: '4px 10px', borderRadius: 6, border: '1px solid #21262d' }}>{currentPin}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}