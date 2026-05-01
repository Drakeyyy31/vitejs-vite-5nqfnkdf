import { useState, useEffect, useMemo } from 'react';

// ── SYSTEM CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_ACTIVATION_KEY = "AFTERSALES-BOSS-2026"; 

const fmt = (d) => d ? new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtInputDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// ── SHARED STYLES ──
const cardStyle = { width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: 14, padding: '24px' };
const inputStyle = { width: '100%', background: '#0d1117', color: '#fff', border: '1px solid #30363d', padding: 12, borderRadius: 8, marginBottom: 15, fontFamily: 'monospace' };
const btnStyle = { padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: '600', transition: '0.2s' };

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

  // Approval & Swap States
  const [regForm, setRegForm] = useState({ name: '', pin: '', platform: 'META' });
  const [activationKeyInput, setActivationKeyInput] = useState('');
  const [approvalSalary, setApprovalSalary] = useState('');
  
  // Agent Swap Request States
  const [swapPartner, setSwapPartner] = useState('');
  const [myNewOff, setMyNewOff] = useState('');
  const [partnerNewOff, setPartnerNewOff] = useState('');
  const [isRequestingSwap, setIsRequestingSwap] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ name: '', pin: '' });
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
    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) return setError("Invalid Activation Key.");
    
    setIsLoading(true);
    const finalData = { ...regForm, role: regForm.platform === 'MANAGER' ? 'Manager' : 'Agent' };
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_REGISTER', agent: regForm.name.trim(), device: JSON.stringify(finalData), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess("Registration request sent!");
    setTimeout(() => { setView('landing'); setSuccess(''); }, 3000);
  };

  const handleApproveUser = async (agent) => {
    if (!approvalSalary) return alert("Set a salary first.");
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_APPROVE', agent: agent.name, device: JSON.stringify({ ...agent, salary: Number(approvalSalary) }), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setApprovalSalary(''); fetchData();
  };

  const handleRequestSwap = async () => {
    if (!swapPartner || !myNewOff || !partnerNewOff) return alert("Fill all swap details.");
    const swapData = { partner: swapPartner, myOff: myNewOff, partnerOff: partnerNewOff };
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'SWAP_REQUEST', agent: loggedInUser.name, device: JSON.stringify(swapData), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setSuccess("Swap request sent to managers!");
    setIsRequestingSwap(false);
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleApproveSwap = async (logEntry) => {
    const details = JSON.parse(logEntry.device);
    const finalLog = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'SWAP_APPROVED', agent: logEntry.agent, device: `Approved by manager. Partner: ${details.partner}`, timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(finalLog) });
    fetchData();
  };

  const handleLogin = () => {
    const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
    if (!user) return setError("Incorrect credentials.");
    if (user.status === 'pending') return setError("Pending manager approval.");
    setLoggedInUser(user);
    setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
  };

  const handleAction = async (type) => {
    const entry = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: type, agent: loggedInUser.name, device: `Portal | ${loggedInUser.platform}`, timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    setSuccess(`${type} Logged!`); fetchData();
    setTimeout(() => setSuccess(''), 4000);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 800 }}>AFTERSALES <span style={{ color: '#58a6ff' }}>WORKSPACE</span></h1>
        <div style={{ fontSize: 12, color: '#58a6ff', marginTop: 5 }}>{new Date(now).toLocaleTimeString('en-PH')}</div>
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
          <input placeholder="Username" onChange={e => setRegForm({...regForm, name: e.target.value})} style={inputStyle} />
          <input placeholder="Password" type="password" onChange={e => setRegForm({...regForm, pin: e.target.value})} style={inputStyle} />
          <select value={regForm.platform} onChange={e => setRegForm({...regForm, platform: e.target.value})} style={inputStyle}>
            <option value="META">META</option><option value="KANAL">KANAL</option><option value="Helpwave">Helpwave</option><option value="Chargeback">Chargeback</option><option value="DMCA">DMCA</option><option value="MANAGER">MANAGER</option>
          </select>
          {regForm.platform === 'MANAGER' && <input type="password" placeholder="Activation Key" onChange={e => setActivationKeyInput(e.target.value)} style={inputStyle} />}
          <button onClick={handleRegister} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>SUBMIT</button>
          <button onClick={() => setView('landing')} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
        </div>
      )}

      {view === 'login' && (
        <div style={cardStyle}>
          <h2>Secure Sign-In</h2>
          <input placeholder="Username" onChange={e => setLoginForm({...loginForm, name: e.target.value})} style={inputStyle} />
          <input placeholder="Password" type="password" onChange={e => setLoginForm({...loginForm, pin: e.target.value})} style={inputStyle} />
          <button onClick={handleLogin} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>SIGN IN</button>
          <button onClick={() => setView('landing')} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
        </div>
      )}

      {view === 'agentPortal' && (
        <div style={{ width: '100%', maxWidth: 450 }}>
          <div style={cardStyle}>
            <h3>Hello, {loggedInUser.name}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
               <button onClick={() => handleAction('clockIn')} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>CLOCK IN</button>
               <button onClick={() => handleAction('clockOut')} style={{ ...btnStyle, background: '#6e40c9', color: '#fff' }}>CLOCK OUT</button>
               <button onClick={() => setIsRequestingSwap(!isRequestingSwap)} style={{ gridColumn: '1/-1', ...btnStyle, background: '#1f6feb', color: '#fff' }}>🔄 REQUEST SHIFT SWAP</button>
            </div>
            {isRequestingSwap && (
              <div className="fade-in" style={{ marginTop: 20, padding: 15, background: '#0d1117', borderRadius: 8 }}>
                <label style={{ fontSize: 11, color: '#8b949e' }}>SELECT SWAP PARTNER (SAME DEPT ONLY)</label>
                <select onChange={e => setSwapPartner(e.target.value)} style={inputStyle}>
                  <option value="">Select Partner</option>
                  {dynamicAgents.filter(a => a.name !== loggedInUser.name && a.platform === loggedInUser.platform).map(a => <option key={a.name}>{a.name}</option>)}
                </select>
                <input type="date" placeholder="My New Off" onChange={e => setMyNewOff(e.target.value)} style={inputStyle} />
                <input type="date" placeholder="Partner New Off" onChange={e => setPartnerNewOff(e.target.value)} style={inputStyle} />
                <button onClick={handleRequestSwap} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>SEND FOR APPROVAL</button>
              </div>
            )}
          </div>
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#f87171', marginTop: 20 }}>Logout</button>
        </div>
      )}

      {view === 'mgrPortal' && (
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setMgrTab('dashboard')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'dashboard' ? '#1f6feb' : '#161b22' }}>Company Records</button>
            <button onClick={() => setMgrTab('requests')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'requests' ? '#1f6feb' : '#161b22' }}>Pending Swaps ({globalLogs.filter(l => l.action === 'SWAP_REQUEST').length})</button>
            <button onClick={() => setMgrTab('onboarding')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'onboarding' ? '#1f6feb' : '#161b22' }}>New Hires</button>
          </div>

          {mgrTab === 'requests' && (
            <div style={cardStyle}>
              <h3>Rest Day Swap Requests</h3>
              {globalLogs.filter(l => l.action === 'SWAP_REQUEST').map((l, i) => (
                <div key={i} style={{ padding: 15, borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between' }}>
                  <span><b>{l.agent}</b> wants to swap with <b>{JSON.parse(l.device).partner}</b></span>
                  <button onClick={() => handleApproveSwap(l)} style={{ ...btnStyle, background: '#238636', color: '#fff', padding: '5px 15px' }}>APPROVE</button>
                </div>
              ))}
            </div>
          )}

          {mgrTab === 'dashboard' && (
            <div style={cardStyle}>
               <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={inputStyle} />
               {globalLogs.filter(l => fmtInputDate(l.timestamp) === filterDate).map((l, i) => (
                 <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #30363d', fontSize: 13 }}>
                   <b>{l.agent}</b>: {l.action} at {l.time}
                 </div>
               ))}
            </div>
          )}
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#f87171', marginTop: 20 }}>Close Command Center</button>
        </div>
      )}
    </div>
  );
}