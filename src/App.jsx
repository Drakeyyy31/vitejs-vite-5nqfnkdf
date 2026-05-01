import { useState, useEffect, useMemo, useCallback } from 'react';

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const HOOK       = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MGR_KEY    = 'AFTERSALES-BOSS-2026';
const BREAK_MAX  = 3_600_000;   // 1 h
const SHIFT_GOAL = 28_800_000;  // 8 h
const LATE_GRACE = 900_000;     // 15 min

const PAY = n => {
  if (['Egar','Drakeyyy'].includes(n)) return 600;
  if (['Lasgna','Sinclair'].includes(n)) return 400;
  if (['Eli','Mary','Robert','Porsha','Gio','Giah','Art','Jon','Koko','Hawuki','John','Eunice'].includes(n)) return 360;
  return 260;
};

const DEPT_HUE = { META:210, KANAL:42, Helpwave:24, Chargeback:355, DMCA:220, MANAGER:270 };
const dc  = d => `hsl(${DEPT_HUE[d]??210},90%,60%)`;
const dg  = d => `hsl(${DEPT_HUE[d]??210},90%,60%,0.2)`;

// ── SHIFT SCHEDULES ──
// General teams: Morning / Mid / Night
// DMCA & Chargeback teams: fixed Office hours
const SHIFT_TEMPLATES = [
  { label:'Morning', start:'07:00', end:'15:00', overnight:false },
  { label:'Mid',     start:'15:00', end:'23:00', overnight:false },
  { label:'Night',   start:'23:00', end:'07:00', overnight:true  },
  { label:'Office',  start:'09:00', end:'17:00', overnight:false, depts:['DMCA','Chargeback'] },
];

// Departments locked to a specific shift
const DEPT_SHIFT_LOCK = { DMCA:'Office', Chargeback:'Office' };

// Returns the correct shift label for a given dept, or null if agent can choose
const getLockedShift = dept => DEPT_SHIFT_LOCK[dept] || null;

// Returns shifts available for selection based on dept
const availableShifts = dept =>
  getLockedShift(dept)
    ? SHIFT_TEMPLATES.filter(s => s.label === getLockedShift(dept))
    : SHIFT_TEMPLATES.filter(s => !s.depts);

// Resolve a shift object by label, fallback to Morning
const resolveShift = label => SHIFT_TEMPLATES.find(s => s.label === label) || SHIFT_TEMPLATES[0];

// Compute scheduled clock-in timestamp for a given date, handling overnight shifts.
// For Night shift (23:00 start), scheduled start is 23:00 of the *previous* day
// when evaluating against a clock-in that happened after midnight.
const schedStart = (shiftLabel, clockInTs) => {
  const shift = resolveShift(shiftLabel);
  const [sh, sm] = shift.start.split(':').map(Number);
  const ci = new Date(clockInTs);
  const ref = new Date(clockInTs);
  ref.setHours(sh, sm, 0, 0);
  // If overnight shift and clock-in is in the early morning window (00:00–12:00),
  // the scheduled start was yesterday at shift.start
  if (shift.overnight && ci.getHours() < 12) {
    ref.setDate(ref.getDate() - 1);
  }
  return ref.getTime();
};

const STATUS = {
  ACTIVE:  { label:'ON SHIFT',    color:'#22d3a5', pulse:true  },
  BREAK:   { label:'ON BREAK',    color:'#f59e0b', pulse:true  },
  OUT:     { label:'CLOCKED OUT', color:'#64748b', pulse:false },
  PENDING: { label:'NOT IN',      color:'#334155', pulse:false },
  ONCALL:  { label:'ON CALL',     color:'#c084fc', pulse:true  },
};
const AC = { clockIn:'#22d3a5', clockOut:'#f43f5e', breakStart:'#f59e0b', breakEnd:'#38bdf8' };
const AI = { clockIn:'▶', clockOut:'■', breakStart:'⏸', breakEnd:'▶' };
const AL = { clockIn:'Clock In', clockOut:'Clock Out', breakStart:'Break Start', breakEnd:'Resume' };

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const pad  = n => String(n).padStart(2,'0');
const fmt  = ms => { if(!ms||ms<0)return'00:00:00'; return `${pad(~~(ms/3_600_000))}:${pad(~~(ms%3_600_000/60_000))}:${pad(~~(ms%60_000/1000))}`; };
const fmtS = ms => { if(!ms||ms<0)return'0m'; const h=~~(ms/3_600_000),m=~~(ms%3_600_000/60_000); return h?`${h}h ${m}m`:`${m}m`; };
const todayMs = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const tsKey   = () => new Date().toISOString().split('T')[0];

const deriveStatus = (logs, name, rec, isManager=false) => {
  if (isManager) return rec.onCall ? STATUS.ONCALL : STATUS.ONCALL;
  if (rec.onBreak)  return STATUS.BREAK;
  if (rec.clockIn && !rec.clockedOut) return STATUS.ACTIVE;
  const last = [...logs.filter(l=>l.agent===name&&l.timestamp>=todayMs())].sort((a,b)=>a.ts-b.ts).pop();
  if (!last) return STATUS.PENDING;
  return {clockIn:STATUS.ACTIVE,breakStart:STATUS.BREAK,clockOut:STATUS.OUT}[last.action]??STATUS.PENDING;
};

// ─────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────
const Ring = ({ pct=0, size=72, stroke=5, color='#22d3a5', bg='rgba(255,255,255,0.05)', children }) => {
  const r=( size-stroke*2)/2, c=size/2, circ=2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={bg} strokeWidth={stroke}/>
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ*(1-Math.min(pct/100,1))}
        strokeLinecap="round" style={{transition:'stroke-dashoffset 1s ease'}}/>
      <foreignObject x={0} y={0} width={size} height={size}
        style={{transform:'rotate(90deg)',transformOrigin:`${c}px ${c}px`}}>
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {children}
        </div>
      </foreignObject>
    </svg>
  );
};

const Glass = ({ children, style={}, glow='' }) => (
  <div style={{
    background:'rgba(255,255,255,0.04)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',
    border:'1px solid rgba(255,255,255,0.08)',borderRadius:20,padding:22,
    boxShadow:glow?`0 0 40px ${glow},0 8px 32px rgba(0,0,0,0.4)`:'0 8px 32px rgba(0,0,0,0.4)',
    ...style
  }}>{children}</div>
);

const Chip = ({ color, children }) => (
  <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,
    fontSize:10,fontWeight:700,letterSpacing:1.5,fontFamily:'var(--mono)',whiteSpace:'nowrap',
    background:`${color}18`,color,border:`1px solid ${color}38`}}>{children}</span>
);

const Dot = ({ color, pulse }) => (
  <span style={{width:6,height:6,borderRadius:'50%',background:color,flexShrink:0,
    display:'inline-block',animation:pulse?'blink 2s infinite':undefined}}/>
);

const Sep = () => <div style={{height:1,background:'rgba(255,255,255,0.06)',margin:'18px 0'}}/>;

const MiniStat = ({ label, value, color='var(--text)', sub }) => (
  <div style={{textAlign:'center',padding:'12px 8px',background:'rgba(0,0,0,0.3)',
    borderRadius:12,border:'1px solid rgba(255,255,255,0.06)'}}>
    <div style={{fontFamily:'var(--mono)',fontSize:'clamp(11px,3vw,15px)',fontWeight:700,color}}>{value}</div>
    <div style={{fontSize:9,letterSpacing:1.5,color:'var(--sub)',marginTop:3,fontFamily:'var(--mono)'}}>{label}</div>
    {sub&&<div style={{fontSize:9,color:'var(--sub)',marginTop:2}}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root{
  --bg0:#03050f;--bg1:#070c1a;--bg2:#0c1228;
  --teal:#22d3a5;--blue:#38bdf8;--amber:#f59e0b;--red:#f43f5e;--purple:#c084fc;
  --text:#e2e8f0;--sub:#64748b;--dim:#1e2d45;
  --font:'Sora',sans-serif;--mono:'JetBrains Mono',monospace;
  --safe-b:env(safe-area-inset-bottom,0px);
  --safe-l:env(safe-area-inset-left,0px);
  --safe-r:env(safe-area-inset-right,0px);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html{background:var(--bg0);-webkit-text-size-adjust:100%;text-size-adjust:100%;}
body{background:var(--bg0);color:var(--text);font-family:var(--font);-webkit-overflow-scrolling:touch;overflow-x:hidden;min-height:100vh;min-height:100dvh;}

#orbs{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
.orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.15;}
.orb1{width:600px;height:600px;background:radial-gradient(circle,hsl(190,90%,45%),transparent 70%);top:-200px;left:-150px;animation:drift1 18s ease-in-out infinite;}
.orb2{width:500px;height:500px;background:radial-gradient(circle,hsl(265,80%,55%),transparent 70%);bottom:-150px;right:-100px;animation:drift2 22s ease-in-out infinite;}
.orb3{width:400px;height:400px;background:radial-gradient(circle,hsl(150,80%,40%),transparent 70%);top:40%;left:50%;animation:drift3 16s ease-in-out infinite;}
@keyframes drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,80px)}}
@keyframes drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(-80px,-60px)}}
@keyframes drift3{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(calc(-50% + 40px),calc(-50% + 60px))}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
.fu{animation:fadeUp .4s ease both;}
.fu2{animation:fadeUp .4s .08s ease both;}
.fu3{animation:fadeUp .4s .16s ease both;}

#shell{position:relative;z-index:1;width:100%;max-width:1440px;margin:0 auto;
  min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;
  padding:0 calc(18px + var(--safe-r)) calc(48px + var(--safe-b)) calc(18px + var(--safe-l));}

