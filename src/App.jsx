import { useState, useEffect } from 'react';

const AGENTS = [
  { name: 'Robert', pin: '7342' },
  { name: 'Mary', pin: '5819' },
  { name: 'Eli', pin: '2674' },
  { name: 'Art', pin: '9031' },
  { name: 'Giah', pin: '4587' },
  { name: 'Gio', pin: '1263' },
  { name: 'Jon', pin: '8495' },
  { name: 'Koko', pin: '3726' },
  { name: 'Porsha', pin: '6148' },
  { name: 'Hawuki', pin: '9507' },
  { name: 'John', pin: '2893' },
  { name: 'Eunice', pin: '4361' },
  { name: 'Juan', pin: '7014' },
  { name: 'Bulad', pin: '5682' },
  { name: 'Charles', pin: '8237' },
  { name: 'Lanie', pin: '1954' },
  { name: 'Kat', pin: '6720' },
  { name: 'Aruchi', pin: '3485' },
  { name: 'Pea', pin: '9163' },
  { name: 'Venellope', pin: '2748' },
  { name: 'Seyan', pin: '5091' },
  { name: 'Marc', pin: '8364' },
  { name: 'Icho', pin: '1537' },
  { name: 'Kemuel', pin: '6892' },
  { name: 'Dani', pin: '4015' },
  { name: 'Jiro', pin: '7483' },
  { name: 'Chin', pin: '3256' },
  { name: 'Ryujo', pin: '9740' },
  { name: 'Kate', pin: '2167' },
  { name: 'Chris', pin: '5834' },
  { name: 'Trellix', pin: '8609' },
  { name: 'Luna', pin: '1472' },
  { name: 'Daniel', pin: '6325' },
  { name: 'Juliana', pin: '3958' },
  { name: 'Kisses', pin: '7241' },
  { name: 'Aljane', pin: '4863' },
  { name: 'Drakeyyy', pin: '0731' }
];

// ── Manager credentials — change these as needed ──
const MANAGERS = [
  { name: 'Suley', password: 'mgr-suley-2026' },
  { name: 'Manager2', password: 'mgr-m2-2026' },
  { name: 'Manager3', password: 'mgr-m3-2026' },
  { name: 'Manager4', password: 'mgr-m4-2026' },
];

const BREAK_LIMIT_MS = 60 * 60 * 1000;
const SHEET_ID = '1nqfY75hCmplXuLKqQy1gSYsIIdK8qvLlF50stj6VzAU';
const SHEETS_WEBHOOK =
  'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec';

const fmt = (d) =>
  d
    ? new Date(d).toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0m';
  const m = Math.floor(ms / 60000),
    h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};

async function logToSheets(payload) {
  if (
    !SHEETS_WEBHOOK ||
    SHEETS_WEBHOOK ===
      'https://script.google.com/macros/s/AKfycbzodvlY8lLDK3AYtmYpBnDOSjIbwS90FHeDFsc6ssUtxIQZvIrpRm4jydNwZk73LkEA/exec'
  )
    return;
  try {
    await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Sheets log failed:', e);
  }
}

const Badge = ({ status }) => {
  const map = {
    idle: ['#64748b', 'IDLE'],
    clocked_in: ['#22c55e', 'CLOCKED IN'],
    on_break: ['#f59e0b', 'ON BREAK'],
    clocked_out: ['#3b82f6', 'CLOCKED OUT'],
  };
  const [color, label] = map[status] || map.idle;
  return (
    <span
      style={{
        background: color + '22',
        color,
        border: `1px solid ${color}55`,
        borderRadius: 6,
        padding: '3px 12px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        fontFamily: 'monospace',
      }}
    >
      {label}
    </span>
  );
};

const actionLabel = {
  clockIn: '▶ Clock In',
  clockOut: '⏹ Clock Out',
  breakStart: '☕ Break Start',
  breakEnd: '💼 Break End',
};
const actionColor = {
  clockIn: '#4ade80',
  clockOut: '#a78bfa',
  breakStart: '#fbbf24',
  breakEnd: '#60a5fa',
};

