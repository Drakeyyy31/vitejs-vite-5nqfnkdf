import { useState, useEffect, useMemo } from 'react';

// ── SYSTEM CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';

const fmt = (d) => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtInputDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// ── SHARED STYLES ──
const cardStyle = { width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: '24px' };
const inputStyle = { width: '100%', background: '#0d1117', color: '#fff', border: '1px solid #30363d', padding: 12, borderRadius: 8, marginBottom: 15, fontFamily: 'monospace' };
const btnStyle = { padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: '600', transition: '0.2s' };

export default function AttendanceApp() {
  const [view, setView] = useState('landing'); 
  const [mgrTab, setMgrTab] = useState('dashboard');
  const [dynamicAgents, setDynamicAgents] = useState([]);
  const [globalLogs, setGlobalLogs] = useState([]);
  
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Registration & Approval States
  const [regForm, setRegForm] = useState({ name: '', pin: '', platform: 'META' });
  const [approvalSalary, setApprovalSalary] = useState('');
  const [makeManager, setMakeManager] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
  const [mgrInput, setMgrInput] = useState('');
  const [filterDate, setFilterDate] = useState(fmtInputDate(Date.now()));

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(SHEETS_WEBHOOK);
      const data = await response.json();
      
      const users = data.filter(item => item.action === 'USER_REGISTER' || item.action === 'USER_APPROVE');
      const logs = data.filter(item => !item.action?.startsWith('USER_')).map(l => ({ ...l, timestamp: Number(l.timestamp) || new Date(`${l.date} ${l.time}`).getTime() })).sort((a,b) => b.timestamp - a.timestamp);
      
      const agentMap = {};
      users.forEach(u => {
        try {
          const details = JSON.parse(u.device);
          agentMap[u.agent] = { ...details, name: u.agent, status: u.action === 'USER_APPROVE' ? 'active' : 'pending' };
        } catch (e) {}
      });

      setDynamicAgents(Object.values(agentMap));
      setGlobalLogs(logs);
    } catch (e) { console.error("Sync Error:", e); }
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [view]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const handleRegister = async () => {
    if (!regForm.name || regForm.pin.length < 4) return setError("Fill all fields (PIN min 4 chars)");
    setIsLoading(true);
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_REGISTER', agent: regForm.name, device: JSON.stringify(regForm), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess("Request sent! A manager must approve and set your salary.");
    setTimeout(() => { setView('landing'); setSuccess(''); }, 3000);
  };

  const handleApproveUser = async (agent) => {
    if (!approvalSalary) return alert("Please set a monthly salary first.");
    const updatedAgent = { ...agent, salary: Number(approvalSalary), role: makeManager ? 'Manager' : 'Agent' };
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_APPROVE', agent: agent.name, device: JSON.stringify(updatedAgent), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setApprovalSalary('');
    setMakeManager(false);
    fetchData();
  };

  const handleLogin = () => {
    const user = dynamicAgents.find(a => a.name === loginForm.name && a.pin === loginForm.pin);
    if (!user) return setError("Invalid credentials.");
    if (user.status === 'pending') return setError("Account pending approval.");
    setLoggedInUser(user);
    setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
  };

  const handleAction = async (type) => {
    const entry = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: type, agent: loggedInUser.name, device: `Portal | ${loggedInUser.platform}`, timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    setSuccess(`${type} Logged!`);
    fetchData();
    setTimeout(() => setSuccess(''), 4000);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>CELLUMOVE <span style={{ color: '#58a6ff' }}>HQ</span></h1>
        <div style={{ fontSize: 12, color: '#8b949e', marginTop: 10 }}>{new Date(now).toLocaleTimeString('en-PH')}</div>
      </div>

      {view === 'landing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, width: 300 }}>
          <button onClick={() => setView('login')} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>LOGIN</button>
          <button onClick={() => setView('register')} style={{ ...btnStyle, background: '#1f6feb', color: '#fff' }}>CREATE ACCOUNT</button>
        </div>
      )}

      {view === 'register' && (
        <div style={cardStyle}>
          <h2>Sign Up</h2>
          <input placeholder="Full Name" onChange={e => setRegForm({...regForm, name: e.target.value})} style={inputStyle} />
          <input placeholder="Create PIN" type="password" onChange={e => setRegForm({...regForm, pin: e.target.value})} style={inputStyle} />
          <select onChange={e => setRegForm({...regForm, platform: e.target.value})} style={inputStyle}>
            <option>META</option><option>KANAL</option><option>Helpwave</option><option>Chargeback</option><option>DMCA</option>
          </select>
          <button onClick={handleRegister} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>REGISTER</button>
          <button onClick={() => setView('landing')} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
          {success && <p style={{ color: '#4ade80', textAlign: 'center' }}>{success}</p>}
        </div>
      )}

      {view === 'login' && (
        <div style={cardStyle}>
          <h2>Portal Login</h2>
          <select onChange={e => setLoginForm({...loginForm, name: e.target.value})} style={inputStyle}>
            <option value="">Choose User</option>
            {dynamicAgents.filter(a => a.status === 'active').map(a => <option key={a.name}>{a.name}</option>)}
          </select>
          <input placeholder="PIN" type="password" onChange={e => setLoginForm({...loginForm, pin: e.target.value})} style={inputStyle} />
          <button onClick={handleLogin} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>ENTER</button>
          <button onClick={() => setView('landing')} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
          {error && <p style={{ color: '#f87171', textAlign: 'center' }}>{error}</p>}
        </div>
      )}

      {view === 'agentPortal' && loggedInUser && (
        <div style={{ width: '100%', maxWidth: 450 }}>
          <div style={cardStyle}>
            <h3 style={{ margin: 0 }}>{loggedInUser.name}</h3>
            <div style={{ color: '#58a6ff', fontSize: 13, marginBottom: 20 }}>{loggedInUser.platform} • Agent Portal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
               <button onClick={() => handleAction('clockIn')} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>CLOCK IN</button>
               <button onClick={() => handleAction('clockOut')} style={{ ...btnStyle, background: '#6e40c9', color: '#fff' }}>CLOCK OUT</button>
               <button onClick={() => handleAction('pauseStart')} style={{ ...btnStyle, background: '#ea580c', color: '#fff' }}>PAUSE</button>
               <button onClick={() => handleAction('pauseEnd')} style={{ ...btnStyle, background: '#1d4ed8', color: '#fff' }}>RESUME</button>
            </div>
          </div>
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', marginTop: 20 }}>Logout</button>
        </div>
      )}

      {view === 'mgrPortal' && loggedInUser && (
        <div style={{ width: '100%', maxWidth: 900 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setMgrTab('dashboard')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'dashboard' ? '#1f6feb' : '#161b22' }}>Command Center</button>
            <button onClick={() => setMgrTab('onboarding')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'onboarding' ? '#1f6feb' : '#161b22' }}>Onboarding ({dynamicAgents.filter(a => a.status === 'pending').length})</button>
          </div>

          {mgrTab === 'dashboard' && (
            <div style={cardStyle}>
              <h3>Daily Coverage ({filterDate})</h3>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={inputStyle} />
              {globalLogs.filter(l => fmtInputDate(l.timestamp) === filterDate).map((l, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #30363d', fontSize: 13 }}>
                  <b>{l.agent}</b>: {l.action} at {l.time}
                </div>
              ))}
            </div>
          )}

          {mgrTab === 'onboarding' && (
            <div style={cardStyle}>
              <h3>Pending Approvals</h3>
              <div style={{ background: '#1c2128', padding: 15, borderRadius: 8, marginBottom: 20, border: '1px solid #6b21a8' }}>
                <p style={{ fontSize: 12, color: '#c084fc', marginTop: 0 }}>Step 1: Set Monthly Salary (USD)</p>
                <input placeholder="Ex: 260" type="number" value={approvalSalary} onChange={e => setApprovalSalary(e.target.value)} style={inputStyle} />
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={makeManager} onChange={e => setMakeManager(e.target.checked)} /> Approve as Manager?
                </label>
              </div>
              {dynamicAgents.filter(a => a.status === 'pending').map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid #30363d' }}>
                  <span>{a.name} ({a.platform})</span>
                  <button onClick={() => handleApproveUser(a)} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>FINALIZE & APPROVE</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', border: 'none', color: '#f87171', marginTop: 20 }}>Exit Command Center</button>
        </div>
      )}
    </div>
  );
}