#topbar{display:flex;justify-content:space-between;align-items:center;
  padding:18px 0 14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:28px;
  flex-wrap:wrap;gap:10px;}
.logo-text{font-size:clamp(17px,4vw,26px);font-weight:800;letter-spacing:-0.5px;
  background:linear-gradient(135deg,var(--teal),var(--blue));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.logo-sub{font-size:10px;letter-spacing:3px;color:var(--sub);margin-top:2px;font-family:var(--mono);}
.clock-time{font-family:var(--mono);font-size:clamp(15px,3vw,22px);font-weight:700;letter-spacing:2px;color:var(--text);text-align:right;}
.clock-date{font-size:10px;color:var(--sub);text-align:right;margin-top:2px;}

#loader{position:fixed;top:0;left:0;width:100%;height:2px;z-index:9999;
  background:linear-gradient(90deg,transparent,var(--teal),var(--blue),transparent);
  animation:slide 1.4s linear infinite;}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

#toast{position:fixed;bottom:calc(24px + var(--safe-b));left:50%;transform:translateX(-50%) translateY(0);
  padding:10px 22px;border-radius:40px;font-size:13px;font-weight:600;letter-spacing:1px;
  font-family:var(--mono);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  white-space:nowrap;z-index:600;transition:opacity .3s,transform .3s;pointer-events:none;}
#toast.ok {background:rgba(34,211,165,.18);border:1px solid rgba(34,211,165,.4);color:var(--teal);}
#toast.err{background:rgba(244,63,94,.18); border:1px solid rgba(244,63,94,.4); color:var(--red);}
#toast.hide{opacity:0;transform:translateX(-50%) translateY(12px);}

.inp{background:rgba(0,0,0,.35);color:var(--text);border:1px solid rgba(255,255,255,.1);
  border-radius:12px;padding:14px 16px;width:100%;font-family:var(--font);font-size:16px;
  outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s;resize:vertical;}
.inp:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(34,211,165,.12);}
.inp[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.5;}
select.inp{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
.lbl{font-size:11px;letter-spacing:2px;color:var(--sub);margin-bottom:7px;display:block;font-family:var(--mono);}
.gap{margin-bottom:14px;}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
  min-height:48px;padding:12px 20px;border-radius:12px;border:none;
  font-family:var(--font);font-size:13px;font-weight:700;letter-spacing:.3px;
  cursor:pointer;text-transform:uppercase;-webkit-appearance:none;
  transition:transform .13s,opacity .13s;touch-action:manipulation;
  user-select:none;-webkit-user-select:none;}
.btn:active{transform:scale(.95);opacity:.85;}
.btn:disabled{opacity:.3;pointer-events:none;}
.bt{background:linear-gradient(135deg,var(--teal),hsl(175,65%,45%));color:#000;box-shadow:0 4px 18px rgba(34,211,165,.28);}
.bb{background:linear-gradient(135deg,var(--blue),hsl(200,85%,55%));color:#000;box-shadow:0 4px 18px rgba(56,189,248,.28);}
.br{background:linear-gradient(135deg,var(--red),hsl(345,85%,55%));color:#fff;box-shadow:0 4px 18px rgba(244,63,94,.28);}
.ba{background:linear-gradient(135deg,var(--amber),hsl(35,90%,55%));color:#000;}
.bp{background:linear-gradient(135deg,var(--purple),hsl(280,75%,60%));color:#fff;box-shadow:0 4px 18px rgba(192,132,252,.25);}
.bg{background:rgba(255,255,255,.05);color:var(--sub);border:1px solid rgba(255,255,255,.08);}
.bg:active{background:rgba(255,255,255,.1);}
.bw{width:100%;}
.btn-tab{background:transparent;color:var(--sub);border:none;border-bottom:2px solid transparent;
  border-radius:0;padding:10px 14px;font-size:11px;font-family:var(--mono);letter-spacing:2px;
  min-height:44px;white-space:nowrap;cursor:pointer;touch-action:manipulation;transition:color .2s,border-color .2s;}
.btn-tab.on{color:var(--teal);border-bottom-color:var(--teal);}

.alert{padding:11px 15px;border-radius:12px;font-size:13px;display:flex;align-items:center;gap:9px;}
.aok{background:rgba(34,211,165,.08);border:1px solid rgba(34,211,165,.3);color:var(--teal);}
.aer{background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.3);color:var(--red);}
.awn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);color:var(--amber);}
.apr{background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.3);color:var(--purple);}

.pbar{height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;}
.pfill{height:100%;border-radius:2px;transition:width 1s ease;}

.g2{display:grid;grid-template-columns:1fr;gap:18px;width:100%;}
@media(min-width:768px){.g2{grid-template-columns:1fr 1fr;}}
.g4{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;}
@media(min-width:600px){.g4{grid-template-columns:repeat(4,1fr);}}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.g2sm{display:grid;grid-template-columns:1fr 1fr;gap:10px;}

.sc{padding:18px;border-radius:16px;position:relative;overflow:hidden;}
.sv{font-family:var(--mono);font-size:clamp(22px,4.5vw,36px);font-weight:700;line-height:1;}
.sl{font-size:10px;letter-spacing:2px;color:var(--sub);margin-top:5px;font-family:var(--mono);}

.arow{display:flex;align-items:center;gap:11px;padding:12px 8px;border-radius:12px;
  cursor:pointer;transition:background .13s;border-bottom:1px solid rgba(255,255,255,.04);}
.arow:last-child{border-bottom:none;}
.arow:active,.arow:focus-within{background:rgba(34,211,165,.05);}
@media(hover:hover){.arow:hover{background:rgba(34,211,165,.05);}}
.av{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:14px;flex-shrink:0;font-family:var(--mono);}
.an{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ad{font-size:10px;color:var(--sub);letter-spacing:1px;margin-top:2px;font-family:var(--mono);}

.tl{position:relative;padding-left:22px;}
.tl::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.07);}
.tlrow{position:relative;padding:8px 0;}
.tldot{position:absolute;left:-19px;top:12px;width:8px;height:8px;border-radius:50%;border:2px solid var(--bg0);}
.tlt{font-size:10px;color:var(--sub);font-family:var(--mono);}
.tla{font-size:13px;font-weight:600;margin-top:2px;}

.tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:22px;width:100%;
  overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:0;}
.tabs::-webkit-scrollbar{display:none;}

.center{display:flex;flex-direction:column;align-items:center;justify-content:center;
  flex:1;width:100%;max-width:440px;gap:13px;padding:24px 0;margin:0 auto;}

.bigtimer{font-family:var(--mono);font-weight:700;letter-spacing:3px;line-height:1;}

.overlay{position:fixed;inset:0;background:rgba(3,5,15,.88);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;}
@media(min-width:600px){.overlay{align-items:center;padding:20px;}}
.modal{background:rgba(8,14,32,.97);border:1px solid rgba(34,211,165,.18);
  border-radius:24px 24px 0 0;padding:22px 18px calc(20px + var(--safe-b));
  width:100%;max-height:92vh;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;}
@media(min-width:600px){.modal{border-radius:24px;max-width:540px;max-height:88vh;padding:26px;}}
.drag{width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:2px;margin:0 auto 18px;}

.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px;}
.tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:520px;font-family:var(--mono);}
.tbl th{text-align:left;padding:10px 13px;font-size:10px;letter-spacing:2px;color:var(--sub);
  border-bottom:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.3);white-space:nowrap;}
.tbl td{padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;}

.swap-card{padding:14px;border-radius:14px;background:rgba(0,0,0,.3);
  border:1px solid rgba(255,255,255,.07);margin-bottom:10px;transition:border-color .2s;}
.swap-card:hover{border-color:rgba(34,211,165,.25);}

.announce-card{padding:14px 16px;border-radius:14px;background:rgba(192,132,252,.07);
  border:1px solid rgba(192,132,252,.2);margin-bottom:10px;animation:slideIn .3s ease both;}
.announce-urgent{background:rgba(244,63,94,.07);border-color:rgba(244,63,94,.25);}

.oncall-badge{display:inline-flex;align-items:center;gap:7px;padding:6px 16px;border-radius:40px;
  background:rgba(192,132,252,.15);border:1px solid rgba(192,132,252,.3);
  color:var(--purple);font-size:12px;font-weight:700;letter-spacing:1.5px;font-family:var(--mono);}