export default function AttendanceApp() {
  const [selected, setSelected] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [records, setRecords] = useState({});
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState('clock');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  // Manager auth state
  const [mgrAuthed, setMgrAuthed] = useState(false);
  const [mgrInput, setMgrInput] = useState('');
  const [mgrError, setMgrError] = useState('');
  const [mgrName, setMgrName] = useState('');
  const [showMgrPass, setShowMgrPass] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const s = localStorage.getItem('cellumove_att');
    if (s) setRecords(JSON.parse(s));
  }, []);

  const save = (r) => {
    setRecords(r);
    localStorage.setItem('cellumove_att', JSON.stringify(r));
  };
  const getRec = (n) => records[n] || null;
  const getStatus = (rec) => {
    if (!rec?.clockIn) return 'idle';
    if (rec.clockOut) return 'clocked_out';
    if (rec.onBreak) return 'on_break';
    return 'clocked_in';
  };
  const breakUsed = (rec) => {
    if (!rec) return 0;
    let u = rec.breakUsedMs || 0;
    if (rec.onBreak && rec.breakStart) u += now - rec.breakStart;
    return u;
  };
  const breakLeft = (rec) => Math.max(0, BREAK_LIMIT_MS - breakUsed(rec));

  const validate = () => {
    if (!selected) {
      setError('Please select your name.');
      return null;
    }
    const a = AGENTS.find((x) => x.name === selected);
    if (a?.pin !== pin.trim()) {
      setError('Incorrect PIN. Please try again.');
      return null;
    }
    setError('');
    return a;
  };

  const handleAction = async (action) => {
    const agent = validate();
    if (!agent) return;
    const rec = getRec(agent.name) || {};
    const status = getStatus(rec);
    const ts = Date.now();
    const today = new Date().toDateString();
    let next = { ...rec };

    if (action === 'clockIn') {
      if (rec.date && rec.date !== today) {
        next = {};
      } else if (status === 'clocked_out') {
        setError('Already clocked out today.');
        return;
      } else if (status !== 'idle') {
        setError('You already have an active session.');
        return;
      }
      next = {
        ...next,
        clockIn: ts,
        date: today,
        clockOut: null,
        onBreak: false,
        breakUsedMs: 0,
        breakStart: null,
      };
      setSuccess(`✅ Clocked in at ${fmt(ts)}`);
    } else if (action === 'breakStart') {
      if (status !== 'clocked_in') {
        setError('Must be clocked in to start break.');
        return;
      }
      if (breakLeft(rec) <= 0) {
        setError('No break time remaining.');
        return;
      }
      next = { ...next, onBreak: true, breakStart: ts };
      setSuccess(`☕ Break started — ${fmtDur(breakLeft(rec))} remaining`);
    } else if (action === 'breakEnd') {
      if (status !== 'on_break') {
        setError('You are not on break.');
        return;
      }
      const used = (rec.breakUsedMs || 0) + (ts - rec.breakStart);
      next = { ...next, onBreak: false, breakStart: null, breakUsedMs: used };
      setSuccess(
        `💼 Back to work — ${fmtDur(breakLeft({ ...next }))} break left`
      );
    } else if (action === 'clockOut') {
      if (status !== 'clocked_in' && status !== 'on_break') {
        setError('You are not clocked in.');
        return;
      }
      if (rec.onBreak && rec.breakStart) {
        const used = (rec.breakUsedMs || 0) + (ts - rec.breakStart);
        next = { ...next, onBreak: false, breakStart: null, breakUsedMs: used };
      }
      next = { ...next, clockOut: ts };
      setSuccess(
        `🏁 Done! Total worked: ${fmtDur(
          ts - rec.clockIn - (next.breakUsedMs || 0)
        )}`
      );
    }

    const entry = {
      date: fmtDate(ts),
      time: fmt(ts),
      action,
      agent: agent.name,
      device: navigator.userAgent.slice(0, 100),
      timestamp: ts,
    };
    next.history = [...(rec.history || []), entry];
    save({ ...records, [agent.name]: next });
    await logToSheets(entry);
    setPin('');
    setTimeout(() => setSuccess(''), 5000);
  };

  const handleMgrLogin = () => {
    const mgr = MANAGERS.find((m) => m.password === mgrInput.trim());
    if (!mgr) {
      setMgrError('Incorrect password.');
      return;
    }
    setMgrAuthed(true);
    setMgrName(mgr.name);
    setMgrError('');
    setMgrInput('');
  };

  const handleMgrLogout = () => {
    setMgrAuthed(false);
    setMgrName('');
    setMgrInput('');
  };

  const curRec = selected ? getRec(selected) : null;
  const curStatus = getStatus(curRec);
  const bLeft = breakLeft(curRec);
  const bUsed = breakUsed(curRec);

  const allLogs = Object.entries(records)
    .flatMap(([, rec]) => rec.history || [])
    .filter((l) => {
      if (filterAgent !== 'all' && l.agent !== filterAgent) return false;
      if (filterDate && l.date !== fmtDate(new Date(filterDate).getTime()))
        return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 400);

  // ── Shared styles ──
  const card = {
    width: '100%',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 14,
  };
  const inputBase = {
    background: '#0d1117',
    color: '#e6edf3',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: '10px 14px',
    fontFamily: "'DM Mono',monospace",
  };
  const labelStyle = {
    fontSize: 10,
    color: '#8b949e',
    letterSpacing: 2,
    display: 'block',
    marginBottom: 6,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0d1117',
        fontFamily: "'DM Mono',monospace",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 16px 80px',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:#161b22}
        ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        select,input{outline:none}
        select option{background:#161b22;color:#e6edf3}
        .btn{cursor:pointer;transition:all .15s;border:none;font-family:'DM Mono',monospace;font-weight:500;letter-spacing:.5px}
        .btn:hover:not(:disabled){filter:brightness(1.18);transform:translateY(-1px)}
        .btn:active:not(:disabled){transform:translateY(0)}
        .btn:disabled{cursor:not-allowed;opacity:.4}
        .tab-btn{background:none;border:none;cursor:pointer;padding:8px 20px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:1.2px;transition:all .2s;text-transform:uppercase}
        .row-hover:hover{background:#1c2128!important}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn .3s ease}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .pulse{animation:pulse 2s infinite}
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: '#58a6ff',
            marginBottom: 8,
          }}
        >
          CELLUMOVE · WEAVNONO LLC
        </div>
        <h1
          style={{
            fontFamily: "'Syne',sans-serif",
            fontWeight: 800,
            fontSize: 'clamp(26px,5vw,42px)',
            color: '#e6edf3',
            margin: 0,
            letterSpacing: -1,
          }}
        >
          ATTENDANCE <span style={{ color: '#58a6ff' }}>SYSTEM</span>
        </h1>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 8 }}>
          {new Date(now).toLocaleDateString('en-PH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          &nbsp;&nbsp;
          <span style={{ color: '#58a6ff', fontWeight: 500 }} className="pulse">
            {new Date(now).toLocaleTimeString('en-PH')}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          marginBottom: 28,
          border: '1px solid #30363d',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {[
          ['clock', '⏱ Clock'],
          ['log', '📋 Log'],
          ['pins', '🔑 PIN Sheet'],
        ].map(([t, label], i, arr) => (
          <button
            key={t}
            className="tab-btn"
            onClick={() => setTab(t)}
            style={{
              color: tab === t ? '#58a6ff' : '#8b949e',
              background: tab === t ? '#161b22' : 'transparent',
              borderRight: i < arr.length - 1 ? '1px solid #30363d' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CLOCK TAB ── */}
      {tab === 'clock' && (
        <div
          className="fade-in"
          style={{ ...card, maxWidth: 460, padding: '32px 28px' }}
        >
          <label style={labelStyle}>SELECT AGENT</label>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPin('');
              setError('');
              setSuccess('');
            }}
            style={{
              ...inputBase,
              width: '100%',
              fontSize: 14,
              marginBottom: 18,
              cursor: 'pointer',
            }}
          >
            <option value="">— Choose your name —</option>
            {AGENTS.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>

          {selected && (
            <div
              style={{
                background: '#0d1117',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 18,
                border: '1px solid #21262d',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{ fontSize: 10, color: '#8b949e', marginBottom: 5 }}
                >
                  STATUS
                </div>
                <Badge status={curStatus} />
              </div>
              {curRec?.clockIn && (
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{ fontSize: 10, color: '#8b949e', marginBottom: 2 }}
                  >
                    CLOCK IN
                  </div>
                  <div style={{ fontSize: 13, color: '#e6edf3' }}>
                    {fmt(curRec.clockIn)}
                  </div>
                </div>
              )}
            </div>
          )}

          {selected && curRec?.clockIn && !curRec?.clockOut && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: '#8b949e',
                  marginBottom: 5,
                }}
              >
                <span>BREAK USED</span>
                <span style={{ color: bLeft < 600000 ? '#f87171' : '#58a6ff' }}>
                  {fmtDur(bUsed)} / 60m &nbsp;·&nbsp;{' '}
                  <b>{fmtDur(bLeft)} left</b>
                </span>
              </div>
              <div
                style={{ background: '#21262d', borderRadius: 4, height: 7 }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    width: `${Math.min(100, (bUsed / BREAK_LIMIT_MS) * 100)}%`,
                    background: bLeft < 600000 ? '#f87171' : '#58a6ff',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>
          )}

          <label style={labelStyle}>ENTER PIN</label>
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError('');
            }}
            placeholder="· · · ·"
            style={{
              ...inputBase,
              width: '100%',
              fontSize: 24,
              marginBottom: 20,
              letterSpacing: 10,
              textAlign: 'center',
              border: `1px solid ${error ? '#f87171' : '#30363d'}`,
            }}
          />

          {error && (
            <div
              style={{
                color: '#f87171',
                fontSize: 12,
                marginBottom: 14,
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}
          {success && (
            <div
              style={{
                color: '#4ade80',
                fontSize: 13,
                marginBottom: 14,
                textAlign: 'center',
              }}
              className="fade-in"
            >
              {success}
            </div>
          )}

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            <button
              className="btn"
              onClick={() => handleAction('clockIn')}
              disabled={curStatus !== 'idle'}
              style={{
                gridColumn: '1/-1',
                padding: 13,
                borderRadius: 8,
                fontSize: 13,
                background: curStatus === 'idle' ? '#238636' : '#21262d',
                color: curStatus === 'idle' ? '#fff' : '#484f58',
              }}
            >
              ▶ CLOCK IN
            </button>
            <button
              className="btn"
              onClick={() => handleAction('breakStart')}
              disabled={curStatus !== 'clocked_in' || bLeft <= 0}
              style={{
                padding: 13,
                borderRadius: 8,
                fontSize: 13,
                background:
                  curStatus === 'clocked_in' && bLeft > 0
                    ? '#9a3412'
                    : '#21262d',
                color:
                  curStatus === 'clocked_in' && bLeft > 0
                    ? '#fed7aa'
                    : '#484f58',
              }}
            >
              ☕ START BREAK
            </button>
            <button
              className="btn"
              onClick={() => handleAction('breakEnd')}
              disabled={curStatus !== 'on_break'}
              style={{
                padding: 13,
                borderRadius: 8,
                fontSize: 13,
                background: curStatus === 'on_break' ? '#1d4ed8' : '#21262d',
                color: curStatus === 'on_break' ? '#bfdbfe' : '#484f58',
              }}
            >
              💼 END BREAK
            </button>
            <button
              className="btn"
              onClick={() => handleAction('clockOut')}
              disabled={curStatus !== 'clocked_in' && curStatus !== 'on_break'}
              style={{
                gridColumn: '1/-1',
                padding: 13,
                borderRadius: 8,
                fontSize: 13,
                background:
                  curStatus === 'clocked_in' || curStatus === 'on_break'
                    ? '#6e40c9'
                    : '#21262d',
                color:
                  curStatus === 'clocked_in' || curStatus === 'on_break'
                    ? '#e2d9f3'
                    : '#484f58',
              }}
            >
              ⏹ CLOCK OUT
            </button>
          </div>

          {curRec?.clockOut && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                background: '#0d1117',
                borderRadius: 8,
                border: '1px solid #21262d',
              }}
              className="fade-in"
            >
              <div
                style={{
                  color: '#58a6ff',
                  fontWeight: 600,
                  marginBottom: 10,
                  fontSize: 10,
                  letterSpacing: 1,
                }}
              >
                TODAY'S SUMMARY
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}
              >
                {[
                  ['Clock In', fmt(curRec.clockIn)],
                  ['Clock Out', fmt(curRec.clockOut)],
                  ['Break Used', fmtDur(curRec.breakUsedMs)],
                  [
                    'Total Worked',
                    fmtDur(
                      curRec.clockOut -
                        curRec.clockIn -
                        (curRec.breakUsedMs || 0)
                    ),
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      background: '#161b22',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}
                  >
                    <div
                      style={{
                        color: '#8b949e',
                        fontSize: 9,
                        marginBottom: 3,
                        letterSpacing: 1,
                      }}
                    >
                      {k}
                    </div>
                    <div
                      style={{
                        color: '#e6edf3',
                        fontWeight: 500,
                        fontSize: 13,
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── LOG TAB ── */}
      {tab === 'log' && (
        <div
          className="fade-in"
          style={{ ...card, maxWidth: 860, overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '18px 24px',
              borderBottom: '1px solid #21262d',
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontFamily: "'Syne',sans-serif",
                fontWeight: 700,
                color: '#e6edf3',
                fontSize: 15,
                marginRight: 'auto',
              }}
            >
              Attendance Log
            </div>
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              style={{ ...inputBase, padding: '6px 10px', fontSize: 12 }}
            >
              <option value="all">All Agents</option>
              {AGENTS.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              style={{ ...inputBase, padding: '6px 10px', fontSize: 12 }}
            />
            {(filterAgent !== 'all' || filterDate) && (
              <button
                className="btn"
                onClick={() => {
                  setFilterAgent('all');
                  setFilterDate('');
                }}
                style={{
                  background: '#21262d',
                  color: '#8b949e',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 11,
                }}
              >
                ✕ Clear
              </button>
            )}
            <span style={{ fontSize: 11, color: '#484f58' }}>
              {allLogs.length} entries
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: '#0d1117' }}>
                  {['Date', 'Time', 'Agent', 'Action', 'Device Info'].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 16px',
                          textAlign: 'left',
                          color: '#8b949e',
                          fontWeight: 500,
                          letterSpacing: 1,
                          fontSize: 10,
                          borderBottom: '1px solid #21262d',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {allLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: 40,
                        textAlign: 'center',
                        color: '#484f58',
                        fontStyle: 'italic',
                      }}
                    >
                      No entries yet.
                    </td>
                  </tr>
                )}
                {allLogs.map((l, i) => (
                  <tr
                    key={i}
                    className="row-hover"
                    style={{ borderBottom: '1px solid #21262d' }}
                  >
                    <td
                      style={{
                        padding: '10px 16px',
                        color: '#8b949e',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {l.date}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: '#e6edf3',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {l.time}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: '#e6edf3',
                        fontWeight: 500,
                      }}
                    >
                      {l.agent}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          color: actionColor[l.action] || '#e6edf3',
                          fontWeight: 600,
                        }}
                      >
                        {actionLabel[l.action] || l.action}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: '#484f58',
                        fontSize: 10,
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {l.device}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PIN SHEET TAB ── */}
      {tab === 'pins' && (
        <div className="fade-in" style={{ width: '100%', maxWidth: 500 }}>
          {!mgrAuthed ? (
            /* ── Manager Login Gate ── */
            <div style={{ ...card, padding: '36px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
              <div
                style={{
                  fontFamily: "'Syne',sans-serif",
                  fontWeight: 800,
                  fontSize: 20,
                  color: '#e6edf3',
                  marginBottom: 4,
                }}
              >
                Manager Access Only
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#8b949e',
                  marginBottom: 28,
                  lineHeight: 1.6,
                }}
              >
                This section contains confidential agent PINs.
                <br />
                Enter your manager password to continue.
              </div>

              <label style={{ ...labelStyle, textAlign: 'left' }}>
                MANAGER PASSWORD
              </label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  type={showMgrPass ? 'text' : 'password'}
                  value={mgrInput}
                  onChange={(e) => {
                    setMgrInput(e.target.value);
                    setMgrError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleMgrLogin()}
                  placeholder="Enter password"
                  style={{
                    ...inputBase,
                    width: '100%',
                    fontSize: 14,
                    paddingRight: 44,
                  }}
                />
                <button
                  onClick={() => setShowMgrPass((p) => !p)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8b949e',
                    fontSize: 14,
                  }}
                >
                  {showMgrPass ? '🙈' : '👁'}
                </button>
              </div>
              {mgrError && (
                <div
                  style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}
                >
                  {mgrError}
                </div>
              )}
              <button
                className="btn"
                onClick={handleMgrLogin}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  fontSize: 13,
                  background: '#1f6feb',
                  color: '#fff',
                  marginTop: 8,
                }}
              >
                UNLOCK PIN SHEET
              </button>
            </div>
          ) : (
            /* ── PIN Sheet (authenticated) ── */
            <div style={{ ...card, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #21262d',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "'Syne',sans-serif",
                      fontWeight: 700,
                      color: '#e6edf3',
                      fontSize: 15,
                    }}
                  >
                    Agent PIN Reference
                  </div>
                  <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                    Logged in as{' '}
                    <span style={{ color: '#58a6ff' }}>{mgrName}</span>
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={handleMgrLogout}
                  style={{
                    background: '#21262d',
                    color: '#f87171',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11,
                  }}
                >
                  🔒 Lock
                </button>
              </div>

              <div
                style={{ padding: '4px 0', maxHeight: 520, overflowY: 'auto' }}
              >
                {AGENTS.map((a, i) => (
                  <div
                    key={a.name}
                    className="row-hover"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '9px 24px',
                      borderBottom:
                        i < AGENTS.length - 1 ? '1px solid #21262d' : 'none',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#21262d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          color: '#8b949e',
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        style={{
                          color: '#e6edf3',
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        {a.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 18,
                        fontWeight: 700,
                        color: '#58a6ff',
                        letterSpacing: 5,
                        background: '#0d1117',
                        padding: '4px 14px',
                        borderRadius: 6,
                        border: '1px solid #21262d',
                      }}
                    >
                      {a.pin}
                    </span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  padding: '12px 24px',
                  borderTop: '1px solid #21262d',
                  fontSize: 11,
                  color: '#8b949e',
                }}
              >
                ⚠ Share each PIN privately. Do not distribute this list to
                agents.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
