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
const btnStyle = { padding: '12px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: '600', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' };

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

  // Registration & Approval States
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
      const logs = data.filter(item => !item.action?.startsWith('USER_')).map(l => ({ 
        ...l, 
        timestamp: Number(l.timestamp) || new Date(`${l.date} ${l.time}`).getTime() 
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
    } catch (e) { console.error("Sync Error:", e); }
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, [view]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const handleRegister = async () => {
    setError('');
    if (!regForm.name || regForm.pin.length < 4) return setError("Fill all fields (PIN min 4 chars)");
    
    // GUARD: Check if username already exists
    const exists = dynamicAgents.some(a => a.name.toLowerCase() === regForm.name.toLowerCase().trim());
    if (exists) return setError("User already created. Contact Drakeyyy or Egar.");

    if (regForm.platform === 'MANAGER' && activationKeyInput !== MANAGER_ACTIVATION_KEY) return setError("Invalid Activation Key.");
    
    setIsLoading(true);
    const finalData = { ...regForm, role: regForm.platform === 'MANAGER' ? 'Manager' : 'Agent' };
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_REGISTER', agent: regForm.name.trim(), device: JSON.stringify(finalData), timestamp: Date.now() };
    
    try {
        await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        setSuccess("Registration request sent!");
        setTimeout(() => { setView('landing'); setSuccess(''); }, 3000);
    } catch (e) { setError("Network error. Try again."); }
    setIsLoading(false);
  };

  const handleApproveUser = async (agent) => {
    if (!approvalSalary) return alert("Set a salary first.");
    setIsLoading(true);
    const payload = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: 'USER_APPROVE', agent: agent.name, device: JSON.stringify({ ...agent, salary: Number(approvalSalary) }), timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    setApprovalSalary(''); 
    await fetchData();
    setIsLoading(false);
  };

  const handleLogin = () => {
    const user = dynamicAgents.find(a => a.name.toLowerCase() === loginForm.name.toLowerCase().trim() && a.pin === loginForm.pin);
    if (!user) return setError("Incorrect credentials.");
    if (user.status === 'pending') return setError("Pending manager approval.");
    setLoggedInUser(user);
    setView(user.role === 'Manager' ? 'mgrPortal' : 'agentPortal');
  };

  const handleAction = async (type) => {
    setIsLoading(true);
    const entry = { date: fmtDate(Date.now()), time: fmt(Date.now()), action: type, agent: loggedInUser.name, device: `Portal | ${loggedInUser.platform}`, timestamp: Date.now() };
    await fetch(SHEETS_WEBHOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(entry) });
    setSuccess(`${type} Logged!`); 
    await fetchData();
    setIsLoading(false);
    setTimeout(() => setSuccess(''), 4000);
  };

  // ── RENDER COMPONENT ──
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
      
      {isLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '3px', background: '#58a6ff', zIndex: 9999, animation: 'loading 2s infinite linear' }} />
      )}
      <style>{`@keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>

      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 800 }}>AFTERSALES <span style={{ color: '#58a6ff' }}>WORKSPACE</span></h1>
        <div style={{ fontSize: 12, color: '#58a6ff', marginTop: 5 }}>{new Date(now).toLocaleTimeString('en-PH')}</div>
      </div>

      {/* ── LANDING VIEW ── */}
      {view === 'landing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15, width: 300 }}>
          <button onClick={() => setView('login')} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>LOGIN</button>
          <button onClick={() => setView('register')} style={{ ...btnStyle, background: '#1f6feb', color: '#fff' }}>CREATE ACCOUNT</button>
        </div>
      )}

      {/* ── REGISTER VIEW ── */}
      {view === 'register' && (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Onboarding</h2>
          <input placeholder="Username" disabled={isLoading} onChange={e => setRegForm({...regForm, name: e.target.value})} style={inputStyle} />
          <input placeholder="Password" type="password" disabled={isLoading} onChange={e => setRegForm({...regForm, pin: e.target.value})} style={inputStyle} />
          <select value={regForm.platform} disabled={isLoading} onChange={e => setRegForm({...regForm, platform: e.target.value})} style={inputStyle}>
            <option value="META">META</option><option value="KANAL">KANAL</option><option value="Helpwave">Helpwave</option><option value="Chargeback">Chargeback</option><option value="DMCA">DMCA</option><option value="MANAGER">MANAGER</option>
          </select>
          {regForm.platform === 'MANAGER' && <input type="password" placeholder="Activation Key" disabled={isLoading} onChange={e => setActivationKeyInput(e.target.value)} style={inputStyle} />}
          
          <button onClick={handleRegister} disabled={isLoading} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff', opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? "PROCESSING..." : "SUBMIT REQUEST"}
          </button>
          
          <button onClick={() => setView('landing')} disabled={isLoading} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
          {error && <p style={{ color: '#f87171', textAlign: 'center', fontSize: 13, fontWeight: 'bold' }}>⚠️ {error}</p>}
          {success && <p style={{ color: '#4ade80', textAlign: 'center' }}>{success}</p>}
        </div>
      )}

      {/* ── LOGIN VIEW ── */}
      {view === 'login' && (
        <div style={cardStyle}>
          <h2>Sign-In</h2>
          <input placeholder="Username" disabled={isLoading} onChange={e => setLoginForm({...loginForm, name: e.target.value})} style={inputStyle} />
          <input placeholder="Password" type="password" disabled={isLoading} onChange={e => setLoginForm({...loginForm, pin: e.target.value})} style={inputStyle} />
          <button onClick={handleLogin} disabled={isLoading} style={{ ...btnStyle, width: '100%', background: '#238636', color: '#fff' }}>
             {isLoading ? "SYNCING..." : "SIGN IN"}
          </button>
          <button onClick={() => setView('landing')} disabled={isLoading} style={{ ...btnStyle, width: '100%', background: 'transparent', color: '#8b949e', marginTop: 10 }}>Back</button>
          {error && <p style={{ color: '#f87171', textAlign: 'center' }}>{error}</p>}
        </div>
      )}

      {/* ── AGENT PORTAL ── */}
      {view === 'agentPortal' && (
        <div style={{ width: '100%', maxWidth: 450 }}>
          <div style={cardStyle}>
            <h3>Hello, {loggedInUser.name}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
               <button onClick={() => handleAction('clockIn')} disabled={isLoading} style={{ ...btnStyle, background: '#238636', color: '#fff' }}>
                  {isLoading ? "..." : "CLOCK IN"}
               </button>
               <button onClick={() => handleAction('clockOut')} disabled={isLoading} style={{ ...btnStyle, background: '#6e40c9', color: '#fff' }}>
                  {isLoading ? "..." : "CLOCK OUT"}
               </button>
            </div>
            {success && <p style={{ color: '#4ade80', textAlign: 'center', marginTop: 15 }}>{success}</p>}
          </div>
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#f87171', marginTop: 20 }}>Logout</button>
        </div>
      )}

      {/* ── MANAGER PORTAL ── */}
      {view === 'mgrPortal' && (
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button onClick={() => setMgrTab('dashboard')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'dashboard' ? '#1f6feb' : '#161b22' }}>Company Records</button>
            <button onClick={() => setMgrTab('onboarding')} style={{ ...btnStyle, flex: 1, background: mgrTab === 'onboarding' ? '#1f6feb' : '#161b22' }}>New Hires</button>
          </div>

          {mgrTab === 'dashboard' && (
            <div style={cardStyle}>
               <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={inputStyle} />
               <div style={{maxHeight: 400, overflowY: 'auto'}}>
                   {globalLogs.filter(l => fmtInputDate(l.timestamp) === filterDate).map((l, i) => (
                     <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #30363d', fontSize: 13 }}>
                       <b>{l.agent}</b>: {l.action} at {l.time}
                     </div>
                   ))}
               </div>
            </div>
          )}

          {mgrTab === 'onboarding' && (
            <div style={cardStyle}>
              <h3>Pending Approvals</h3>
              <input placeholder="Set Monthly Salary (USD)" type="number" value={approvalSalary} onChange={e => setApprovalSalary(e.target.value)} style={inputStyle} />
              {dynamicAgents.filter(a => a.status === 'pending').map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 15, borderBottom: '1px solid #30363d' }}>
                  <span>{a.name} ({a.platform})</span>
                  <button onClick={() => handleApproveUser(a)} disabled={isLoading} style={{ ...btnStyle, background: '#238636', color: '#fff', padding: '5px 15px' }}>
                     {isLoading ? "WAIT..." : "APPROVE"}
                  </button>
                </div>
              ))}
              {dynamicAgents.filter(a => a.status === 'pending').length === 0 && <p style={{textAlign: 'center', color: '#8b949e'}}>No pending requests.</p>}
            </div>
          )}
          <button onClick={() => setView('landing')} style={{ width: '100%', background: 'transparent', color: '#f87171', marginTop: 20 }}>Close Command Center</button>
        </div>
      )}
    </div>
  );
}