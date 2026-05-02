import React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const HOOK     = 'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';
const MGR_KEY  = 'AFTERSALES-BOSS-2026';
const FIN_KEY  = 'AFTERSALES-FINANCE-2026';
const BREAK_MAX  = 3_600_000;   // 1 h — included in 8 h shift
const SHIFT_GOAL = 28_800_000;  // 8 h total (7h work + 1h break)
const LATE_GRACE = 900_000;     // 15 min grace period
const WORKING_DAYS = 26;        // standard monthly working days for salary calc

// ─────────────────────────────────────────────────────────────────────────────
// PH TIMEZONE (UTC+8)
// ─────────────────────────────────────────────────────────────────────────────
const PH_TZ       = 'Asia/Manila';
const phFmt       = (ts, opts) => new Date(ts).toLocaleString('en-PH', { timeZone: PH_TZ, ...opts });
const phTime      = ts => phFmt(ts, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const phTimeShort = ts => phFmt(ts, { hour: '2-digit', minute: '2-digit' });
const phDateFull  = ts => phFmt(ts, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const phDateShort = ts => phFmt(ts, { month: 'short', day: 'numeric' });
const phDateLong  = ts => phFmt(ts, { month: 'long', day: 'numeric', year: 'numeric' });
const todayMs = () => {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: PH_TZ });
  return new Date(ymd + 'T00:00:00+08:00').getTime();
};
const tsKey   = () => new Date().toLocaleDateString('en-CA', { timeZone: PH_TZ });
const phNowDate = () => new Date().toLocaleDateString('en-PH', { timeZone: PH_TZ });
const phNowTime = () => new Date().toLocaleTimeString('en-PH', { timeZone: PH_TZ });

// Stable unique ID for an announcement — used for seen/ack tracking.
// Composed from fields that Sheets always returns as plain text,
// so it's immune to timestamp format changes across environments.
// Stable announcement ID — uses only plain-text fields that Sheets never reformats.
// date/time columns can come back as ISO strings or locale strings depending on
// column format, so we exclude them and key on from+text which are always plain text.
const annId = a => `${a.from || a.agent || ''}_${String(a.text || '').trim().slice(0, 40)}`;

// ─────────────────────────────────────────────────────────────────────────────
// SHIFTS & DEPARTMENTS
// ─────────────────────────────────────────────────────────────────────────────
const SHIFTS = [
  { label: 'Morning', start: '07:00', end: '15:00', overnight: false },
  { label: 'Mid',     start: '15:00', end: '23:00', overnight: false },
  { label: 'Night',   start: '23:00', end: '07:00', overnight: true  },
  { label: 'Office',  start: '09:00', end: '17:00', overnight: false, locked: ['DMCA','Chargeback'] },
];
const DEPT_SHIFT_LOCK = { DMCA: 'Office', Chargeback: 'Office' };
const resolveShift  = label => SHIFTS.find(s => s.label === label) || SHIFTS[0];
const lockedShift   = dept  => DEPT_SHIFT_LOCK[dept] || null;
const shiftsForDept = dept  => lockedShift(dept)
  ? SHIFTS.filter(s => s.label === lockedShift(dept))
  : SHIFTS.filter(s => !s.locked);

const schedStart = (shiftLabel, clockInTs) => {
  const shift = resolveShift(shiftLabel);
  const ciPhDate = new Date(clockInTs).toLocaleDateString('en-CA', { timeZone: PH_TZ });
  const ciPhHour = parseInt(
    new Date(clockInTs).toLocaleTimeString('en-PH', { timeZone: PH_TZ, hour: '2-digit', hour12: false })
  , 10);
  let refDate = ciPhDate;
  if (shift.overnight && ciPhHour < 12) {
    refDate = new Date(clockInTs - 86_400_000).toLocaleDateString('en-CA', { timeZone: PH_TZ });
  }
  return new Date(refDate + 'T' + shift.start + ':00+08:00').getTime();
};

// ─────────────────────────────────────────────────────────────────────────────
// POSITIONS & ROLES
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Returns today's day-of-week in PH time (0=Sun … 6=Sat)
const todayDowPH = () => {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: PH_TZ });
  return new Date(ymd + 'T12:00:00+08:00').getDay();
};

const POSITIONS = [
  'Customer Service Agent', 'Senior Agent', 'Team Lead',
  'Quality Analyst', 'DMCA Specialist', 'Chargeback Analyst',
  'Operations Staff', 'Finance Staff', 'Manager',
];

// Role hierarchy: agent < finance < manager
const ROLE_AGENT   = 'Agent';
const ROLE_FINANCE = 'Finance';
const ROLE_MANAGER = 'Manager';

const PAY = n => {
  if (['Egar','Drakeyyy'].includes(n)) return 600;
  if (['Lasgna','Sinclair'].includes(n)) return 400;
  if (['Eli','Mary','Robert','Porsha','Gio','Giah','Art','Jon','Koko','Hawuki','John','Eunice'].includes(n)) return 360;
  return 260;
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS & ACTION MAPS
// ─────────────────────────────────────────────────────────────────────────────
const DEPT_HUE = { META: 210, KANAL: 42, Helpwave: 24, Chargeback: 355, DMCA: 220, MANAGER: 270 };
const dc  = d => `hsl(${DEPT_HUE[d] ?? 210},90%,60%)`;
const dg  = d => `hsl(${DEPT_HUE[d] ?? 210},90%,45%,0.2)`;

const ST = {
  ACTIVE:  { label: 'ON SHIFT',    color: '#22d3a5', pulse: true  },
  BREAK:   { label: 'ON BREAK',    color: '#f59e0b', pulse: true  },
  PAUSED:  { label: 'DUTY PAUSED', color: '#f97316', pulse: true  },
  OUT:     { label: 'CLOCKED OUT', color: '#64748b', pulse: false },
  PENDING: { label: 'NOT IN',      color: '#334155', pulse: false },
  ONCALL:  { label: 'ON CALL',     color: '#c084fc', pulse: true  },
};
const AC = { clockIn: '#22d3a5', clockOut: '#f43f5e', breakStart: '#f59e0b', breakEnd: '#38bdf8', dutyPause: '#f97316', dutyResume: '#22d3a5' };
const AL = { clockIn: 'Clock In', clockOut: 'Clock Out', breakStart: 'Break Start', breakEnd: 'Resume Work', dutyPause: 'Duty Paused', dutyResume: 'Duty Resumed' };
const AI = { clockIn: '▶', clockOut: '■', breakStart: '⏸', breakEnd: '▶', dutyPause: '⚠', dutyResume: '▶' };

const deriveStatus = (logs, name, rec, role) => {
  if (role === ROLE_MANAGER || role === ROLE_FINANCE) return ST.ONCALL;
  if (rec.onPause)  return ST.PAUSED;
  if (rec.onBreak)  return ST.BREAK;
  if (rec.clockIn && !rec.clockedOut) return ST.ACTIVE;
  const td = todayMs();
  const last = [...logs.filter(l => l.agent === name && l.timestamp >= td)]
    .sort((a, b) => a.timestamp - b.timestamp).pop();
  if (!last) return ST.PENDING;
  return { clockIn: ST.ACTIVE, breakStart: ST.BREAK, dutyPause: ST.PAUSED, clockOut: ST.OUT }[last.action] ?? ST.PENDING;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const pad  = n => String(n).padStart(2, '0');
const fmt  = ms => { if (!ms || ms < 0) return '00:00:00'; return `${pad(~~(ms / 3_600_000))}:${pad(~~(ms % 3_600_000 / 60_000))}:${pad(~~(ms % 60_000 / 1_000))}`; };
const fmtS = ms => { if (!ms || ms < 0) return '0m'; const h = ~~(ms / 3_600_000), m = ~~(ms % 3_600_000 / 60_000); return h ? `${h}h ${m}m` : `${m}m`; };
const currency = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const Ring = ({ pct = 0, size = 72, stroke = 5, color = '#22d3a5', bg = 'rgba(255,255,255,0.05)', children }) => {
  const r = (size - stroke * 2) / 2, c = size / 2, circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(pct / 100, 1))}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <foreignObject x={0} y={0} width={size} height={size}
        style={{ transform: 'rotate(90deg)', transformOrigin: `${c}px ${c}px` }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  );
};

const Glass = ({ children, style = {}, glow = '' }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 22,
    boxShadow: glow ? `0 0 40px ${glow},0 8px 32px rgba(0,0,0,0.4)` : '0 8px 32px rgba(0,0,0,0.4)',
    ...style,
  }}>{children}</div>
);

const Chip = ({ color, children, small }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: small ? '2px 8px' : '4px 11px', borderRadius: 20,
    fontSize: small ? 9 : 10, fontWeight: 700, letterSpacing: 1.5,
    fontFamily: 'var(--mono)', whiteSpace: 'nowrap',
    background: `${color}18`, color, border: `1px solid ${color}38`,
  }}>{children}</span>
);

const Dot = ({ color, pulse }) => (
  <span style={{
    width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
    display: 'inline-block', animation: pulse ? 'blink 2s infinite' : undefined,
  }} />
);

const Sep = () => <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />;

const MiniStat = ({ label, value, color = 'var(--text)' }) => (
  <div style={{ textAlign: 'center', padding: '11px 7px', background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
    <div style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(11px,3vw,15px)', fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--sub)', marginTop: 3, fontFamily: 'var(--mono)' }}>{label}</div>
  </div>
);

const SectionHead = ({ children, action }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
    <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: -0.3 }}>{children}</div>
    {action}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root {
  --bg0:#03050f;--bg1:#070c1a;--bg2:#0c1228;
  --teal:#22d3a5;--blue:#38bdf8;--amber:#f59e0b;--red:#f43f5e;--purple:#c084fc;--orange:#f97316;
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
.orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.14;}
.orb1{width:600px;height:600px;background:radial-gradient(circle,hsl(190,90%,45%),transparent 70%);top:-200px;left:-150px;animation:drift1 18s ease-in-out infinite;}
.orb2{width:500px;height:500px;background:radial-gradient(circle,hsl(265,80%,55%),transparent 70%);bottom:-150px;right:-100px;animation:drift2 22s ease-in-out infinite;}
.orb3{width:400px;height:400px;background:radial-gradient(circle,hsl(150,80%,40%),transparent 70%);top:40%;left:50%;animation:drift3 16s ease-in-out infinite;}
@keyframes drift1{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,80px)}}
@keyframes drift2{0%,100%{transform:translate(0,0)}50%{transform:translate(-80px,-60px)}}
@keyframes drift3{0%,100%{transform:translate(-50%,-50%)}50%{transform:translate(calc(-50% + 40px),calc(-50% + 60px))}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fadeUp .4s ease both;}
.fu2{animation:fadeUp .4s .08s ease both;}
.fu3{animation:fadeUp .4s .16s ease both;}

#shell{position:relative;z-index:1;width:100%;max-width:1440px;margin:0 auto;
  min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;
  padding:0 calc(18px + var(--safe-r)) calc(56px + var(--safe-b)) calc(18px + var(--safe-l));}

#topbar{display:flex;justify-content:space-between;align-items:center;
  padding:18px 0 14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:24px;flex-wrap:wrap;gap:10px;}
.logo-text{font-size:clamp(17px,4vw,26px);font-weight:800;letter-spacing:-.5px;
  background:linear-gradient(135deg,var(--teal),var(--blue));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.logo-sub{font-size:10px;letter-spacing:3px;color:var(--sub);margin-top:2px;font-family:var(--mono);}
.clock-time{font-family:var(--mono);font-size:clamp(15px,3vw,22px);font-weight:700;letter-spacing:2px;text-align:right;}
.clock-date{font-size:10px;color:var(--sub);text-align:right;margin-top:2px;}

#loader{position:fixed;top:0;left:0;width:100%;height:2px;z-index:9999;
  background:linear-gradient(90deg,transparent,var(--teal),var(--blue),transparent);
  animation:slide 1.4s linear infinite;}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

#toast{position:fixed;bottom:calc(24px + var(--safe-b));left:50%;transform:translateX(-50%) translateY(0);
  padding:10px 22px;border-radius:40px;font-size:13px;font-weight:600;letter-spacing:1px;
  font-family:var(--mono);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  white-space:nowrap;z-index:600;transition:opacity .3s,transform .3s;pointer-events:none;}
#toast.ok{background:rgba(34,211,165,.18);border:1px solid rgba(34,211,165,.4);color:var(--teal);}
#toast.err{background:rgba(244,63,94,.18);border:1px solid rgba(244,63,94,.4);color:var(--red);}
#toast.warn{background:rgba(245,158,11,.18);border:1px solid rgba(245,158,11,.4);color:var(--amber);}
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
  transition:transform .13s,opacity .13s;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
.btn:active{transform:scale(.95);opacity:.85;}
.btn:disabled{opacity:.3;pointer-events:none;}
.bt{background:linear-gradient(135deg,var(--teal),hsl(175,65%,45%));color:#000;box-shadow:0 4px 18px rgba(34,211,165,.28);}
.bb{background:linear-gradient(135deg,var(--blue),hsl(200,85%,55%));color:#000;box-shadow:0 4px 18px rgba(56,189,248,.28);}
.br{background:linear-gradient(135deg,var(--red),hsl(345,85%,55%));color:#fff;box-shadow:0 4px 18px rgba(244,63,94,.28);}
.ba{background:linear-gradient(135deg,var(--amber),hsl(35,90%,55%));color:#000;}
.bo{background:linear-gradient(135deg,var(--orange),hsl(20,90%,52%));color:#fff;}
.bp{background:linear-gradient(135deg,var(--purple),hsl(280,75%,60%));color:#fff;}
.bg{background:rgba(255,255,255,.05);color:var(--sub);border:1px solid rgba(255,255,255,.08);}
.bg:active{background:rgba(255,255,255,.1);}
.bw{width:100%;}
.btn-tab{background:transparent;color:var(--sub);border:none;border-bottom:2px solid transparent;
  border-radius:0;padding:10px 13px;font-size:11px;font-family:var(--mono);letter-spacing:2px;
  min-height:44px;white-space:nowrap;cursor:pointer;touch-action:manipulation;transition:color .2s,border-color .2s;}
.btn-tab.on{color:var(--teal);border-bottom-color:var(--teal);}

.alert{padding:11px 15px;border-radius:12px;font-size:13px;display:flex;align-items:center;gap:9px;}
.aok{background:rgba(34,211,165,.08);border:1px solid rgba(34,211,165,.3);color:var(--teal);}
.aer{background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.3);color:var(--red);}
.awn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);color:var(--amber);}
.aor{background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.3);color:var(--orange);}
.apr{background:rgba(192,132,252,.08);border:1px solid rgba(192,132,252,.3);color:var(--purple);}

.pbar{height:4px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;}
.pfill{height:100%;border-radius:2px;transition:width 1s ease;}

.g2{display:grid;grid-template-columns:1fr;gap:18px;width:100%;}
@media(min-width:768px){.g2{grid-template-columns:1fr 1fr;}}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.g4{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;}
@media(min-width:600px){.g4{grid-template-columns:repeat(4,1fr);}}
.g2sm{display:grid;grid-template-columns:1fr 1fr;gap:10px;}

.sc{padding:18px;border-radius:16px;position:relative;overflow:hidden;}
.sv{font-family:var(--mono);font-size:clamp(22px,4.5vw,36px);font-weight:700;line-height:1;}
.sl{font-size:10px;letter-spacing:2px;color:var(--sub);margin-top:5px;font-family:var(--mono);}

.arow{display:flex;align-items:center;gap:11px;padding:12px 8px;border-radius:12px;
  cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .13s;}
.arow:last-child{border-bottom:none;}
.arow:active{background:rgba(34,211,165,.05);}
@media(hover:hover){.arow:hover{background:rgba(34,211,165,.05);}}
.av{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:14px;flex-shrink:0;font-family:var(--mono);}

.tl{position:relative;padding-left:22px;}
.tl::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.07);}
.tlrow{position:relative;padding:8px 0;}
.tldot{position:absolute;left:-19px;top:12px;width:8px;height:8px;border-radius:50%;border:2px solid var(--bg0);}
.tlt{font-size:10px;color:var(--sub);font-family:var(--mono);}
.tla{font-size:13px;font-weight:600;margin-top:2px;}

.tabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:22px;width:100%;
  overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
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
@media(min-width:600px){.modal{border-radius:24px;max-width:560px;max-height:88vh;padding:26px;}}
.drag{width:36px;height:4px;background:rgba(255,255,255,.12);border-radius:2px;margin:0 auto 18px;}

