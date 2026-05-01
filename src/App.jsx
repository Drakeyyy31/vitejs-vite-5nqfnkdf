import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ── CONFIG ──
const SHEETS_WEBHOOK = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MANAGER_KEY    = "AFTERSALES-BOSS-2026";
const BREAK_MAX      = 3600000;   // 1 hr
const SHIFT_GOAL     = 28800000;  // 8 hrs

const PAY = (n) => {
  if (['Egar','Drakeyyy'].includes(n)) return 600;
  if (['Lasgna','Sinclair'].includes(n)) return 400;
  if (['Eli','Mary','Robert','Porsha','Gio','Giah','Art','Jon','Koko','Hawuki','John','Eunice'].includes(n)) return 360;
  return 260;
};

const DEPT_HUE = { META:210, KANAL:42, Helpwave:24, Chargeback:355, DMCA:220, MANAGER:270 };
const deptColor  = (d) => `hsl(${DEPT_HUE[d]??210},90%,60%)`;
const deptGlow   = (d) => `hsl(${DEPT_HUE[d]??210},90%,60%,0.25)`;

const STATUS = {
  ACTIVE:  { label:'ON SHIFT',    color:'#22d3a5', pulse:true  },
  BREAK:   { label:'ON BREAK',    color:'#f59e0b', pulse:true  },
  OUT:     { label:'CLOCKED OUT', color:'#64748b', pulse:false },
  PENDING: { label:'NOT IN',      color:'#334155', pulse:false },
};
const ACT_COLOR = { clockIn:'#22d3a5', clockOut:'#f43f5e', breakStart:'#f59e0b', breakEnd:'#38bdf8' };
const ACT_ICON  = { clockIn:'▶', clockOut:'■', breakStart:'⏸', breakEnd:'▶' };
const ACT_LABEL = { clockIn:'Clock In', clockOut:'Clock Out', breakStart:'Break Start', breakEnd:'Resume' };

const pad  = (n) => String(n).padStart(2,'0');
const fmt  = (ms) => { if(!ms||ms<0)return'00:00:00'; return `${pad(~~(ms/3600000))}:${pad(~~(ms%3600000/60000))}:${pad(~~(ms%60000/1000))}`; };
const fmtS = (ms) => { if(!ms||ms<0)return'0m'; const h=~~(ms/3600000),m=~~(ms%3600000/60000); return h?`${h}h ${m}m`:`${m}m`; };

const deriveStatus = (logs, name, rec) => {
  if(rec.onBreak) return STATUS.BREAK;
  if(rec.clockIn && !rec.clockedOut) return STATUS.ACTIVE;
  const d=new Date(); d.setHours(0,0,0,0);
  const last=[...logs.filter(l=>l.agent===name&&l.timestamp>=d.getTime())].sort((a,b)=>a.timestamp-b.timestamp).pop();
  if(!last)return STATUS.PENDING;
  return {clockIn:STATUS.ACTIVE,breakStart:STATUS.BREAK,clockOut:STATUS.OUT}[last.action]??STATUS.PENDING;
};

// SVG Ring component
const Ring = ({ pct, size=72, stroke=5, color='#22d3a5', bg='rgba(255,255,255,0.05)', children }) => {
  const r = (size-stroke*2)/2, c=size/2, circ=2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={bg} strokeWidth={stroke}/>
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ*(1-Math.min(pct/100,1))}
        strokeLinecap="round" style={{transition:'stroke-dashoffset 1s ease'}}/>
      <foreignObject x={0} y={0} width={size} height={size} style={{transform:'rotate(90deg)',transformOrigin:`${c}px ${c}px`}}>
        <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {children}
        </div>
      </foreignObject>
    </svg>
  );
};

// Glassmorphism card
const Glass = ({ children, style={}, className='', glow='' }) => (
  <div className={`glass ${className}`} style={{
    background:'rgba(255,255,255,0.04)',
    backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)',
    border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:20, padding:24,
    boxShadow: glow ? `0 0 40px ${glow}, 0 8px 32px rgba(0,0,0,0.4)` : '0 8px 32px rgba(0,0,0,0.4)',
    ...style
  }}>{children}</div>
);

