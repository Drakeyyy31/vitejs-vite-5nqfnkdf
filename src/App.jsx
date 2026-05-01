import { useState, useEffect, useMemo } from 'react';

// ── CONFIG & LEGACY DATA INTEGRATION ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026"; 
const BREAK_LIMIT_MS = 60 * 60 * 1000;

// Re-integrating the pay logic from your original 800-line code
const getLegacyPay = (name) => {
  const seniors = ['Eli', 'Mary', 'Robert', 'Porsha', 'Gio', 'Giah', 'Art', 'Jon', 'Koko', 'Hawuki', 'John', 'Eunice'];
  if (['Egar', 'Drakeyyy'].includes(name)) return 600;
  if (['Lasgna', 'Sinclair'].includes(name)) return 400;
  if (seniors.includes(name)) return 360;
  return 260; 
};

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

  const [regForm, setRegForm] = useState({ name: '', pin: '', platform: 'META' });
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [approvalSalary, setApprovalSalary] = useState('');
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
  
  const [reportRange, setReportRange] = useState('today'); 
  const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  // ── CORE DATA ENGINE ──
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

  const userRec = loggedInUser ? (records[loggedInUser.name] || {}) : {};
  const bUsed = (userRec.breakUsedMs || 0) + (userRec.onBreak ? (now - userRec.breakStart) : 0);

  const filteredLogs = useMemo(() => {
    let startTs, endTs;
    const today = new Date(); today.setHours(0,0,0,0);
    if (reportRange === 'today') { startTs = today.getTime(); endTs = today.getTime() + 86400000; }
    else if (reportRange === 'yesterday') { startTs = today.getTime() - 86400000; endTs = today.getTime(); }
    else { startTs = new Date(customStart).getTime(); endTs = new Date(customEnd).getTime() + 86400000; }
    return globalLogs.filter(l => l.timestamp >= startTs && l.timestamp <= endTs);
  }, [globalLogs, reportRange, customStart, customEnd]);

  const getAuditProof = async () => {
    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      return `${data.city}, ${data.country_code} | IP: ${data.ip} | ${navigator.platform}`;
    } catch (e) { return `Audit Bypass | ${navigator.platform}`; }
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const ts = Date.now();
    const proof = await getAuditProof();
    let next = { ...userRec };
    if (type === 'clockIn') next = { clockIn: ts, breakUsedMs: 0 };
    if (type === 'breakStart') next.onBreak = true, next.breakStart = ts;
    if (type === 'breakEnd') next.onBreak = false, next.breakUsedMs = (next.breakUsedMs || 0) + (ts - next.breakStart);
    if (type === 'clockOut') next = {};
    setRecords({ ...records, [loggedInUser.name]: next });

    const entry = { date: new Date(ts).toLocaleDateString(), time: new Date(ts).toLocaleTimeString(), action: type, agent: loggedInUser.name, device: proof, timestamp: ts };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    await fetchData();
    setIsLoading(false);
  };

  return (
    <div className="app-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@800&display=swap');
        :root { --bg: #030712; --card: #111827; --border: #374151; --blue: #3b82f6; --green: #10b981; --red: #ef4444; }
        body { margin: 0; background: var(--bg); color: #f9fafb; font-family: 'DM Mono', monospace; width: 100vw; display: flex; justify-content: center; }
        .app-shell { width: 100%; max-width: 1400px; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
        .header h1 { font-family: 'Syne'; font-size: clamp(32px, 8vw, 64px); text-transform: uppercase; background: linear-gradient(to bottom, #fff, #4b5563); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .card { background: rgba(17, 24, 39, 0.8); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: 24px; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); width: 100%; }
        .btn { padding: 20px; border-radius: 16px; border: none; font-weight: 700; cursor: pointer; transition: 0.3s; width: 100%; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; width: 100%; }
        .report-bar { display: flex; gap: 12px; margin-bottom: 30px; background: var(--card); padding: 20px; border-radius: 20px; border: 1px solid var(--border); width: 100%; justify-content: center; }
        .table-container { overflow-x: auto; border-radius: 20px; border: 1px solid var(--border); width: 100%; background: var(--card); }
        table { width: 100%; border-collapse: collapse; min-width: 1000px; }
        td, th { padding: 20px; border-bottom: 1px solid var(--border); }
      `}</style>

      <div className="header">
        <h1>AFTERSALES <span style={{ color: 'var(--blue)' }}>WORKSPACE</span></h1>
        <div style={{ color: '#6b7280', textAlign: 'center', fontSize: '18px' }}>{new Date(now).toLocaleString('en-PH')}</div>
      </div>

      {view === 'landing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '400px' }}>
          <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => setView('login')}>SIGN IN</button>
          <button className="btn" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => setView('register')}>CREATE ACCOUNT</button>
        </div>
      )}

      {view === 'login' && (
        <div className="card" style={{ maxWidth: '500px' }}>
          <h2 style={{ textAlign: 'center' }}>Secure Access</h2>
          <input className="input-box" style={{ width: '100%', padding: '15px', marginBottom: '10px', background: '#000', color: '#fff', border: '1px solid var(--border)' }} placeholder="Username" onChange={e => setLoginForm({...loginForm, name: e.target.value})} />
          <input className="input-box" style={{ width: '100%', padding: '15px', marginBottom: '20px', background: '#000', color: '#fff', border: '1px solid var(--border)' }} placeholder="Password" type="password" onChange={e => setLoginForm({...loginForm, pin: e.target.value})} />
          <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => {
            const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
            if (!user) return setError("Invalid credentials.");
            setLoggedInUser(user); setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
          }}>ENTER WORKSPACE</button>
          <button className="btn" style={{ background: 'transparent', color: '#6b7280' }} onClick={() => setView('landing')}>Back</button>
        </div>
      )}

      {view === 'agentPortal' && loggedInUser && (
        <div className="grid">
          <div className="card">
            <h2 style={{ color: 'var(--blue)' }}>{loggedInUser.name}</h2>
            {userRec.clockIn && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>BREAK USAGE</span>
                  <span>{Math.floor(bUsed/60000)}m / 60m</span>
                </div>
                <div style={{ height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden', marginTop: '5px' }}>
                  <div style={{ height: '100%', width: `${(bUsed/BREAK_LIMIT_MS)*100}%`, background: 'var(--blue)' }} />
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <button className="btn" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => handleAction('clockIn')}>CLOCK IN</button>
              <button className="btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => handleAction('clockOut')}>CLOCK OUT</button>
              <button className="btn" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => handleAction(userRec.onBreak ? 'breakEnd' : 'breakStart')}>{userRec.onBreak ? 'RESUME' : 'BREAK'}</button>
            </div>
          </div>
          <div className="card">
            <h3>Recent Activity</h3>
            {globalLogs.filter(l => l.agent === loggedInUser.name).slice(0, 5).map((l, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #333' }}>{l.time} - {l.action}</div>
            ))}
            <button className="btn" style={{ marginTop: '20px', color: 'var(--red)', background: 'transparent' }} onClick={() => setView('landing')}>LOGOUT</button>
          </div>
        </div>
      )}

      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%' }}>
          <div className="report-bar">
            {['dashboard', 'onboarding', 'logs'].map(t => (
              <button key={t} className="btn" onClick={() => setMgrTab(t)} style={{ background: mgrTab === t ? 'var(--blue)' : 'var(--bg)', color: '#fff', flex: 1 }}>{t.toUpperCase()}</button>
            ))}
          </div>

          {mgrTab === 'dashboard' && (
            <div className="grid">
              <div className="card">
                <h3>Operational Burn</h3>
                <div style={{ fontSize: '48px', color: 'var(--green)', fontWeight: '800' }}>
                  ${(dynamicAgents.reduce((s, a) => s + (a.salary || 0), 0) / 30).toFixed(2)}
                </div>
                <p>Daily Labor Cost (USD)</p>
              </div>
              <div className="card">
                <h3>Absence Tracker</h3>
                {dynamicAgents.map(a => {
                   const isPresent = globalLogs.some(l => l.agent === a.name && l.date === new Date().toLocaleDateString() && l.action === 'clockIn');
                   return (
                     <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333' }}>
                       <span>{a.name}</span>
                       <span style={{ color: isPresent ? 'var(--green)' : 'var(--red)' }}>{isPresent ? 'ACTIVE' : 'ABSENT'}</span>
                     </div>
                   );
                })}
              </div>
            </div>
          )}

          {mgrTab === 'logs' && (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Date</th><th>Time</th><th>Agent</th><th>Action</th><th>Audit Proof</th></tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l, i) => (
                    <tr key={i}><td>{l.date}</td><td>{l.time}</td><td>{l.agent}</td><td>{l.action}</td><td style={{ fontSize: '10px', color: '#666' }}>{l.device}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn" style={{ marginTop: '40px', color: 'var(--red)', background: 'transparent' }} onClick={() => setView('landing')}>CLOSE WORKSPACE</button>
        </div>
      )}
    </div>
  );
}