.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:16px;}
.tbl{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--mono);}
.tbl th{text-align:left;padding:10px 13px;font-size:10px;letter-spacing:2px;color:var(--sub);
  border-bottom:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.3);white-space:nowrap;}
.tbl td{padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;}

.actg{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.actg .s2{grid-column:1/-1;}
.actg .s3{grid-column:1/-1;}

.hero{font-size:clamp(30px,7vw,58px);font-weight:800;line-height:1.05;
  background:linear-gradient(135deg,#fff 0%,var(--teal) 50%,var(--blue) 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  letter-spacing:-2px;margin-bottom:6px;}
.herosub{font-size:clamp(11px,2.5vw,13px);color:var(--sub);letter-spacing:3px;font-family:var(--mono);}

.profile-card{padding:14px 16px;border-radius:14px;background:rgba(34,211,165,0.06);border:1px solid rgba(34,211,165,0.15);}

.payslip{background:#fff;color:#111;padding:32px;border-radius:16px;font-family:'JetBrains Mono',monospace;font-size:12px;min-width:480px;}
.payslip-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee;}
.payslip-total{display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:14px;border-top:2px solid #111;margin-top:4px;}

@media(pointer:fine){
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// LOCALSTORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const lsGet = key => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } };
const lsDel = key => { try { localStorage.removeItem(key); } catch { } };

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY — catches render crashes, shows a reload button instead of blank
// ─────────────────────────────────────────────────────────────────────────────
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#03050f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0', fontFamily: 'monospace', gap: 20, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>⚠</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: '#64748b', maxWidth: 400, lineHeight: 1.6 }}>{String(this.state.error)}</div>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ padding: '12px 28px', background: '#22d3a5', color: '#000', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'monospace' }}>
            RELOAD APP
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {

  // ── state ──
  const [view,   setView]  = useState(() => { const u = lsGet('afs_user'); return u ? (u.role === ROLE_MANAGER ? 'mgr' : u.role === ROLE_FINANCE ? 'finance' : 'agent') : 'landing'; });
  const [user,   setUser]  = useState(() => lsGet('afs_user'));
  const [recs,   setRecs]  = useState(() => lsGet('afs_recs') || {});
  const [tab,    setTab]   = useState('attendance');
  const [agents, setAgents]= useState([]);
  const [logs,   setLogs]  = useState([]);
  const [busy,   setBusy]  = useState(false);
  const [now,    setNow]   = useState(Date.now());

  // ── ui ──
  const [toast,      setToast]     = useState({ msg: '', kind: 'ok' });
  const [modal,      setModal]     = useState(null);
  const [swapModal,  setSwapModal] = useState(false);
  const [memoModal,  setMemoModal] = useState(false);
  const [escalModal, setEscalModal]= useState(false);
  const [annModal,   setAnnModal]  = useState(false);
  const [payModal,   setPayModal]  = useState(null); // agent object for payslip
  const [pwModal,    setPwModal]   = useState(false); // self-serve password change
  const [editAgent,  setEditAgent] = useState(null);  // agent obj being edited by manager
  const [resetAgent, setResetAgent]= useState(null);  // agent whose password the manager is resetting
  const [statsModal, setStatsModal]= useState(false); // agent's own attendance + earnings preview

  // ── forms ──
  const [reg,   setReg]  = useState({ name: '', pin: '', platform: 'META', shift: 'Morning', position: POSITIONS[0] });
  const [mkey,  setMkey] = useState('');
  const [logF,  setLogF] = useState({ name: '', pin: '' });
  const [err,   setErr]  = useState('');
  const [ok,    setOk]   = useState('');
  const [sal,   setSal]  = useState('');
  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' });
  const [pwErr,     setPwErr]     = useState('');
  const [editForm,  setEditForm]  = useState({ position: '', platform: '', shift: '', salary: '' });
  const [resetForm, setResetForm] = useState('');

  // ── log filter (defaults to TODAY) ──
  const [logDate, setLogDate] = useState(tsKey());

  // ── payroll period ──
  const [payPeriod, setPayPeriod] = useState('week');
  const [payStart,  setPayStart]  = useState(tsKey());
  const [payEnd,    setPayEnd]    = useState(tsKey());

  // ── swap / memo / escalate / announce ──
  const [swapTarget, setSwapTarget] = useState('');
  const [swapNote,   setSwapNote]   = useState('');
  const [memoText,   setMemoText]   = useState('');
  const [escalTitle,   setEscalTitle]  = useState('');
  const [escalDetail,  setEscalDetail] = useState('');
  const [escalUrgent,  setEscalUrgent] = useState(false);
  const [annText,    setAnnText]   = useState('');
  const [annUrgent,  setAnnUrgent] = useState(false);

  // ── notifications: track which announcement IDs have been seen by this user ──
  // Key: 'afs_seen_' + username, Value: array of announcement timestamps (used as IDs)
  const [seenAnns, setSeenAnns] = useState(() => {
    try {
      const u = lsGet('afs_user');
      const raw = u?.name ? lsGet(`afs_seen_${u.name}`) : null;
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  });
  const [notifTab, setNotifTab] = useState(false); // notification drawer open

  // ── server data ──
  const [swapReqs,   setSwapReqs]   = useState([]);
  const [anns,       setAnns]       = useState([]);
  const [acks,       setAcks]       = useState([]); // ANN_ACK records from server
  const [dayOffs,    setDayOffs]    = useState({}); // { agentName: dayOfWeekNumber (0-6) }
  const [editDayOff, setEditDayOff] = useState(null); // { name } agent being edited
  const [escals,     setEscals]     = useState([]);
  const [escAcks,    setEscAcks]    = useState([]); // ESC_ACK records from server
  const [memos,      setMemos]      = useState([]);

  // ── tick ──
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // ── persist ──
  useEffect(() => { lsSet('afs_recs', recs); }, [recs]);
  useEffect(() => { if (user) lsSet('afs_user', user); else lsDel('afs_user'); }, [user]);

  // Keep seenAnns in sync with the logged-in user
  useEffect(() => {
    if (user?.name) {
      const saved = lsGet(`afs_seen_${user.name}`) || [];
      setSeenAnns(saved);
    } else {
      setSeenAnns([]);
    }
  }, [user?.name]); // eslint-disable-line

  const markAnnSeen = useCallback((ann) => {
    // ann can be the full object or a raw id string (legacy)
    const id = (ann && typeof ann === 'object') ? annId(ann) : String(ann || '');
    if (!id) return;
    setSeenAnns(prev => {
      const safe = Array.isArray(prev) ? prev : [];
      if (safe.includes(id)) return safe;
      const next = [...safe, id];
      try { if (user?.name) lsSet(`afs_seen_${user.name}`, next); } catch {}
      return next;
    });
  }, [user?.name]); // eslint-disable-line

  const markAllAnnsSeen = useCallback((annList) => {
    if (!Array.isArray(annList)) return;
    const ids = annList.map(a => annId(a)).filter(Boolean);
    if (!ids.length) return;
    setSeenAnns(prev => {
      const safe = Array.isArray(prev) ? prev : [];
      const next = [...new Set([...safe, ...ids])];
      try { if (user?.name) lsSet(`afs_seen_${user.name}`, next); } catch {}
      return next;
    });
  }, [user?.name]); // eslint-disable-line

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast({ msg: '', kind: 'ok' }), 3200);
  }, []);

  // ── REBUILD SESSION FROM LOGS (declared BEFORE useEffects that use it) ──
  const rebuildSession = useCallback((agentName, sourceLogs) => {
    const td = todayMs();
    const tl = [...sourceLogs.filter(l => l.agent === agentName && l.timestamp >= td)]
      .sort((a, b) => a.timestamp - b.timestamp);
    if (!tl.length) return null;

    let clockIn = null, breakUsedMs = 0, pauseUsedMs = 0;
    let breakStart = null, pauseStart = null, clockedOut = false;

    for (const l of tl) {
      if (l.action === 'clockIn') {
        if (!clockIn || clockedOut) { clockIn = l.timestamp; breakUsedMs = 0; pauseUsedMs = 0; breakStart = null; pauseStart = null; clockedOut = false; }
      }
      if (l.action === 'breakStart' && clockIn && !clockedOut) { breakStart = l.timestamp; }
      if (l.action === 'breakEnd' && breakStart) { breakUsedMs += l.timestamp - breakStart; breakStart = null; }
      if (l.action === 'dutyPause' && clockIn && !clockedOut) { pauseStart = l.timestamp; }
      if (l.action === 'dutyResume' && pauseStart) { pauseUsedMs += l.timestamp - pauseStart; pauseStart = null; }
      if (l.action === 'clockOut' && clockIn) { clockedOut = true; breakStart = null; pauseStart = null; }
    }
    if (!clockIn) return null;

    const rebuilt = { clockIn, breakUsedMs, pauseUsedMs };
    if (clockedOut) {
      rebuilt.clockedOut = true;
      // FIX: was `todayLogs` (undefined). The local sorted list is `tl`.
      const coLog = tl.filter(l => l.action === 'clockOut').pop();
      if (coLog) rebuilt.clockOutTs = coLog.timestamp;
    }
    if (breakStart) { rebuilt.onBreak = true; rebuilt.breakStart = breakStart; }
    if (pauseStart) { rebuilt.onPause = true; rebuilt.pauseStart = pauseStart; }
    return rebuilt;
  }, []);

  // ── async server-sync (runs after fetch_) ──
  useEffect(() => {
    if (!user || user.role !== ROLE_AGENT) return;
    const rebuilt = rebuildSession(user.name, logs);
    if (!rebuilt) return;
    setRecs(prev => {
      const cur = prev[user.name] || {};
      const lastLogTs = [...logs.filter(l => l.agent === user.name)]
        .sort((a, b) => b.timestamp - a.timestamp)[0]?.timestamp || 0;
      if (cur.onBreak && !rebuilt.onBreak && (cur.breakStart || 0) > lastLogTs) return prev;
      if (cur.onPause && !rebuilt.onPause && (cur.pauseStart || 0) > lastLogTs) return prev;
      if (cur.clockedOut && !rebuilt.clockedOut) return prev;
      return { ...prev, [user.name]: rebuilt };
    });
  }, [logs, user, rebuildSession]);

  // ── FETCH ──
  const fetch_ = useCallback(async () => {
    setBusy(true);
    try {
      const d = await fetch(HOOK).then(r => r.json());

      const USER_ACTIONS = ['USER_REGISTER','USER_APPROVE','USER_PWCHANGE','USER_UPDATE','USER_DEACTIVATE','USER_REACTIVATE'];
      const uRows = d.filter(i => USER_ACTIONS.includes(i.action))
        .map(r => ({ ...r, timestamp: Number(r.timestamp) || new Date(`${r.date} ${r.time}`).getTime() }))
        .sort((a, b) => a.timestamp - b.timestamp); // ASC — latest action wins
      const lRows = d.filter(i => !i.action?.startsWith('USER_') && !['SWAP_REQUEST','SWAP_APPROVE','SWAP_DENY','ANNOUNCE','ESCALATE','MEMO','ANN_ACK','ESC_ACK','DAYOFF_SET'].includes(i.action))
        .map(l => ({ ...l, timestamp: Number(l.timestamp) || new Date(`${l.date} ${l.time}`).getTime() }))
        .sort((a, b) => b.timestamp - a.timestamp);

      // HARDENED parse: strip protected row-level keys from device JSON before merging.
      // This prevents a serialized `action`/`agent`/`timestamp` etc. inside `device`
      // from shadowing the real row fields when we read it back.
      const PROTECTED_KEYS = ['action','agent','timestamp','date','time','device'];
      const parse = row => {
        try {
          const extras = JSON.parse(row.device);
          if (!extras || typeof extras !== 'object') return row;
          const safe = {};
          for (const k of Object.keys(extras)) {
            if (!PROTECTED_KEYS.includes(k)) safe[k] = extras[k];
          }
          return { ...row, ...safe };
        } catch { return row; }
      };
      const swaps = d.filter(i => ['SWAP_REQUEST','SWAP_APPROVE','SWAP_DENY'].includes(i.action)).map(parse);
      const anns_  = d.filter(i => i.action === 'ANNOUNCE').map(parse).sort((a,b) => b.timestamp - a.timestamp);
      const escs_  = d.filter(i => i.action === 'ESCALATE').map(parse).sort((a,b) => b.timestamp - a.timestamp);
      const escAcks_ = d.filter(i => i.action === 'ESC_ACK').map(parse);
      const mems_  = d.filter(i => i.action === 'MEMO').map(parse).sort((a,b) => b.timestamp - a.timestamp);
      const acks_  = d.filter(i => i.action === 'ANN_ACK').map(parse);
      // Build latest day-off per agent (most recent DAYOFF_SET wins)
      const dayOffMap = {};
      d.filter(i => i.action === 'DAYOFF_SET').map(parse)
        .sort((a,b) => (Number(a.timestamp)||0) - (Number(b.timestamp)||0))
        .forEach(r => { if (r.agent && r.dayOff !== undefined) dayOffMap[r.agent] = Number(r.dayOff); });

      const map = {};
      uRows.forEach(u => {
        try {
          const x = u.device ? JSON.parse(u.device) : {};
          const key = u.agent.toLowerCase();
          const cur = map[key] || {};
          if (u.action === 'USER_REGISTER') {
            // Initial registration — only seed if no record yet, never overwrite an active account
            map[key] = cur.status ? cur : { ...x, name: u.agent, status: 'pending' };
          } else if (u.action === 'USER_APPROVE') {
            // Approve flips to active. Manager-side approval may carry an updated salary.
            map[key] = { ...cur, ...x, name: u.agent, status: 'active' };
          } else if (u.action === 'USER_PWCHANGE') {
            // Only the pin changes; everything else stays.
            map[key] = { ...cur, pin: x.pin };
          } else if (u.action === 'USER_UPDATE') {
            // Manager edited profile — merge whitelisted fields. NEVER let this overwrite pin.
            const { pin: _ignored, status: _s, name: _n, ...safe } = x;
            map[key] = { ...cur, ...safe };
          } else if (u.action === 'USER_DEACTIVATE') {
            map[key] = { ...cur, status: 'inactive' };
          } else if (u.action === 'USER_REACTIVATE') {
            map[key] = { ...cur, status: 'active' };
          }
        } catch { }
      });

      setAgents(Object.values(map));
      // Merge server logs, deduplicating by timestamp+agent+action
      // to avoid showing optimistic entries twice after the sync
      setLogs(prev => {
        const serverKeys = new Set(lRows.map(l => `${l.timestamp}_${l.agent}_${l.action}`));
        const localOnly  = prev.filter(l => !serverKeys.has(`${l.timestamp}_${l.agent}_${l.action}`));
        return [...lRows, ...localOnly].sort((a, b) => b.timestamp - a.timestamp);
      });
      setSwapReqs(swaps);
      setAnns(anns_);
      setAcks(acks_);
      setDayOffs(dayOffMap);
      setEscals(escs_);
      setEscAcks(escAcks_);
      setMemos(mems_);
    } catch (e) { console.error(e); }
    setBusy(false);
  }, []);

  useEffect(() => { fetch_(); }, [view, fetch_]);

  const post = p => fetch(HOOK, { method: 'POST', mode: 'no-cors', body: JSON.stringify(p) });

  const audit = async () => {
    try { const d = await fetch('https://ipapi.co/json/').then(r => r.json()); return `${d.city},${d.country_code}|IP:${d.ip}|${navigator.platform}`; }
    catch { return navigator.platform; }
  };

  // ── REGISTER ──
  const doRegister = async () => {
    setErr('');
    if (!reg.name.trim() || reg.pin.length < 4) return setErr('Min 4-char password.');
    const isMgr = reg.platform === 'MANAGER';
    const isFin = reg.role === ROLE_FINANCE;
    if (isMgr && mkey !== MGR_KEY) return setErr('Invalid Manager Key.');
    if (isFin && mkey !== FIN_KEY) return setErr('Invalid Finance Key.');
    setBusy(true);
    const loc = await audit();
    const role = isMgr ? ROLE_MANAGER : (reg.platform === 'FINANCE' ? ROLE_FINANCE : ROLE_AGENT);
    const data = { ...reg, role, salary: (isMgr || isFin) ? PAY(reg.name) : 0 };
    await post({
      date: phNowDate(), time: phNowTime(),
      action: (isMgr || isFin) ? 'USER_APPROVE' : 'USER_REGISTER',
      agent: reg.name.trim(), device: JSON.stringify({ ...data, loc }), timestamp: Date.now(),
    });
    setOk((isMgr || isFin) ? 'Access granted!' : 'Sent — awaiting approval.');
    if (isMgr) { setUser({ ...data, status: 'active' }); setView('mgr'); }
    else if (isFin) { setUser({ ...data, status: 'active' }); setView('finance'); }
    else setTimeout(() => setView('landing'), 2500);
    setBusy(false);
  };

  // ── LOGIN ──
  const doLogin = () => {
    setErr('');
    const found = agents.find(a => a.name.toLowerCase() === logF.name.toLowerCase().trim() && a.pin === logF.pin);
    if (!found) return setErr('Credentials not found.');
    if (found.status === 'pending') return setErr('Account awaiting approval.');
    if (found.status === 'inactive') return setErr('Account has been deactivated. Contact your manager.');

    if (found.role === ROLE_AGENT) {
      const rebuilt = rebuildSession(found.name, logs);
      if (rebuilt) {
        setRecs(prev => ({ ...prev, [found.name]: rebuilt }));
        if (!rebuilt.clockedOut) showToast('Session restored — clock still running');
      }
    }

    setUser(found);
    setView(found.role === ROLE_MANAGER ? 'mgr' : found.role === ROLE_FINANCE ? 'finance' : 'agent');
  };

  const logout = () => { setUser(null); setView('landing'); };

  // ── CLOCK ACTIONS ──
  const doAction = async (type) => {
    setBusy(true);
    try {
      const ts    = Date.now();
      const proof = await audit().catch(() => navigator.platform);
      const rec   = recs[user?.name] || {};
      let nx = { ...rec };
      if (type === 'clockIn')    { nx = { clockIn: ts, breakUsedMs: 0, pauseUsedMs: 0 }; }
      if (type === 'breakStart') { nx.onBreak = true;  nx.breakStart = ts; }
      if (type === 'breakEnd')   { nx.onBreak = false; nx.breakUsedMs = (nx.breakUsedMs || 0) + (ts - (nx.breakStart || ts)); delete nx.breakStart; }
      if (type === 'dutyPause')  { nx.onPause = true;  nx.pauseStart = ts; }
      if (type === 'dutyResume') { nx.onPause = false; nx.pauseUsedMs = (nx.pauseUsedMs || 0) + (ts - (nx.pauseStart || ts)); delete nx.pauseStart; }
      if (type === 'clockOut')   { nx = { clockedOut: true, clockIn: rec.clockIn, clockOutTs: ts, breakUsedMs: rec.breakUsedMs || 0, pauseUsedMs: rec.pauseUsedMs || 0 }; }
      setRecs(p => ({ ...p, [user.name]: nx }));

      // ── OPTIMISTIC LOCAL UPDATE ────────────────────────────────────────────
      // Add the action to the local logs state immediately so the timeline
      // shows it right away, even before the server responds.
      const localEntry = {
        date:      phNowDate(),
        time:      phNowTime(),
        action:    type,
        agent:     user.name,
        device:    proof,
        timestamp: ts,
      };
      setLogs(prev => [localEntry, ...prev]);
      // ──────────────────────────────────────────────────────────────────────

      showToast(AL[type] || type);

      // Send to server, then do a background sync to get the canonical server state.
      // We await post so the data reaches Sheets before we refetch.
      try {
        await post({ date: localEntry.date, time: localEntry.time, action: type, agent: user.name, device: proof, timestamp: ts });
      } catch (_) { /* network issue — optimistic entry already shown */ }

      // Background sync (non-blocking — don't await so UI stays fast)
      fetch_().catch(console.error);

    } catch (e) {
      console.error('doAction error:', e);
      showToast('Action failed — please try again', 'err');
    } finally {
      setBusy(false);
    }
  };

  // ── SWAP ──
  const doSwapRequest = async () => {
    if (!swapTarget) return showToast('Select a target agent', 'err');
    setBusy(true);
    await post({
      date: phNowDate(), time: phNowTime(), action: 'SWAP_REQUEST', agent: user.name, timestamp: Date.now(),
      device: JSON.stringify({ from: user.name, to: swapTarget, fromShift: user.shift || 'Morning', toShift: agents.find(a => a.name === swapTarget)?.shift || 'Morning', platform: user.platform, note: swapNote, status: 'pending' }),
    });
    showToast('Swap request sent!');
    setSwapModal(false); setSwapTarget(''); setSwapNote('');
    await fetch_(); setBusy(false);
  };

  // FIX: explicit whitelist of fields placed into device JSON so the decision
  // record never carries a stale `action: 'SWAP_REQUEST'`. We also stash the
  // original request's timestamp as `reqTimestamp` so swapKey() can match
  // request ↔ decision regardless of when each row was written.
  const doSwapDecision = async (req, decision) => {
    setBusy(true);
    await post({
      date: phNowDate(), time: phNowTime(),
      action: decision === 'approve' ? 'SWAP_APPROVE' : 'SWAP_DENY',
      agent: user.name, timestamp: Date.now(),
      device: JSON.stringify({
        from: req.from,
        to: req.to,
        fromShift: req.fromShift,
        toShift: req.toShift,
        platform: req.platform,
        note: req.note,
        reqTimestamp: req.timestamp,
        status: decision === 'approve' ? 'approved' : 'denied',
        decidedBy: user.name,
      }),
    });
    showToast(decision === 'approve' ? 'Swap approved!' : 'Swap denied.');
    await fetch_(); setBusy(false);
  };

  // ── MEMO ──
  const doMemo = async () => {
    if (!memoText.trim()) return;
    setBusy(true);
    await post({ date: phNowDate(), time: phNowTime(), action: 'MEMO', agent: user.name, timestamp: Date.now(), device: JSON.stringify({ text: memoText, agent: user.name }) });
    showToast('Memo submitted!');
    setMemoModal(false); setMemoText('');
    await fetch_(); setBusy(false);
  };

  // ── ACKNOWLEDGE ESCALATION (manager) ──
  const doAckEscalation = async (esc) => {
    if (!user?.name) return;
    const escKey = `${esc.agent}|${esc.date}|${esc.time}|${String(esc.title||'').slice(0,20)}`;
    // Optimistic update
    const localAck = { action: 'ESC_ACK', agent: user.name, escKey, escalAgent: esc.agent, date: phNowDate(), time: phNowTime(), timestamp: Date.now() };
    setEscAcks(prev => [...prev, localAck]);
    post({ date: localAck.date, time: localAck.time, action: 'ESC_ACK', agent: user.name, timestamp: localAck.timestamp, device: JSON.stringify({ escKey, escalAgent: esc.agent, ackedBy: user.name }) }).catch(console.error);
    showToast('Escalation acknowledged');
    fetch_().catch(console.error);
  };

  // ── ESCALATE ──
  const doEscalate = async () => {
    if (!escalTitle.trim()) return showToast('Add a title', 'err');
    setBusy(true);
    await post({ date: phNowDate(), time: phNowTime(), action: 'ESCALATE', agent: user.name, timestamp: Date.now(), device: JSON.stringify({ title: escalTitle, detail: escalDetail, urgent: escalUrgent, agent: user.name, resolved: false }) });
    showToast(escalUrgent ? '🚨 Urgent escalation sent!' : 'Escalation submitted.');
    setEscalModal(false); setEscalTitle(''); setEscalDetail(''); setEscalUrgent(false);
    await fetch_(); setBusy(false);
  };

  // ── ACKNOWLEDGE ANNOUNCEMENT ──
  const doAcknowledge = async (annTimestamp) => {
    if (!user?.name) return;
    // Check if already acked
    if (acks.some(a => a.annTs === annTimestamp && a.agent === user.name)) return;
    // Optimistic local update
    const localAck = { action: 'ANN_ACK', agent: user.name, annTs: annTimestamp, date: phNowDate(), time: phNowTime(), timestamp: Date.now() };
    setAcks(prev => [...prev, localAck]);
    post({ date: localAck.date, time: localAck.time, action: 'ANN_ACK', agent: user.name, timestamp: localAck.timestamp, device: JSON.stringify({ annTs: annTimestamp, agent: user.name }) }).catch(console.error);
    showToast('Acknowledged ✓');
  };

  // ── DAY OFF MANAGEMENT ──
  const doSetDayOff = async (agentName, dayOfWeek) => {
    // dayOfWeek: 0-6 (0=Sun) or null to clear
    setBusy(true);
    const payload = { date: phNowDate(), time: phNowTime(), action: 'DAYOFF_SET',
      agent: agentName, timestamp: Date.now(),
      device: JSON.stringify({ dayOff: dayOfWeek, setBy: user?.name }) };
    // Optimistic local update
    setDayOffs(prev => ({ ...prev, [agentName]: dayOfWeek }));
    try { await post(payload); } catch(_) {}
    fetch_().catch(console.error);
    setEditDayOff(null);
    setBusy(false);
    showToast(dayOfWeek !== null ? `Day off set: ${DAY_NAMES[dayOfWeek]}` : 'Day off cleared');
  };

  // Helper: is a given agent on day off RIGHT NOW (PH time)?
  const isOnDayOff = useCallback((agentName) => {
    const dow = dayOffs[agentName];
    if (dow === undefined || dow === null) return false;
    return todayDowPH() === Number(dow);
  }, [dayOffs]);

  // ── ANNOUNCE ──
  const doAnnounce = async () => {
    if (!annText.trim()) return;
    setBusy(true);
    await post({ date: phNowDate(), time: phNowTime(), action: 'ANNOUNCE', agent: user.name, timestamp: Date.now(), device: JSON.stringify({ text: annText, urgent: annUrgent, from: user.name }) });
    showToast('Announcement sent!');
    setAnnModal(false); setAnnText(''); setAnnUrgent(false);
    await fetch_(); setBusy(false);
  };

  // ── ACCOUNT MANAGEMENT ──

  // Self-serve password change (agent or manager)
  const doChangePassword = async () => {
    setPwErr('');
    if (!user) return;
    if (pwForm.current !== user.pin) return setPwErr('Current password is incorrect.');
    if (!pwForm.next || pwForm.next.length < 4) return setPwErr('New password must be at least 4 characters.');
    if (pwForm.next === pwForm.current) return setPwErr('New password must differ from the current one.');
    if (pwForm.next !== pwForm.confirm) return setPwErr('Confirmation does not match.');
    setBusy(true);
    try {
      await post({
        date: phNowDate(), time: phNowTime(),
        action: 'USER_PWCHANGE', agent: user.name, timestamp: Date.now(),
        device: JSON.stringify({ pin: pwForm.next, by: 'self' }),
      });
      // Update local user immediately so this session keeps working without re-login
      const updated = { ...user, pin: pwForm.next };
      setUser(updated);
      setPwForm({ current: '', next: '', confirm: '' });
      setPwModal(false);
      showToast('Password updated');
      fetch_().catch(console.error);
    } catch (e) {
      setPwErr('Network error — try again.');
    }
    setBusy(false);
  };

  // Manager: force-reset an agent's password
  const doResetPassword = async () => {
    if (!resetAgent || !resetForm || resetForm.length < 4) {
      return showToast('Password must be at least 4 characters', 'err');
    }
    setBusy(true);
    try {
      await post({
        date: phNowDate(), time: phNowTime(),
        action: 'USER_PWCHANGE', agent: resetAgent.name, timestamp: Date.now(),
        device: JSON.stringify({ pin: resetForm, by: user?.name || 'manager' }),
      });
      showToast(`Password reset for ${resetAgent.name}`);
      setResetAgent(null);
      setResetForm('');
      await fetch_();
    } catch (e) { showToast('Reset failed', 'err'); }
    setBusy(false);
  };

  // Manager: edit an agent's profile (position, platform, shift, salary)
  const doUpdateAgent = async () => {
    if (!editAgent) return;
    const lock = lockedShift(editForm.platform);
    const finalShift = lock || editForm.shift;
    const salary = Number(editForm.salary);
    if (!isFinite(salary) || salary < 0) return showToast('Invalid salary', 'err');
    setBusy(true);
    try {
      await post({
        date: phNowDate(), time: phNowTime(),
        action: 'USER_UPDATE', agent: editAgent.name, timestamp: Date.now(),
        device: JSON.stringify({
          position: editForm.position,
          platform: editForm.platform,
          shift: finalShift,
          salary,
          updatedBy: user?.name,
        }),
      });
      showToast(`${editAgent.name} updated`);
      setEditAgent(null);
      await fetch_();
    } catch (e) { showToast('Update failed', 'err'); }
    setBusy(false);
  };

  // Manager: deactivate or reactivate an agent
  const doToggleAgentStatus = async (agent, deactivate) => {
    setBusy(true);
    try {
      await post({
        date: phNowDate(), time: phNowTime(),
        action: deactivate ? 'USER_DEACTIVATE' : 'USER_REACTIVATE',
        agent: agent.name, timestamp: Date.now(),
        device: JSON.stringify({ by: user?.name }),
      });
      showToast(`${agent.name} ${deactivate ? 'deactivated' : 'reactivated'}`);
      await fetch_();
    } catch (e) { showToast('Action failed', 'err'); }
    setBusy(false);
  };

  // ── SESSION CALCS ──
  // Break IS included in the 8h shift (7h work + 1h break = 8h total).
  // Duty Pause is NOT counted — it extends the shift window.
  const rec       = user ? (recs[user.name] || {}) : {};
  const bMs       = (rec.breakUsedMs || 0) + (rec.onBreak ? (now - rec.breakStart) : 0);
  const pauseMs   = (rec.pauseUsedMs || 0) + (rec.onPause ? (now - rec.pauseStart) : 0);
  // Cap elapsed at clockOutTs once clocked out — the timer must stop
  const rawMs     = rec.clockIn ? ((rec.clockedOut && rec.clockOutTs ? rec.clockOutTs : now) - rec.clockIn) : 0;
  const shMs      = Math.max(0, rawMs - pauseMs);   // elapsed excl. paused time
  const net       = Math.max(0, shMs - bMs);         // actual work time (display)
  const ot        = Math.max(0, shMs - SHIFT_GOAL);
  const bOvr      = bMs > BREAK_MAX;
  const bPct      = Math.min(bMs / BREAK_MAX * 100, 100);
  const sPct      = Math.min(shMs / SHIFT_GOAL * 100, 100);
  const agentSt   = (user?.role === ROLE_MANAGER || user?.role === ROLE_FINANCE) ? ST.ONCALL
    : rec.onPause ? ST.PAUSED : rec.onBreak ? ST.BREAK : (rec.clockIn && !rec.clockedOut) ? ST.ACTIVE : ST.PENDING;

  // ── ATTENDANCE SUMMARY ──
  const attend = useMemo(() => {
    return agents.filter(a => a.status === 'active' && a.role === ROLE_AGENT).map(agent => {
      const td = todayMs();
      const tl = logs.filter(l => l.agent === agent.name && l.timestamp >= td).sort((a, b) => a.timestamp - b.timestamp);
      let ci = null, co = null, tb = 0, pb = 0, bs = null, ps = null;
      tl.forEach(l => {
        if (l.action === 'clockIn' && !ci) ci = l.timestamp;
        if (l.action === 'breakStart') bs = l.timestamp;
        if (l.action === 'breakEnd' && bs) { tb += l.timestamp - bs; bs = null; }
        if (l.action === 'dutyPause') ps = l.timestamp;
        if (l.action === 'dutyResume' && ps) { pb += l.timestamp - ps; ps = null; }
        if (l.action === 'clockOut') co = l.timestamp;
      });
      const r = recs[agent.name] || {};
      const ab = r.onBreak ? (now - (r.breakStart || now)) : 0;
      const ap = r.onPause ? (now - (r.pauseStart || now)) : 0;
      const totB = tb + (r.breakUsedMs || 0) + ab;
      const totP = pb + (r.pauseUsedMs || 0) + ap;
      const raw = ci ? ((co || now) - ci) : 0;
      const sMs = Math.max(0, raw - totP);
      const nMs = Math.max(0, sMs - totB);
      const otMs = Math.max(0, sMs - SHIFT_GOAL);
      const lateMs = ci ? Math.max(0, ci - (schedStart(agent.shift || 'Morning', ci) + LATE_GRACE)) : 0;
      return {
        ...agent, ci, co, totB, totP, sMs, nMs, otMs, tl,
        status: deriveStatus(logs, agent.name, r, agent.role),
        bOvr: totB > BREAK_MAX, sPct: Math.min(sMs / SHIFT_GOAL * 100, 100), lateMs,
      };
    });
  }, [agents, logs, recs, now]);

  // ── FILTERED LOGS (always one specific PH date) ──
  const filtLogs = useMemo(() => {
    const s = new Date(logDate + 'T00:00:00+08:00').getTime();
    const e = s + 86_400_000;
    return logs.filter(l => l.timestamp >= s && l.timestamp < e);
  }, [logs, logDate]);

  // ── PAYROLL CALCULATIONS ──
  const calcPayroll = useCallback((agentList, fromTs, toTs) => {
    return agentList.map(agent => {
      const agLogs = logs.filter(l => l.agent === agent.name && l.timestamp >= fromTs && l.timestamp < toTs)
        .sort((a, b) => a.timestamp - b.timestamp);

      // Group by PH date
      const dayMap = {};
      agLogs.forEach(l => {
        const d = new Date(l.timestamp).toLocaleDateString('en-CA', { timeZone: PH_TZ });
        if (!dayMap[d]) dayMap[d] = [];
        dayMap[d].push(l);
      });

      const days = Object.entries(dayMap).map(([date, dl]) => {
        let ci = null, co = null, tb = 0, pb = 0, bs = null, ps = null;
        dl.forEach(l => {
          if (l.action === 'clockIn' && !ci) ci = l.timestamp;
          if (l.action === 'breakStart') bs = l.timestamp;
          if (l.action === 'breakEnd' && bs) { tb += l.timestamp - bs; bs = null; }
          if (l.action === 'dutyPause') ps = l.timestamp;
          if (l.action === 'dutyResume' && ps) { pb += l.timestamp - ps; ps = null; }
          if (l.action === 'clockOut') co = l.timestamp;
        });
        const raw = (ci && co) ? (co - ci) : (ci ? (Math.min(Date.now(), new Date(date + 'T23:59:59+08:00').getTime()) - ci) : 0);
        const sMs = Math.max(0, raw - pb);
        const nMs = Math.max(0, sMs - tb);
        const late = ci ? Math.max(0, ci - (schedStart(agent.shift || 'Morning', ci) + LATE_GRACE)) : 0;
        return { date, ci, co, breakMs: tb, pauseMs: pb, shiftMs: sMs, workMs: nMs, otMs: Math.max(0, sMs - SHIFT_GOAL), lateMs: late };
      }).filter(d => d.ci);

      const totalShiftMs = days.reduce((s, d) => s + d.shiftMs, 0);
      const totalOtMs    = days.reduce((s, d) => s + d.otMs, 0);
      const monthlySal   = agent.salary || 260;
      const dailyRate    = monthlySal / WORKING_DAYS;
      const hourlyRate   = dailyRate / 8;
      const regularPay   = days.length * dailyRate;
      const otPay        = (totalOtMs / 3_600_000) * hourlyRate * 1.25; // 125% OT rate
      const grossPay     = regularPay + otPay;

      return { ...agent, days, totalShiftMs, totalOtMs, monthlySal, dailyRate, hourlyRate, regularPay, otPay, grossPay, daysWorked: days.length };
    });
  }, [logs]);

  const payRange = useMemo(() => {
    if (payPeriod === 'week') {
      const now_ = new Date(); now_.setHours(0, 0, 0, 0);
      const dow = now_.getDay();
      const mon = new Date(now_); mon.setDate(now_.getDate() - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return {
        from: new Date(mon.toLocaleDateString('en-CA', { timeZone: PH_TZ }) + 'T00:00:00+08:00').getTime(),
        to:   new Date(sun.toLocaleDateString('en-CA', { timeZone: PH_TZ }) + 'T23:59:59+08:00').getTime(),
      };
    }
    if (payPeriod === 'month') {
      const now_ = new Date();
      const yr = now_.getFullYear(), mo = now_.getMonth();
      return {
        from: new Date(`${yr}-${String(mo + 1).padStart(2, '0')}-01T00:00:00+08:00`).getTime(),
        to:   new Date(`${yr}-${String(mo + 1).padStart(2, '0')}-${new Date(yr, mo + 1, 0).getDate()}T23:59:59+08:00`).getTime(),
      };
    }
    return {
      from: new Date(payStart + 'T00:00:00+08:00').getTime(),
      to:   new Date(payEnd   + 'T23:59:59+08:00').getTime(),
    };
  }, [payPeriod, payStart, payEnd]);

  const payrollData = useMemo(() => {
    const activeAgents = agents.filter(a => a.status === 'active' && a.role === ROLE_AGENT);
    return calcPayroll(activeAgents, payRange.from, payRange.to);
  }, [agents, payRange, calcPayroll]);

  // ── AGENT'S OWN STATS — current period earnings preview + last 14 days ──
  const myStats = useMemo(() => {
    if (!user || user.role !== ROLE_AGENT) return null;
    const now_ = new Date(); now_.setHours(0,0,0,0);
    const dow = now_.getDay();
    const mon = new Date(now_); mon.setDate(now_.getDate() - (dow === 0 ? 6 : dow - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const weekFrom = new Date(mon.toLocaleDateString('en-CA', { timeZone: PH_TZ }) + 'T00:00:00+08:00').getTime();
    const weekTo   = new Date(sun.toLocaleDateString('en-CA', { timeZone: PH_TZ }) + 'T23:59:59+08:00').getTime();
    const monthFrom = new Date(`${now_.getFullYear()}-${String(now_.getMonth()+1).padStart(2,'0')}-01T00:00:00+08:00`).getTime();
    const monthEndDay = new Date(now_.getFullYear(), now_.getMonth()+1, 0).getDate();
    const monthTo = new Date(`${now_.getFullYear()}-${String(now_.getMonth()+1).padStart(2,'0')}-${monthEndDay}T23:59:59+08:00`).getTime();
    const fortnightFrom = todayMs() - 13 * 86_400_000;
    const fortnightTo   = todayMs() + 86_400_000 - 1;
    const week  = calcPayroll([user], weekFrom, weekTo)[0];
    const month = calcPayroll([user], monthFrom, monthTo)[0];
    const last14 = calcPayroll([user], fortnightFrom, fortnightTo)[0];
    return { week, month, last14 };
  }, [user, calcPayroll]);

  // ── SWAP ELIGIBILITY — same platform AND same shift ──
  const swapEligible = useMemo(() =>
    agents.filter(a =>
      a.status === 'active' && a.role === ROLE_AGENT &&
      a.name !== user?.name &&
      (a.shift || 'Morning') === (user?.shift || 'Morning') &&
      a.platform === user?.platform
    ), [agents, user]);

  // Stable key for matching a request to its decision record.
  // Decisions carry `reqTimestamp` (the original request's timestamp) so they
  // resolve to the same key as the request. Fallback to `timestamp` for raw requests.
  const swapKey = s => `${s.from||''}|${s.to||''}|${s.platform||''}|${s.reqTimestamp || s.timestamp || ''}`;

  const pendingSwaps = useMemo(() => {
    // Build set of swap keys that already have an APPROVE or DENY decision
    const decided = new Set(
      swapReqs
        .filter(s => s.action === 'SWAP_APPROVE' || s.action === 'SWAP_DENY')
        .map(s => swapKey(s))
    );
    // Only show SWAP_REQUEST records with no matching decision yet
    return swapReqs.filter(s => s.action === 'SWAP_REQUEST' && !decided.has(swapKey(s)));
  }, [swapReqs]);

  // For agent's "my swaps" panel — deduplicate by key, keep most recent record
  const mySwaps = useMemo(() => {
    const mine = swapReqs.filter(s => s.from === user?.name || s.to === user?.name);
    // Keep only decided swaps (approved/denied) — no point showing pending in agent view
    // Deduplicate: one entry per swap key, decision record wins over request record
    const map = {};
    mine.forEach(s => {
      const k = swapKey(s);
      if (!map[k] || s.action === 'SWAP_APPROVE' || s.action === 'SWAP_DENY') map[k] = s;
    });
    return Object.values(map).filter(s =>
      s.action === 'SWAP_APPROVE' || s.action === 'SWAP_DENY' ||
      s.status === 'approved'     || s.status === 'denied'
    );
  }, [swapReqs, user]);
  const escKey = e => `${e.agent}|${e.date}|${e.time}|${String(e.title||'').slice(0,20)}`;
  const openEscals    = useMemo(() => escals.filter(e => !e.resolved), [escals]);
  // For each escalation, get the list of managers who acknowledged it
  const escAckMap = useMemo(() => {
    const map = {};
    escAcks.forEach(a => {
      if (!map[a.escKey]) map[a.escKey] = [];
      map[a.escKey].push(a.agent);
    });
    return map;
  }, [escAcks]);

  const exportAttCSV = () => {
    const rows = [['Agent','Position','Dept','Shift','Clock In','Clock Out','Break','Pause','Net Work','Overtime','Shift%','Status','Late']];
    attend.forEach(a => rows.push([
      a.name, a.position || 'Agent', a.platform, a.shift || 'Morning',
      a.ci ? phTimeShort(a.ci) : '-', a.co ? phTimeShort(a.co) : '-',
      fmtS(a.totB), fmtS(a.totP), fmtS(a.nMs), fmtS(a.otMs),
      `${a.sPct.toFixed(0)}%`, a.status.label, a.lateMs > 0 ? fmtS(a.lateMs) : '-',
    ]));
    const b = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = `attendance_${tsKey()}.csv`; a.click();
  };

  const exportPayCSV = () => {
    const rows = [['Agent','Position','Dept','Days Worked','Total Hours','OT Hours','Daily Rate','Regular Pay','OT Pay','Gross Pay']];
    payrollData.forEach(a => rows.push([
      a.name, a.position || 'Agent', a.platform, a.daysWorked,
      fmtS(a.totalShiftMs), fmtS(a.totalOtMs),
      `USD ${a.dailyRate.toFixed(2)}`, `USD ${a.regularPay.toFixed(2)}`,
      `USD ${a.otPay.toFixed(2)}`, `USD ${a.grossPay.toFixed(2)}`,
    ]));
    const b = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = `payroll_${tsKey()}.csv`; a.click();
  };

  const timeLabel = new Date(now).toLocaleTimeString('en-PH', { timeZone: PH_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateLabel = new Date(now).toLocaleDateString('en-PH', { timeZone: PH_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div id="orbs"><div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" /></div>
      {busy && <div id="loader" />}
      <div id="toast" className={`${toast.kind} ${toast.msg ? '' : 'hide'}`}>{toast.msg}</div>

      <div id="shell">

        {/* TOP BAR */}
        <div id="topbar">
          <div>
            <div className="logo-text">AFTERSALES</div>
            <div className="logo-sub">WORKFORCE MANAGEMENT v4.0</div>
          </div>
          <div>
            <div className="clock-time">{timeLabel}</div>
            <div className="clock-date">{dateLabel}</div>
          </div>
        </div>

        {/* ══ LANDING ══ */}
        {view === 'landing' && (
          <div className="center">
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div className="hero fu">CLOCK IN.</div>
              <div className="herosub fu2">ATTENDANCE · PAYROLL · TEAM</div>
            </div>
            <button className="btn bt bw fu3" onClick={() => { setErr(''); setView('login'); }}>▶  SIGN IN</button>
            <button className="btn bg bw" onClick={() => { setErr(''); setOk(''); setView('register'); }}>CREATE ACCOUNT</button>
          </div>
        )}

        {/* ══ REGISTER ══ */}
        {view === 'register' && (
          <div className="center">
            <Glass style={{ width: '100%' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5 }}>Create Account</div>
                <div style={{ fontSize: 10, color: 'var(--sub)', letterSpacing: 3, fontFamily: 'var(--mono)', marginTop: 4 }}>ONBOARDING</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Display name" autoCapitalize="off" autoCorrect="off" autoComplete="username" onChange={e => setReg({ ...reg, name: e.target.value })} />
              <label className="lbl">PASSWORD</label>
              <input className="inp gap" type="password" placeholder="Min 4 characters" autoComplete="new-password" onChange={e => setReg({ ...reg, pin: e.target.value })} />
              <label className="lbl">DEPARTMENT</label>
              <select className="inp gap" onChange={e => {
                const dept = e.target.value;
                const lock = lockedShift(dept);
                setReg({ ...reg, platform: dept, shift: lock || reg.shift });
              }}>
                {Object.keys(DEPT_HUE).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <label className="lbl">POSITION / ROLE</label>
              <select className="inp gap" onChange={e => setReg({ ...reg, position: e.target.value })}>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {reg.platform !== 'MANAGER' && (
                lockedShift(reg.platform)
                  ? <div className="alert aok gap">🕘 Auto-assigned: <strong>Office (9:00 AM – 5:00 PM)</strong></div>
                  : <>
                    <label className="lbl">SHIFT SCHEDULE</label>
                    <select className="inp gap" value={reg.shift} onChange={e => setReg({ ...reg, shift: e.target.value })}>
                      {shiftsForDept(reg.platform).map(s => <option key={s.label} value={s.label}>{s.label} ({s.start}–{s.end}{s.overnight ? ' +1' : ''})</option>)}
                    </select>
                  </>
              )}
              {reg.platform === 'MANAGER' && (
                <>
                  <label className="lbl">ACTIVATION KEY</label>
                  <input className="inp gap" type="password" placeholder="Manager / Finance key" onChange={e => setMkey(e.target.value)} />
                </>
              )}
              {err && <div className="alert aer gap">⚠ {err}</div>}
              {ok  && <div className="alert aok gap">✓ {ok}</div>}
              <button className="btn bt bw" onClick={doRegister}>REGISTER</button>
              <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ LOGIN ══ */}
        {view === 'login' && (
          <div className="center">
            <Glass style={{ width: '100%' }}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -.5 }}>Welcome back</div>
                <div style={{ fontSize: 10, color: 'var(--sub)', letterSpacing: 3, fontFamily: 'var(--mono)', marginTop: 4 }}>SECURE ACCESS</div>
              </div>
              <label className="lbl">USERNAME</label>
              <input className="inp gap" placeholder="Your name" autoCapitalize="off" autoCorrect="off" autoComplete="username" onChange={e => setLogF({ ...logF, name: e.target.value })} />
              <label className="lbl">PASSWORD</label>
              <input className="inp" style={{ marginBottom: 20 }} type="password" autoComplete="current-password" onChange={e => setLogF({ ...logF, pin: e.target.value })} />
              {err && <div className="alert aer gap">⚠ {err}</div>}
              <button className="btn bt bw" onClick={doLogin}>ENTER</button>
              <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setView('landing')}>← BACK</button>
            </Glass>
          </div>
        )}

        {/* ══ AGENT PORTAL ══ */}
        {view === 'agent' && user && (() => {
          const sh = resolveShift(user.shift || 'Morning');
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingTop: 4 }}>

              {/* PROFILE BANNER */}
              <div className="profile-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="av" style={{ background: dg(user.platform), color: dc(user.platform), width: 44, height: 44, fontSize: 18 }}>{user.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: dc(user.platform), fontFamily: 'var(--mono)', marginTop: 2 }}>◆ {user.platform}</div>
                    <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 1 }}>
                      {user.position || 'Customer Service Agent'} · {sh.label} Shift ({sh.start}–{sh.end})
                      {dayOffs[user.name] !== undefined && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>· Day Off: Every {DAY_NAMES[dayOffs[user.name]]}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {isOnDayOff(user.name) && !rec.clockIn && <Chip color="var(--amber)">🏖 DAY OFF</Chip>}
                  <Chip color={agentSt.color}><Dot color={agentSt.color} pulse={agentSt.pulse} /> {agentSt.label}</Chip>
                </div>
              </div>

              {/* DAY OFF BLOCK — replaces session card when on day off and not already clocked in */}
              {isOnDayOff(user.name) && !rec.clockIn && (
                <div style={{ padding: '28px 24px', borderRadius: 16, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏖</div>
                  <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Today is your Day Off</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', fontFamily: 'var(--mono)', marginBottom: 16 }}>
                    {new Date().toLocaleDateString('en-PH', { timeZone: PH_TZ, weekday: 'long', month: 'long', day: 'numeric' })} · Rest well!
                  </div>
                  <div className="alert awn" style={{ maxWidth: 360, margin: '0 auto', justifyContent: 'center' }}>
                    Clock-in is disabled on your assigned day off. Contact your manager if this is incorrect.
                  </div>
                </div>
              )}

              {/* SHIFT COMPLETE BANNER */}
              {rec.clockedOut && rec.clockIn && (
                <div style={{ padding: '11px 16px', borderRadius: 12, background: 'rgba(100,116,139,.08)', border: '1px solid rgba(100,116,139,.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15 }}>✅</span>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--sub)', letterSpacing: 1 }}>SHIFT COMPLETE</div>
                      <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                        {phTimeShort(rec.clockIn)} – {rec.clockOutTs ? phTimeShort(rec.clockOutTs) : '?'} · {new Date(rec.clockIn).toLocaleDateString('en-PH', { timeZone: PH_TZ, month: 'short', day: 'numeric' })} · Clock out recorded
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--sub)' }}>{fmt(shMs)}</div>
                </div>
              )}

              {/* SESSION ACTIVE BANNER */}
              {rec.clockIn && !rec.clockedOut && (
                <div style={{ padding: '11px 16px', borderRadius: 12, background: rec.onPause ? 'rgba(249,115,22,0.08)' : 'rgba(34,211,165,0.07)', border: `1px solid ${rec.onPause ? 'rgba(249,115,22,0.3)' : 'rgba(34,211,165,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15 }}>{rec.onPause ? '⚠' : '🟢'}</span>
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: rec.onPause ? 'var(--orange)' : 'var(--teal)', letterSpacing: 1 }}>
                        {rec.onPause ? 'DUTY PAUSED' : 'SHIFT IN PROGRESS'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                        Clocked in at {phTimeShort(rec.clockIn)} · {new Date(rec.clockIn).toLocaleDateString('en-PH', { timeZone: PH_TZ, month: 'short', day: 'numeric' })} · Clock runs even when logged out
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: rec.onPause ? 'var(--orange)' : 'var(--teal)' }}>{fmt(shMs)}</div>
                </div>
              )}

              {/* ANNOUNCEMENT BANNERS — only unread, dismissible */}
              {anns.filter(a => !Array.isArray(seenAnns) || !seenAnns.includes(annId(a))).slice(0, 3).map((a) => (
                <div key={a.timestamp} style={{ padding: '11px 16px', borderRadius: 12, background: a.urgent ? 'rgba(244,63,94,.07)' : 'rgba(192,132,252,.07)', border: `1px solid ${a.urgent ? 'rgba(244,63,94,.25)' : 'rgba(192,132,252,.2)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {a.urgent && <span>🚨</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, color: a.urgent ? 'var(--red)' : 'var(--purple)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{a.urgent ? 'URGENT' : 'ANNOUNCEMENT'} — {a.from}</span>
                    <span style={{ fontSize: 10, color: 'var(--sub)', marginLeft: 8 }}>{a.date} {a.time}</span>
                    <button onClick={() => markAnnSeen(a)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }} title="Dismiss">✕</button>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.text}</div>
                </div>
              ))}

              <div className="g2">
                {/* LEFT — Session */}
                <Glass glow={`${agentSt.color}28`}>
                  {/* Ring + Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0 14px', flexWrap: 'wrap' }}>
                    <Ring pct={sPct} size={100} stroke={7} color={rec.onPause ? 'var(--orange)' : rec.onBreak ? 'var(--amber)' : 'var(--teal)'}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: rec.onPause ? 'var(--orange)' : rec.onBreak ? 'var(--amber)' : 'var(--teal)' }}>
                          {rec.clockIn ? `${~~(shMs / 3_600_000)}h${pad(~~(shMs % 3_600_000 / 60_000))}m` : '—'}
                        </div>
                      </div>
                    </Ring>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div className="bigtimer" style={{ fontSize: 'clamp(30px,6vw,52px)', color: rec.onPause ? 'var(--orange)' : rec.onBreak ? 'var(--amber)' : 'var(--teal)' }}>
                        {rec.onPause ? fmt(now - rec.pauseStart) : rec.onBreak ? fmt(now - rec.breakStart) : rec.clockIn ? fmt(shMs) : '--:--:--'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 5, fontFamily: 'var(--mono)' }}>
                        {rec.onPause ? 'DUTY PAUSED' : rec.onBreak ? 'CURRENT BREAK' : rec.clockIn ? 'SHIFT ELAPSED' : 'NOT CLOCKED IN'}
                      </div>
                      {rec.clockIn && <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2, fontFamily: 'var(--mono)' }}>In since {phTimeShort(rec.clockIn)}</div>}
                      {ot > 0 && <div style={{ fontSize: 11, color: 'var(--purple)', marginTop: 4, fontFamily: 'var(--mono)', fontWeight: 700 }}>+{fmtS(ot)} overtime</div>}
                    </div>
                  </div>

                  {/* Progress bars */}
                  {rec.clockIn && <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--sub)', marginBottom: 5 }}>
                        <span>SHIFT ELAPSED</span><span style={{ color: sPct >= 100 ? 'var(--teal)' : 'var(--text)' }}>{fmt(shMs)} / 8h</span>
                      </div>
                      <div className="pbar"><div className="pfill" style={{ width: `${sPct}%`, background: sPct >= 100 ? 'var(--teal)' : 'linear-gradient(90deg,var(--blue),var(--teal))' }} /></div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: bOvr ? 'var(--red)' : 'var(--sub)', marginBottom: 5 }}>
                        <span>BREAK USED</span><span style={{ color: bOvr ? 'var(--red)' : 'var(--text)' }}>{fmt(bMs)} / 1h</span>
                      </div>
                      <div className="pbar"><div className="pfill" style={{ width: `${bPct}%`, background: bOvr ? 'var(--red)' : 'var(--amber)' }} /></div>
                    </div>
                    {pauseMs > 0 && <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--sub)', marginBottom: 5 }}>
                        <span>DUTY PAUSED</span><span>{fmtS(pauseMs)}</span>
                      </div>
                      <div className="pbar"><div className="pfill" style={{ width: '100%', background: 'var(--orange)' }} /></div>
                    </div>}
                  </>}

                  {bOvr && <div className="alert aer" style={{ marginBottom: 10 }}>⚠ Break exceeded by {fmtS(bMs - BREAK_MAX)}</div>}
                  {sPct >= 100 && !rec.clockedOut && <div className="alert aok" style={{ marginBottom: 10 }}>✓ 8h target reached! {ot > 0 ? `+${fmtS(ot)} OT` : ''}</div>}

                  {/* Action buttons */}
                  <div className="actg">
                    <button className="btn bt" disabled={busy || isOnDayOff(user.name) || !(!rec.clockIn || rec.clockedOut)} onClick={() => doAction('clockIn')}>
                      {busy && !rec.clockIn ? '⏳ LOADING...' : isOnDayOff(user.name) && !rec.clockIn ? '🏖 DAY OFF' : '▶ CLOCK IN'}
                    </button>
                    <button className="btn br" disabled={!(rec.clockIn && !rec.onBreak && !rec.onPause && !rec.clockedOut)} onClick={() => doAction('clockOut')}>■ CLOCK OUT</button>
                    <button className="btn ba s2" disabled={!(rec.clockIn && !rec.onPause && !rec.clockedOut)} onClick={() => doAction(rec.onBreak ? 'breakEnd' : 'breakStart')}>
                      {rec.onBreak ? '▶ RESUME WORK' : '⏸ START BREAK'}
                    </button>
                    <button className={`btn s3 ${rec.onPause ? 'bt' : 'bo'}`} disabled={!(rec.clockIn && !rec.onBreak && !rec.clockedOut)} onClick={() => doAction(rec.onPause ? 'dutyResume' : 'dutyPause')}>
                      {rec.onPause ? '▶ RESUME DUTY' : '⚠ PAUSE DUTY'}
                    </button>
                  </div>

                  {/* Mini stats */}
                  {rec.clockIn && <div className="g3" style={{ marginTop: 12 }}>
                    <MiniStat label="ELAPSED" value={fmt(shMs)} color="var(--teal)" />
                    <MiniStat label="BREAK"   value={fmt(bMs)}  color={bOvr ? 'var(--red)' : 'var(--amber)'} />
                    <MiniStat label="WORKING" value={fmt(net)}  color="var(--sub)" />
                  </div>}
                  {busy && !rec.clockIn && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 6 }}>Checking your shift status...</div>}
                </Glass>

                {/* RIGHT — Quick actions + timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Notification bell with unread badge */}
                {(() => {
                  const unread = anns.filter(a => !Array.isArray(seenAnns) || !seenAnns.includes(annId(a))).length;
                  return (
                    <button style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'10px 16px',borderRadius:12,border:'1px solid rgba(192,132,252,.3)',background:'rgba(192,132,252,.08)',cursor:'pointer',width:'100%',color:'var(--purple)',fontWeight:700,fontSize:13,fontFamily:'var(--font)',position:'relative' }}
                      onClick={() => { setNotifTab(true); markAllAnnsSeen(anns); }}>
                      🔔 NOTIFICATIONS
                      {unread > 0 && <span style={{position:'absolute',top:8,right:12,background:'var(--red)',color:'#fff',borderRadius:'50%',width:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{unread}</span>}
                    </button>
                  );
                })()}
                <div className="g2sm">
                    <button className="btn bb" style={{ fontSize: 11 }} onClick={() => setSwapModal(true)}>⇄ SWAP SHIFT</button>
                    <button className="btn br" style={{ fontSize: 11 }} onClick={() => setEscalModal(true)}>🚨 ESCALATE</button>
                    <button className="btn bg" style={{ fontSize: 11 }} onClick={() => setMemoModal(true)}>📝 MEMO</button>
                    <button className="btn bt" style={{ fontSize: 11 }} onClick={() => setStatsModal(true)}>📊 MY STATS</button>
                    <button className="btn bg" style={{ fontSize: 11 }} onClick={() => { setPwErr(''); setPwForm({current:'',next:'',confirm:''}); setPwModal(true); }}>🔒 PASSWORD</button>
                    <button className="btn bg" style={{ fontSize: 11 }} onClick={fetch_}>↺ REFRESH</button>
                  </div>

                  {/* My swaps */}
                  {mySwaps.length > 0 && <Glass style={{ padding: 16 }}>
                    <SectionHead>Swap Results</SectionHead>
                    {mySwaps.slice(0, 5).map((s, i) => {
                      const approved = s.action === 'SWAP_APPROVE' || s.status === 'approved';
                      const denied   = s.action === 'SWAP_DENY'    || s.status === 'denied';
                      return (
                        <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>
                                {s.from === user.name ? `You → ${s.to}` : `${s.from} → You`} · {s.fromShift}
                              </div>
                              {s.note && <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2, fontStyle: 'italic' }}>"{s.note}"</div>}
                              {s.decidedBy && <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2, fontFamily: 'var(--mono)' }}>by {s.decidedBy}</div>}
                            </div>
                            <Chip color={approved ? 'var(--teal)' : 'var(--red)'}>
                              {approved ? '✓ APPROVED' : '✕ DENIED'}
                            </Chip>
                          </div>
                        </div>
                      );
                    })}
                  </Glass>}

                  {/* My Escalations — status feedback for agents */}
                  {(() => {
                    const myEscals = escals.filter(e => e.agent === user.name).slice(0, 3);
                    if (!myEscals.length) return null;
                    return (
                      <Glass style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 14 }}>🚨</span>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>My Escalations</div>
                        </div>
                        {myEscals.map((e, i) => {
                          const key = escKey(e);
                          const ackedBy = escAckMap[key] || [];
                          return (
                            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 12 }}>{e.urgent ? '🚨 ' : ''}{e.title}</div>
                                  <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 2 }}>{e.date} {e.time}</div>
                                </div>
                                {ackedBy.length > 0
                                  ? <Chip color="var(--teal)">✓ Seen by {ackedBy.join(', ')}</Chip>
                                  : <Chip color="var(--sub)">Pending review</Chip>
                                }
                              </div>
                            </div>
                          );
                        })}
                      </Glass>
                    );
                  })()}

                  {/* Handover Memos — latest memos from same platform teammates */}
                  {(() => {
                    const handoverMemos = memos.filter(m =>
                      m.agent !== user.name &&
                      agents.find(a => a.name === m.agent && a.platform === user.platform && (a.shift || 'Morning') === (user.shift || 'Morning'))
                    ).slice(0, 3);
                    if (!handoverMemos.length) return null;
                    return (
                      <Glass style={{ padding: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ fontSize: 14 }}>📋</span>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Handover Notes</div>
                          <span style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginLeft: 4 }}>from your team</span>
                        </div>
                        {handoverMemos.map((m, i) => (
                          <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--sub)', marginBottom: 4 }}>
                              <span style={{ color: dc(agents.find(a => a.name === m.agent)?.platform), fontWeight: 700 }}>{m.agent}</span>
                              <span>{m.date} {m.time}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{m.text}</div>
                          </div>
                        ))}
                      </Glass>
                    );
                  })()}

                  {/* Today's timeline */}
                  <Glass style={{ flex: 1 }}>
                    <SectionHead>
                      Today's Timeline
                      <span style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>{phDateShort(Date.now())}</span>
                    </SectionHead>
                    {logs.filter(l => l.agent === user.name && l.timestamp >= todayMs()).sort((a, b) => a.timestamp - b.timestamp).length === 0
                      ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '24px 0', fontSize: 13 }}>No activity yet.</div>
                      : <div className="tl">
                        {logs.filter(l => l.agent === user.name && l.timestamp >= todayMs()).sort((a, b) => a.timestamp - b.timestamp).map((l, i) => (
                          <div className="tlrow" key={i}>
                            <div className="tldot" style={{ background: AC[l.action] || 'var(--sub)' }} />
                            <div className="tlt">{l.time}</div>
                            <div className="tla" style={{ color: AC[l.action] || 'var(--text)' }}>{AI[l.action]} {AL[l.action] || l.action}</div>
                          </div>
                        ))}
                      </div>
                    }
                  </Glass>
                  <button className="btn bg bw" style={{ color: 'var(--red)', borderColor: 'rgba(244,63,94,.2)' }} onClick={logout}>LOGOUT</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ FINANCE PORTAL ══ */}
        {view === 'finance' && user && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>FINANCE PORTAL</div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, marginTop: 2 }}>{user.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 40, background: 'rgba(192,132,252,.15)', border: '1px solid rgba(192,132,252,.3)', color: 'var(--purple)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: 'var(--mono)' }}>
                    <Dot color="var(--purple)" pulse /> ON CALL · FINANCE
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn bg" style={{ fontSize: 11 }} onClick={() => { setPwErr(''); setPwForm({current:'',next:'',confirm:''}); setPwModal(true); }}>🔒 PASSWORD</button>
                <button className="btn bg" style={{ color: 'var(--red)' }} onClick={logout}>LOGOUT</button>
              </div>
            </div>

            {/* Payroll section directly */}
            <PayrollPanel payrollData={payrollData} payPeriod={payPeriod} setPayPeriod={setPayPeriod}
              payStart={payStart} setPayStart={setPayStart} payEnd={payEnd} setPayEnd={setPayEnd}
              payRange={payRange} exportPayCSV={exportPayCSV} setPayModal={setPayModal}
              agents={agents} logs={logs} />
          </div>
        )}

        {/* ══ MANAGER PORTAL ══ */}
        {view === 'mgr' && user && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>MANAGER PORTAL</div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -.5, marginTop: 2 }}>{user.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 14px', borderRadius: 40, background: 'rgba(192,132,252,.15)', border: '1px solid rgba(192,132,252,.3)', color: 'var(--purple)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: 'var(--mono)' }}>
                    <Dot color="var(--purple)" pulse /> ON CALL
                  </div>
                  {openEscals.length > 0 && <Chip color="var(--red)">🚨 {openEscals.length} ESCALATION{openEscals.length !== 1 ? 'S' : ''}</Chip>}
                  {pendingSwaps.length > 0 && <Chip color="var(--amber)">⇄ {pendingSwaps.length} SWAP{pendingSwaps.length !== 1 ? 'S' : ''}</Chip>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {(() => {
                  const unread = anns.filter(a => !Array.isArray(seenAnns) || !seenAnns.includes(annId(a))).length;
                  return (
                    <button style={{ position:'relative',display:'flex',alignItems:'center',gap:6,padding:'10px 14px',borderRadius:12,border:'1px solid rgba(192,132,252,.3)',background:'rgba(192,132,252,.08)',cursor:'pointer',color:'var(--purple)',fontWeight:700,fontSize:12,fontFamily:'var(--font)' }}
                      onClick={() => { setNotifTab(true); markAllAnnsSeen(anns); }}>
                      🔔 NOTIFS
                      {unread > 0 && <span style={{position:'absolute',top:6,right:6,background:'var(--red)',color:'#fff',borderRadius:'50%',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700}}>{unread}</span>}
                    </button>
                  );
                })()}
                <button className="btn bp" style={{ fontSize: 11 }} onClick={() => setAnnModal(true)}>📢 ANNOUNCE</button>
                <button className="btn bg" style={{ fontSize: 11 }} onClick={() => { setPwErr(''); setPwForm({current:'',next:'',confirm:''}); setPwModal(true); }}>🔒 PASSWORD</button>
                <button className="btn bg" style={{ color: 'var(--red)', fontSize: 11 }} onClick={logout}>LOGOUT</button>
              </div>
            </div>

            <div className="tabs">
              {['attendance','payroll','swaps','escalations','schedule','team','logs','onboarding'].map(t => {
                const pendingCount = agents.filter(a => a.status === 'pending').length;
                let label = t.toUpperCase();
                if (t === 'swaps' && pendingSwaps.length > 0) label = `SWAPS (${pendingSwaps.length})`;
                else if (t === 'escalations' && openEscals.length > 0) label = `🚨 ESC (${openEscals.length})`;
                else if (t === 'onboarding') label = pendingCount > 0 ? `AGENTS (${pendingCount})` : 'AGENTS';
                return (
                  <button key={t} className={`btn-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ATTENDANCE */}
            {tab === 'attendance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="g4">
                  {[
                    { l: 'ON SHIFT',     v: attend.filter(a => a.status === ST.ACTIVE).length,  c: 'var(--teal)', g: 'rgba(34,211,165,.1)' },
                    { l: 'ON BREAK',     v: attend.filter(a => a.status === ST.BREAK).length,   c: 'var(--amber)',g: 'rgba(245,158,11,.1)' },
                    { l: 'DUTY PAUSED', v: attend.filter(a => a.status === ST.PAUSED).length,  c: 'var(--orange)',g:'rgba(249,115,22,.1)' },
                    { l: 'NOT IN',       v: attend.filter(a => a.status === ST.PENDING || a.status === ST.OUT).length, c: 'var(--sub)', g: 'rgba(100,116,139,.07)' },
                  ].map(s => (
                    <div key={s.l} className="sc" style={{ background: s.g, border: `1px solid ${s.c}22` }}>
                      <div className="sv" style={{ color: s.c }}>{s.v}</div>
                      <div className="sl">{s.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn bg" style={{ fontSize: 11 }} onClick={exportAttCSV}>↓ CSV</button>
                  <button className="btn bg" style={{ fontSize: 11 }} onClick={fetch_}>↺ REFRESH</button>
                </div>
                <Glass style={{ padding: 8 }}>
                  {attend.length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: 28 }}>No active agents.</div>
                    : attend.map(a => (
                      <div key={a.name} className="arow" onClick={() => setModal(a)}>
                        <Ring pct={a.sPct} size={50} stroke={4} color={a.status.color}>
                          <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', color: a.status.color }}>{a.sPct.toFixed(0)}%</div>
                        </Ring>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {a.name}
                            {isOnDayOff(a.name) && <Chip color="var(--amber)" small>🏖 DAY OFF</Chip>}
                            {a.lateMs > 0 && <Chip color="var(--amber)" small>LATE</Chip>}
                            {a.otMs > 0 && <Chip color="var(--purple)" small>OT</Chip>}
                            {a.status === ST.PAUSED && <Chip color="var(--orange)" small>PAUSED</Chip>}
                          </div>
                          <div style={{ fontSize: 10, color: dc(a.platform), fontFamily: 'var(--mono)', marginTop: 2 }}>◆ {a.platform} · {a.position || 'Agent'} · {resolveShift(a.shift || 'Morning').label}</div>
                          {a.ci && <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                            IN {phTimeShort(a.ci)}
                            {a.co && ` · OUT ${phTimeShort(a.co)}`}
                            {a.lateMs > 0 && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>+{fmtS(a.lateMs)} late</span>}
                          </div>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                          <Chip color={a.status.color}><Dot color={a.status.color} pulse={a.status.pulse} />{a.status.label}</Chip>
                          {a.ci && <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>
                            <div style={{ color: a.bOvr ? 'var(--red)' : 'var(--sub)' }}>BRK {fmtS(a.totB)}{a.bOvr ? ' ⚠' : ''}</div>
                            <div style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 13, marginTop: 1 }}>{fmt(a.nMs)}</div>
                          </div>}
                        </div>
                      </div>
                    ))}
                </Glass>
                {/* Today's memos */}
                {memos.filter(m => new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: PH_TZ }) === tsKey()).length > 0 && (
                  <Glass>
                    <SectionHead>📝 Today's Memos</SectionHead>
                    {memos.filter(m => new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: PH_TZ }) === tsKey()).slice(0, 5).map((m, i) => (
                      <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--sub)', marginBottom: 4 }}>
                          <span style={{ color: dc(agents.find(a => a.name === m.agent)?.platform) }}>{m.agent}</span>
                          <span>{m.time}</span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.text}</div>
                      </div>
                    ))}
                  </Glass>
                )}
              </div>
            )}

            {/* PAYROLL */}
            {tab === 'payroll' && (
              <PayrollPanel payrollData={payrollData} payPeriod={payPeriod} setPayPeriod={setPayPeriod}
                payStart={payStart} setPayStart={setPayStart} payEnd={payEnd} setPayEnd={setPayEnd}
                payRange={payRange} exportPayCSV={exportPayCSV} setPayModal={setPayModal}
                agents={agents} logs={logs} />
            )}

            {/* SWAPS */}
            {tab === 'swaps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="g2sm">
                  <div className="sc" style={{ background: 'rgba(56,189,248,.08)', border: '1px solid rgba(56,189,248,.2)' }}>
                    <div className="sv" style={{ color: 'var(--blue)' }}>{pendingSwaps.length}</div>
                    <div className="sl">PENDING</div>
                  </div>
                  <div className="sc" style={{ background: 'rgba(34,211,165,.08)', border: '1px solid rgba(34,211,165,.2)' }}>
                    <div className="sv" style={{ color: 'var(--teal)' }}>{swapReqs.filter(s => s.action === 'SWAP_APPROVE' || s.status === 'approved').length}</div>
                    <div className="sl">APPROVED</div>
                  </div>
                </div>
                <Glass>
                  <SectionHead>Pending Swap Requests</SectionHead>
                  {pendingSwaps.length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '16px 0', fontSize: 13 }}>No pending swaps.</div>
                    : pendingSwaps.map((s, i) => (
                      <div key={i} style={{ padding: 14, borderRadius: 12, marginBottom: 10, background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.07)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>
                              <span style={{ color: 'var(--teal)' }}>{s.from}</span>
                              <span style={{ color: 'var(--sub)', margin: '0 8px' }}>⇄</span>
                              <span style={{ color: 'var(--blue)' }}>{s.to}</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 3 }}>
                              {s.platform} · {s.fromShift} shift · {s.date}
                            </div>
                            {s.note && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 5, fontStyle: 'italic' }}>"{s.note}"</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                            <button className="btn bt" style={{ fontSize: 11, minHeight: 36, padding: '7px 14px' }} onClick={() => doSwapDecision(s, 'approve')}>APPROVE</button>
                            <button className="btn br" style={{ fontSize: 11, minHeight: 36, padding: '7px 14px' }} onClick={() => doSwapDecision(s, 'deny')}>DENY</button>
                          </div>
                        </div>
                      </div>
                    ))}
                </Glass>
                <Glass>
                  <SectionHead>Swap History</SectionHead>
                  <div className="tbl-wrap">
                    <table className="tbl" style={{ minWidth: 520 }}>
                      <thead><tr><th>DATE</th><th>FROM</th><th>TO</th><th>DEPT</th><th>SHIFT</th><th>STATUS</th><th>DECIDED BY</th></tr></thead>
                      <tbody>
                        {(() => {
                          // Deduplicate: one row per unique swap, showing final status
                          const map = {};
                          swapReqs.forEach(s => {
                            const k = swapKey(s);
                            if (!map[k] || s.action === 'SWAP_APPROVE' || s.action === 'SWAP_DENY') map[k] = s;
                          });
                          return Object.values(map).slice(0, 30).map((s, i) => (
                          <tr key={i}>
                            <td style={{ color: 'var(--sub)', fontSize: 10 }}>{s.date}</td>
                            <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{s.from}</td>
                            <td style={{ fontWeight: 700, color: 'var(--blue)' }}>{s.to}</td>
                            <td style={{ fontSize: 11 }}>{s.platform}</td>
                            <td style={{ fontSize: 11 }}>{s.fromShift}</td>
                            <td><Chip color={(s.action==='SWAP_APPROVE'||s.status==='approved') ? '#22d3a5' : (s.action==='SWAP_DENY'||s.status==='denied') ? '#f43f5e' : '#f59e0b'}>{s.action==='SWAP_APPROVE'||s.status==='approved' ? 'APPROVED' : s.action==='SWAP_DENY'||s.status==='denied' ? 'DENIED' : 'PENDING'}</Chip></td>
                            <td style={{ fontSize: 11, color: 'var(--sub)' }}>{s.decidedBy || '—'}</td>
                          </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </Glass>
              </div>
            )}

            {/* ESCALATIONS */}
            {tab === 'escalations' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div className="sc" style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.2)' }}>
                    <div className="sv" style={{ color: 'var(--red)' }}>{openEscals.filter(e => e.urgent).length}</div>
                    <div className="sl">URGENT OPEN</div>
                  </div>
                  <div className="sc" style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)' }}>
                    <div className="sv" style={{ color: 'var(--amber)' }}>{openEscals.filter(e => !e.urgent).length}</div>
                    <div className="sl">STANDARD OPEN</div>
                  </div>
                  <div className="sc" style={{ background: 'rgba(34,211,165,.08)', border: '1px solid rgba(34,211,165,.2)' }}>
                    <div className="sv" style={{ color: 'var(--teal)' }}>{openEscals.filter(e => (escAckMap[escKey(e)]||[]).length > 0).length}</div>
                    <div className="sl">ACKNOWLEDGED</div>
                  </div>
                </div>
                <Glass>
                  <SectionHead>Open Escalations</SectionHead>
                  {openEscals.length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '16px 0' }}>All clear!</div>
                    : openEscals.map((e, i) => {
                      const key = escKey(e);
                      const ackedBy = escAckMap[key] || [];
                      const myAck = ackedBy.includes(user?.name);
                      return (
                        <div key={i} style={{ padding: 14, borderRadius: 12, marginBottom: 10, background: e.urgent ? 'rgba(244,63,94,.07)' : 'rgba(245,158,11,.06)', border: `1px solid ${e.urgent ? (ackedBy.length ? 'rgba(244,63,94,.15)' : 'rgba(244,63,94,.25)') : (ackedBy.length ? 'rgba(245,158,11,.12)' : 'rgba(245,158,11,.2)')}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{e.urgent && '🚨 '}{e.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 3 }}>{e.agent} · {e.date} {e.time}</div>
                              {e.detail && <div style={{ fontSize: 13, marginTop: 5, lineHeight: 1.5 }}>{e.detail}</div>}
                            </div>
                            <Chip color={e.urgent ? 'var(--red)' : 'var(--amber)'}>{e.urgent ? 'URGENT' : 'STANDARD'}</Chip>
                          </div>
                          {/* Acknowledge row */}
                          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              {ackedBy.length > 0
                                ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                    {ackedBy.map((name, j) => (
                                      <span key={j} style={{ padding: '2px 9px', borderRadius: 20, background: 'rgba(34,211,165,.12)', color: 'var(--teal)', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700 }}>✓ {name}</span>
                                    ))}
                                  </div>
                                : <span style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>No acknowledgement yet</span>
                              }
                            </div>
                            {myAck
                              ? <span style={{ fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--mono)', fontWeight: 700 }}>✓ YOU ACKNOWLEDGED</span>
                              : <button className="btn bt" style={{ fontSize: 11, minHeight: 32, padding: '6px 14px' }} onClick={() => doAckEscalation(e)}>✓ ACKNOWLEDGE</button>
                            }
                          </div>
                        </div>
                      );
                    })}
                </Glass>
              </div>
            )}

            {/* TEAM */}
            {/* ── SCHEDULE / DAY OFF TAB ── */}
            {tab === 'schedule' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Weekly roster overview */}
                <Glass>
                  <SectionHead>Weekly Day-Off Roster</SectionHead>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
                    {DAY_NAMES.map((day, dow) => {
                      const offAgents = agents.filter(a => a.status === 'active' && a.role === ROLE_AGENT && dayOffs[a.name] === dow);
                      const isToday = todayDowPH() === dow;
                      return (
                        <div key={dow} style={{ borderRadius: 12, padding: '10px 8px', background: isToday ? 'rgba(56,189,248,0.1)' : 'rgba(0,0,0,0.25)', border: `1px solid ${isToday ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.07)'}`, textAlign: 'center', minHeight: 80 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, fontFamily: 'var(--mono)', color: isToday ? 'var(--blue)' : 'var(--sub)', marginBottom: 6 }}>{DAY_SHORT[dow]}{isToday ? ' ←' : ''}</div>
                          {offAgents.length === 0
                            ? <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)', fontFamily: 'var(--mono)' }}>—</div>
                            : offAgents.map(a => (
                              <div key={a.name} style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--mono)', marginBottom: 2, lineHeight: 1.4 }}>🏖 {a.name}</div>
                            ))
                          }
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', textAlign: 'center', marginTop: 4 }}>
                    {Object.keys(dayOffs).length} / {agents.filter(a=>a.status==='active'&&a.role===ROLE_AGENT).length} agents have day off assigned
                  </div>
                </Glass>

                {/* Per-agent day off assignment */}
                <Glass>
                  <SectionHead>Assign Day Off</SectionHead>
                  {agents.filter(a => a.status === 'active').map(agent => {
                    const currentDow = dayOffs[agent.name];
                    const isEditing = editDayOff?.name === agent.name;
                    return (
                      <div key={agent.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
                        <div className="av" style={{ background: dg(agent.platform), color: dc(agent.platform) }}>{agent.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.name}</div>
                          <div style={{ fontSize: 10, color: dc(agent.platform), fontFamily: 'var(--mono)', marginTop: 2 }}>{agent.platform} · {agent.position || 'Agent'}{agent.role === ROLE_MANAGER ? ' · Manager' : ''}</div>
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {DAY_NAMES.map((day, dow) => (
                              <button key={dow} className={`btn ${currentDow === dow ? 'ba' : 'bg'}`}
                                style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }}
                                onClick={() => doSetDayOff(agent.name, dow)}>
                                {DAY_SHORT[dow]}
                              </button>
                            ))}
                            {currentDow !== undefined && <button className="btn br" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }} onClick={() => doSetDayOff(agent.name, null)}>CLEAR</button>}
                            <button className="btn bg" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }} onClick={() => setEditDayOff(null)}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {currentDow !== undefined
                              ? <Chip color="var(--amber)">🏖 {DAY_NAMES[currentDow]}</Chip>
                              : <span style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>Not set</span>
                            }
                            {isOnDayOff(agent.name) && <Chip color="var(--red)" small>OFF TODAY</Chip>}
                            <button className="btn bg" style={{ fontSize: 11, minHeight: 34, padding: '6px 14px' }}
                              onClick={() => setEditDayOff({ name: agent.name })}>
                              {currentDow !== undefined ? '✎ CHANGE' : '+ ASSIGN'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Glass>
              </div>
            )}

            {tab === 'team' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Glass>
                  <SectionHead>Shift Breakdown</SectionHead>
                  {SHIFTS.map(shift => {
                    const inShift = agents.filter(a => a.status === 'active' && a.role === ROLE_AGENT && (a.shift || 'Morning') === shift.label);
                    if (!inShift.length) return null;
                    return (
                      <div key={shift.label} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{shift.label} Shift</span>
                            <span style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', marginLeft: 8 }}>{shift.start}–{shift.end}{shift.overnight ? ' (+1)' : ''}</span>
                          </div>
                          <Chip color="var(--blue)">{inShift.length} agent{inShift.length !== 1 ? 's' : ''}</Chip>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {inShift.map(a => (
                            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: dg(a.platform), borderRadius: 20, border: `1px solid ${dc(a.platform)}30` }}>
                              <Dot color={dc(a.platform)} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{a.name}</div>
                                <div style={{ fontSize: 9, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>{a.position || 'Agent'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </Glass>
                <Glass>
                  <SectionHead>
                    Broadcast History
                    <button className="btn bp" style={{ fontSize: 11, minHeight: 36, padding: '7px 14px' }} onClick={() => { setAnnModal(true); markAllAnnsSeen(anns); }}>+ NEW</button>
                  </SectionHead>
                  {anns.length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '14px 0', fontSize: 13 }}>No announcements yet.</div>
                    : anns.slice(0, 10).map((a, i) => {
                      const ackList = acks.filter(k => k.annTs === a.timestamp);
                      const totalAgents = agents.filter(ag => ag.status === 'active' && ag.role === ROLE_AGENT).length;
                      const pct = totalAgents > 0 ? Math.round((ackList.length / totalAgents) * 100) : 0;
                      return (
                        <div key={i} style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 8, background: a.urgent ? 'rgba(244,63,94,.07)' : 'rgba(192,132,252,.07)', border: `1px solid ${a.urgent ? 'rgba(244,63,94,.2)' : 'rgba(192,132,252,.2)'}` }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            {a.urgent && <span>🚨</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, color: a.urgent ? 'var(--red)' : 'var(--purple)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{a.urgent ? 'URGENT' : 'BROADCAST'}</span>
                            <span style={{ fontSize: 10, color: 'var(--sub)', marginLeft: 'auto' }}>{a.date} {a.time}</span>
                          </div>
                          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{a.text}</div>
                          {/* Acknowledgement tracker */}
                          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>READ BY</span>
                              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700, color: ackList.length === totalAgents && totalAgents > 0 ? 'var(--teal)' : 'var(--amber)' }}>
                                {ackList.length} / {totalAgents} agents ({pct}%)
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--teal)' : 'var(--amber)', borderRadius: 2, transition: 'width .4s ease' }} />
                            </div>
                            {/* Agent name chips */}
                            {ackList.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {ackList.map((k, j) => (
                                  <span key={j} style={{ padding: '2px 9px', borderRadius: 20, background: 'rgba(34,211,165,.12)', color: 'var(--teal)', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                    ✓ {k.agent}
                                  </span>
                                ))}
                              </div>
                            )}
                            {ackList.length === 0 && <span style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>No acknowledgements yet</span>}
                          </div>
                        </div>
                      );
                    })}
                </Glass>
              </div>
            )}

            {/* LOGS — default to today, date picker for history */}
            {tab === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Glass style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>DATE</div>
                    <input className="inp" type="date" value={logDate} onChange={e => setLogDate(e.target.value)} style={{ width: 'auto', padding: '9px 14px', fontSize: 14 }} />
                    <button className="btn bg" style={{ fontSize: 11, minHeight: 38, padding: '8px 14px' }} onClick={() => setLogDate(tsKey())}>TODAY</button>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>{filtLogs.length} entries · {new Date(logDate + 'T12:00:00+08:00').toLocaleDateString('en-PH', { timeZone: PH_TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  </div>
                </Glass>
                <Glass style={{ padding: 0 }} className="tbl-wrap">
                  <table className="tbl" style={{ minWidth: 520 }}>
                    <thead><tr><th>TIME</th><th>AGENT</th><th>POSITION</th><th>ACTION</th><th>AUDIT</th></tr></thead>
                    <tbody>
                      {filtLogs.sort((a, b) => a.timestamp - b.timestamp).map((l, i) => (
                        <tr key={i}>
                          <td style={{ color: AC[l.action] || 'var(--teal)', fontWeight: 700, whiteSpace: 'nowrap' }}>{l.time}</td>
                          <td style={{ fontWeight: 700 }}>{l.agent}</td>
                          <td style={{ fontSize: 10, color: 'var(--sub)' }}>{agents.find(a => a.name === l.agent)?.position || '—'}</td>
                          <td><span style={{ color: AC[l.action] || 'var(--sub)', fontWeight: 600, fontSize: 12 }}>{AI[l.action] || '·'} {AL[l.action] || l.action}</span></td>
                          <td style={{ fontSize: 10, color: 'var(--sub)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.device}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtLogs.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--sub)' }}>No entries for this date.</div>}
                </Glass>
              </div>
            )}

            {/* ONBOARDING */}
            {tab === 'onboarding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                {/* Pending Activation Queue */}
                <Glass>
                  <SectionHead>
                    Activation Queue
                    <Chip color="var(--amber)">{agents.filter(a => a.status === 'pending').length} PENDING</Chip>
                  </SectionHead>
                  <label className="lbl">DEFAULT MONTHLY SALARY FOR APPROVAL (USD)</label>
                  <input className="inp gap" placeholder="e.g. 260" type="number" inputMode="numeric" value={sal} onChange={e => setSal(e.target.value)} />
                  {agents.filter(a => a.status === 'pending').length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '14px 0', fontFamily: 'var(--mono)', fontSize: 12 }}>No pending registrations.</div>
                    : agents.filter(a => a.status === 'pending').map(a => (
                      <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,.05)', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{a.name}</div>
                          <div style={{ fontSize: 10, color: dc(a.platform), fontFamily: 'var(--mono)', letterSpacing: 1, marginTop: 3 }}>
                            {a.platform} · {a.position || 'Agent'} · {resolveShift(a.shift || 'Morning').label} ({resolveShift(a.shift || 'Morning').start}–{resolveShift(a.shift || 'Morning').end})
                          </div>
                        </div>
                        <button className="btn bt" style={{ fontSize: 11 }} onClick={async () => {
                          if (!sal) return showToast('Assign salary first', 'err');
                          await post({ date: phNowDate(), time: phNowTime(), action: 'USER_APPROVE', agent: a.name, device: JSON.stringify({ ...a, salary: Number(sal) }), timestamp: Date.now() });
                          fetch_();
                        }}>ACTIVATE</button>
                      </div>
                    ))}
                </Glass>

                {/* Active Roster — full management */}
                <Glass>
                  <SectionHead>
                    Active Roster
                    <Chip color="var(--teal)">{agents.filter(a => a.status === 'active').length} ACTIVE</Chip>
                  </SectionHead>
                  {agents.filter(a => a.status === 'active').length === 0
                    ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '14px 0', fontSize: 12 }}>No active accounts.</div>
                    : agents.filter(a => a.status === 'active').sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                      <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap' }}>
                        <div className="av" style={{ background: dg(a.platform), color: dc(a.platform) }}>{a.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {a.name}
                            {a.role === ROLE_MANAGER && <Chip color="var(--purple)" small>MGR</Chip>}
                            {a.role === ROLE_FINANCE && <Chip color="var(--blue)" small>FIN</Chip>}
                          </div>
                          <div style={{ fontSize: 10, color: dc(a.platform), fontFamily: 'var(--mono)', marginTop: 2 }}>
                            {a.platform} · {a.position || 'Agent'} · {resolveShift(a.shift || 'Morning').label} · {currency(a.salary || 0)}/mo
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn bg" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }}
                            onClick={() => { setEditAgent(a); setEditForm({ position: a.position || POSITIONS[0], platform: a.platform, shift: a.shift || 'Morning', salary: String(a.salary || 0) }); }}>
                            ✎ EDIT
                          </button>
                          <button className="btn bg" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }}
                            onClick={() => { setResetAgent(a); setResetForm(''); }}>
                            🔑 RESET PW
                          </button>
                          {a.name !== user?.name && (
                            <button className="btn br" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }}
                              onClick={() => { if (window.confirm(`Deactivate ${a.name}? They will be hidden from attendance, payroll, and swap eligibility, but their history is preserved.`)) doToggleAgentStatus(a, true); }}>
                              ✕ DEACTIVATE
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </Glass>

                {/* Inactive Roster — reactivation */}
                {agents.filter(a => a.status === 'inactive').length > 0 && (
                  <Glass>
                    <SectionHead>
                      Inactive
                      <Chip color="var(--sub)">{agents.filter(a => a.status === 'inactive').length}</Chip>
                    </SectionHead>
                    {agents.filter(a => a.status === 'inactive').sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                      <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px', borderBottom: '1px solid rgba(255,255,255,.05)', flexWrap: 'wrap', opacity: 0.7 }}>
                        <div className="av" style={{ background: 'rgba(100,116,139,.15)', color: 'var(--sub)' }}>{a.name[0]}</div>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sub)' }}>{a.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                            {a.platform} · {a.position || 'Agent'}
                          </div>
                        </div>
                        <button className="btn bt" style={{ fontSize: 10, minHeight: 32, padding: '5px 10px' }}
                          onClick={() => doToggleAgentStatus(a, false)}>
                          ↺ REACTIVATE
                        </button>
                      </div>
                    ))}
                  </Glass>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {/* Agent Detail (Manager) */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: -.5 }}>{modal.name}</div>
                <div style={{ fontSize: 11, color: dc(modal.platform), letterSpacing: 1, marginTop: 2, fontFamily: 'var(--mono)' }}>◆ {modal.platform} · {modal.position || 'Agent'}</div>
                <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 2 }}>{resolveShift(modal.shift || 'Morning').label} Shift · {resolveShift(modal.shift || 'Morning').start}–{resolveShift(modal.shift || 'Morning').end}</div>
              </div>
              <Chip color={modal.status.color}><Dot color={modal.status.color} pulse={modal.status.pulse} />{modal.status.label}</Chip>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <Ring pct={modal.sPct} size={110} stroke={8} color={modal.status.color}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: modal.status.color }}>{modal.sPct.toFixed(0)}%</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--sub)', letterSpacing: 1 }}>SHIFT</div>
                </div>
              </Ring>
            </div>
            <div className="g3" style={{ marginBottom: 14 }}>
              <MiniStat label="CLOCK IN" value={modal.ci ? phTimeShort(modal.ci) : '—'} />
              <MiniStat label="BREAK" value={fmtS(modal.totB)} color={modal.bOvr ? 'var(--red)' : 'var(--amber)'} />
              <MiniStat label="NET WORK" value={fmt(modal.nMs)} color="var(--teal)" />
            </div>
            {modal.totP > 0 && <MiniStat label="DUTY PAUSED" value={fmtS(modal.totP)} color="var(--orange)" />}
            {modal.otMs > 0 && <div style={{ marginTop: 8 }}><MiniStat label="OVERTIME" value={fmtS(modal.otMs)} color="var(--purple)" /></div>}
            {modal.lateMs > 0 && <div className="alert awn" style={{ marginTop: 10 }}>⚠ Arrived {fmtS(modal.lateMs)} late</div>}
            {modal.bOvr && <div className="alert aer" style={{ marginTop: 8 }}>⚠ Break over by {fmtS(modal.totB - BREAK_MAX)}</div>}
            <Sep />
            <SectionHead>Today's Activity</SectionHead>
            {modal.tl.length === 0
              ? <div style={{ color: 'var(--sub)', padding: '12px 0', textAlign: 'center' }}>No activity today.</div>
              : <div className="tl">
                {modal.tl.map((l, i) => (
                  <div className="tlrow" key={i}>
                    <div className="tldot" style={{ background: AC[l.action] || 'var(--sub)' }} />
                    <div className="tlt">{l.time}</div>
                    <div className="tla" style={{ color: AC[l.action] || 'var(--text)' }}>{AI[l.action]} {AL[l.action] || l.action}</div>
                  </div>
                ))}
              </div>}
            <button className="btn bg bw" style={{ marginTop: 18 }} onClick={() => setModal(null)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Swap Request */}
      {swapModal && (
        <div className="overlay" onClick={() => setSwapModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Request Shift Swap</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 12 }}>SAME DEPARTMENT + SAME SHIFT · MANAGER APPROVAL REQUIRED</div>
            {user && (() => { const sh = resolveShift(user.shift || 'Morning'); return (
              <div className="alert aok" style={{ marginBottom: 14 }}>
                Your shift: <strong>{user.platform} · {sh.label} ({sh.start}–{sh.end}{sh.overnight ? ' +1' : ''})</strong>
              </div>
            ); })()}
            {swapEligible.length === 0
              ? <div className="alert awn" style={{ marginBottom: 14 }}>No agents in {user?.platform} on the {resolveShift(user?.shift || 'Morning').label} shift available to swap with.</div>
              : <>
                <label className="lbl">SELECT AGENT TO SWAP WITH</label>
                <select className="inp gap" value={swapTarget} onChange={e => setSwapTarget(e.target.value)}>
                  <option value="">— Choose agent —</option>
                  {swapEligible.map(a => <option key={a.name} value={a.name}>{a.name} · {a.position || 'Agent'}</option>)}
                </select>
                <label className="lbl">REASON (OPTIONAL)</label>
                <textarea className="inp" style={{ minHeight: 80, marginBottom: 18 }} placeholder="Reason for swap request..." value={swapNote} onChange={e => setSwapNote(e.target.value)} />
                <button className="btn bt bw" onClick={doSwapRequest}>SEND REQUEST</button>
              </>}
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setSwapModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Shift Memo */}
      {memoModal && (
        <div className="overlay" onClick={() => setMemoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Shift Memo</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>END-OF-SHIFT NOTES FOR MANAGER</div>
            <textarea className="inp" style={{ minHeight: 120, marginBottom: 18 }} placeholder="Handover notes, issues, updates..." value={memoText} onChange={e => setMemoText(e.target.value)} />
            <button className="btn bt bw" onClick={doMemo}>SUBMIT MEMO</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setMemoModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Escalation */}
      {escalModal && (
        <div className="overlay" onClick={() => setEscalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Raise Escalation</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>NOTIFY MANAGEMENT</div>
            <label className="lbl">ISSUE TITLE</label>
            <input className="inp gap" placeholder="Brief summary" value={escalTitle} onChange={e => setEscalTitle(e.target.value)} />
            <label className="lbl">DETAILS</label>
            <textarea className="inp" style={{ minHeight: 90, marginBottom: 14 }} placeholder="Describe the issue..." value={escalDetail} onChange={e => setEscalDetail(e.target.value)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer', padding: '10px 14px', borderRadius: 12, background: escalUrgent ? 'rgba(244,63,94,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${escalUrgent ? 'rgba(244,63,94,.3)' : 'rgba(255,255,255,.08)'}`, transition: 'all .2s' }} onClick={() => setEscalUrgent(v => !v)}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${escalUrgent ? 'var(--red)' : 'rgba(255,255,255,.2)'}`, background: escalUrgent ? 'var(--red)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {escalUrgent && <span style={{ fontSize: 12, color: '#fff' }}>✓</span>}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: escalUrgent ? 'var(--red)' : 'var(--text)' }}>🚨 Mark as Urgent</div>
                <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>Sends immediate alert</div>
              </div>
            </div>
            <button className={`btn bw ${escalUrgent ? 'br' : 'bt'}`} onClick={doEscalate}>{escalUrgent ? '🚨 SEND URGENT' : 'SUBMIT ESCALATION'}</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setEscalModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Announce */}
      {annModal && (
        <div className="overlay" onClick={() => setAnnModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Broadcast Announcement</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>SENT TO ALL AGENTS</div>
            <textarea className="inp" style={{ minHeight: 100, marginBottom: 14 }} placeholder="Type your message..." value={annText} onChange={e => setAnnText(e.target.value)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, cursor: 'pointer', padding: '10px 14px', borderRadius: 12, background: annUrgent ? 'rgba(244,63,94,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${annUrgent ? 'rgba(244,63,94,.3)' : 'rgba(255,255,255,.08)'}` }} onClick={() => setAnnUrgent(v => !v)}>
              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${annUrgent ? 'var(--red)' : 'rgba(255,255,255,.2)'}`, background: annUrgent ? 'var(--red)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {annUrgent && <span style={{ fontSize: 12, color: '#fff' }}>✓</span>}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: annUrgent ? 'var(--red)' : 'var(--text)' }}>🚨 Mark as Urgent</div>
                <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>Highlighted in red for all agents</div>
              </div>
            </div>
            <button className={`btn bw ${annUrgent ? 'br' : 'bp'}`} onClick={doAnnounce}>{annUrgent ? '🚨 SEND URGENT' : '📢 BROADCAST'}</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setAnnModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* ══ NOTIFICATIONS DRAWER ══ */}
      {notifTab && (
        <div className="overlay" onClick={() => setNotifTab(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 19 }}>🔔 Notifications</div>
                <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginTop: 3 }}>ALL ANNOUNCEMENTS</div>
              </div>
              {anns.some(a => !seenAnns.includes(a.timestamp)) && (
                <button className="btn bg" style={{ fontSize: 11, minHeight: 36, padding: '7px 14px' }}
                  onClick={() => markAllAnnsSeen(anns)}>MARK ALL READ</button>
              )}
            </div>
            {anns.length === 0
              ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '32px 0', fontSize: 13 }}>No announcements yet.</div>
              : anns.map((a) => {
                const isRead = Array.isArray(seenAnns) && seenAnns.includes(annId(a));
                const myAck = acks.some(k => k.annTs === a.timestamp && k.agent === user?.name);
                const ackList = acks.filter(k => k.annTs === a.timestamp);
                const isManager = user?.role === ROLE_MANAGER || user?.role === ROLE_FINANCE;
                return (
                  <div key={a.timestamp} style={{ padding: '13px 14px', borderRadius: 12, marginBottom: 10, background: a.urgent ? 'rgba(244,63,94,.07)' : 'rgba(192,132,252,.06)', border: `1px solid ${a.urgent ? (isRead ? 'rgba(244,63,94,.1)' : 'rgba(244,63,94,.3)') : (isRead ? 'rgba(192,132,252,.1)' : 'rgba(192,132,252,.25)')}`, opacity: isRead ? 0.65 : 1, transition: 'opacity .2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          {a.urgent && <span>🚨</span>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: a.urgent ? 'var(--red)' : 'var(--purple)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>{a.urgent ? 'URGENT' : 'BROADCAST'} — {a.from}</span>
                          {!isRead && <span style={{ marginLeft: 4, width: 7, height: 7, borderRadius: '50%', background: a.urgent ? 'var(--red)' : 'var(--purple)', display: 'inline-block' }} />}
                          <span style={{ fontSize: 10, color: 'var(--sub)', marginLeft: 'auto' }}>{a.date} {a.time}</span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>{a.text}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          {/* Acknowledge button — only for agents, hidden for managers */}
                          {!isManager && (
                            myAck
                              ? <span style={{ fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--mono)', fontWeight: 700 }}>✓ ACKNOWLEDGED</span>
                              : <button className="btn bt" style={{ fontSize: 11, minHeight: 32, padding: '6px 14px' }} onClick={() => { doAcknowledge(a.timestamp); markAnnSeen(a); }}>✓ ACKNOWLEDGE</button>
                          )}
                          {/* Ack count — visible to everyone, full list to managers */}
                          {ackList.length > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)' }}>
                              {isManager
                                ? <span style={{ color: 'var(--teal)', cursor: 'default' }} title={ackList.map(k => k.agent).join(', ')}>✓ {ackList.length} agent{ackList.length !== 1 ? 's' : ''} acknowledged · {ackList.map(k => k.agent).join(', ')}</span>
                                : <span style={{ color: 'var(--teal)' }}>✓ {ackList.length} acknowledged</span>
                              }
                            </div>
                          )}
                        </div>
                      </div>
                );
              })
            }
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setNotifTab(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Change Password (self-serve) */}
      {pwModal && (
        <div className="overlay" onClick={() => setPwModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Change Password</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>UPDATE YOUR LOGIN CREDENTIAL</div>
            <label className="lbl">CURRENT PASSWORD</label>
            <input className="inp gap" type="password" autoComplete="current-password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} />
            <label className="lbl">NEW PASSWORD</label>
            <input className="inp gap" type="password" autoComplete="new-password" placeholder="Min 4 characters" value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })} />
            <label className="lbl">CONFIRM NEW PASSWORD</label>
            <input className="inp" style={{ marginBottom: 14 }} type="password" autoComplete="new-password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} />
            {pwErr && <div className="alert aer gap">⚠ {pwErr}</div>}
            <button className="btn bt bw" disabled={busy} onClick={doChangePassword}>{busy ? 'UPDATING…' : 'UPDATE PASSWORD'}</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setPwModal(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Manager: Edit Agent Profile */}
      {editAgent && (
        <div className="overlay" onClick={() => setEditAgent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Edit {editAgent.name}</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>PROFILE & ASSIGNMENT</div>
            <label className="lbl">DEPARTMENT</label>
            <select className="inp gap" value={editForm.platform} onChange={e => {
              const dept = e.target.value;
              const lock = lockedShift(dept);
              setEditForm({ ...editForm, platform: dept, shift: lock || editForm.shift });
            }}>
              {Object.keys(DEPT_HUE).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="lbl">POSITION</label>
            <select className="inp gap" value={editForm.position} onChange={e => setEditForm({ ...editForm, position: e.target.value })}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {lockedShift(editForm.platform)
              ? <div className="alert aok gap">🕘 Shift locked to <strong>{lockedShift(editForm.platform)}</strong> for this department.</div>
              : <>
                <label className="lbl">SHIFT</label>
                <select className="inp gap" value={editForm.shift} onChange={e => setEditForm({ ...editForm, shift: e.target.value })}>
                  {shiftsForDept(editForm.platform).map(s => <option key={s.label} value={s.label}>{s.label} ({s.start}–{s.end}{s.overnight ? ' +1' : ''})</option>)}
                </select>
              </>}
            <label className="lbl">MONTHLY SALARY (USD)</label>
            <input className="inp" style={{ marginBottom: 14 }} type="number" inputMode="numeric" value={editForm.salary} onChange={e => setEditForm({ ...editForm, salary: e.target.value })} />
            <div className="alert awn gap" style={{ fontSize: 11 }}>
              ⓘ Changes apply immediately. The agent's password is not affected. Existing time logs and payroll history remain attached to this account.
            </div>
            <button className="btn bt bw" disabled={busy} onClick={doUpdateAgent}>{busy ? 'SAVING…' : 'SAVE CHANGES'}</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setEditAgent(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Manager: Reset Agent Password */}
      {resetAgent && (
        <div className="overlay" onClick={() => setResetAgent(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>Reset Password — {resetAgent.name}</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>OVERRIDES THE AGENT'S CURRENT PASSWORD</div>
            <div className="alert awn gap" style={{ fontSize: 12, lineHeight: 1.5 }}>
              ⚠ Share the new password with {resetAgent.name} <strong>through a secure channel</strong>, not in chat history. Ask them to change it themselves after first login.
            </div>
            <label className="lbl">NEW PASSWORD</label>
            <input className="inp" style={{ marginBottom: 18 }} type="text" placeholder="Min 4 characters" value={resetForm} onChange={e => setResetForm(e.target.value)} />
            <button className="btn br bw" disabled={busy} onClick={doResetPassword}>{busy ? 'RESETTING…' : '🔑 RESET PASSWORD'}</button>
            <button className="btn bg bw" style={{ marginTop: 10 }} onClick={() => setResetAgent(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* Agent: My Stats / Period Earnings Preview */}
      {statsModal && myStats && user && (
        <div className="overlay" onClick={() => setStatsModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 19 }}>📊 My Stats</div>
              <Chip color="var(--blue)">{user.name}</Chip>
            </div>
            <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 18 }}>YOUR ATTENDANCE & EARNINGS PREVIEW</div>

            {/* This week */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 8 }}>THIS WEEK (MON–SUN)</div>
              <div className="g3">
                <MiniStat label="DAYS" value={myStats.week?.daysWorked || 0} color="var(--blue)" />
                <MiniStat label="HOURS" value={fmtS(myStats.week?.totalShiftMs || 0)} color="var(--teal)" />
                <MiniStat label="EARNED" value={currency(myStats.week?.grossPay || 0)} color="var(--teal)" />
              </div>
              {(myStats.week?.totalOtMs || 0) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--purple)', fontFamily: 'var(--mono)', marginTop: 6, textAlign: 'center' }}>
                  +{fmtS(myStats.week.totalOtMs)} overtime · +{currency(myStats.week.otPay)} OT pay
                </div>
              )}
            </div>

            {/* This month */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 8 }}>THIS MONTH</div>
              <div className="g3">
                <MiniStat label="DAYS" value={myStats.month?.daysWorked || 0} color="var(--blue)" />
                <MiniStat label="HOURS" value={fmtS(myStats.month?.totalShiftMs || 0)} color="var(--teal)" />
                <MiniStat label="EARNED" value={currency(myStats.month?.grossPay || 0)} color="var(--teal)" />
              </div>
              <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 6, textAlign: 'center' }}>
                Daily rate: {currency((user.salary || 260) / WORKING_DAYS)} · Monthly base: {currency(user.salary || 260)}
              </div>
            </div>

            <Sep />

            {/* Last 14 days breakdown */}
            <div style={{ fontSize: 11, color: 'var(--sub)', fontFamily: 'var(--mono)', letterSpacing: 2, marginBottom: 10 }}>LAST 14 DAYS</div>
            {(!myStats.last14?.days || myStats.last14.days.length === 0)
              ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: '14px 0', fontSize: 12 }}>No attendance recorded in this window.</div>
              : <div className="tbl-wrap">
                <table className="tbl" style={{ width: '100%' }}>
                  <thead><tr><th>DATE</th><th>IN</th><th>OUT</th><th>WORK</th><th>OT</th></tr></thead>
                  <tbody>
                    {myStats.last14.days.slice().reverse().map((d, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--sub)', whiteSpace: 'nowrap' }}>{phDateShort(new Date(d.date + 'T12:00:00+08:00').getTime())}</td>
                        <td style={{ color: 'var(--teal)' }}>{d.ci ? phTimeShort(d.ci) : '—'}</td>
                        <td style={{ color: 'var(--red)' }}>{d.co ? phTimeShort(d.co) : '—'}</td>
                        <td style={{ fontWeight: 700 }}>{fmtS(d.workMs)}</td>
                        <td style={{ color: d.otMs > 0 ? 'var(--purple)' : 'var(--sub)' }}>{d.otMs > 0 ? fmtS(d.otMs) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }

            <div className="alert awn" style={{ marginTop: 14, fontSize: 11, lineHeight: 1.5 }}>
              ⓘ This is a preview based on your clock-in records. Final payroll is calculated and approved by your manager. Discrepancies should be raised via the MEMO or ESCALATE button.
            </div>
            <button className="btn bg bw" style={{ marginTop: 14 }} onClick={() => setStatsModal(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* Payslip Modal */}
      {payModal && (
        <div className="overlay" onClick={() => setPayModal(null)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="drag" />
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 18 }}>Payslip Preview — {payModal.name}</div>
            <div className="payslip">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>AFTERSALES — WEAVNONO LLC</div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>Cellumove / Bloomommy Operations · Salaries in USD</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#555' }}>
                  <div>Period: {phDateLong(payRange.from)} – {phDateLong(payRange.to)}</div>
                  <div>Generated: {phDateFull(Date.now())}</div>
                </div>
              </div>
              <div style={{ borderTop: '2px solid #111', borderBottom: '1px solid #ccc', padding: '10px 0', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{payModal.name}</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{payModal.position || 'Customer Service Agent'} · {payModal.platform} · {resolveShift(payModal.shift || 'Morning').label} Shift</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: 2, marginBottom: 6, color: '#333' }}>DAILY BREAKDOWN</div>
              {payModal.days.map((d, i) => (
                <div className="payslip-row" key={i}>
                  <span>{phDateLong(new Date(d.date + 'T12:00:00+08:00').getTime())}</span>
                  <span style={{ color: '#555', fontSize: 11 }}>
                    {d.ci ? phTimeShort(d.ci) : '?'} – {d.co ? phTimeShort(d.co) : 'ongoing'} · {fmtS(d.shiftMs)} shift
                    {d.lateMs > 0 && ` (${fmtS(d.lateMs)} late)`}
                    {d.otMs > 0 && ` (+${fmtS(d.otMs)} OT)`}
                  </span>
                  <span style={{ fontWeight: 700 }}>{currency(payModal.dailyRate + (d.otMs / 3_600_000) * payModal.hourlyRate * 1.25)}</span>
                </div>
              ))}
              {payModal.days.length === 0 && <div style={{ color: '#888', padding: '8px 0', fontSize: 12 }}>No attendance records for this period.</div>}
              <div style={{ marginTop: 16, borderTop: '1px solid #ccc', paddingTop: 12 }}>
                <div className="payslip-row"><span>Days Worked</span><span /><span>{payModal.daysWorked} day{payModal.daysWorked !== 1 ? 's' : ''}</span></div>
                <div className="payslip-row"><span>Monthly Base Salary</span><span /><span>{currency(payModal.monthlySal)}</span></div>
                <div className="payslip-row"><span>Daily Rate ({WORKING_DAYS} working days)</span><span /><span>{currency(payModal.dailyRate)}</span></div>
                <div className="payslip-row"><span>Regular Pay ({payModal.daysWorked} days × {currency(payModal.dailyRate)})</span><span /><span>{currency(payModal.regularPay)}</span></div>
                {payModal.otPay > 0 && <div className="payslip-row"><span>Overtime Pay (×1.25)</span><span /><span style={{ color: '#6c47ff' }}>{currency(payModal.otPay)}</span></div>}
                <div className="payslip-total"><span>GROSS PAY FOR PERIOD</span><span /><span>{currency(payModal.grossPay)}</span></div>
              </div>
            </div>
            <button className="btn bg bw" style={{ marginTop: 18 }} onClick={() => setPayModal(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL PANEL (shared between Manager and Finance portals)
// ─────────────────────────────────────────────────────────────────────────────
// Wrap AppInner in ErrorBoundary for default export
export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}

function PayrollPanel({ payrollData, payPeriod, setPayPeriod, payStart, setPayStart, payEnd, setPayEnd, payRange, exportPayCSV, setPayModal }) {
  const totalGross = payrollData.reduce((s, a) => s + a.grossPay, 0);
  const totalOt    = payrollData.reduce((s, a) => s + a.otPay, 0);
  const totalDays  = payrollData.reduce((s, a) => s + a.daysWorked, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Period selector */}
      <Glass style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {['week','month','custom'].map(p => (
            <button key={p} className={`btn ${payPeriod === p ? 'bt' : 'bg'}`} style={{ fontSize: 11, minHeight: 38, padding: '7px 16px' }} onClick={() => setPayPeriod(p)}>
              {p === 'week' ? 'THIS WEEK' : p === 'month' ? 'THIS MONTH' : 'CUSTOM'}
            </button>
          ))}
          {payPeriod === 'custom' && <>
            <input className="inp" type="date" value={payStart} onChange={e => setPayStart(e.target.value)} style={{ width: 'auto', padding: '9px 12px', fontSize: 14 }} />
            <span style={{ color: 'var(--sub)' }}>→</span>
            <input className="inp" type="date" value={payEnd} onChange={e => setPayEnd(e.target.value)} style={{ width: 'auto', padding: '9px 12px', fontSize: 14 }} />
          </>}
          <button className="btn bg" style={{ fontSize: 11, minHeight: 38, padding: '7px 14px', marginLeft: 'auto' }} onClick={exportPayCSV}>↓ EXPORT CSV</button>
        </div>
      </Glass>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        {[
          { l: 'TOTAL GROSS PAY', v: currency(totalGross), c: 'var(--teal)' },
          { l: 'OVERTIME PAY',    v: currency(totalOt),    c: 'var(--purple)' },
          { l: 'AGENTS ON PAYROLL', v: payrollData.length, c: 'var(--blue)' },
          { l: 'TOTAL DAYS WORKED', v: totalDays,          c: 'var(--amber)' },
        ].map(s => (
          <div key={s.l} className="sc" style={{ background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.07)' }}>
            <div className="sv" style={{ color: s.c, fontSize: 'clamp(16px,3vw,26px)' }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Per-agent breakdown */}
      <Glass style={{ padding: 8 }}>
        {payrollData.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--sub)', padding: 28 }}>No payroll data for this period.</div>
          : payrollData.map(a => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 10px', borderBottom: '1px solid rgba(255,255,255,.04)', cursor: 'pointer', borderRadius: 10, transition: 'background .13s' }}
              onClick={() => setPayModal(a)}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,211,165,.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div className="av" style={{ background: dg(a.platform), color: dc(a.platform) }}>{a.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: dc(a.platform), fontFamily: 'var(--mono)', marginTop: 2 }}>◆ {a.platform} · {a.position || 'Agent'} · {a.daysWorked} day{a.daysWorked !== 1 ? 's' : ''}</div>
                <div style={{ marginTop: 5 }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, overflow: 'hidden', width: 100 }}>
                    <div style={{ height: '100%', width: `${Math.min((a.grossPay / (a.monthlySal / WORKING_DAYS * 7)) * 100, 100)}%`, background: 'linear-gradient(90deg,var(--blue),var(--teal))', borderRadius: 2 }} />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{currency(a.grossPay)}</div>
                <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                  {currency(a.dailyRate)}/day{a.otPay > 0 ? ` · +${currency(a.otPay)} OT` : ''}
                </div>
                <div style={{ fontSize: 10, color: 'var(--sub)', fontFamily: 'var(--mono)', marginTop: 1 }}>{fmtS(a.totalShiftMs)} total</div>
              </div>
            </div>
          ))}
      </Glass>
    </div>
  );
}