export default function App() {
  const [view,     setView]    = useState('landing');
  const [tab,      setTab]     = useState('attendance');
  const [agents,   setAgents]  = useState([]);
  const [logs,     setLogs]    = useState([]);
  const [recs,     setRecs]    = useState({});
  const [user,     setUser]    = useState(null);
  const [err,      setErr]     = useState('');
  const [ok,       setOk]      = useState('');
  const [busy,     setBusy]    = useState(false);
  const [now,      setNow]     = useState(Date.now());
  const [modal,    setModal]   = useState(null); // agent detail
  const [toast,    setToast]   = useState('');

  const [reg,  setReg]  = useState({name:'',pin:'',platform:'META'});
  const [mkey, setMkey] = useState('');
  const [log,  setLog]  = useState({name:'',pin:''});
  const [sal,  setSal]  = useState('');
  const [rng,  setRng]  = useState('today');
  const [cs,   setCs]   = useState(new Date().toISOString().split('T')[0]);
  const [ce,   setCe]   = useState(new Date().toISOString().split('T')[0]);

  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t); },[]);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''),3000); };

  const fetch_ = useCallback(async()=>{
    setBusy(true);
    try {
      const d = await fetch(SHEETS_WEBHOOK).then(r=>r.json());
      const urows = d.filter(i=>i.action==='USER_REGISTER'||i.action==='USER_APPROVE');
      const lrows = d.filter(i=>!i.action?.startsWith('USER_'))
        .map(l=>({...l,timestamp:Number(l.timestamp)||new Date(`${l.date} ${l.time}`).getTime()}))
        .sort((a,b)=>b.timestamp-a.timestamp);
      const map={};
      urows.forEach(u=>{ try{ const x=JSON.parse(u.device); map[u.agent.toLowerCase()]={...x,name:u.agent,status:u.action==='USER_APPROVE'?'active':'pending'}; }catch(_){} });
      setAgents(Object.values(map)); setLogs(lrows);
    } catch(e){ console.error(e); }
    setBusy(false);
  },[]);

  useEffect(()=>{ fetch_(); },[view,fetch_]);

  const audit = async()=>{ try{ const d=await fetch('https://ipapi.co/json/').then(r=>r.json()); return `${d.city},${d.country_code}|IP:${d.ip}|${navigator.platform}`; }catch(_){ return navigator.platform; } };

  const doRegister = async()=>{
    setErr('');
    if(!reg.name.trim()||reg.pin.length<4)return setErr('Min 4-char password.');
    const mgr=reg.platform==='MANAGER';
    if(mgr&&mkey!==MANAGER_KEY)return setErr('Invalid Manager Key.');
    setBusy(true);
    const loc=await audit();
    const data={...reg,role:mgr?'Manager':'Agent',salary:mgr?PAY(reg.name):0};
    await fetch(SHEETS_WEBHOOK,{method:'POST',mode:'no-cors',body:JSON.stringify({
      date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString(),
      action:mgr?'USER_APPROVE':'USER_REGISTER',agent:reg.name.trim(),
      device:JSON.stringify({...data,loc}),timestamp:Date.now()
    })});
    setOk(mgr?'Manager activated!':'Sent — awaiting approval.');
    if(mgr){setUser({...data,status:'active'});setView('mgr');}
    else setTimeout(()=>setView('landing'),2500);
    setBusy(false);
  };

  const doLogin=()=>{
    setErr('');
    const found=agents.find(a=>a.name.toLowerCase()===log.name.toLowerCase().trim()&&a.pin===log.pin);
    if(!found)return setErr('Credentials not found.');
    if(found.status==='pending')return setErr('Account awaiting approval.');
    setUser(found); setView(found.role==='Manager'?'mgr':'agent');
  };

  const doAction=async(type)=>{
    setBusy(true);
    const ts=Date.now(), proof=await audit(), rec=recs[user.name]||{};
    let nx={...rec};
    if(type==='clockIn')   nx={clockIn:ts,breakUsedMs:0};
    if(type==='breakStart'){nx.onBreak=true;nx.breakStart=ts;}
    if(type==='breakEnd')  {nx.onBreak=false;nx.breakUsedMs=(nx.breakUsedMs||0)+(ts-nx.breakStart);}
    if(type==='clockOut')  nx={clockedOut:true};
    setRecs(p=>({...p,[user.name]:nx}));
    await fetch(SHEETS_WEBHOOK,{method:'POST',mode:'no-cors',body:JSON.stringify({
      date:new Date(ts).toLocaleDateString(),time:new Date(ts).toLocaleTimeString(),
      action:type,agent:user.name,device:proof,timestamp:ts
    })});
    showToast(ACT_LABEL[type]);
    await fetch_(); setBusy(false);
  };

  const logout=()=>{setUser(null);setRecs({});setView('landing');};

  // ── SESSION CALCS ──
  const rec  = user?(recs[user.name]||{}):{};
  const bMs  = (rec.breakUsedMs||0)+(rec.onBreak?(now-rec.breakStart):0);
  const shMs = rec.clockIn?(now-rec.clockIn):0;
  const net  = Math.max(0,shMs-bMs);
  const bOvr = bMs>BREAK_MAX;
  const st   = rec.onBreak?STATUS.BREAK:(rec.clockIn&&!rec.clockedOut)?STATUS.ACTIVE:STATUS.PENDING;

  const todayStart = useMemo(()=>{ const d=new Date();d.setHours(0,0,0,0);return d.getTime(); },[]);

  const timeline = (name) =>
    logs.filter(l=>l.agent===name&&l.timestamp>=todayStart).sort((a,b)=>a.timestamp-b.timestamp);

  const filtLogs = useMemo(()=>{
    let s,e; const td=new Date();td.setHours(0,0,0,0);
    if(rng==='today'){s=td.getTime();e=s+86400000;}
    else if(rng==='yesterday'){s=td.getTime()-86400000;e=td.getTime();}
    else{s=new Date(cs).getTime();e=new Date(ce).getTime()+86400000;}
    return logs.filter(l=>l.timestamp>=s&&l.timestamp<=e);
  },[logs,rng,cs,ce]);

  const attend = useMemo(()=>
    agents.filter(a=>a.status==='active').map(agent=>{
      const tl=logs.filter(l=>l.agent===agent.name&&l.timestamp>=todayStart).sort((a,b)=>a.timestamp-b.timestamp);
      let ci=null,co=null,tb=0,bs=null;
      tl.forEach(l=>{
        if(l.action==='clockIn'&&!ci)ci=l.timestamp;
        if(l.action==='breakStart')bs=l.timestamp;
        if(l.action==='breakEnd'&&bs){tb+=l.timestamp-bs;bs=null;}
        if(l.action==='clockOut')co=l.timestamp;
      });
      const r=recs[agent.name]||{}, ab=r.onBreak?(now-(r.breakStart||now)):0;
      const totB=tb+(r.breakUsedMs||0)+ab, sMs=ci?((co||now)-ci):0, nMs=Math.max(0,sMs-totB);
      return{...agent,ci,co,totB,sMs,nMs,tl,status:deriveStatus(logs,agent.name,r),
        bOvr:totB>BREAK_MAX, sPct:Math.min(nMs/SHIFT_GOAL*100,100), bPct:Math.min(totB/BREAK_MAX*100,100)};
    })
  ,[agents,logs,recs,now,todayStart]);

  const exportCSV=()=>{
    const rows=[['Agent','Dept','Clock In','Clock Out','Break','Net Work','Shift%','Status']];
    attend.forEach(a=>rows.push([a.name,a.platform,
      a.ci?new Date(a.ci).toLocaleTimeString():'-',
      a.co?new Date(a.co).toLocaleTimeString():'-',
      fmtS(a.totB),fmtS(a.nMs),`${a.sPct.toFixed(0)}%`,a.status.label]));
    const b=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(b);
    a.download=`attendance_${new Date().toISOString().split('T')[0]}.csv`;a.click();
  };

  // ── DATE LABEL ──
  const dayLabel = new Date(now).toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const timeLabel = new Date(now).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

        :root {
          --bg0:#03050f; --bg1:#070c1a; --bg2:#0c1228;
          --teal:#22d3a5; --blue:#38bdf8; --amber:#f59e0b; --red:#f43f5e;
          --text:#e2e8f0; --sub:#64748b; --dim:#1e2d45;
          --font:'Sora',sans-serif; --mono:'JetBrains Mono',monospace;
          --safe-b:env(safe-area-inset-bottom,0px);
          --safe-l:env(safe-area-inset-left,0px);
          --safe-r:env(safe-area-inset-right,0px);
        }
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        html{background:var(--bg0);-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;}
        body{background:var(--bg0);color:var(--text);font-family:var(--font);-webkit-overflow-scrolling:touch;overflow-x:hidden;min-height:100vh;min-height:100dvh;}

        /* ── CANVAS ── */
        #orbs{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;}
        .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.18;}
        .orb1{width:600px;height:600px;background:radial-gradient(circle,hsl(190,90%,45%),transparent 70%);top:-200px;left:-150px;animation:drift1 18s ease-in-out infinite;}
        .orb2{width:500px;height:500px;background:radial-gradient(circle,hsl(265,80%,55%),transparent 70%);bottom:-150px;right:-100px;animation:drift2 22s ease-in-out infinite;}
        .orb3{width:400px;height:400px;background:radial-gradient(circle,hsl(150,80%,40%),transparent 70%);top:40%;left:50%;animation:drift3 16s ease-in-out infinite;}
        @keyframes drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,80px)}}
        @keyframes drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(-80px,-60px)}}
        @keyframes drift3{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(calc(-50% + 40px),calc(-50% + 60px))}}

        /* ── SHELL ── */
        #shell{position:relative;z-index:1;width:100%;max-width:1440px;margin:0 auto;
          min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;
          padding:0 calc(20px + var(--safe-r)) calc(40px + var(--safe-b)) calc(20px + var(--safe-l));}

        /* ── TOPBAR ── */
        #topbar{display:flex;justify-content:space-between;align-items:center;
          padding:20px 0 16px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:32px;flex-wrap:wrap;gap:12px;}
        .logo-text{font-family:var(--font);font-size:clamp(18px,4vw,28px);font-weight:800;letter-spacing:-0.5px;
          background:linear-gradient(135deg,var(--teal),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .logo-sub{font-size:10px;letter-spacing:3px;color:var(--sub);margin-top:2px;font-family:var(--mono);}
        #clock{text-align:right;}
        .clock-time{font-family:var(--mono);font-size:clamp(16px,3.5vw,24px);font-weight:700;color:var(--text);letter-spacing:2px;}
        .clock-date{font-size:11px;color:var(--sub);margin-top:3px;}

        /* ── LOADER ── */
        #loader{position:fixed;top:0;left:0;width:100%;height:2px;z-index:9999;
          background:linear-gradient(90deg,transparent,var(--teal),var(--blue),transparent);
          animation:slide 1.4s linear infinite;}
        @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

        /* ── TOAST ── */
        #toast{position:fixed;bottom:calc(24px + var(--safe-b));left:50%;transform:translateX(-50%) translateY(0);
          background:rgba(34,211,165,0.15);border:1px solid rgba(34,211,165,0.4);
          color:var(--teal);padding:10px 24px;border-radius:40px;font-size:13px;font-weight:600;
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          white-space:nowrap;z-index:500;letter-spacing:1px;font-family:var(--mono);
          transition:opacity .3s,transform .3s;}
        #toast.hide{opacity:0;transform:translateX(-50%) translateY(12px);}

        /* ── GLASS ── */
        .glass{background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:24px;
          box-shadow:0 8px 40px rgba(0,0,0,0.5);}

        /* ── INPUTS ── */
        .inp{background:rgba(0,0,0,0.35);color:var(--text);border:1px solid rgba(255,255,255,0.1);
          border-radius:12px;padding:14px 16px;width:100%;font-family:var(--font);font-size:16px;
          outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s;}
        .inp:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(34,211,165,0.15);}
        .inp[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.5;}
        select.inp{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
        .lbl{font-size:11px;letter-spacing:2px;color:var(--sub);margin-bottom:7px;display:block;font-family:var(--mono);}
        .gap{margin-bottom:16px;}

        /* ── BUTTONS ── */
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
          min-height:48px;padding:12px 22px;border-radius:12px;border:none;
          font-family:var(--font);font-size:13px;font-weight:700;letter-spacing:.5px;
          cursor:pointer;text-transform:uppercase;-webkit-appearance:none;appearance:none;
          transition:transform .13s,opacity .13s,box-shadow .2s;
          touch-action:manipulation;user-select:none;-webkit-user-select:none;}
        .btn:active{transform:scale(.95);opacity:.85;}
        .btn:disabled{opacity:.3;pointer-events:none;}
        .btn-teal{background:linear-gradient(135deg,var(--teal),hsl(175,65%,45%));color:#000;box-shadow:0 4px 20px rgba(34,211,165,0.3);}
        .btn-blue{background:linear-gradient(135deg,var(--blue),hsl(200,85%,55%));color:#000;box-shadow:0 4px 20px rgba(56,189,248,0.3);}
        .btn-red {background:linear-gradient(135deg,var(--red),hsl(345,85%,55%));color:#fff;box-shadow:0 4px 20px rgba(244,63,94,0.3);}
        .btn-amber{background:linear-gradient(135deg,var(--amber),hsl(35,90%,55%));color:#000;box-shadow:0 4px 20px rgba(245,158,11,0.3);}
        .btn-ghost{background:rgba(255,255,255,0.05);color:var(--sub);border:1px solid rgba(255,255,255,0.08);}
        .btn-ghost:active{background:rgba(255,255,255,0.1);}
        .btn-full{width:100%;}
        .btn-tab{background:transparent;color:var(--sub);border:none;border-bottom:2px solid transparent;
          border-radius:0;padding:11px 16px;font-size:11px;font-family:var(--mono);letter-spacing:2px;
          min-height:44px;white-space:nowrap;cursor:pointer;touch-action:manipulation;
          transition:color .2s,border-color .2s;}
        .btn-tab.on{color:var(--teal);border-bottom-color:var(--teal);}

        /* ── BADGE ── */
        .badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;
          font-size:10px;font-weight:700;letter-spacing:2px;white-space:nowrap;font-family:var(--mono);}
        .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        .blink{animation:blink 2s infinite;}

        /* ── ALERTS ── */
        .alert{padding:11px 16px;border-radius:12px;font-size:13px;display:flex;align-items:center;gap:9px;}
        .a-ok {background:rgba(34,211,165,.1);border:1px solid rgba(34,211,165,.3);color:var(--teal);}
        .a-err{background:rgba(244,63,94,.1) ;border:1px solid rgba(244,63,94,.3) ;color:var(--red);}
        .a-wrn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:var(--amber);}

        /* ── PROGRESS ── */
        .pbar{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;}
        .pfill{height:100%;border-radius:2px;transition:width 1s ease;}

        /* ── GRIDS ── */
        .g2{display:grid;grid-template-columns:1fr;gap:20px;width:100%;}
        @media(min-width:768px){.g2{grid-template-columns:1fr 1fr;}}
        .g4{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;}
        @media(min-width:600px){.g4{grid-template-columns:repeat(4,1fr);}}
        .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}

        /* ── STAT CARD ── */
        .stat-card{padding:20px;border-radius:16px;position:relative;overflow:hidden;}
        .stat-val{font-family:var(--mono);font-size:clamp(24px,5vw,38px);font-weight:700;line-height:1;}
        .stat-lbl{font-size:10px;letter-spacing:2px;color:var(--sub);margin-top:6px;font-family:var(--mono);}

        /* ── AGENT ROW ── */
        .arow{display:flex;align-items:center;gap:12px;padding:13px 10px;border-radius:12px;cursor:pointer;
          transition:background .15s;border-bottom:1px solid rgba(255,255,255,0.04);}
        .arow:last-child{border-bottom:none;}
        .arow:active{background:rgba(34,211,165,0.05);}
        @media(hover:hover){.arow:hover{background:rgba(34,211,165,0.05);}}
        .av{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:15px;flex-shrink:0;font-family:var(--mono);}
        .ainfo{flex:1;min-width:0;}
        .aname{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .adept{font-size:10px;color:var(--sub);letter-spacing:1px;margin-top:2px;font-family:var(--mono);}
        .ameta{text-align:right;font-size:10px;color:var(--sub);flex-shrink:0;}

        /* ── TIMELINE ── */
        .tl{position:relative;padding-left:22px;}
        .tl::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.08);}
        .tl-row{position:relative;padding:8px 0;}
        .tl-dot{position:absolute;left:-19px;top:12px;width:8px;height:8px;border-radius:50%;border:2px solid var(--bg0);}
        .tl-t{font-size:10px;color:var(--sub);font-family:var(--mono);}
        .tl-a{font-size:13px;font-weight:600;margin-top:2px;}

        /* ── TABS ── */
        .tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:24px;width:100%;
          overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:0;}
        .tabs::-webkit-scrollbar{display:none;}

        /* ── CENTER ── */
        .center{display:flex;flex-direction:column;align-items:center;justify-content:center;
          flex:1;width:100%;max-width:440px;gap:14px;padding:28px 0;margin:0 auto;}

        /* ── BIG TIMER ── */
        .bigtimer{font-family:var(--mono);font-size:clamp(42px,11vw,80px);font-weight:700;
          letter-spacing:3px;line-height:1;text-align:center;}

        /* ── MODAL ── */
        .overlay{position:fixed;inset:0;background:rgba(3,5,15,0.85);
          -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
          z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;}
        @media(min-width:600px){.overlay{align-items:center;padding:20px;}}
        .modal{background:rgba(10,16,36,0.97);border:1px solid rgba(34,211,165,0.2);
          border-radius:24px 24px 0 0;padding:24px 20px calc(20px + var(--safe-b));
          width:100%;max-height:92vh;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;}
        @media(min-width:600px){.modal{border-radius:24px;max-width:520px;max-height:88vh;padding:28px;}}
        .drag{width:36px;height:4px;background:rgba(255,255,255,0.12);border-radius:2px;margin:0 auto 20px;}

        /* ── TABLE ── */
        .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px;}
        .tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:540px;font-family:var(--mono);}
        .tbl th{text-align:left;padding:11px 14px;font-size:10px;letter-spacing:2px;
          color:var(--sub);border-bottom:1px solid rgba(255,255,255,0.07);
          background:rgba(0,0,0,0.3);white-space:nowrap;}
        .tbl td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle;}

        /* ── SCROLLBAR ── */
        @media(pointer:fine){
          ::-webkit-scrollbar{width:4px;height:4px;}
          ::-webkit-scrollbar-track{background:transparent;}
          ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
        }

        /* ── ACTION GRID ── */
        .actg{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        .actg .span2{grid-column:1/-1;}

        /* ── LANDING HERO ── */
        .hero-title{font-size:clamp(32px,8vw,64px);font-weight:800;line-height:1.05;
          background:linear-gradient(135deg,#fff 0%,var(--teal) 50%,var(--blue) 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          letter-spacing:-2px;margin-bottom:8px;}
        .hero-sub{font-size:clamp(12px,2.5vw,15px);color:var(--sub);letter-spacing:3px;font-family:var(--mono);}

        /* ── ENTRY ANIMATION ── */
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .5s ease forwards;}
        .fade-up-2{animation:fadeUp .5s .1s ease both;}
        .fade-up-3{animation:fadeUp .5s .2s ease both;}
        .fade-up-4{animation:fadeUp .5s .3s ease both;}

        /* ── SEPARATOR ── */
        .sep{height:1px;background:rgba(255,255,255,0.06);margin:20px 0;}

        /* ── MINI RING LABEL ── */
        .ring-lbl{font-family:var(--mono);font-size:clamp(10px,2.5vw,13px);font-weight:700;}
      `}</style>

      {/* AMBIENT ORBS */}
      <div id="orbs"><div className="orb orb1"/><div className="orb orb2"/><div className="orb orb3"/></div>

      {/* LOADING */}
      {busy && <div id="loader"/>}

      {/* TOAST */}
      <div id="toast" className={toast?'':'hide'}>{toast}</div>

      <div id="shell">
        {/* TOP BAR */}
        <div id="topbar">
          <div>
            <div className="logo-text">AFTERSALES</div>
            <div className="logo-sub">WORKFORCE ATTENDANCE SYSTEM</div>
          </div>
          <div id="clock">
            <div className="clock-time">{timeLabel}</div>
            <div className="clock-date">{dayLabel}</div>
          </div>
        </div>

        {/* ══ LANDING ══ */}
        {view==='landing' && (
          <div className="center">
            <div style={{textAlign:'center',marginBottom:12}}>
              <div className="hero-title fade-up">CLOCK IN.</div>
              <div className="hero-sub fade-up-2">v3.0 · LIVE TRACKING · MULTI-DEVICE</div>
            </div>
            <button className="btn btn-teal btn-full fade-up-3" onClick={()=>{setErr('');setView('login');}}>
              ▶ &nbsp;SIGN IN
            </button>
            <button className="btn btn-ghost btn-full fade-up-4" onClick={()=>{setErr('');setOk('');setView('register');}}>
              CREATE ACCOUNT
            </button>
          </div>
        )}

        {/* ══ REGISTER ══ */}
        {view==='register' && (
          <div className="center">
            <Glass style={{width:'100%'}}>
              <div style={{marginBottom:22}}>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Create Account</div>
                <div className="hero-sub" style={{fontSize:10,marginTop:4}}>ONBOARDING</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Display name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
                onChange={e=>setReg({...reg,name:e.target.value})}/>
              <label className="lbl">PASSWORD</label>
              <input className="inp gap" type="password" placeholder="Min 4 characters" autoComplete="new-password"
                onChange={e=>setReg({...reg,pin:e.target.value})}/>
              <label className="lbl">DEPARTMENT</label>
              <select className="inp" style={{marginBottom:reg.platform==='MANAGER'?16:22}}
                onChange={e=>setReg({...reg,platform:e.target.value})}>
                {Object.keys(DEPT_HUE).map(p=><option key={p} value={p}>{p}</option>)}
              </select>
              {reg.platform==='MANAGER'&&<>
                <label className="lbl" style={{marginTop:2}}>ACTIVATION KEY</label>
                <input className="inp" style={{marginBottom:22}} type="password" placeholder="Manager key"
                  onChange={e=>setMkey(e.target.value)}/>
              </>}
              {err&&<div className="alert a-err" style={{marginBottom:12}}>⚠ {err}</div>}
              {ok &&<div className="alert a-ok"  style={{marginBottom:12}}>✓ {ok}</div>}
              <button className="btn btn-teal btn-full" onClick={doRegister}>REGISTER</button>
              <button className="btn btn-ghost btn-full" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ LOGIN ══ */}
        {view==='login' && (
          <div className="center">
            <Glass style={{width:'100%'}}>
              <div style={{marginBottom:22}}>
                <div style={{fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Welcome back</div>
                <div className="hero-sub" style={{fontSize:10,marginTop:4}}>SECURE ACCESS</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Your name" autoCapitalize="off" autoCorrect="off" autoComplete="username"
                onChange={e=>setLog({...log,name:e.target.value})}/>
              <label className="lbl">PASSWORD</label>
              <input className="inp" style={{marginBottom:22}} type="password" placeholder="PIN / Password" autoComplete="current-password"
                onChange={e=>setLog({...log,pin:e.target.value})}/>
              {err&&<div className="alert a-err" style={{marginBottom:12}}>⚠ {err}</div>}
              <button className="btn btn-teal btn-full" onClick={doLogin}>ENTER WORKSPACE</button>
              <button className="btn btn-ghost btn-full" style={{marginTop:10}} onClick={()=>setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ AGENT PORTAL ══ */}
        {view==='agent' && user && (
          <div className="g2 fade-up" style={{paddingTop:8}}>

            {/* LEFT — Live Session */}
            <Glass glow={`${st.color}33`}>
              {/* Agent header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10,marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,letterSpacing:2,color:'var(--sub)',fontFamily:'var(--mono)'}}>ACTIVE SESSION</div>
                  <div style={{fontSize:22,fontWeight:800,marginTop:4,letterSpacing:-0.5}}>{user.name}</div>
                  <div style={{fontSize:11,fontWeight:600,marginTop:3,color:deptColor(user.platform),fontFamily:'var(--mono)',letterSpacing:1}}>◆ {user.platform}</div>
                </div>
                <div className="badge" style={{background:`${st.color}18`,color:st.color,border:`1px solid ${st.color}44`}}>
                  <div className={`dot${st.pulse?' blink':''}`} style={{background:st.color}}/>{st.label}
                </div>
              </div>

              {/* Big ring + timer */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20,padding:'8px 0 16px',flexWrap:'wrap'}}>
                <Ring pct={rec.clockIn?Math.min(net/SHIFT_GOAL*100,100):0} size={110} stroke={7}
                  color={rec.onBreak?'var(--amber)':'var(--teal)'} bg="rgba(255,255,255,0.05)">
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--sub)',letterSpacing:1,fontFamily:'var(--mono)',transform:'rotate(0deg)'}}>NET</div>
                    <div className="ring-lbl" style={{color:rec.onBreak?'var(--amber)':'var(--teal)'}}>
                      {rec.clockIn?`${~~(net/3600000)}h${pad(~~(net%3600000/60000))}m`:'—'}
                    </div>
                  </div>
                </Ring>
                <div style={{flex:1,minWidth:160}}>
                  <div className="bigtimer" style={{color:rec.onBreak?'var(--amber)':'var(--teal)',fontSize:'clamp(32px,7vw,56px)'}}>
                    {rec.onBreak?fmt(now-rec.breakStart):rec.clockIn?fmt(net):'--:--:--'}
                  </div>
                  <div style={{fontSize:11,color:'var(--sub)',marginTop:6,fontFamily:'var(--mono)'}}>
                    {rec.onBreak?'CURRENT BREAK':rec.clockIn?'NET WORK TIME':'NOT CLOCKED IN'}
                  </div>
                  {rec.clockIn&&<div style={{fontSize:11,color:'var(--sub)',marginTop:3,fontFamily:'var(--mono)'}}>
                    In since {new Date(rec.clockIn).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}
                  </div>}
                </div>
              </div>

              {/* Progress bars */}
              {rec.clockIn&&<>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:6}}>
                    <span>SHIFT PROGRESS</span>
                    <span style={{color:net>=SHIFT_GOAL?'var(--teal)':'var(--text)'}}>{fmt(net)} / 8h</span>
                  </div>
                  <div className="pbar"><div className="pfill" style={{width:`${Math.min(net/SHIFT_GOAL*100,100)}%`,background:net>=SHIFT_GOAL?'var(--teal)':'linear-gradient(90deg,var(--blue),var(--teal))'}}/></div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:bOvr?'var(--red)':'var(--sub)',marginBottom:6}}>
                    <span>BREAK USED</span>
                    <span style={{color:bOvr?'var(--red)':'var(--text)'}}>{fmt(bMs)} / 1h</span>
                  </div>
                  <div className="pbar"><div className="pfill" style={{width:`${Math.min(bMs/BREAK_MAX*100,100)}%`,background:bOvr?'var(--red)':'var(--amber)'}}/></div>
                </div>
              </>}

              {bOvr&&<div className="alert a-err" style={{marginBottom:12}}>⚠ Break exceeded by {fmtS(bMs-BREAK_MAX)}</div>}
              {net>=SHIFT_GOAL&&!rec.clockedOut&&<div className="alert a-ok" style={{marginBottom:12}}>✓ 8-hour target reached!</div>}

              {/* Action buttons */}
              <div className="actg">
                <button className="btn btn-teal" disabled={!(!rec.clockIn||rec.clockedOut)} onClick={()=>doAction('clockIn')}>▶ CLOCK IN</button>
                <button className="btn btn-red"  disabled={!(rec.clockIn&&!rec.onBreak&&!rec.clockedOut)} onClick={()=>doAction('clockOut')}>■ CLOCK OUT</button>
                <button className="btn btn-amber span2"
                  disabled={!(rec.clockIn&&!rec.clockedOut)}
                  onClick={()=>doAction(rec.onBreak?'breakEnd':'breakStart')}>
                  {rec.onBreak?'▶  RESUME WORK':'⏸  START BREAK'}
                </button>
              </div>

              {/* Mini stats */}
              {rec.clockIn&&<div className="g3" style={{marginTop:14}}>
                {[{l:'GROSS',v:fmt(shMs),c:'var(--text)'},{l:'BREAK',v:fmt(bMs),c:bOvr?'var(--red)':'var(--amber)'},{l:'NET',v:fmt(net),c:'var(--teal)'}].map(s=>(
                  <div key={s.l} style={{textAlign:'center',padding:'12px 8px',background:'rgba(0,0,0,0.3)',borderRadius:12,border:'1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:'clamp(11px,3vw,15px)',fontWeight:700,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:9,letterSpacing:1.5,color:'var(--sub)',marginTop:4,fontFamily:'var(--mono)'}}>{s.l}</div>
                  </div>
                ))}
              </div>}
            </Glass>

            {/* RIGHT — Timeline + logout */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <Glass style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <div style={{fontWeight:800,fontSize:15,letterSpacing:-0.3}}>Today's Timeline</div>
                  <div style={{fontSize:10,color:'var(--sub)',fontFamily:'var(--mono)'}}>
                    {new Date().toLocaleDateString('en-PH',{month:'short',day:'numeric'})}
                  </div>
                </div>
                {timeline(user.name).length===0
                  ?<div style={{textAlign:'center',color:'var(--sub)',padding:'32px 0',fontSize:13}}>
                    No activity yet.<br/>Clock in to start tracking.
                  </div>
                  :<div className="tl">
                    {timeline(user.name).map((l,i)=>(
                      <div className="tl-row" key={i}>
                        <div className="tl-dot" style={{background:ACT_COLOR[l.action]||'var(--sub)'}}/>
                        <div className="tl-t">{l.time}</div>
                        <div className="tl-a" style={{color:ACT_COLOR[l.action]||'var(--text)'}}>
                          {ACT_ICON[l.action]} {ACT_LABEL[l.action]||l.action}
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </Glass>
              <button className="btn btn-ghost btn-full" style={{color:'var(--red)',borderColor:'rgba(244,63,94,0.25)'}} onClick={logout}>
                LOGOUT
              </button>
            </div>
          </div>
        )}

        {/* ══ MANAGER PORTAL ══ */}
        {view==='mgr' && user && (
          <div style={{width:'100%'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22,flexWrap:'wrap',gap:10}}>
              <div>
                <div style={{fontSize:11,letterSpacing:2,color:'var(--sub)',fontFamily:'var(--mono)'}}>MANAGER</div>
                <div style={{fontSize:20,fontWeight:800,letterSpacing:-0.5,marginTop:3}}>{user.name}</div>
              </div>
              <button className="btn btn-ghost" style={{color:'var(--red)'}} onClick={logout}>LOGOUT</button>
            </div>

            <div className="tabs">
              {['attendance','dashboard','logs','onboarding'].map(t=>(
                <button key={t} className={`btn-tab${tab===t?' on':''}`} onClick={()=>setTab(t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            {/* ── ATTENDANCE ── */}
            {tab==='attendance'&&(
              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                {/* 4 stats */}
                <div className="g4">
                  {(()=>{
                    const on=attend.filter(a=>a.status===STATUS.ACTIVE).length;
                    const br=attend.filter(a=>a.status===STATUS.BREAK).length;
                    const ni=attend.filter(a=>a.status===STATUS.OUT||a.status===STATUS.PENDING).length;
                    const ov=attend.filter(a=>a.bOvr).length;
                    return[
                      {l:'ON SHIFT',v:on,c:'var(--teal)',g:'rgba(34,211,165,0.12)'},
                      {l:'ON BREAK',v:br,c:'var(--amber)',g:'rgba(245,158,11,0.12)'},
                      {l:'NOT IN',  v:ni,c:'var(--sub)',  g:'rgba(100,116,139,0.08)'},
                      {l:'VIOLATIONS',v:ov,c:'var(--red)',g:'rgba(244,63,94,0.12)'},
                    ].map(s=>(
                      <div key={s.l} className="stat-card" style={{background:s.g,border:`1px solid ${s.c}28`}}>
                        <div className="stat-val" style={{color:s.c}}>{s.v}</div>
                        <div className="stat-lbl">{s.l}</div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Export */}
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <button className="btn btn-ghost" style={{fontSize:11}} onClick={exportCSV}>↓ EXPORT CSV</button>
                </div>

                {/* Agent list with rings */}
                <Glass style={{padding:'8px 8px'}}>
                  {attend.length===0
                    ?<div style={{textAlign:'center',color:'var(--sub)',padding:32}}>No active agents.</div>
                    :attend.map(a=>(
                      <div key={a.name} className="arow" onClick={()=>setModal(a)}>
                        {/* Shift ring */}
                        <Ring pct={a.sPct} size={52} stroke={4} color={a.status.color} bg="rgba(255,255,255,0.05)">
                          <div style={{fontSize:10,fontWeight:700,fontFamily:'var(--mono)',color:a.status.color}}>
                            {a.sPct.toFixed(0)}%
                          </div>
                        </Ring>
                        <div className="ainfo">
                          <div className="aname">{a.name}</div>
                          <div className="adept" style={{color:deptColor(a.platform)}}>◆ {a.platform}</div>
                          {a.ci&&<div style={{marginTop:5}}>
                            <div style={{display:'flex',gap:4,fontSize:10,color:'var(--sub)',fontFamily:'var(--mono)'}}>
                              <span>IN {new Date(a.ci).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</span>
                              {a.co&&<span>· OUT {new Date(a.co).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</span>}
                            </div>
                          </div>}
                        </div>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0}}>
                          <div className="badge" style={{background:`${a.status.color}18`,color:a.status.color,border:`1px solid ${a.status.color}40`}}>
                            <div className={`dot${a.status.pulse?' blink':''}`} style={{background:a.status.color}}/>{a.status.label}
                          </div>
                          {a.ci&&<div className="ameta">
                            <div style={{color:a.bOvr?'var(--red)':'var(--sub)'}}>BRK {fmtS(a.totB)}{a.bOvr?' ⚠':''}</div>
                            <div style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:700,color:'var(--teal)',marginTop:2}}>{fmt(a.nMs)}</div>
                          </div>}
                        </div>
                      </div>
                    ))
                  }
                </Glass>
              </div>
            )}

            {/* ── DASHBOARD ── */}
            {tab==='dashboard'&&(
              <div style={{display:'flex',flexDirection:'column',gap:20}}>
                <div className="g4">
                  {[
                    {l:'DAILY LABOR',v:`$${(agents.reduce((s,a)=>s+(a.salary||0),0)/30).toFixed(0)}`,c:'var(--teal)',g:'rgba(34,211,165,0.1)'},
                    {l:'ACTIVE AGENTS',v:agents.filter(a=>a.status==='active').length,c:'var(--blue)',g:'rgba(56,189,248,0.1)'},
                    {l:'PENDING',v:agents.filter(a=>a.status==='pending').length,c:'var(--amber)',g:'rgba(245,158,11,0.1)'},
                    {l:'DEPARTMENTS',v:[...new Set(agents.filter(a=>a.status==='active').map(a=>a.platform))].length,c:'#c084fc',g:'rgba(192,132,252,0.1)'},
                  ].map(s=>(
                    <div key={s.l} className="stat-card" style={{background:s.g,border:`1px solid ${s.c}28`}}>
                      <div className="stat-val" style={{color:s.c}}>{s.v}</div>
                      <div className="stat-lbl">{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Dept breakdown */}
                <Glass>
                  <div style={{fontWeight:800,fontSize:15,marginBottom:16,letterSpacing:-0.3}}>Department Breakdown</div>
                  {Object.keys(DEPT_HUE).filter(d=>agents.some(a=>a.platform===d&&a.status==='active')).map(dept=>{
                    const count=agents.filter(a=>a.platform===dept&&a.status==='active').length;
                    const total=agents.filter(a=>a.status==='active').length||1;
                    return(
                      <div key={dept} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:5}}>
                          <span style={{color:deptColor(dept),fontWeight:700}}>◆ {dept}</span>
                          <span style={{color:'var(--text)'}}>{count} agent{count!==1?'s':''}</span>
                        </div>
                        <div className="pbar" style={{height:5}}>
                          <div className="pfill" style={{width:`${(count/total)*100}%`,background:`linear-gradient(90deg,${deptColor(dept)},${deptColor(dept)}88)`}}/>
                        </div>
                      </div>
                    );
                  })}
                </Glass>

                {/* Directory */}
                <Glass>
                  <div style={{fontWeight:800,fontSize:15,marginBottom:16,letterSpacing:-0.3}}>Agent Directory</div>
                  {agents.filter(a=>a.status==='active').map(a=>(
                    <div key={a.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid rgba(255,255,255,0.05)',gap:10,flexWrap:'wrap'}}>
                      <div style={{display:'flex',gap:10,alignItems:'center'}}>
                        <div className="av" style={{background:`${deptColor(a.platform)}18`,color:deptColor(a.platform)}}>{a.name[0]}</div>
                        <div>
                          <div style={{fontWeight:700,fontSize:13}}>{a.name}</div>
                          <div style={{fontSize:10,color:'var(--sub)',marginTop:2,fontFamily:'var(--mono)'}}>{a.loc||'—'}</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{color:deptColor(a.platform),fontSize:11,fontWeight:700,fontFamily:'var(--mono)',letterSpacing:1}}>{a.platform}</div>
                        {a.salary>0&&<div style={{fontSize:10,color:'var(--sub)',marginTop:2,fontFamily:'var(--mono)'}}>${a.salary}/mo</div>}
                      </div>
                    </div>
                  ))}
                </Glass>
              </div>
            )}

            {/* ── LOGS ── */}
            {tab==='logs'&&(
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  {['today','yesterday','custom'].map(r=>(
                    <button key={r} className={`btn ${rng===r?'btn-teal':'btn-ghost'}`} style={{fontSize:11,minHeight:40,padding:'8px 16px'}} onClick={()=>setRng(r)}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                  {rng==='custom'&&(
                    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                      <input className="inp" type="date" value={cs} onChange={e=>setCs(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                      <span style={{color:'var(--sub)'}}>→</span>
                      <input className="inp" type="date" value={ce} onChange={e=>setCe(e.target.value)} style={{width:'auto',padding:'10px 12px',fontSize:14}}/>
                    </div>
                  )}
                  <div style={{marginLeft:'auto',fontSize:11,color:'var(--sub)',fontFamily:'var(--mono)'}}>{filtLogs.length} entries</div>
                </div>
                <Glass style={{padding:0}} className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>DATE</th><th>TIME</th><th>AGENT</th><th>ACTION</th><th>AUDIT</th></tr></thead>
                    <tbody>
                      {filtLogs.map((l,i)=>(
                        <tr key={i}>
                          <td style={{color:'var(--sub)',fontSize:11}}>{l.date}</td>
                          <td style={{color:ACT_COLOR[l.action]||'var(--teal)',fontWeight:700,whiteSpace:'nowrap'}}>{l.time}</td>
                          <td style={{fontWeight:700}}>{l.agent}</td>
                          <td><span style={{color:ACT_COLOR[l.action]||'var(--sub)',fontWeight:600,fontSize:12}}>{ACT_ICON[l.action]||'·'} {ACT_LABEL[l.action]||l.action}</span></td>
                          <td style={{fontSize:10,color:'var(--sub)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.device}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtLogs.length===0&&<div style={{padding:28,textAlign:'center',color:'var(--sub)'}}>No entries.</div>}
                </Glass>
              </div>
            )}

            {/* ── ONBOARDING ── */}
            {tab==='onboarding'&&(
              <Glass style={{maxWidth:520}}>
                <div style={{fontWeight:800,fontSize:16,marginBottom:18,letterSpacing:-0.3}}>Activation Queue</div>
                <label className="lbl">SET MONTHLY SALARY (USD)</label>
                <input className="inp gap" placeholder="e.g. 260" type="number" inputMode="numeric"
                  onChange={e=>setSal(e.target.value)}/>
                {agents.filter(a=>a.status==='pending').length===0
                  ?<div style={{textAlign:'center',color:'var(--sub)',padding:'20px 0',fontFamily:'var(--mono)',fontSize:12}}>No pending registrations.</div>
                  :agents.filter(a=>a.status==='pending').map(a=>(
                    <div key={a.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 0',borderBottom:'1px solid rgba(255,255,255,0.05)',gap:10,flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontWeight:700}}>{a.name}</div>
                        <div style={{fontSize:11,color:deptColor(a.platform),marginTop:3,fontFamily:'var(--mono)',letterSpacing:1}}>{a.platform}</div>
                      </div>
                      <button className="btn btn-teal" style={{fontSize:11}} onClick={async()=>{
                        if(!sal)return alert('Assign a salary first.');
                        await fetch(SHEETS_WEBHOOK,{method:'POST',mode:'no-cors',body:JSON.stringify({
                          date:new Date().toLocaleDateString(),time:new Date().toLocaleTimeString(),
                          action:'USER_APPROVE',agent:a.name,device:JSON.stringify({...a,salary:Number(sal)}),timestamp:Date.now()
                        })});
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

      {/* ══ AGENT DETAIL MODAL ══ */}
      {modal&&(
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:10}}>
              <div>
                <div style={{fontWeight:800,fontSize:20,letterSpacing:-0.5}}>{modal.name}</div>
                <div style={{fontSize:11,color:deptColor(modal.platform),letterSpacing:1,marginTop:4,fontFamily:'var(--mono)'}}>◆ {modal.platform}</div>
              </div>
              <div className="badge" style={{background:`${modal.status.color}18`,color:modal.status.color,border:`1px solid ${modal.status.color}40`}}>
                <div className={`dot${modal.status.pulse?' blink':''}`} style={{background:modal.status.color}}/>{modal.status.label}
              </div>
            </div>

            {/* Big ring */}
            <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
              <Ring pct={modal.sPct} size={120} stroke={8} color={modal.status.color} bg="rgba(255,255,255,0.05)">
                <div style={{textAlign:'center'}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:22,fontWeight:700,color:modal.status.color}}>{modal.sPct.toFixed(0)}%</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--sub)',letterSpacing:1}}>SHIFT</div>
                </div>
              </Ring>
            </div>

            {/* Stats grid */}
            <div className="g3" style={{marginBottom:16}}>
              {[
                {l:'CLOCK IN', v:modal.ci?new Date(modal.ci).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'—', a:false},
                {l:'BREAK',    v:fmtS(modal.totB), a:modal.bOvr},
                {l:'NET WORK', v:fmt(modal.nMs), hi:true},
              ].map(s=>(
                <div key={s.l} style={{textAlign:'center',padding:'13px 8px',background:'rgba(0,0,0,0.3)',borderRadius:12,border:`1px solid ${s.a?'rgba(244,63,94,0.3)':'rgba(255,255,255,0.06)'}`}}>
                  <div style={{fontFamily:'var(--mono)',fontSize:'clamp(12px,3.5vw,16px)',fontWeight:700,color:s.a?'var(--red)':s.hi?'var(--teal)':'var(--text)'}}>{s.v}</div>
                  <div style={{fontSize:9,color:'var(--sub)',letterSpacing:1.5,marginTop:3,fontFamily:'var(--mono)'}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Progress */}
            <div style={{marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:'var(--sub)',marginBottom:5}}>
                <span>SHIFT COMPLETION</span><span>{modal.sPct.toFixed(0)}%</span>
              </div>
              <div className="pbar" style={{height:6}}>
                <div className="pfill" style={{width:`${modal.sPct}%`,background:modal.sPct>=100?'var(--teal)':'linear-gradient(90deg,var(--blue),var(--teal))'}}/>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,fontFamily:'var(--mono)',color:modal.bOvr?'var(--red)':'var(--sub)',marginBottom:5}}>
                <span>BREAK USED</span><span>{fmtS(modal.totB)}</span>
              </div>
              <div className="pbar" style={{height:6}}>
                <div className="pfill" style={{width:`${modal.bPct}%`,background:modal.bOvr?'var(--red)':'var(--amber)'}}/>
              </div>
            </div>

            {modal.bOvr&&<div className="alert a-err" style={{marginBottom:14}}>⚠ Break exceeded by {fmtS(modal.totB-BREAK_MAX)}</div>}

            <div style={{fontWeight:700,fontSize:13,marginBottom:12,letterSpacing:0.5}}>Today's Activity</div>
            {modal.tl.length===0
              ?<div style={{color:'var(--sub)',fontSize:13,textAlign:'center',padding:'14px 0'}}>No activity today.</div>
              :<div className="tl">
                {modal.tl.map((l,i)=>(
                  <div className="tl-row" key={i}>
                    <div className="tl-dot" style={{background:ACT_COLOR[l.action]||'var(--sub)'}}/>
                    <div className="tl-t">{l.time}</div>
                    <div className="tl-a" style={{color:ACT_COLOR[l.action]||'var(--text)'}}>{ACT_ICON[l.action]} {ACT_LABEL[l.action]||l.action}</div>
                  </div>
                ))}
              </div>
            }
            <button className="btn btn-ghost btn-full" style={{marginTop:20}} onClick={()=>setModal(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </>
  );
}