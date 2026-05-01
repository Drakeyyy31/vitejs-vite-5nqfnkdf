import { useState, useEffect, useMemo } from 'react';

// ── SYSTEM CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026"; 
const BREAK_LIMIT_MS = 60 * 60 * 1000;

// ── UTILS ──
const fmt = (d) => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtInputDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0m';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

// ── STYLES ──
const card = { width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 16, padding: '28px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' };
const inputBase = { background: '#0d1117', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 8, padding: '12px 14px', fontFamily: "'DM Mono',monospace", width: '100%', marginBottom: 15 };
const labelStyle = { fontSize: 10, color: '#8b949e', letterSpacing: 2, display: 'block', marginBottom: 6, fontWeight: 600 };
const platformColors = { META: '#3b82f6', KANAL: '#eab308', Helpwave: '#f97316', Chargeback: '#f43f5e', DMCA: '#94a3b8', MANAGER: '#a78bfa' };
const btnStyle = { padding: '14px 24px', borderRadius: 10, border: 'none', fontWeight: '700', fontSize: 13, letterSpacing: 1, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };

export default function AftersalesApp() {
  const [view, setView] = useState('landing'); 
  const [mgrTab, setMgrTab] = useState('dashboard');
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
  const [filterDate, setFilterDate] = useState(fmtInputDate(Date.now()));

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
  const getStatus = () => {
    if (!userRec.clockIn) return 'idle';
    if (userRec.onPause) return 'paused';
    if (userRec.onBreak) return 'on_break';
    return 'clocked_in';
  };

  const handleRegister = async () => {
    setError('');
    if (!regForm.name || regForm.pin.length < 4) return setError("Fill all fields (PIN min 4 chars)");
    if (dynamicAgents.some(a => a.name.toLowerCase() === regForm.name.toLowerCase().trim())) return setError("User already created.");
    
    setIsLoading(true);
    const isManagerBypass = regForm.platform === 'MANAGER' && activationKeyInput === MANAGER_ACTIVATION_KEY;
    
    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) {
        setIsLoading(false); return setError("Invalid Activation Key.");
    }
    
    const finalData = { ...regForm, role: regForm.platform === 'MANAGER' ? 'Manager' : 'Agent', salary: isManagerBypass ? 600 : 0 };
    const payload = { date: fmtDate(now), time: fmt(now), action: isManagerBypass ? 'USER_APPROVE' : 'USER_REGISTER', agent: regForm.name.trim(), device: JSON.stringify(finalData), timestamp: now };
    
    try {
        await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        if (isManagerBypass) {
            setLoggedInUser({ ...finalData, status: 'active' });
            setView('mgrPortal');
        } else {
            setSuccess("Registration request sent!");
            setTimeout(() => setView('landing'), 3000);
        }
    } catch (e) { setError("Network error."); }
    setIsLoading(false);
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const ts = Date.now();
    let next = { ...userRec };
    if (type === 'clockIn') next = { clockIn: ts, breakUsedMs: 0, pauseUsedMs: 0 };
    if (type === 'breakStart') next.onBreak = true, next.breakStart = ts;
    if (type === 'breakEnd') next.onBreak = false, next.breakUsedMs = (next.breakUsedMs || 0) + (ts - next.breakStart);
    if (type === 'pauseStart') next.onPause = true, next.pauseStart = ts;
    if (type === 'pauseEnd') next.onPause = false, next.pauseUsedMs = (next.pauseUsedMs || 0) + (ts - next.pauseStart);
    if (type === 'clockOut') next = {};
    setRecords({ ...records, [loggedInUser.name]: next });
    
    const entry = { date: fmtDate(ts), time: fmt(ts), action: type, agent: loggedInUser.name, device: `Aftersales HUD | ${loggedInUser.platform}`, timestamp: ts };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    await fetchData();
    setIsLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: "'DM Mono', monospace", padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@800&display=swap');
        .btn:hover{filter:brightness(1.2);transform:translateY(-1px)}
        .loading-bar{position:fixed;top:0;left:0;right:0;height:3px;background:#58a6ff;z-index:99;animation:ld 2s infinite}
        @keyframes ld{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
      `}</style>

      {isLoading && <div className="loading-bar" />}

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'Syne', fontSize: 32, margin: 0, letterSpacing: -1 }}>AFTERSALES <span style={{ color: '#58a6ff' }}>WORKSPACE</span></h1>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>{new Date(now).toLocaleTimeString('en-PH')}</div>
      </div>

      {view === 'landing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, width: 320 }}>
          <button className="btn" onClick={() => setView('login')} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>SIGN IN</button>
          <button className="btn" onClick={() => setView('register')} style={{ ...btnStyle, background: '#1f6feb', color: '#fff' }}>CREATE ACCOUNT</button>
        </div>
      )}

      {view === 'register' && (
        <div style={card}>
          <h2 style={{ fontFamily: 'Syne', marginTop: 0 }}>Onboarding</h2>
          <input placeholder="Username" style={inputBase} onChange={e => setRegForm({...regForm, name: e.target.value})} />
          <input placeholder="Password" type="password" style={inputBase} onChange={e => setRegForm({...regForm, pin: e.target.value})} />
          <label style={labelStyle}>DEPARTMENT</label>
          <select style={inputBase} onChange={e => setRegForm({...regForm, platform: e.target.value})}>
            {Object.keys(platformColors).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {regForm.platform === 'MANAGER' && <input type="password" placeholder="Activation Key" style={inputBase} onChange={e => setActivationKeyInput(e.target.value)} />}
          <button className="btn" onClick={handleRegister} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>SUBMIT REQUEST</button>
          <button className="btn" onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#8b949e', border: 'none', marginTop: 10 }}>Cancel</button>
        </div>
      )}

      {view === 'login' && (
        <div style={card}>
          <h2 style={{ fontFamily: 'Syne', marginTop: 0 }}>Secure Login</h2>
          <input placeholder="Username" style={inputBase} onChange={e => setLoginForm({...loginForm, name: e.target.value})} />
          <input placeholder="Password" type="password" style={inputBase} onChange={e => setLoginForm({...loginForm, pin: e.target.value})} />
          <button className="btn" onClick={() => {
            const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
            if (!user) return setError("Invalid credentials.");
            if (user.status === 'pending') return setError("Approval pending.");
            setLoggedInUser(user); setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
          }} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>ENTER WORKSPACE</button>
          <button className="btn" onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#8b949e', border: 'none', marginTop: 10 }}>Back</button>
          {error && <p style={{ color: '#f87171', textAlign: 'center', fontSize: 12 }}>{error}</p>}
        </div>
      )}

      {/* ── AGENT PORTAL ── */}
      {view === 'agentPortal' && loggedInUser && (
        <div style={{ width: '100%', maxWidth: 500 }}>
          <div style={card}>
            <h3 style={{ margin: 0, fontFamily: 'Syne' }}>{loggedInUser.name}</h3>
            <span style={{ color: platformColors[loggedInUser.platform], fontSize: 11, fontWeight: 700 }}>{loggedInUser.platform} DEPARTMENT</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 25 }}>
               <button className="btn" onClick={() => handleAction('clockIn')} style={{ gridColumn: '1/-1', ...btnStyle, background: '#238636', color: '#fff' }}>▶ START SHIFT</button>
               <button className="btn" onClick={() => handleAction('clockOut')} style={{ gridColumn: '1/-1', ...btnStyle, background: '#6e40c9', color: '#fff' }}>⏹ END SHIFT</button>
            </div>
          </div>
          <button className="btn" onClick={() => { setLoggedInUser(null); setView('landing'); }} style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', marginTop: 25 }}>Logout</button>
        </div>
      )}

      {/* ── MANAGER COMMAND CENTER ── */}
      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%', maxWidth: 1100 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 25 }}>
             {['dashboard', 'directory', 'onboarding', 'logs'].map(t => (
               <button key={t} className="btn" onClick={() => setMgrTab(t)} style={{ ...btnStyle, flex: 1, background: mgrTab === t ? '#1f6feb' : '#161b22', border: '1px solid #30363d', color: '#fff', textTransform: 'uppercase', fontSize: 10 }}>{t}</button>
             ))}
          </div>

          {mgrTab === 'dashboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
               <div style={card}>
                  <h3 style={{ fontFamily: 'Syne', marginTop: 0 }}>🚨 Live Status</h3>
                  {dynamicAgents.filter(a => a.status === 'active' && a.role === 'Agent').map(a => {
                    const log = globalLogs.find(l => l.agent === a.name);
                    const isPresent = log?.action === 'clockIn' && log.date === fmtDate(now);
                    return (
                      <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #21262d' }}>
                         <span>{a.name}</span>
                         <span style={{ color: isPresent ? '#22c55e' : '#f87171', fontWeight: 700, fontSize: 11 }}>{isPresent ? 'ACTIVE' : 'ABSENT'}</span>
                      </div>
                    )
                  })}
               </div>
               <div style={card}>
                  <h3 style={{ fontFamily: 'Syne', marginTop: 0 }}>📊 Financial Summary</h3>
                  <div style={{ background: '#0d1117', padding: 20, borderRadius: 12, border: '1px solid #238636' }}>
                     <div style={labelStyle}>EST. DAILY BURN</div>
                     <div style={{ fontSize: 32, fontWeight: 800, color: '#238636' }}>${(dynamicAgents.reduce((sum, a) => sum + (a.salary || 0), 0) / 30).toFixed(2)}<span style={{ fontSize: 12 }}> USD</span></div>
                  </div>
                  <button className="btn" onClick={() => {
                    const header = "Date,Agent,Platform,Monthly,Daily Rate\n";
                    const rows = dynamicAgents.map(a => `"${fmtDate(now)}","${a.name}","${a.platform}","$${a.salary}","$${(a.salary/30).toFixed(2)}"`).join("\n");
                    const link = document.createElement("a"); link.href = 'data:text/csv;charset=utf-8,' + encodeURI(header+rows);
                    link.download = `Payroll_Export.csv`; link.click();
                  }} style={{ ...btnStyle, width: '100%', background: '#1d4ed8', color: '#fff', marginTop: 20 }}>📥 FULL PAYROLL EXPORT</button>
               </div>
            </div>
          )}

          {mgrTab === 'directory' && (
            <div style={card}>
              <h3 style={{ fontFamily: 'Syne', marginTop: 0 }}>Member Directory & Salaries</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#0d1117', color: '#8b949e' }}>
                    <tr>
                      <th style={{ padding: 12, textAlign: 'left' }}>NAME</th>
                      <th style={{ padding: 12, textAlign: 'left' }}>DEPT</th>
                      <th style={{ padding: 12, textAlign: 'left' }}>ROLE</th>
                      <th style={{ padding: 12, textAlign: 'left' }}>MONTHLY</th>
                      <th style={{ padding: 12, textAlign: 'left' }}>DAILY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicAgents.filter(a => a.status === 'active').map(a => (
                      <tr key={a.name} style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: 12, fontWeight: 700 }}>{a.name}</td>
                        <td style={{ padding: 12, color: platformColors[a.platform] }}>{a.platform}</td>
                        <td style={{ padding: 12 }}>{a.role}</td>
                        <td style={{ padding: 12, color: '#22c55e' }}>${a.salary || 0}</td>
                        <td style={{ padding: 12, color: '#58a6ff' }}>${((a.salary || 0)/30).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mgrTab === 'onboarding' && (
             <div style={card}>
                <h3 style={{ fontFamily: 'Syne', marginTop: 0 }}>Pending Approvals</h3>
                <input placeholder="Set Monthly Salary (USD)" type="number" style={inputBase} onChange={e => setApprovalSalary(e.target.value)} />
                {dynamicAgents.filter(a => a.status === 'pending').map(a => (
                  <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid #30363d' }}>
                     <span>{a.name} ({a.platform})</span>
                     <button className="btn" onClick={async () => {
                        if(!approvalSalary) return alert("Set salary!");
                        setIsLoading(true);
                        const payload = { date: fmtDate(now), time: fmt(now), action: 'USER_APPROVE', agent: a.name, device: JSON.stringify({ ...a, salary: Number(approvalSalary) }), timestamp: now };
                        await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
                        await fetchData();
                     }} style={{ ...btnStyle, background: '#238636', color: '#fff', padding: '6px 15px' }}>ACTIVATE</button>
                  </div>
                ))}
             </div>
          )}

          <button className="btn" onClick={() => { setLoggedInUser(null); setView('landing'); }} style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', marginTop: 25 }}>Close Workspace</button>
        </div>
      )}
    </div>
  );
}