import { useState, useEffect, useMemo } from 'react';

// ── SYSTEM CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026"; 

const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtISO = (ts) => new Date(ts).toISOString().split('T')[0];

const platformColors = { META: '#3b82f6', KANAL: '#eab308', Helpwave: '#f97316', Chargeback: '#f43f5e', DMCA: '#94a3b8', MANAGER: '#a78bfa' };

export default function AftersalesApp() {
  const [view, setView] = useState('landing'); 
  const [mgrTab, setMgrTab] = useState('dashboard');
  const [dynamicAgents, setDynamicAgents] = useState([]);
  const [globalLogs, setGlobalLogs] = useState([]);
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
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredLogs = useMemo(() => {
    let startTs, endTs;
    const today = new Date();
    today.setHours(0,0,0,0);

    if (reportRange === 'today') {
      startTs = today.getTime();
      endTs = today.getTime() + 86400000;
    } else if (reportRange === 'yesterday') {
      startTs = today.getTime() - 86400000;
      endTs = today.getTime();
    } else if (reportRange === 'week') {
      startTs = today.getTime() - (7 * 86400000);
      endTs = Date.now();
    } else if (reportRange === 'month') {
      startTs = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
      endTs = Date.now();
    } else {
      startTs = new Date(customStart).getTime();
      endTs = new Date(customEnd).getTime() + 86400000;
    }
    return globalLogs.filter(l => l.timestamp >= startTs && l.timestamp <= endTs);
  }, [globalLogs, reportRange, customStart, customEnd]);

  const getClientLocation = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      return `${data.city}, ${data.country_code} | IP: ${data.ip}`;
    } catch (e) { return "Location Hidden"; }
  };

  const handleRegister = async () => {
    setError('');
    if (!regForm.name || regForm.pin.length < 4) return setError("Min 4 characters for PIN.");
    setIsLoading(true);
    const isMgr = regForm.platform === 'MANAGER' && activationKeyInput === MANAGER_ACTIVATION_KEY;
    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) {
        setIsLoading(false); return setError("Invalid Manager Key.");
    }
    const loc = await getClientLocation();
    const finalData = { ...regForm, role: isMgr ? 'Manager' : 'Agent', salary: isMgr ? 600 : 0 };
    const payload = { date: fmtDate(now), time: fmt(now), action: isMgr ? 'USER_APPROVE' : 'USER_REGISTER', agent: regForm.name.trim(), device: JSON.stringify({ ...finalData, loc }), timestamp: now };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess(isMgr ? "Manager Activated!" : "Registration Sent!");
    if (isMgr) { setLoggedInUser({ ...finalData, status: 'active' }); setView('mgrPortal'); }
    else { setTimeout(() => setView('landing'), 2000); }
    setIsLoading(false);
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const loc = await getClientLocation();
    const entry = { date: fmtDate(now), time: fmt(now), action: type, agent: loggedInUser.name, device: `${loc} | ${navigator.platform}`, timestamp: now };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    await fetchData();
    setIsLoading(false);
  };

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@800&display=swap');
        :root { --bg: #0d1117; --card: #161b22; --border: #30363d; --blue: #58a6ff; --green: #238636; --red: #f87171; }
        * { box-sizing: border-box; }
        body { margin: 0; background: var(--bg); color: #e6edf3; font-family: 'DM Mono', monospace; overflow-x: hidden; }
        .app-shell { width: 100vw; min-height: 100vh; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
        .header { text-align: center; margin-bottom: 40px; width: 100%; }
        .header h1 { font-family: 'Syne'; font-size: clamp(28px, 6vw, 48px); margin: 0; text-transform: uppercase; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: clamp(20px, 5vw, 40px); box-shadow: 0 10px 40px rgba(0,0,0,0.5); width: 100%; }
        .input-box { background: var(--bg); color: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 16px; width: 100%; margin-bottom: 15px; font-size: 16px; }
        .btn { padding: 18px 24px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer; transition: 0.2s; font-size: 14px; text-transform: uppercase; width: 100%; }
        .btn:hover { filter: brightness(1.2); transform: translateY(-2px); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 30px; width: 100%; max-width: 1600px; }
        .report-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--border); width: 100%; max-width: 1600px; justify-content: center; }
        .table-container { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border); width: 100%; max-width: 1600px; }
        table { width: 100%; border-collapse: collapse; min-width: 900px; }
        th { text-align: left; padding: 20px; background: #0d1117; color: #8b949e; border-bottom: 2px solid var(--border); font-size: 12px; letter-spacing: 1px; }
        td { padding: 18px 20px; border-bottom: 1px solid var(--border); font-size: 14px; }
        .loading { position: fixed; top: 0; left: 0; width: 100%; height: 4px; background: var(--blue); z-index: 1000; animation: lds 1.5s infinite; }
        @keyframes lds { 0% { left: -100%; } 100% { left: 100%; } }
        .centered-view { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; max-width: 500px; margin: auto; }
      `}</style>

      {isLoading && <div className="loading" />}

      <div className="header">
        <h1>AFTERSALES <span style={{ color: 'var(--blue)' }}>WORKSPACE</span></h1>
        <div style={{ color: '#8b949e', marginTop: '10px', fontSize: '16px' }}>{new Date(now).toLocaleString('en-PH')}</div>
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
            <h2 style={{ fontFamily: 'Syne', marginTop: 0, textAlign: 'center' }}>Registration</h2>
            <input className="input-box" placeholder="Username" onChange={e => setRegForm({...regForm, name: e.target.value})} />
            <input className="input-box" placeholder="Password" type="password" onChange={e => setRegForm({...regForm, pin: e.target.value})} />
            <select className="input-box" onChange={e => setRegForm({...regForm, platform: e.target.value})}>
              {Object.keys(platformColors).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {regForm.platform === 'MANAGER' && <input className="input-box" type="password" placeholder="Manager Activation Key" onChange={e => setActivationKeyInput(e.target.value)} />}
            <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={handleRegister}>SUBMIT REQUEST</button>
            <button className="btn" style={{ background: 'transparent', color: '#8b949e', marginTop: '10px' }} onClick={() => setView('landing')}>Cancel</button>
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
            }}>ACCESS WORKSPACE</button>
            <button className="btn" style={{ background: 'transparent', color: '#8b949e', marginTop: '10px' }} onClick={() => setView('landing')}>Back</button>
            {error && <p style={{ color: 'var(--red)', textAlign: 'center', marginTop: '15px' }}>{error}</p>}
          </div>
        </div>
      )}

      {view === 'agentPortal' && loggedInUser && (
        <div className="grid">
          <div className="card">
            <h2 style={{ fontFamily: 'Syne', color: 'var(--blue)' }}>{loggedInUser.name}</h2>
            <p>Department: <span style={{ color: platformColors[loggedInUser.platform], fontWeight: 'bold' }}>{loggedInUser.platform}</span></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
              <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => handleAction('clockIn')}>CLOCK IN</button>
              <button className="btn" style={{ background: '#6e40c9', color: '#fff' }} onClick={() => handleAction('clockOut')}>CLOCK OUT</button>
            </div>
          </div>
          <div className="card">
             <h3 style={{ fontFamily: 'Syne' }}>Recent Activity</h3>
             {globalLogs.filter(l => l.agent === loggedInUser.name).slice(0, 10).map((l, i) => (
                <div key={i} style={{ padding: '15px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
                   {l.date} | {l.time} - <span style={{ fontWeight: 'bold' }}>{l.action}</span>
                </div>
             ))}
             <button className="btn" style={{ marginTop: '30px', background: 'transparent', color: 'var(--red)' }} onClick={() => { setLoggedInUser(null); setView('landing'); }}>LOGOUT</button>
          </div>
        </div>
      )}

      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="report-bar">
            {['dashboard', 'onboarding', 'logs'].map(t => (
              <button key={t} className="btn" onClick={() => setMgrTab(t)} style={{ background: mgrTab === t ? 'var(--blue)' : 'var(--bg)', color: '#fff', flex: '1', maxWidth: '200px' }}>{t.toUpperCase()}</button>
            ))}
          </div>

          {mgrTab === 'logs' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="report-bar">
                <button className="btn" onClick={() => setReportRange('today')} style={{ fontSize: '11px', background: reportRange === 'today' ? 'var(--blue)' : 'var(--bg)', color: '#fff', width: 'auto' }}>TODAY</button>
                <button className="btn" onClick={() => setReportRange('yesterday')} style={{ fontSize: '11px', background: reportRange === 'yesterday' ? 'var(--blue)' : 'var(--bg)', color: '#fff', width: 'auto' }}>YESTERDAY</button>
                
                {/* Week/Month hidden if custom is active */}
                {reportRange !== 'custom' && (
                  <>
                    <button className="btn" onClick={() => setReportRange('week')} style={{ fontSize: '11px', background: 'var(--bg)', color: '#fff', width: 'auto' }}>WEEK</button>
                    <button className="btn" onClick={() => setReportRange('month')} style={{ fontSize: '11px', background: 'var(--bg)', color: '#fff', width: 'auto' }}>MONTH</button>
                  </>
                )}
                
                <button className="btn" onClick={() => setReportRange('custom')} style={{ fontSize: '11px', background: reportRange === 'custom' ? 'var(--blue)' : 'var(--bg)', color: '#fff', width: 'auto' }}>CUSTOM RANGE</button>
              </div>

              {reportRange === 'custom' && (
                <div className="report-bar" style={{ gap: '20px' }}>
                  <div style={{ flex: 1 }}><label style={{ fontSize: '11px', color: '#8b949e' }}>START DATE</label><input className="input-box" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ marginBottom: 0 }} /></div>
                  <div style={{ flex: 1 }}><label style={{ fontSize: '11px', color: '#8b949e' }}>END DATE</label><input className="input-box" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ marginBottom: 0 }} /></div>
                </div>
              )}

              <div className="table-container card" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Time</th><th>Agent</th><th>Action</th><th>Audit Proof (Location/IP/Device)</th></tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, i) => (
                      <tr key={i}>
                        <td>{l.date}</td>
                        <td style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{l.time}</td>
                        <td style={{ fontWeight: '700' }}>{l.agent}</td>
                        <td>{l.action}</td>
                        <td style={{ fontSize: '12px', color: '#8b949e' }}>{l.device}</td>
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
                  <h3 style={{ fontFamily: 'Syne' }}>Payroll Summary</h3>
                  <div style={{ fontSize: '48px', fontWeight: '800', color: 'var(--green)' }}>
                    ${(dynamicAgents.reduce((s, a) => s + (a.salary || 0), 0) / 30).toFixed(2)}
                  </div>
                  <p style={{ color: '#8b949e', fontSize: '18px' }}>Daily Labor Burn (USD)</p>
               </div>
               <div className="card">
                  <h3 style={{ fontFamily: 'Syne' }}>Staff Directory</h3>
                  {dynamicAgents.filter(a => a.status === 'active').map(a => (
                    <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid var(--border)' }}>
                       <span style={{ fontSize: '18px' }}>{a.name}</span>
                       <span style={{ fontWeight: 'bold', color: platformColors[a.platform], fontSize: '18px' }}>{a.platform}</span>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {mgrTab === 'onboarding' && (
            <div className="card" style={{ maxWidth: '800px' }}>
               <h3 style={{ fontFamily: 'Syne' }}>Activation Queue</h3>
               <input className="input-box" placeholder="Assign Base Salary (Monthly USD)" type="number" onChange={e => setApprovalSalary(e.target.value)} />
               {dynamicAgents.filter(a => a.status === 'pending').map(a => (
                 <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <span style={{ fontSize: '18px' }}>{a.name} ({a.platform})</span>
                    <button className="btn" style={{ background: 'var(--green)', color: '#fff', width: 'auto' }} onClick={async () => {
                       if(!approvalSalary) return alert("Enter salary.");
                       const payload = { date: fmtDate(now), time: fmt(now), action: 'USER_APPROVE', agent: a.name, device: JSON.stringify({ ...a, salary: Number(approvalSalary) }), timestamp: now };
                       await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
                       await fetchData();
                    }}>ACTIVATE</button>
                 </div>
               ))}
            </div>
          )}
          
          <button className="btn" style={{ maxWidth: '400px', marginTop: '50px', background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => { setLoggedInUser(null); setView('landing'); }}>EXIT WORKSPACE</button>
        </div>
      )}
    </div>
  );
}