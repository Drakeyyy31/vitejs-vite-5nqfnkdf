import { useState, useEffect, useMemo } from 'react';

// ── CONFIG & RE-INTEGRATED LEGACY DATA ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026"; 
const BREAK_LIMIT_MS = 60 * 60 * 1000;

const getLegacyPayScale = (name) => {
  const seniors = ['Eli', 'Mary', 'Robert', 'Porsha', 'Gio', 'Giah', 'Art', 'Jon', 'Koko', 'Hawuki', 'John', 'Eunice'];
  const masters = ['Egar', 'Drakeyyy'];
  const subManagers = ['Lasgna', 'Sinclair'];

  if (masters.includes(name)) return 600;
  if (subManagers.includes(name)) return 400;
  if (seniors.includes(name)) return 360;
  return 260; // Default Junior
};

// ── UTILS ──
const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtISO = (ts) => new Date(ts).toISOString().split('T')[0];
const platformColors = { META: '#3b82f6', KANAL: '#eab308', Helpwave: '#f97316', Chargeback: '#f43f5e', DMCA: '#94a3b8', MANAGER: '#a78bfa' };

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

  // Form States
  const [regForm, setRegForm] = useState({ name: '', pin: '', platform: 'META' });
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [approvalSalary, setApprovalSalary] = useState('');
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
  
  // Log States
  const [reportRange, setReportRange] = useState('today'); 
  const [customStart, setCustomStart] = useState(fmtISO(Date.now()));
  const [customEnd, setCustomEnd] = useState(fmtISO(Date.now()));

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
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const filteredLogs = useMemo(() => {
    let startTs, endTs;
    const today = new Date(); today.setHours(0,0,0,0);
    if (reportRange === 'today') { startTs = today.getTime(); endTs = today.getTime() + 86400000; }
    else if (reportRange === 'yesterday') { startTs = today.getTime() - 86400000; endTs = today.getTime(); }
    else { startTs = new Date(customStart).getTime(); endTs = new Date(customEnd).getTime() + 86400000; }
    return globalLogs.filter(l => l.timestamp >= startTs && l.timestamp <= endTs);
  }, [globalLogs, reportRange, customStart, customEnd]);

  const handleRegister = async () => {
    setError('');
    if (!regForm.name || regForm.pin.length < 4) return setError("Min 4 characters for PIN.");
    setIsLoading(true);
    const isMgr = regForm.platform === 'MANAGER' && activationKeyInput === MANAGER_ACTIVATION_KEY;
    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) {
        setIsLoading(false); return setError("Invalid Manager Key.");
    }
    const finalData = { ...regForm, role: isMgr ? 'Manager' : 'Agent', salary: isMgr ? getLegacyPayScale(regForm.name) : 0 };
    const payload = { date: fmtDate(now), time: fmt(now), action: isMgr ? 'USER_APPROVE' : 'USER_REGISTER', agent: regForm.name.trim(), device: `Audit Proof: ${navigator.platform}`, timestamp: now };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess(isMgr ? "Manager Activated!" : "Registration Sent!");
    if (isMgr) { setLoggedInUser({ ...finalData, status: 'active' }); setView('mgrPortal'); }
    else { setTimeout(() => setView('landing'), 2000); }
    setIsLoading(false);
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const entry = { date: fmtDate(now), time: fmt(now), action: type, agent: loggedInUser.name, device: `Secure Access Hub | IP Trace Active`, timestamp: now };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    await fetchData();
    setIsLoading(false);
  };

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@800&display=swap');
        :root { --bg: #030712; --card: #111827; --border: #374151; --blue: #3b82f6; --green: #10b981; --red: #ef4444; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: #f9fafb; font-family: 'DM Mono', monospace; overflow-x: hidden; width: 100%; display: flex; justify-content: center; }
        .app-shell { width: 100%; max-width: 1400px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 50px; width: 100%; }
        .header h1 { font-family: 'Syne'; font-size: clamp(32px, 8vw, 64px); margin: 0; letter-spacing: -2px; font-weight: 800; background: linear-gradient(to bottom, #fff, #4b5563); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .card { background: rgba(17, 24, 39, 0.8); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: 24px; padding: clamp(30px, 5vw, 50px); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); width: 100%; }
        .input-box { background: rgba(0,0,0,0.3); color: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 18px; width: 100%; margin-bottom: 15px; font-size: 16px; outline: none; }
        .btn { padding: 20px 24px; border-radius: 16px; border: none; font-weight: 700; cursor: pointer; transition: 0.3s; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; width: 100%; }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; width: 100%; }
        .report-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 30px; background: var(--card); padding: 20px; border-radius: 20px; border: 1px solid var(--border); width: 100%; justify-content: center; }
        .table-container { overflow-x: auto; border-radius: 20px; border: 1px solid var(--border); width: 100%; background: var(--card); }
        table { width: 100%; border-collapse: collapse; min-width: 900px; }
        th { text-align: left; padding: 22px; background: rgba(0,0,0,0.2); color: #9ca3af; font-size: 11px; letter-spacing: 2px; }
        td { padding: 20px; border-bottom: 1px solid var(--border); font-size: 14px; }
        .loading { position: fixed; top: 0; left: 0; width: 100%; height: 5px; background: var(--blue); z-index: 1000; animation: lds 1.5s infinite; }
        @keyframes lds { 0% { left: -100%; } 100% { left: 100%; } }
        .centered-view { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; max-width: 480px; flex-grow: 1; }
      `}</style>

      {isLoading && <div className="loading" />}

      <div className="header">
        <h1>AFTERSALES <span style={{ color: 'var(--blue)' }}>WORKSPACE</span></h1>
        <div style={{ color: '#6b7280', marginTop: '15px', fontSize: '18px', fontWeight: '500' }}>{new Date(now).toLocaleString('en-PH')}</div>
      </div>

      {view === 'landing' && (
        <div className="centered-view" style={{ gap: '20px' }}>
          <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => setView('login')}>SIGN IN</button>
          <button className="btn" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => setView('register')}>CREATE ACCOUNT</button>
        </div>
      )}

      {view === 'register' && (
        <div className="centered-view">
          <div className="card">
            <h2 style={{ fontFamily: 'Syne', marginTop: 0, textAlign: 'center', color: '#fff' }}>Onboarding</h2>
            <input className="input-box" placeholder="Full Name" onChange={e => setRegForm({...regForm, name: e.target.value})} />
            <input className="input-box" placeholder="Password" type="password" onChange={e => setRegForm({...regForm, pin: e.target.value})} />
            <select className="input-box" onChange={e => setRegForm({...regForm, platform: e.target.value})}>
              {Object.keys(platformColors).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {regForm.platform === 'MANAGER' && <input className="input-box" type="password" placeholder="Manager Key" onChange={e => setActivationKeyInput(e.target.value)} />}
            <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={handleRegister}>REGISTER</button>
            <button className="btn" style={{ background: 'transparent', color: '#6b7280', marginTop: '10px', fontSize: '12px' }} onClick={() => setView('landing')}>Cancel</button>
          </div>
        </div>
      )}

      {view === 'login' && (
        <div className="centered-view">
          <div className="card">
            <h2 style={{ fontFamily: 'Syne', marginTop: 0, textAlign: 'center' }}>Secure Access</h2>
            <input className="input-box" placeholder="Username" onChange={e => setLoginForm({...loginForm, name: e.target.value})} />
            <input className="input-box" placeholder="Password" type="password" onChange={e => setLoginForm({...loginForm, pin: e.target.value})} />
            <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => {
              const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
              if (!user) return setError("Invalid credentials.");
              if (user.status === 'pending') return setError("Approval pending.");
              setLoggedInUser(user); setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
            }}>ENTER</button>
            {error && <p style={{ color: 'var(--red)', textAlign: 'center', marginTop: '20px' }}>{error}</p>}
          </div>
        </div>
      )}

      {view === 'agentPortal' && loggedInUser && (
        <div className="grid">
          <div className="card">
            <h2 style={{ fontFamily: 'Syne', color: 'var(--blue)', fontSize: '32px' }}>{loggedInUser.name}</h2>
            <p style={{ color: '#9ca3af' }}>Dept: <span style={{ color: platformColors[loggedInUser.platform], fontWeight: 'bold' }}>{loggedInUser.platform}</span></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '30px' }}>
              <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => handleAction('clockIn')}>CLOCK IN</button>
              <button className="btn" style={{ background: '#6d28d9', color: '#fff' }} onClick={() => handleAction('clockOut')}>CLOCK OUT</button>
            </div>
          </div>
          <div className="card">
             <h3 style={{ fontFamily: 'Syne' }}>Logs</h3>
             {globalLogs.filter(l => l.agent === loggedInUser.name).slice(0, 10).map((l, i) => (
                <div key={i} style={{ padding: '15px 0', borderBottom: '1px solid var(--border)', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
                   <span>{l.date}</span>
                   <span style={{ fontWeight: 'bold', color: 'var(--blue)' }}>{l.action}</span>
                   <span style={{ color: '#6b7280' }}>{l.time}</span>
                </div>
             ))}
             <button className="btn" style={{ marginTop: '40px', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => { setLoggedInUser(null); setView('landing'); }}>LOGOUT</button>
          </div>
        </div>
      )}

      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%' }}>
          <div className="report-bar">
            {['dashboard', 'onboarding', 'logs'].map(t => (
              <button key={t} className="btn" onClick={() => setMgrTab(t)} style={{ background: mgrTab === t ? 'var(--blue)' : 'var(--bg)', color: '#fff', flex: '1', maxWidth: '250px' }}>{t.toUpperCase()}</button>
            ))}
          </div>

          {mgrTab === 'logs' && (
            <div style={{ width: '100%' }}>
              <div className="report-bar">
                {['today', 'yesterday', 'custom'].map(r => (
                  <button key={r} className="btn" onClick={() => setReportRange(r)} style={{ fontSize: '11px', background: reportRange === r ? 'var(--blue)' : 'var(--card)', color: '#fff', width: 'auto' }}>{r.toUpperCase()}</button>
                ))}
              </div>
              {reportRange === 'custom' && (
                <div className="report-bar" style={{ gap: '20px' }}>
                  <input className="input-box" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ margin: 0 }} />
                  <input className="input-box" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ margin: 0 }} />
                </div>
              )}
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Time</th><th>Agent</th><th>Action</th><th>Audit Proof</th></tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, i) => (
                      <tr key={i}>
                        <td>{l.date}</td>
                        <td style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{l.time}</td>
                        <td style={{ fontWeight: '700' }}>{l.agent}</td>
                        <td>{l.action}</td>
                        <td style={{ fontSize: '12px', color: '#6b7280' }}>{l.device}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mgrTab === 'dashboard' && (
            <div className="grid">
               <div className="card">
                  <h3 style={{ fontFamily: 'Syne', color: '#9ca3af' }}>Operational Burn</h3>
                  <div style={{ fontSize: '64px', fontWeight: '800', color: 'var(--green)' }}>
                    ${(dynamicAgents.reduce((s, a) => s + (a.salary || 0), 0) / 30).toFixed(2)}
                  </div>
                  <p style={{ color: '#4b5563', fontSize: '20px' }}>Daily Labor Cost (USD)</p>
               </div>
               <div className="card">
                  <h3 style={{ fontFamily: 'Syne', color: '#9ca3af' }}>Staff Directory</h3>
                  {dynamicAgents.filter(a => a.status === 'active').map(a => (
                    <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
                       <span style={{ fontSize: '20px' }}>{a.name}</span>
                       <span style={{ fontWeight: 'bold', color: platformColors[a.platform] }}>{a.platform}</span>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {mgrTab === 'onboarding' && (
            <div className="card" style={{ maxWidth: '900px', margin: 'auto' }}>
               <h3 style={{ fontFamily: 'Syne' }}>Activation Queue</h3>
               <input className="input-box" placeholder="Set Monthly Salary (USD)" type="number" onChange={e => setApprovalSalary(e.target.value)} />
               {dynamicAgents.filter(a => a.status === 'pending').map(a => (
                 <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '25px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <span>{a.name} ({a.platform})</span>
                    <button className="btn" style={{ background: 'var(--green)', color: '#fff', width: 'auto' }} onClick={async () => {
                       if(!approvalSalary) return alert("Assign salary.");
                       const payload = { date: fmtDate(now), time: fmt(now), action: 'USER_APPROVE', agent: a.name, device: JSON.stringify({ ...a, salary: Number(approvalSalary) }), timestamp: now };
                       await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
                       await fetchData();
                    }}>ACTIVATE</button>
                 </div>
               ))}
            </div>
          )}
          <button className="btn" style={{ maxWidth: '400px', margin: '60px auto 0', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: '20px' }} onClick={() => { setLoggedInUser(null); setView('landing'); }}>TERMINATE SESSION</button>
        </div>
      )}
    </div>
  );
}