@media(pointer:fine){
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}
}
.actg{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.actg .s2{grid-column:1/-1;}
.hero{font-size:clamp(30px,7vw,58px);font-weight:800;line-height:1.05;
  background:linear-gradient(135deg,#fff 0%,var(--teal) 50%,var(--blue) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  letter-spacing:-2px;margin-bottom:6px;}
.herosub{font-size:clamp(11px,2.5vw,13px);color:var(--sub);letter-spacing:3px;font-family:var(--mono);}
`;

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // ── core state ──
  const [view,   setView]   = useState('landing');
  const [tab,    setTab]    = useState('attendance');
  const [agents, setAgents] = useState([]);
  const [logs,   setLogs]   = useState([]);
  const [recs,   setRecs]   = useState({});
  const [user,   setUser]   = useState(null);
  const [busy,   setBusy]   = useState(false);
  const [now,    setNow]    = useState(Date.now());

  // ── ui state ──
  const [toast,     setToast]    = useState({ msg:'', kind:'ok' });
  const [modal,     setModal]    = useState(null);   // agent detail (mgr)
  const [swapModal, setSwapModal]= useState(false);  // agent swap request
  const [memoModal, setMemoModal]= useState(false);  // agent shift memo
  const [escalModal,setEscalModal]= useState(false); // agent escalation
  const [annModal,  setAnnModal] = useState(false);  // mgr announce

  // ── form state ──
  const [reg,    setReg]   = useState({ name:'', pin:'', platform:'META', shift:'Morning' });
  const [mkey,   setMkey]  = useState('');
  const [logF,   setLogF]  = useState({ name:'', pin:'' });
  const [err,    setErr]   = useState('');
  const [ok,     setOk]    = useState('');
  const [sal,    setSal]   = useState('');
  const [rng,    setRng]   = useState('today');
  const [cs,     setCs]    = useState(tsKey());
  const [ce,     setCe]    = useState(tsKey());

  // ── swap form ──
  const [swapTarget, setSwapTarget] = useState('');
  const [swapNote,   setSwapNote]   = useState('');

  // ── memo form ──
  const [memoText, setMemoText] = useState('');

  // ── escalation form ──
  const [escalTitle,   setEscalTitle]  = useState('');
  const [escalDetail,  setEscalDetail] = useState('');
  const [escalUrgent,  setEscalUrgent] = useState(false);

  // ── announcement form (mgr) ──
  const [annText,   setAnnText]  = useState('');
  const [annUrgent, setAnnUrgent]= useState(false);

  // ── swap queue (local mirror) ──
  const [swapRequests, setSwapRequests] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [escalations,   setEscalations]   = useState([]);
  const [memos,         setMemos]         = useState([]);

  // ── performance filter ──
  const [perfAgent, setPerfAgent] = useState('');

  // ── manager on-call state ──
  const [mgrOnCall, setMgrOnCall] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const showToast = (msg, kind='ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast({ msg:'', kind:'ok' }), 3000);
  };

  // ── FETCH ──
  const fetch_ = useCallback(async () => {
    setBusy(true);
    try {
      const d = await fetch(HOOK).then(r => r.json());

      const urows = d.filter(i => i.action==='USER_REGISTER'||i.action==='USER_APPROVE');
      const lrows = d.filter(i => !i.action?.startsWith('USER_') &&
        !['SWAP_REQUEST','SWAP_APPROVE','SWAP_DENY','ANNOUNCE','ESCALATE','MEMO'].includes(i.action))
        .map(l => ({ ...l, timestamp: Number(l.timestamp)||new Date(`${l.date} ${l.time}`).getTime() }))
        .sort((a,b) => b.timestamp - a.timestamp);

      const swaps = d.filter(i => ['SWAP_REQUEST','SWAP_APPROVE','SWAP_DENY'].includes(i.action))
        .map(s => { try { return { ...s, ...JSON.parse(s.device) }; } catch { return s; } });
      const anns = d.filter(i => i.action==='ANNOUNCE')
        .map(a => { try { return { ...a, ...JSON.parse(a.device) }; } catch { return a; } })
        .sort((a,b) => b.timestamp - a.timestamp).slice(0,20);
      const escs = d.filter(i => i.action==='ESCALATE')
        .map(e => { try { return { ...e, ...JSON.parse(e.device) }; } catch { return e; } })
        .sort((a,b) => b.timestamp - a.timestamp);
      const ms = d.filter(i => i.action==='MEMO')
        .map(m => { try { return { ...m, ...JSON.parse(m.device) }; } catch { return m; } })
        .sort((a,b) => b.timestamp - a.timestamp);

      const map = {};
      urows.forEach(u => {
        try {
          const x = JSON.parse(u.device);
          map[u.agent.toLowerCase()] = { ...x, name:u.agent, status:u.action==='USER_APPROVE'?'active':'pending' };
        } catch(_) {}
      });

      setAgents(Object.values(map));
      setLogs(lrows);
      setSwapRequests(swaps);
      setAnnouncements(anns);
      setEscalations(escs);
      setMemos(ms);
    } catch(e) { console.error(e); }
    setBusy(false);
  }, []);

  useEffect(() => { fetch_(); }, [view, fetch_]);

  const post = (payload) =>
    fetch(HOOK, { method:'POST', mode:'no-cors', body: JSON.stringify(payload) });

  const audit = async () => {
    try {
      const d = await fetch('https://ipapi.co/json/').then(r=>r.json());
      return `${d.city},${d.country_code}|IP:${d.ip}|${navigator.platform}`;
    } catch { return navigator.platform; }
  };

  // ── REGISTER ──
  const doRegister = async () => {
    setErr('');
    if (!reg.name.trim() || reg.pin.length < 4) return setErr('Min 4-char password.');
    const mgr = reg.platform === 'MANAGER';
    if (mgr && mkey !== MGR_KEY) return setErr('Invalid Manager Key.');
    setBusy(true);
    const loc  = await audit();
    const data = { ...reg, role:mgr?'Manager':'Agent', salary:mgr?PAY(reg.name):0 };
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:mgr?'USER_APPROVE':'USER_REGISTER', agent:reg.name.trim(),
      device:JSON.stringify({ ...data, loc }), timestamp:Date.now()
    });
    setOk(mgr?'Manager activated!':'Sent — awaiting approval.');
    if (mgr) { setUser({ ...data, status:'active' }); setView('mgr'); }
    else setTimeout(() => setView('landing'), 2500);
    setBusy(false);
  };

  // ── LOGIN ──
  const doLogin = () => {
    setErr('');
    const found = agents.find(a =>
      a.name.toLowerCase() === logF.name.toLowerCase().trim() && a.pin === logF.pin
    );
    if (!found) return setErr('Credentials not found.');
    if (found.status === 'pending') return setErr('Account awaiting approval.');
    setUser(found);
    setView(found.role === 'Manager' ? 'mgr' : 'agent');
  };

  // ── CLOCK ACTIONS ──
  const doAction = async (type) => {
    setBusy(true);
    const ts = Date.now(), proof = await audit();
    const rec = recs[user.name] || {};
    let nx = { ...rec };
    if (type === 'clockIn')    nx = { clockIn:ts, breakUsedMs:0 };
    if (type === 'breakStart') { nx.onBreak=true; nx.breakStart=ts; }
    if (type === 'breakEnd')   { nx.onBreak=false; nx.breakUsedMs=(nx.breakUsedMs||0)+(ts-nx.breakStart); }
    if (type === 'clockOut')   nx = { clockedOut:true, clockOutTs:ts, totalNet:Math.max(0,(ts-(rec.clockIn||ts))-(rec.breakUsedMs||0)) };
    setRecs(p => ({ ...p, [user.name]:nx }));
    await post({
      date:new Date(ts).toLocaleDateString(), time:new Date(ts).toLocaleTimeString(),
      action:type, agent:user.name, device:proof, timestamp:ts
    });
    showToast(AL[type] || type);
    await fetch_();
    setBusy(false);
  };

  // ── SHIFT SWAP REQUEST ──
  const doSwapRequest = async () => {
    if (!swapTarget) return showToast('Select a target agent', 'err');
    setBusy(true);
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:'SWAP_REQUEST', agent:user.name, timestamp:Date.now(),
      device:JSON.stringify({
        from:user.name, to:swapTarget, fromShift:user.shift||'Morning',
        toShift:agents.find(a=>a.name===swapTarget)?.shift||'Morning',
        note:swapNote, status:'pending'
      })
    });
    showToast('Swap request sent!');
    setSwapModal(false); setSwapTarget(''); setSwapNote('');
    await fetch_();
    setBusy(false);
  };

  // ── SWAP APPROVE/DENY (manager) ──
  const doSwapDecision = async (req, decision) => {
    setBusy(true);
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:decision==='approve'?'SWAP_APPROVE':'SWAP_DENY', agent:user.name, timestamp:Date.now(),
      device:JSON.stringify({ ...req, status:decision==='approve'?'approved':'denied', decidedBy:user.name })
    });
    showToast(decision==='approve'?'Swap approved!':'Swap denied.');
    await fetch_();
    setBusy(false);
  };

  // ── SUBMIT MEMO ──
  const doMemo = async () => {
    if (!memoText.trim()) return;
    setBusy(true);
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:'MEMO', agent:user.name, timestamp:Date.now(),
      device:JSON.stringify({ text:memoText, agent:user.name })
    });
    showToast('Memo submitted!');
    setMemoModal(false); setMemoText('');
    await fetch_();
    setBusy(false);
  };

  // ── ESCALATION ──
  const doEscalate = async () => {
    if (!escalTitle.trim()) return showToast('Add a title', 'err');
    setBusy(true);
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:'ESCALATE', agent:user.name, timestamp:Date.now(),
      device:JSON.stringify({ title:escalTitle, detail:escalDetail, urgent:escalUrgent, agent:user.name, resolved:false })
    });
    showToast(escalUrgent?'🚨 Urgent escalation sent!':'Escalation submitted.');
    setEscalModal(false); setEscalTitle(''); setEscalDetail(''); setEscalUrgent(false);
    await fetch_();
    setBusy(false);
  };

  // ── ANNOUNCE (manager) ──
  const doAnnounce = async () => {
    if (!annText.trim()) return;
    setBusy(true);
    await post({
      date:new Date().toLocaleDateString(), time:new Date().toLocaleTimeString(),
      action:'ANNOUNCE', agent:user.name, timestamp:Date.now(),
      device:JSON.stringify({ text:annText, urgent:annUrgent, from:user.name })
    });
    showToast('Announcement sent!');
    setAnnModal(false); setAnnText(''); setAnnUrgent(false);
    await fetch_();
    setBusy(false);
  };

  const logout = () => { setUser(null); setRecs({}); setView('landing'); };

  // ── SESSION CALCS ──
  const rec  = user ? (recs[user.name]||{}) : {};
  const bMs  = (rec.breakUsedMs||0) + (rec.onBreak ? (now-rec.breakStart) : 0);
  const shMs = rec.clockIn ? (now-rec.clockIn) : 0;
  const net  = Math.max(0, shMs-bMs);
  const ot   = Math.max(0, net-SHIFT_GOAL);  // overtime
  const bOvr = bMs > BREAK_MAX;
  const bPct = Math.min(bMs/BREAK_MAX*100, 100);
  const sPct = Math.min(net/SHIFT_GOAL*100, 100);

  const agentSt = user?.role==='Manager' ? STATUS.ONCALL :
    rec.onBreak ? STATUS.BREAK : (rec.clockIn && !rec.clockedOut) ? STATUS.ACTIVE : STATUS.PENDING;

  // ── ATTENDANCE SUMMARY ──
  const attend = useMemo(() =>
    agents.filter(a=>a.status==='active').map(agent => {
      const tl = logs.filter(l=>l.agent===agent.name&&l.timestamp>=todayMs())
        .sort((a,b)=>a.timestamp-b.timestamp);
      let ci=null,co=null,tb=0,bs=null;
      tl.forEach(l => {
        if (l.action==='clockIn'&&!ci) ci=l.timestamp;
        if (l.action==='breakStart') bs=l.timestamp;
        if (l.action==='breakEnd'&&bs) { tb+=l.timestamp-bs; bs=null; }
        if (l.action==='clockOut') co=l.timestamp;
      });
      const r=recs[agent.name]||{}, ab=r.onBreak?(now-(r.breakStart||now)):0;
      const totB=tb+(r.breakUsedMs||0)+ab, sMs=ci?((co||now)-ci):0, nMs=Math.max(0,sMs-totB);
      const otMs=Math.max(0,nMs-SHIFT_GOAL);
      const lateMs=ci?Math.max(0,ci-(schedStart(agent.shift||'Morning',ci)+LATE_GRACE)):0;
      return { ...agent, ci, co, totB, sMs, nMs, otMs, tl,
        status:deriveStatus(logs,agent.name,r,agent.role==='Manager'),
        bOvr:totB>BREAK_MAX, sPct:Math.min(nMs/SHIFT_GOAL*100,100),
        bPct:Math.min(totB/BREAK_MAX*100,100), lateMs };
    })
  , [agents,logs,recs,now]);

  // ── PERFORMANCE METRICS ──
  const perfMetrics = useMemo(() => {
    const target = perfAgent || null;
    const agList = target ? agents.filter(a=>a.name===target) : agents.filter(a=>a.status==='active');
    return agList.map(agent => {
      const agLogs = logs.filter(l=>l.agent===agent.name);
      const days = {};
      agLogs.forEach(l => { const d=new Date(l.timestamp).toLocaleDateString(); if(!days[d])days[d]=[]; days[d].push(l); });
      const dayCount=Object.keys(days).length||1;
      let totalNet=0, totalBreak=0, lateDays=0, missedDays=0;
      Object.values(days).forEach(dl => {
        const sorted=dl.sort((a,b)=>a.timestamp-b.timestamp);
        let ci=null,bs=null,tb=0;
        sorted.forEach(l=>{
          if(l.action==='clockIn'&&!ci)ci=l.timestamp;
          if(l.action==='breakStart')bs=l.timestamp;
          if(l.action==='breakEnd'&&bs){tb+=l.timestamp-bs;bs=null;}
        });
        const co=sorted.find(l=>l.action==='clockOut')?.timestamp;
        if(ci){
          const lateThresh = schedStart(agent.shift||'Morning', ci) + LATE_GRACE;
          if(ci > lateThresh) lateDays++;
          const sMs=co?co-ci:0; totalNet+=Math.max(0,sMs-tb); totalBreak+=tb;
        } else missedDays++;
      });
      const avgNet=totalNet/dayCount, avgBreak=totalBreak/dayCount;
      const compliance=Math.round(((dayCount-lateDays-missedDays)/Math.max(dayCount,1))*100);
      return { name:agent.name, platform:agent.platform, avgNet, avgBreak, lateDays, compliance, dayCount };
    });
  }, [agents,logs,perfAgent]);

  // ── FILTERED LOGS ──
  const filtLogs = useMemo(() => {
    let s,e; const td=new Date(); td.setHours(0,0,0,0);
    if (rng==='today')     { s=td.getTime(); e=s+86400000; }
    else if (rng==='yesterday') { s=td.getTime()-86400000; e=td.getTime(); }
    else { s=new Date(cs).getTime(); e=new Date(ce).getTime()+86400000; }
    return logs.filter(l=>l.timestamp>=s&&l.timestamp<=e);
  }, [logs,rng,cs,ce]);

  // ── PENDING SWAPS ──
  const pendingSwaps = useMemo(() =>
    swapRequests.filter(s=>s.status==='pending'), [swapRequests]);
  const mySwapRequests = useMemo(() =>
    swapRequests.filter(s=>s.from===user?.name||s.to===user?.name), [swapRequests,user]);

  // ── UNRESOLVED ESCALATIONS ──
  const openEscals = useMemo(() =>
    escalations.filter(e=>!e.resolved), [escalations]);

  // ── AGENTS ELIGIBLE FOR SWAP ──
  const swapEligible = useMemo(() =>
    agents.filter(a =>
      a.status==='active' && a.role!=='Manager' &&
      a.name!==user?.name &&
      (a.shift||'Morning')===(user?.shift||'Morning')
    ), [agents, user]);

  const exportCSV = () => {
    const rows=[['Agent','Dept','Clock In','Clock Out','Break','Net Work','Overtime','Shift%','Status','Late']];
    attend.forEach(a=>rows.push([
      a.name,a.platform,
      a.ci?new Date(a.ci).toLocaleTimeString():'-',
      a.co?new Date(a.co).toLocaleTimeString():'-',
      fmtS(a.totB),fmtS(a.nMs),fmtS(a.otMs),
      `${a.sPct.toFixed(0)}%`,a.status.label,
      a.lateMs>0?fmtS(a.lateMs):'-'
    ]));
    const b=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b);
    a.download=`attendance_${tsKey()}.csv`; a.click();
  };

  const timeLabel = new Date(now).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const dateLabel = new Date(now).toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric'});

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div id="orbs"><div className="orb orb1"/><div className="orb orb2"/><div className="orb orb3"/></div>
      {busy && <div id="loader"/>}

      {/* TOAST */}
      <div id="toast" className={`${toast.kind} ${toast.msg?'':'hide'}`}>{toast.msg}</div>

      <div id="shell">
        {/* TOP BAR */}
        <div id="topbar">
          <div>
            <div className="logo-text">AFTERSALES</div>
            <div className="logo-sub">WORKFORCE ATTENDANCE v3.1</div>
          </div>
          <div>
            <div className="clock-time">{timeLabel}</div>
            <div className="clock-date">{dateLabel}</div>
          </div>
        </div>

        {/* ══ LANDING ══ */}
        {view==='landing'&&(
          <div className="center">
            <div style={{textAlign:'center',marginBottom:10}}>
              <div className="hero fu">CLOCK IN.</div>
              <div className="herosub fu2">ATTENDANCE · SHIFTS · TEAM</div>
            </div>
            <button className="btn bt bw fu3" onClick={()=>{setErr('');setView('login');}}>▶  SIGN IN</button>
            <button className="btn bg bw" style={{animationDelay:'.24s'}} onClick={()=>{setErr('');setOk('');setView('register');}}>CREATE ACCOUNT</button>
          </div>
        )}

        {/* ══ REGISTER ══ */}
        {view==='register'&&(
          <div className="center">
            <Glass style={{width:'100%'}}>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-.5}}>Create Account</div>
                <div style={{fontSize:10,color:'var(--sub)',letterSpacing:3,fontFamily:'var(--mono)',marginTop:4}}>ONBOARDING</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Display name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
                onChange={e=>setReg({...reg,name:e.target.value})}/>
              <label className="lbl">PASSWORD</label>
              <input className="inp gap" type="password" placeholder="Min 4 characters" autoComplete="new-password"
                onChange={e=>setReg({...reg,pin:e.target.value})}/>
              <label className="lbl">DEPARTMENT</label>
              <select className="inp gap" onChange={e=>{
                const dept = e.target.value;
                const locked = getLockedShift(dept);
                setReg({...reg, platform:dept, shift: locked || reg.shift });
              }}>
                {Object.keys(DEPT_HUE).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              {reg.platform!=='MANAGER'&&(
                getLockedShift(reg.platform) ? (
                  <div className="alert aok" style={{marginBottom:16}}>
                    🕘 Shift auto-assigned: <strong>Office (9:00 AM – 5:00 PM)</strong> for {reg.platform} team
                  </div>
                ) : (
                  <>
                    <label className="lbl">SHIFT SCHEDULE</label>
                    <select className="inp" style={{marginBottom:20}}
                      value={reg.shift}
                      onChange={e=>setReg({...reg,shift:e.target.value})}>
                      {availableShifts(reg.platform).map(s=>(
                        <option key={s.label} value={s.label}>
                          {s.label} ({s.start} – {s.end}{s.overnight?' +1':''})</option>
                      ))}
                    </select>
                  </>
                )
              )}
              {reg.platform==='MANAGER'&&<>
                <label className="lbl" style={{marginTop:2}}>ACTIVATION KEY</label>
                <input className="inp" style={{marginBottom:20}} type="password"
                  onChange={e=>setMkey(e.target.value)}/>
              </>}
              {err&&<div className="alert aer" style={{marginBottom:12}}>⚠ {err}</div>}
              {ok &&<div className="alert aok" style={{marginBottom:12}}>✓ {ok}</div>}
              <button className="btn bt bw" onClick={doRegister}>REGISTER</button>
              <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ LOGIN ══ */}
        {view==='login'&&(
          <div className="center">
            <Glass style={{width:'100%'}}>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-.5}}>Welcome back</div>
                <div style={{fontSize:10,color:'var(--sub)',letterSpacing:3,fontFamily:'var(--mono)',marginTop:4}}>SECURE ACCESS</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Your name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
                onChange={e=>setLogF({...logF,name:e.target.value})}/>
              <label className="lbl">PASSWORD</label>
              <input className="inp" style={{marginBottom:20}} type="password" autoComplete="current-password"
                onChange={e=>setLogF({...logF,pin:e.target.value})}/>
              {err&&<div className="alert aer" style={{marginBottom:12}}>⚠ {err}</div>}
              <button className="btn bt bw" onClick={doLogin}>ENTER WORKSPACE</button>
              <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ AGENT PORTAL ══ */}
        {view==='agent'&&user&&(
          <div style={{display:'flex',flexDirection:'column',gap:18,width:'100%',paddingTop:4}}>

            {/* ANNOUNCEMENTS BANNER */}
            {announcements.slice(0,2).map((a,i)=>(
              <div key={i} className={`announce-card${a.urgent?' announce-urgent':''}`}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  {a.urgent&&<span style={{fontSize:12}}>🚨</span>}
                  <span style={{fontSize:11,fontWeight:700,color:a.urgent?'var(--red)':'var(--purple)',fontFamily:'var(--mono)',letterSpacing:1}}>
                    {a.urgent?'URGENT':'ANNOUNCEMENT'} — {a.from}
                  </span>
                  <span style={{fontSize:10,color:'var(--sub)',marginLeft:'auto'}}>{a.date} {a.time}</span>
                </div>
                <div style={{fontSize:13,color:'var(--text)',lineHeight:1.5}}>{a.text}</div>
              </div>
            ))}

            <div className="g2">
              {/* LEFT — Session */}
              <Glass glow={`${agentSt.color}28`}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10,marginBottom:18}}>
                  <div>
                    <div style={{fontSize:11,letterSpacing:2,color:'var(--sub)',fontFamily:'var(--mono)'}}>SESSION</div>
                    <div style={{fontSize:21,fontWeight:800,marginTop:3,letterSpacing:-.5}}>{user.name}</div>
                    <div style={{fontSize:11,color:dc(user.platform),marginTop:2,fontFamily:'var(--mono)',letterSpacing:1}}>◆ {user.platform}</div>
                    {user.shift&&(()=>{
                      const sh = resolveShift(user.shift);
                      return (
                        <div style={{fontSize:10,color:'var(--sub)',marginTop:2,fontFamily:'var(--mono)'}}>
                          {sh.label.toUpperCase()} SHIFT · {sh.start} – {sh.end}{sh.overnight?' (+1 day)':''}
                        </div>
                      );
                    })()}
                  </div>
                  <Chip color={agentSt.color}><Dot color={agentSt.color} pulse={agentSt.pulse}/> {agentSt.label}</Chip>
                </div>

                {/* Ring + Timer */}
                <div style={{display:'flex',alignItems:'center',gap:16,padding:'6px 0 14px',flexWrap:'wrap'}}>
                  <Ring pct={sPct} size={100} stroke={7} color={rec.onBreak?'var(--amber)':'var(--teal)'}>
                    <div style={{textAlign:'center'}}>
                      <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:rec.onBreak?'var(--amber)':'var(--teal)'}}>
                        {rec.clockIn?`${~~(net/3_600_000)}h${pad(~~(net%3_600_000/60_000))}m`:'—'}
                      </div>
                    </div>
                  </Ring>
                  <div style={{flex:1,minWidth:140}}>
                    <div className="bigtimer" style={{fontSize:'clamp(30px,6vw,52px)',color:rec.onBreak?'var(--amber)':'var(--teal)'}}>
                      {rec.onBreak?fmt(now-rec.breakStart):rec.clockIn?fmt(net):'--:--:--'}
                    </div>
                    <div style={{fontSize:10,color:'var(--sub)',marginTop:5,fontFamily:'var(--mono)'}}>
                      {rec.onBreak?'CURRENT BREAK':rec.clockIn?'NET WORK TIME':'NOT CLOCKED IN'}
                    </div>
                    {rec.clockIn&&<div style={{fontSize:10,color:'var(--sub)',marginTop:2,fontFamily:'var(--mono)'}}>
                      In since {new Date(rec.clockIn).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
                    </div>}
                    {ot>0&&<div style={{fontSize:11,color:'var(--purple)',marginTop:4,fontFamily:'var(--mono)',fontWeight:700}}>
                      +{fmtS(ot)} overtime
                    </div>}
                  </div>
                </div>

                {/* Progress bars */}
                {rec.clockIn&&<>
                  <div style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:5}}>
                      <span>SHIFT</span><span style={{color:sPct>=100?'var(--teal)':'var(--text)'}}>{fmt(net)} / 8h</span>
                    </div>
                    <div className="pbar"><div className="pfill" style={{width:`${sPct}%`,background:sPct>=100?'var(--teal)':'linear-gradient(90deg,var(--blue),var(--teal))'}}/></div>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:bOvr?'var(--red)':'var(--sub)',marginBottom:5}}>
                      <span>BREAK</span><span style={{color:bOvr?'var(--red)':'var(--text)'}}>{fmt(bMs)} / 1h</span>
                    </div>
                    <div className="pbar"><div className="pfill" style={{width:`${bPct}%`,background:bOvr?'var(--red)':'var(--amber)'}}/></div>
                  </div>
                </>}

                {bOvr&&<div className="alert aer" style={{marginBottom:10}}>⚠ Break exceeded by {fmtS(bMs-BREAK_MAX)}</div>}
                {sPct>=100&&!rec.clockedOut&&<div className="alert aok" style={{marginBottom:10}}>✓ 8h target reached! +{fmtS(ot)} OT</div>}

                {/* Clock buttons */}
                <div className="actg">
                  <button className="btn bt" disabled={!(!rec.clockIn||rec.clockedOut)} onClick={()=>doAction('clockIn')}>▶ CLOCK IN</button>
                  <button className="btn br" disabled={!(rec.clockIn&&!rec.onBreak&&!rec.clockedOut)} onClick={()=>doAction('clockOut')}>■ CLOCK OUT</button>
                  <button className="btn ba s2" disabled={!(rec.clockIn&&!rec.clockedOut)} onClick={()=>doAction(rec.onBreak?'breakEnd':'breakStart')}>
                    {rec.onBreak?'▶ RESUME WORK':'⏸ START BREAK'}
                  </button>
                </div>

                {/* Mini stats */}
                {rec.clockIn&&<div className="g3" style={{marginTop:12}}>
                  <MiniStat label="GROSS"    value={fmt(shMs)} color="var(--text)"/>
                  <MiniStat label="BREAK"    value={fmt(bMs)}  color={bOvr?'var(--red)':'var(--amber)'}/>
                  <MiniStat label="NET WORK" value={fmt(net)}  color="var(--teal)"/>
                </div>}
              </Glass>

              {/* RIGHT — Timeline & quick actions */}
              <div style={{display:'flex',flexDirection:'column',gap:14}}>

                {/* Quick action buttons */}
                <div className="g2sm">
                  <button className="btn bb" style={{fontSize:11}} onClick={()=>setSwapModal(true)}>⇄ REQUEST SWAP</button>
                  <button className="btn br" style={{fontSize:11}} onClick={()=>setEscalModal(true)}>🚨 ESCALATE</button>
                  <button className="btn bg" style={{fontSize:11}} onClick={()=>setMemoModal(true)}>📝 SHIFT MEMO</button>
                  <button className="btn bg" style={{fontSize:11}} onClick={fetch_}>↺ REFRESH</button>
                </div>

                {/* My swap requests */}
                {mySwapRequests.length>0&&(
                  <Glass style={{padding:16}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>My Swap Requests</div>
                    {mySwapRequests.slice(0,3).map((s,i)=>(
                      <div key={i} style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,.05)',fontSize:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{color:'var(--sub)',fontFamily:'var(--mono)'}}>
                            {s.from===user.name?`→ ${s.to}`:`← ${s.from}`}
                          </span>
                          <Chip color={s.status==='approved'?'#22d3a5':s.status==='denied'?'#f43f5e':'#f59e0b'}>
                            {s.status?.toUpperCase()}
                          </Chip>
                        </div>
                        {s.note&&<div style={{fontSize:11,color:'var(--sub)',marginTop:3}}>{s.note}</div>}
                      </div>
                    ))}
                  </Glass>
                )}

                {/* Today's timeline */}
                <Glass style={{flex:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div style={{fontWeight:800,fontSize:14}}>Today's Timeline</div>
                    <span style={{fontSize:10,color:'var(--sub)',fontFamily:'var(--mono)'}}>
                      {new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'})}
                    </span>
                  </div>
                  {logs.filter(l=>l.agent===user.name&&l.timestamp>=todayMs()).sort((a,b)=>a.timestamp-b.timestamp).length===0
                    ?<div style={{textAlign:'center',color:'var(--sub)',padding:'24px 0',fontSize:13}}>No activity yet.</div>
                    :<div className="tl">
                      {logs.filter(l=>l.agent===user.name&&l.timestamp>=todayMs()).sort((a,b)=>a.timestamp-b.timestamp).map((l,i)=>(
                        <div className="tlrow" key={i}>
                          <div className="tldot" style={{background:AC[l.action]||'var(--sub)'}}/>
                          <div className="tlt">{l.time}</div>
                          <div className="tla" style={{color:AC[l.action]||'var(--text)'}}>{AI[l.action]} {AL[l.action]||l.action}</div>
                        </div>
                      ))}
                    </div>
                  }
                </Glass>

                <button className="btn bg bw" style={{color:'var(--red)',borderColor:'rgba(244,63,94,.2)'}} onClick={logout}>LOGOUT</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MANAGER PORTAL ══ */}
        {view==='mgr'&&user&&(
          <div style={{width:'100%'}}>
            {/* Manager header with On-Call badge */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,flexWrap:'wrap',gap:10}}>
              <div>
                <div style={{fontSize:11,letterSpacing:2,color:'var(--sub)',fontFamily:'var(--mono)'}}>MANAGER PORTAL</div>
                <div style={{fontSize:19,fontWeight:800,letterSpacing:-.5,marginTop:2}}>{user.name}</div>
                <div style={{marginTop:6,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <div className="oncall-badge">
                    <Dot color="var(--purple)" pulse/> ON CALL
                  </div>
                  {openEscals.length>0&&(
                    <Chip color="var(--red)">🚨 {openEscals.length} OPEN ESCALATION{openEscals.length!==1?'S':''}</Chip>
                  )}
                  {pendingSwaps.length>0&&(
                    <Chip color="var(--amber)">⇄ {pendingSwaps.length} SWAP REQUEST{pendingSwaps.length!==1?'S':''}</Chip>
                  )}
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button className="btn bp" style={{fontSize:11}} onClick={()=>setAnnModal(true)}>📢 ANNOUNCE</button>
                <button className="btn bg" style={{color:'var(--red)',fontSize:11}} onClick={logout}>LOGOUT</button>
              </div>
            </div>

            <div className="tabs">
              {['attendance','swaps','escalations','performance','logs','team','onboarding'].map(t=>(
                <button key={t} className={`btn-tab${tab===t?' on':''}`} onClick={()=>setTab(t)}>
                  {t==='swaps'&&pendingSwaps.length>0?`SWAPS (${pendingSwaps.length})`:
                   t==='escalations'&&openEscals.length>0?`🚨 ESCALATIONS`:
                   t.toUpperCase()}
                </button>
              ))}
            </div>

            {/* ── ATTENDANCE ── */}
            {tab==='attendance'&&(
              <div style={{display:'flex',flexDirection:'column',gap:18}}>
                <div className="g4">
                  {(()=>{
                    const on=attend.filter(a=>a.status===STATUS.ACTIVE).length;
                    const br=attend.filter(a=>a.status===STATUS.BREAK).length;
                    const ni=attend.filter(a=>a.status===STATUS.OUT||a.status===STATUS.PENDING).length;
                    const ov=attend.filter(a=>a.bOvr).length;
                    return[
                      {l:'ON SHIFT',      v:on, c:'var(--teal)',   g:'rgba(34,211,165,.1)'},
                      {l:'ON BREAK',      v:br, c:'var(--amber)',  g:'rgba(245,158,11,.1)'},
                      {l:'NOT IN',        v:ni, c:'var(--sub)',    g:'rgba(100,116,139,.07)'},
                      {l:'BREAK VIOLATIONS',v:ov,c:'var(--red)',   g:'rgba(244,63,94,.1)'},
                    ].map(s=>(
                      <div key={s.l} className="sc" style={{background:s.g,border:`1px solid ${s.c}22`}}>
                        <div className="sv" style={{color:s.c}}>{s.v}</div>
                        <div className="sl">{s.l}</div>
                      </div>
                    ));
                  })()}
                </div>
                <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                  <button className="btn bg" style={{fontSize:11}} onClick={exportCSV}>↓ EXPORT CSV</button>
                  <button className="btn bg" style={{fontSize:11}} onClick={fetch_}>↺ REFRESH</button>
                </div>
                <Glass style={{padding:'8px'}}>
                  {attend.length===0?<div style={{textAlign:'center',color:'var(--sub)',padding:28}}>No active agents.</div>
                  :attend.map(a=>(
                    <div key={a.name} className="arow" onClick={()=>setModal(a)}>
                      <Ring pct={a.sPct} size={50} stroke={4} color={a.status.color}>
                        <div style={{fontSize:9,fontWeight:700,fontFamily:'var(--mono)',color:a.status.color}}>{a.sPct.toFixed(0)}%</div>
                      </Ring>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="an">{a.name}</div>
                        <div className="ad" style={{color:dc(a.platform)}}>◆ {a.platform} · {resolveShift(a.shift||'Morning').label} ({resolveShift(a.shift||'Morning').start}–{resolveShift(a.shift||'Morning').end})</div>
                        {a.ci&&<div style={{fontSize:10,color:'var(--sub)',fontFamily:'var(--mono)',marginTop:2}}>
                          IN {new Date(a.ci).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
                          {a.lateMs>0&&<span style={{color:'var(--amber)',marginLeft:6}}>⚠ {fmtS(a.lateMs)} late</span>}
                          {a.otMs>0&&<span style={{color:'var(--purple)',marginLeft:6}}>+{fmtS(a.otMs)} OT</span>}
                        </div>}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,flexShrink:0}}>
                        <Chip color={a.status.color}><Dot color={a.status.color} pulse={a.status.pulse}/>{a.status.label}</Chip>
                        {a.ci&&<div style={{textAlign:'right',fontSize:10,color:'var(--sub)',fontFamily:'var(--mono)'}}>
                          <div style={{color:a.bOvr?'var(--red)':'var(--sub)'}}>BRK {fmtS(a.totB)}{a.bOvr?' ⚠':''}</div>
                          <div style={{color:'var(--teal)',fontWeight:700,fontSize:13,marginTop:1}}>{fmt(a.nMs)}</div>
                        </div>}
                      </div>
                    </div>
                  ))}
                </Glass>

                {/* Today's memos */}
                {memos.length>0&&(
                  <Glass>
                    <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>📝 Shift Memos Today</div>
                    {memos.filter(m=>{const d=new Date(m.timestamp);const t=new Date();return d.toLocaleDateString()===t.toLocaleDateString();}).slice(0,5).map((m,i)=>(
                      <div key={i} style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)',fontSize:13}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:4}}>
                          <span style={{color:dc(agents.find(a=>a.name===m.agent)?.platform)}}>{m.agent}</span>
                          <span>{m.time}</span>
                        </div>
                        <div style={{color:'var(--text)',lineHeight:1.5}}>{m.text}</div>
                      </div>
                    ))}
                  </Glass>
                )}
              </div>
            )}

            {/* ── SWAPS ── */}
            {tab==='swaps'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div className="g2sm">
                  <div className="sc" style={{background:'rgba(56,189,248,.08)',border:'1px solid rgba(56,189,248,.2)'}}>
                    <div className="sv" style={{color:'var(--blue)'}}>{pendingSwaps.length}</div>
                    <div className="sl">PENDING APPROVAL</div>
                  </div>
                  <div className="sc" style={{background:'rgba(34,211,165,.08)',border:'1px solid rgba(34,211,165,.2)'}}>
                    <div className="sv" style={{color:'var(--teal)'}}>{swapRequests.filter(s=>s.status==='approved').length}</div>
                    <div className="sl">APPROVED TODAY</div>
                  </div>
                </div>

                <Glass>
                  <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>Pending Swap Requests</div>
                  {pendingSwaps.length===0?<div style={{textAlign:'center',color:'var(--sub)',padding:'16px 0',fontSize:13}}>No pending swaps.</div>
                  :pendingSwaps.map((s,i)=>(
                    <div key={i} className="swap-card">
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap'}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14}}>
                            <span style={{color:'var(--teal)'}}>{s.from}</span>
                            <span style={{color:'var(--sub)',margin:'0 8px'}}>⇄</span>
                            <span style={{color:'var(--blue)'}}>{s.to}</span>
                          </div>
                          <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',marginTop:4}}>
                            {s.fromShift} ↔ {s.toShift} · {s.date}
                          </div>
                          {s.note&&<div style={{fontSize:12,color:'var(--text)',marginTop:5,fontStyle:'italic'}}>"{s.note}"</div>}
                        </div>
                        <div style={{display:'flex',gap:7,flexShrink:0}}>
                          <button className="btn bt" style={{fontSize:11,minHeight:36,padding:'7px 14px'}} onClick={()=>doSwapDecision(s,'approve')}>APPROVE</button>
                          <button className="btn br" style={{fontSize:11,minHeight:36,padding:'7px 14px'}} onClick={()=>doSwapDecision(s,'deny')}>DENY</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </Glass>

                <Glass>
                  <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>All Swap History</div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>DATE</th><th>FROM</th><th>TO</th><th>SHIFTS</th><th>STATUS</th><th>NOTE</th></tr></thead>
                      <tbody>
                        {swapRequests.slice(0,20).map((s,i)=>(
                          <tr key={i}>
                            <td style={{color:'var(--sub)',fontSize:10}}>{s.date}</td>
                            <td style={{fontWeight:700,color:'var(--teal)'}}>{s.from}</td>
                            <td style={{fontWeight:700,color:'var(--blue)'}}>{s.to}</td>
                            <td style={{fontSize:11}}>{s.fromShift} ↔ {s.toShift}</td>
                            <td><Chip color={s.status==='approved'?'#22d3a5':s.status==='denied'?'#f43f5e':'#f59e0b'}>{s.status?.toUpperCase()}</Chip></td>
                            <td style={{fontSize:11,color:'var(--sub)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.note||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Glass>
              </div>
            )}

            {/* ── ESCALATIONS ── */}
            {tab==='escalations'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <div className="g2sm">
                  <div className="sc" style={{background:'rgba(244,63,94,.08)',border:'1px solid rgba(244,63,94,.2)'}}>
                    <div className="sv" style={{color:'var(--red)'}}>{openEscals.filter(e=>e.urgent).length}</div>
                    <div className="sl">URGENT OPEN</div>
                  </div>
                  <div className="sc" style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.2)'}}>
                    <div className="sv" style={{color:'var(--amber)'}}>{openEscals.filter(e=>!e.urgent).length}</div>
                    <div className="sl">STANDARD OPEN</div>
                  </div>
                </div>
                <Glass>
                  <div style={{fontWeight:800,fontSize:14,marginBottom:14}}>Open Escalations</div>
                  {openEscals.length===0?<div style={{textAlign:'center',color:'var(--sub)',padding:'16px 0'}}>All clear! No open escalations.</div>
                  :openEscals.map((e,i)=>(
                    <div key={i} style={{padding:'14px',borderRadius:12,marginBottom:10,
                      background:e.urgent?'rgba(244,63,94,.07)':'rgba(245,158,11,.06)',
                      border:`1px solid ${e.urgent?'rgba(244,63,94,.25)':'rgba(245,158,11,.2)'}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:8}}>
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                            {e.urgent&&<span style={{fontSize:14}}>🚨</span>}
                            <span style={{fontWeight:700,fontSize:14}}>{e.title}</span>
                          </div>
                          <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',marginBottom:e.detail?6:0}}>
                            {e.agent} · {e.date} {e.time}
                          </div>
                          {e.detail&&<div style={{fontSize:13,color:'var(--text)',lineHeight:1.5}}>{e.detail}</div>}
                        </div>
                        <Chip color={e.urgent?'var(--red)':'var(--amber)'}>{e.urgent?'URGENT':'STANDARD'}</Chip>
                      </div>
                    </div>
                  ))}
                </Glass>
              </div>
            )}

            {/* ── PERFORMANCE ── */}
            {tab==='performance'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                <Glass style={{padding:14}}>
                  <select className="inp" style={{fontSize:14,padding:'10px 14px'}}
                    value={perfAgent} onChange={e=>setPerfAgent(e.target.value)}>
                    <option value="">All Active Agents</option>
                    {agents.filter(a=>a.status==='active').map(a=><option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                </Glass>

                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
                  {perfMetrics.map(p=>(
                    <Glass key={p.name} style={{padding:18}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                        <div className="av" style={{background:`${dc(p.platform)}18`,color:dc(p.platform)}}>{p.name[0]}</div>
                        <div>
                          <div style={{fontWeight:800,fontSize:14}}>{p.name}</div>
                          <div style={{fontSize:10,color:dc(p.platform),fontFamily:'var(--mono)',letterSpacing:1}}>{p.platform}</div>
                        </div>
                        <div style={{marginLeft:'auto'}}>
                          <Ring pct={p.compliance} size={48} stroke={4} color={p.compliance>=80?'var(--teal)':p.compliance>=60?'var(--amber)':'var(--red)'}>
                            <div style={{fontSize:8,fontWeight:700,fontFamily:'var(--mono)',color:p.compliance>=80?'var(--teal)':p.compliance>=60?'var(--amber)':'var(--red)'}}>{p.compliance}%</div>
                          </Ring>
                        </div>
                      </div>
                      <div className="g2sm">
                        <MiniStat label="AVG DAILY"  value={fmtS(p.avgNet)}  color="var(--teal)"/>
                        <MiniStat label="AVG BREAK"  value={fmtS(p.avgBreak)} color={p.avgBreak>BREAK_MAX?'var(--red)':'var(--amber)'}/>
                      </div>
                      <div style={{marginTop:10,display:'flex',gap:8,flexWrap:'wrap'}}>
                        {p.lateDays>0&&<Chip color="var(--amber)">{p.lateDays} LATE DAY{p.lateDays!==1?'S':''}</Chip>}
                        <Chip color="var(--sub)">{p.dayCount} DAYS TRACKED</Chip>
                        <Chip color={p.compliance>=80?'var(--teal)':p.compliance>=60?'var(--amber)':'var(--red)'}>{p.compliance}% ON-TIME</Chip>
                      </div>
                      <Sep/>
                      <div style={{marginTop:4}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:5}}>
                          <span>COMPLIANCE</span><span>{p.compliance}%</span>
                        </div>
                        <div className="pbar" style={{height:5}}>
                          <div className="pfill" style={{width:`${p.compliance}%`,background:p.compliance>=80?'var(--teal)':p.compliance>=60?'var(--amber)':'var(--red)'}}/>
                        </div>
                      </div>
                    </Glass>
                  ))}
                </div>
              </div>
            )}

            {/* ── LOGS ── */}
            {tab==='logs'&&(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  {['today','yesterday','custom'].map(r=>(
                    <button key={r} className={`btn ${rng===r?'bt':'bg'}`} style={{fontSize:11,minHeight:40,padding:'8px 14px'}} onClick={()=>setRng(r)}>{r.toUpperCase()}</button>
                  ))}
                  {rng==='custom'&&<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <input className="inp" type="date" value={cs} onChange={e=>setCs(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                    <span style={{color:'var(--sub)'}}>→</span>
                    <input className="inp" type="date" value={ce} onChange={e=>setCe(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                  </div>}
                  <div style={{marginLeft:'auto',fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)'}}>{filtLogs.length} entries</div>
                </div>
                <Glass style={{padding:0}} className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>DATE</th><th>TIME</th><th>AGENT</th><th>ACTION</th><th>AUDIT</th></tr></thead>
                    <tbody>
                      {filtLogs.map((l,i)=>(
                        <tr key={i}>
                          <td style={{color:'var(--sub)',fontSize:10}}>{l.date}</td>
                          <td style={{color:AC[l.action]||'var(--teal)',fontWeight:700,whiteSpace:'nowrap'}}>{l.time}</td>
                          <td style={{fontWeight:700}}>{l.agent}</td>
                          <td><span style={{color:AC[l.action]||'var(--sub)',fontWeight:600,fontSize:12}}>{AI[l.action]||'·'} {AL[l.action]||l.action}</span></td>
                          <td style={{fontSize:10,color:'var(--sub)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.device}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtLogs.length===0&&<div style={{padding:24,textAlign:'center',color:'var(--sub)'}}>No entries.</div>}
                </Glass>
              </div>
            )}

            {/* ── TEAM ── */}
            {tab==='team'&&(
              <div style={{display:'flex',flexDirection:'column',gap:16}}>
                {/* Shift breakdown */}
                <Glass>
                  <div style={{fontWeight:800,fontSize:14,marginBottom:16}}>Shift Breakdown</div>
                  {SHIFT_TEMPLATES.map(shift=>{
                    const inShift=agents.filter(a=>a.status==='active'&&(a.shift||'Morning')===shift.label);
                    if(!inShift.length)return null;
                    return(
                      <div key={shift.label} style={{marginBottom:16}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,flexWrap:'wrap',gap:6}}>
                          <div>
                            <span style={{fontWeight:700,fontSize:14}}>{shift.label} Shift</span>
                            <span style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',marginLeft:8}}>
                              {shift.start} – {shift.end}{shift.overnight?' (+1 day)':''}
                            </span>
                            {shift.depts&&<span style={{fontSize:10,color:dc(shift.depts[0]),fontFamily:'var(--mono)',marginLeft:8}}>
                              ({shift.depts.join(', ')} team)
                            </span>}
                          </div>
                          <Chip color="var(--blue)">{inShift.length} agent{inShift.length!==1?'s':''}</Chip>
                        </div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                          {inShift.map(a=>(
                            <div key={a.name} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',
                              background:dg(a.platform),borderRadius:20,border:`1px solid ${dc(a.platform)}30`}}>
                              <Dot color={dc(a.platform)}/>
                              <span style={{fontSize:12,fontWeight:600}}>{a.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </Glass>

                {/* Announcements log */}
                <Glass>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div style={{fontWeight:800,fontSize:14}}>Broadcast History</div>
                    <button className="btn bp" style={{fontSize:11,minHeight:36,padding:'7px 14px'}} onClick={()=>setAnnModal(true)}>+ NEW</button>
                  </div>
                  {announcements.length===0?<div style={{textAlign:'center',color:'var(--sub)',padding:'14px 0',fontSize:13}}>No announcements yet.</div>
                  :announcements.slice(0,10).map((a,i)=>(
                    <div key={i} className={`announce-card${a.urgent?' announce-urgent':''}`}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        {a.urgent&&<span>🚨</span>}
                        <span style={{fontSize:10,fontWeight:700,color:a.urgent?'var(--red)':'var(--purple)',fontFamily:'var(--mono)',letterSpacing:1}}>{a.urgent?'URGENT':'BROADCAST'}</span>
                        <span style={{fontSize:10,color:'var(--sub)',marginLeft:'auto'}}>{a.date} {a.time}</span>
                      </div>
                      <div style={{fontSize:13,lineHeight:1.5}}>{a.text}</div>
                    </div>
                  ))}
                </Glass>
              </div>
            )}

            {/* ── ONBOARDING ── */}
            {tab==='onboarding'&&(
              <Glass style={{maxWidth:520}}>
                <div style={{fontWeight:800,fontSize:16,marginBottom:18}}>Activation Queue</div>
                <label className="lbl">SET MONTHLY SALARY (USD)</label>
                <input className="inp gap" placeholder="e.g. 260" type="number" inputMode="numeric" onChange={e=>setSal(e.target.value)}/>
                {agents.filter(a=>a.status==='pending').length===0
                  ?<div style={{textAlign:'center',color:'var(--sub)',padding:'18px 0',fontFamily:'var(--mono)',fontSize:12}}>No pending registrations.</div>
                  :agents.filter(a=>a.status==='pending').map(a=>(
                    <div key={a.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 0',borderBottom:'1px solid rgba(255,255,255,.05)',gap:10,flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontWeight:700}}>{a.name}</div>
                        <div style={{fontSize:10,color:dc(a.platform),fontFamily:'var(--mono)',letterSpacing:1,marginTop:3}}>
                          {a.platform} · {resolveShift(a.shift||'Morning').label} ({resolveShift(a.shift||'Morning').start}–{resolveShift(a.shift||'Morning').end})
                        </div>
                      </div>
                      <button className="btn bt" style={{fontSize:11}} onClick={async()=>{
                        if(!sal)return alert('Assign salary first.');
                        await post({date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString(),
                          action:'USER_APPROVE',agent:a.name,device:JSON.stringify({...a,salary:Number(sal)}),timestamp:Date.now()});
                        fetch_();
                      }}>ACTIVATE</button>
                    </div>
                  ))
                }
              </Glass>
            )}
          </div>
        )}
      </div>

      {/* ══ MODAL: AGENT DETAIL (MGR) ══ */}
      {modal&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:19,letterSpacing:-.5}}>{modal.name}</div>
                <div style={{fontSize:10,color:dc(modal.platform),letterSpacing:1,marginTop:3,fontFamily:'var(--mono)'}}>
                  ◆ {modal.platform} · {resolveShift(modal.shift||'Morning').label} ({resolveShift(modal.shift||'Morning').start}–{resolveShift(modal.shift||'Morning').end})
                </div>
              </div>
              <Chip color={modal.status.color}><Dot color={modal.status.color} pulse={modal.status.pulse}/>{modal.status.label}</Chip>
            </div>
            <div style={{display:'flex',justifyContent:'center',marginBottom:18}}>
              <Ring pct={modal.sPct} size={110} stroke={8} color={modal.status.color}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:18,fontWeight:700,color:modal.status.color}}>{modal.sPct.toFixed(0)}%</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--sub)',letterSpacing:1}}>SHIFT</div>
                </div>
              </Ring>
            </div>
            <div className="g3" style={{marginBottom:14}}>
              <MiniStat label="CLOCK IN"  value={modal.ci?new Date(modal.ci).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—'}/>
              <MiniStat label="BREAK"     value={fmtS(modal.totB)} color={modal.bOvr?'var(--red)':'var(--amber)'}/>
              <MiniStat label="NET WORK"  value={fmt(modal.nMs)}   color="var(--teal)"/>
            </div>
            {modal.otMs>0&&<MiniStat label="OVERTIME" value={fmtS(modal.otMs)} color="var(--purple)"/>}
            {modal.lateMs>0&&<div className="alert awn" style={{marginTop:10,marginBottom:6}}>⚠ Arrived {fmtS(modal.lateMs)} late today</div>}
            {modal.bOvr&&<div className="alert aer" style={{marginBottom:6}}>⚠ Break over by {fmtS(modal.totB-BREAK_MAX)}</div>}
            <Sep/>
            <div style={{fontWeight:700,fontSize:13,marginBottom:11}}>Today's Activity</div>
            {modal.tl.length===0?<div style={{color:'var(--sub)',padding:'12px 0',textAlign:'center'}}>No activity today.</div>
            :<div className="tl">
              {modal.tl.map((l,i)=>(
                <div className="tlrow" key={i}>
                  <div className="tldot" style={{background:AC[l.action]||'var(--sub)'}}/>
                  <div className="tlt">{l.time}</div>
                  <div className="tla" style={{color:AC[l.action]||'var(--text)'}}>{AI[l.action]} {AL[l.action]||l.action}</div>
                </div>
              ))}
            </div>}
            <button className="btn bg bw" style={{marginTop:18}} onClick={()=>setModal(null)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: SWAP REQUEST (AGENT) ══ */}
      {swapModal&&(
        <div className="overlay" onClick={()=>setSwapModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Request Shift Swap</div>
            <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',letterSpacing:2,marginBottom:8}}>SAME SHIFT · MANAGER APPROVAL REQUIRED</div>
            {user&&(()=>{
              const sh = resolveShift(user.shift||'Morning');
              return (
                <div className="alert aok" style={{marginBottom:16}}>
                  Your shift: <strong>{sh.label} ({sh.start} – {sh.end}{sh.overnight?' +1 day':''})</strong>
                </div>
              );
            })()}

            {swapEligible.length===0?(
              <div className="alert awn" style={{marginBottom:16}}>
                No other agents are on the {resolveShift(user?.shift||'Morning').label} shift ({resolveShift(user?.shift||'Morning').start}–{resolveShift(user?.shift||'Morning').end}) right now.
              </div>
            ):(
              <>
                <label className="lbl">SELECT AGENT TO SWAP WITH</label>
                <select className="inp gap" value={swapTarget} onChange={e=>setSwapTarget(e.target.value)}>
                  <option value="">— Choose agent —</option>
                  {swapEligible.map(a=>(
                    <option key={a.name} value={a.name}>{a.name} ({a.platform})</option>
                  ))}
                </select>
                <label className="lbl">NOTE (OPTIONAL)</label>
                <textarea className="inp" style={{minHeight:80,marginBottom:18}} placeholder="Reason for swap request..."
                  value={swapNote} onChange={e=>setSwapNote(e.target.value)}/>
                <button className="btn bt bw" onClick={doSwapRequest}>SEND REQUEST</button>
              </>
            )}
            <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setSwapModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: SHIFT MEMO (AGENT) ══ */}
      {memoModal&&(
        <div className="overlay" onClick={()=>setMemoModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Shift Memo</div>
            <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',letterSpacing:2,marginBottom:20}}>END-OF-SHIFT NOTES FOR MANAGER</div>
            <label className="lbl">YOUR NOTES</label>
            <textarea className="inp" style={{minHeight:120,marginBottom:18}}
              placeholder="What happened during your shift? Any handover notes, issues, or updates..."
              value={memoText} onChange={e=>setMemoText(e.target.value)}/>
            <button className="btn bt bw" onClick={doMemo}>SUBMIT MEMO</button>
            <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setMemoModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: ESCALATION (AGENT) ══ */}
      {escalModal&&(
        <div className="overlay" onClick={()=>setEscalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Raise Escalation</div>
            <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',letterSpacing:2,marginBottom:20}}>NOTIFY MANAGEMENT</div>
            <label className="lbl">ISSUE TITLE</label>
            <input className="inp gap" placeholder="Brief summary of the issue"
              value={escalTitle} onChange={e=>setEscalTitle(e.target.value)}/>
            <label className="lbl">DETAILS</label>
            <textarea className="inp" style={{minHeight:90,marginBottom:14}} placeholder="Describe the issue in detail..."
              value={escalDetail} onChange={e=>setEscalDetail(e.target.value)}/>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,cursor:'pointer',padding:'10px 14px',
              borderRadius:12,background:escalUrgent?'rgba(244,63,94,.1)':'rgba(255,255,255,.04)',
              border:`1px solid ${escalUrgent?'rgba(244,63,94,.3)':'rgba(255,255,255,.08)'}`,transition:'all .2s'}}
              onClick={()=>setEscalUrgent(v=>!v)}>
              <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${escalUrgent?'var(--red)':'rgba(255,255,255,.2)'}`,
                background:escalUrgent?'var(--red)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {escalUrgent&&<span style={{fontSize:12,color:'#fff'}}>✓</span>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:escalUrgent?'var(--red)':'var(--text)'}}>🚨 Mark as Urgent</div>
                <div style={{fontSize:11,color:'var(--sub)',marginTop:1}}>Sends immediate alert to managers</div>
              </div>
            </div>
            <button className={`btn bw ${escalUrgent?'br':'bt'}`} onClick={doEscalate}>
              {escalUrgent?'🚨 SEND URGENT ESCALATION':'SUBMIT ESCALATION'}
            </button>
            <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setEscalModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ══ MODAL: ANNOUNCE (MGR) ══ */}
      {annModal&&(
        <div className="overlay" onClick={()=>setAnnModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Broadcast Announcement</div>
            <div style={{fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)',letterSpacing:2,marginBottom:20}}>SENT TO ALL AGENTS</div>
            <label className="lbl">MESSAGE</label>
            <textarea className="inp" style={{minHeight:100,marginBottom:14}}
              placeholder="Type your announcement..."
              value={annText} onChange={e=>setAnnText(e.target.value)}/>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,cursor:'pointer',padding:'10px 14px',
              borderRadius:12,background:annUrgent?'rgba(244,63,94,.1)':'rgba(255,255,255,.04)',
              border:`1px solid ${annUrgent?'rgba(244,63,94,.3)':'rgba(255,255,255,.08)'}`,transition:'all .2s'}}
              onClick={()=>setAnnUrgent(v=>!v)}>
              <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${annUrgent?'var(--red)':'rgba(255,255,255,.2)'}`,
                background:annUrgent?'var(--red)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {annUrgent&&<span style={{fontSize:12,color:'#fff'}}>✓</span>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:annUrgent?'var(--red)':'var(--text)'}}>🚨 Mark as Urgent</div>
                <div style={{fontSize:11,color:'var(--sub)',marginTop:1}}>Highlighted at top of agent view</div>
              </div>
            </div>
            <button className={`btn bw ${annUrgent?'br':'bp'}`} onClick={doAnnounce}>
              {annUrgent?'🚨 SEND URGENT':'📢 BROADCAST'}
            </button>
            <button className="btn bg bw" style={{marginTop:10}} onClick={()=>setAnnModal(false)}>CANCEL</button>
          </div>
        </div>
      )}
    </>
  );
}