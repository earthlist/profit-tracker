import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell } from "recharts";

const STORAGE_KEY = "trading-dashboard-data-v2";
const ADMIN_PASSWORD = "Strikepro+123";
const defaultAssets = ["BTC", "ETH", "SOL"];
const DAYS_TH = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"];
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DEFAULT_RATE = 33;

function todayStr() { return new Date().toISOString().slice(0, 10); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function thisMonth() { return todayStr().slice(0, 7); }
function thisYear() { return todayStr().slice(0, 4); }
function thisWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const sun = new Date(now); sun.setDate(now.getDate() - day);
  const sat = new Date(now); sat.setDate(now.getDate() + (6 - day));
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(sun), end: fmt(sat) };
}
function fmtUSD(n) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtTHB(n) { return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtMoney(n, currency="THB") { return currency==="USD" ? fmtUSD(n) : fmtTHB(n); }
function toTHB(n, currency, rate) { return currency==="USD" ? n * rate : n; }
function toUSD(n, currency, rate) { return currency==="THB" ? n / rate : n; }
function fmtPct(n, showSign = true) { return `${showSign && n > 0 ? "+" : ""}${Number(n).toFixed(2)}%`; }
function seedData(assets) { const d = {}; assets.forEach((a) => (d[a] = { principal: 0, entries: [], currency: "THB" })); return d; }
function getDayOfWeek(dateStr) { return new Date(dateStr).getDay(); }
function getMonth(dateStr) { return dateStr.slice(0, 7); }
function getYear(dateStr) { return dateStr.slice(0, 4); }

function calcMoneyHistory(principal, entries) {
  let balance = principal;
  return entries.map((e) => {
    const ps = e.profitShare || 0;
    balance = (balance + (e.deposit || 0)) * (1 + e.pct / 100) - ps;
    balance = parseFloat(balance.toFixed(2));
    return { ...e, balance };
  });
}
function calcCumulative(entries) {
  let cum = 1;
  return entries.map((e) => {
    cum *= 1 + e.pct / 100;
    return { ...e, cumulative: parseFloat(((cum - 1) * 100).toFixed(2)) };
  }); // id is preserved via spread
}
// compound % from array of daily %
function compoundPct(pcts) {
  let c = 1; pcts.forEach(p => { c *= 1 + p / 100; }); return parseFloat(((c - 1) * 100).toFixed(2));
}

// ─── Small Components ─────────────────────────────────────────

// ─── FX Rate Bar ──────────────────────────────────────────────
function FxRateBar({ fxRate, fxUpdated, isAdmin, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(fxRate));
  const [fetching, setFetching] = useState(false);

  const fetchRate = async () => {
    setFetching(true);
    try {
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
      const json = await res.json();
      const rate = parseFloat(json.rates.THB.toFixed(4));
      onUpdate(rate, true);
    } catch {
      try {
        const res2 = await fetch("https://open.er-api.com/v6/latest/USD");
        const json2 = await res2.json();
        const rate2 = parseFloat(json2.rates.THB.toFixed(4));
        onUpdate(rate2, true);
      } catch { alert("ดึงอัตราไม่สำเร็จ ลองกรอกเองได้เลยครับ"); }
    }
    setFetching(false);
  };

  const commit = () => { const n = parseFloat(val); if (!isNaN(n) && n > 0) onUpdate(n, false); setEditing(false); };

  return (
    <div style={{ background:"#0a1520",borderBottom:"1px solid #1a2535",padding:"7px 32px",display:"flex",alignItems:"center",gap:12,fontSize:11 }}>
      <span style={{ color:"#445",letterSpacing:1 }}>อัตรา USD/THB:</span>
      {isAdmin && editing ? (
        <input type="number" step="0.01" value={val} onChange={e=>setVal(e.target.value)}
          onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEditing(false);}}
          autoFocus style={{ background:"#131e2e",border:"1px solid #00e5a060",color:"#00e5a0",width:80,padding:"2px 6px",fontFamily:"inherit",fontSize:11,borderRadius:2,outline:"none" }} />
      ) : (
        <span style={{ color:"#6eb5ff",fontWeight:700,cursor:isAdmin?"text":"default",borderBottom:isAdmin?"1px dashed #334":"none",paddingBottom:1 }}
          onClick={()=>isAdmin&&setEditing(true)} title={isAdmin?"คลิกเพื่อแก้ไข":""}>
          {fxRate.toFixed(2)}
        </span>
      )}
      {isAdmin && !editing && (
        <button onClick={fetchRate} disabled={fetching}
          style={{ background:"transparent",border:"1px solid #1e2a3a",color:fetching?"#445":"#6eb5ff",padding:"2px 10px",fontSize:10,fontFamily:"inherit",cursor:fetching?"default":"pointer",borderRadius:2,letterSpacing:1 }}>
          {fetching?"กำลังดึง...":"🔄 ดึงปัจจุบัน"}
        </button>
      )}
      {fxUpdated && <span style={{ color:"#334",fontSize:10 }}>· อัพเดท {fxUpdated}</span>}
      <span style={{ color:"#223",fontSize:10,marginLeft:"auto" }}>1 USD = {fxRate.toFixed(2)} THB</span>
    </div>
  );
}

function PasswordGate({ onUnlock, onClose }) {
  const [pw, setPw] = useState(""); const [shake, setShake] = useState(false);
  const attempt = () => { if (pw === ADMIN_PASSWORD) { onUnlock(); } else { setShake(true); setPw(""); setTimeout(() => setShake(false), 500); } };
  return (
    <div style={{ position:"fixed",inset:0,background:"#080d14ee",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999 }}
      onClick={(e) => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:"#0d1520",border:"1px solid #1a2535",padding:"40px 36px",borderRadius:4,width:340,textAlign:"center",animation:shake?"shake .4s ease":"fadeIn .3s ease",position:"relative" }}>
        <button onClick={onClose} style={{ position:"absolute",top:12,right:14,background:"none",border:"none",color:"#445",fontSize:20,cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.color="#e8eaf0"} onMouseLeave={e=>e.currentTarget.style.color="#445"}>✕</button>
        <div style={{ fontSize:28,marginBottom:6 }}>🔒</div>
        <div style={{ fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:4,color:"#e8eaf0",marginBottom:6 }}>ADMIN ACCESS</div>
        <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:24 }}>กรอกรหัสผ่านเพื่อแก้ไขข้อมูล</div>
        <input type="password" className="inp" placeholder="Password" value={pw}
          onChange={e=>setPw(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") attempt(); if(e.key==="Escape") onClose(); }}
          autoFocus style={{ width:"100%",marginBottom:12,textAlign:"center",letterSpacing:3 }} />
        <div style={{ display:"flex",gap:8 }}>
          <button className="btn" onClick={attempt} style={{ flex:1,padding:12 }}>UNLOCK</button>
          <button className="btn-outline" onClick={onClose} style={{ flex:1,padding:12 }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

function EditableNumCell({ value, onSave, color, prefix="", suffix="" }) {
  const [editing,setEditing]=useState(false); const [val,setVal]=useState(String(value)); const ref=useRef(null);
  useEffect(()=>{ if(editing&&ref.current) ref.current.focus(); },[editing]);
  const commit=()=>{ const n=parseFloat(val); if(!isNaN(n)) onSave(n); setEditing(false); };
  if(editing) return <input ref={ref} type="number" step="0.01" value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") setEditing(false); }} style={{ background:"#131e2e",border:"1px solid #00e5a060",color:"#00e5a0",width:90,padding:"3px 6px",fontFamily:"inherit",fontSize:13,borderRadius:2,outline:"none" }} />;
  return <span onClick={()=>setEditing(true)} title="คลิกเพื่อแก้ไข" style={{ color,fontWeight:700,cursor:"text",borderBottom:"1px dashed #334",paddingBottom:1 }}>{prefix}{value>0&&suffix==="%"?"+":""}{value}{suffix}</span>;
}

function EditableDateCell({ value, onSave }) {
  const [editing,setEditing]=useState(false); const [val,setVal]=useState(value); const ref=useRef(null);
  useEffect(()=>{ if(editing&&ref.current) ref.current.focus(); },[editing]);
  const commit=()=>{ if(val) onSave(val); setEditing(false); };
  if(editing) return <input ref={ref} type="date" value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") setEditing(false); }} style={{ background:"#131e2e",border:"1px solid #00e5a060",color:"#6eb5ff",width:130,padding:"3px 6px",fontFamily:"inherit",fontSize:12,borderRadius:2,outline:"none" }} />;
  return <span onClick={()=>setEditing(true)} title="คลิกเพื่อแก้ไขวันที่" style={{ color:"#667",cursor:"text",borderBottom:"1px dashed #2a3545",paddingBottom:1 }}>{value}</span>;
}

function RenameModal({ asset, existing, onSave, onClose }) {
  const [val,setVal]=useState(asset); const ref=useRef(null);
  useEffect(()=>{ if(ref.current){ref.current.focus();ref.current.select();} },[]);
  const commit=()=>{ const name=val.trim().toUpperCase(); if(!name||(existing.includes(name)&&name!==asset)) return; onSave(name); };
  return (
    <div style={{ position:"fixed",inset:0,background:"#080d14cc",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:998 }}>
      <div style={{ background:"#0d1520",border:"1px solid #1a2535",padding:"32px 30px",borderRadius:4,width:320,animation:"fadeIn .2s ease" }}>
        <div style={{ fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:4,color:"#e8eaf0",marginBottom:6 }}>RENAME ASSET</div>
        <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:20 }}>เปลี่ยนชื่อ "{asset}"</div>
        <input ref={ref} className="inp" value={val} onChange={e=>setVal(e.target.value.toUpperCase())} onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") onClose(); }} style={{ width:"100%",marginBottom:12,letterSpacing:2 }} />
        <div style={{ display:"flex",gap:8 }}>
          <button className="btn" onClick={commit} style={{ flex:1 }}>บันทึก</button>
          <button className="btn-outline" onClick={onClose} style={{ flex:1 }}>ยกเลิก</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Mini Card ───────────────────────────────────────────
function MiniCard({ label, value, sub, color="#e8eaf0" }) {
  return (
    <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"20px 22px" }}>
      <div style={{ fontSize:11,color:"#8ab4d4",letterSpacing:3,marginBottom:10,textTransform:"uppercase",fontWeight:600 }}>{label}</div>
      <div style={{ fontFamily:"'Bebas Neue'",fontSize:36,color,letterSpacing:2,lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12,color:"#6a8aaa",marginTop:8,letterSpacing:1 }}>{sub}</div>}
    </div>
  );
}

// ─── STATS TAB ────────────────────────────────────────────────
function StatsTab({ assets, data, getAssetStats, pctColor, isAdmin, showMoney }) {
  const [selectedAsset, setSelectedAsset] = useState("ALL");

  const getFilteredEntries = (asset) => {
    if (asset === "ALL") {
      // merge all entries, group by date, average pct
      const map = {};
      assets.forEach(a => {
        (data[a]?.entries || []).forEach(e => {
          if (!map[e.date]) map[e.date] = { pcts: [], deposits: [] };
          map[e.date].pcts.push(e.pct);
          map[e.date].deposits.push(e.deposit || 0);
        });
      });
      return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, pct: parseFloat((v.pcts.reduce((s,x)=>s+x,0)/v.pcts.length).toFixed(4)) }));
    }
    return (data[asset]?.entries || []).slice().sort((a,b)=>a.date.localeCompare(b.date));
  };

  const entries = getFilteredEntries(selectedAsset);

  // By period
  const today = todayStr(); const month = thisMonth(); const year = thisYear();
  const week = thisWeekRange();
  const todayEntries = entries.filter(e=>e.date===today);
  const weekEntries  = entries.filter(e=>e.date>=week.start && e.date<=week.end);
  const monthEntries = entries.filter(e=>e.date.startsWith(month));
  const yearEntries  = entries.filter(e=>e.date.startsWith(year));

  const todayPct = todayEntries.length ? compoundPct(todayEntries.map(e=>e.pct)) : null;
  const weekPct  = weekEntries.length  ? compoundPct(weekEntries.map(e=>e.pct))  : null;
  const monthPct = monthEntries.length ? compoundPct(monthEntries.map(e=>e.pct)) : null;
  const yearPct  = yearEntries.length  ? compoundPct(yearEntries.map(e=>e.pct))  : null;

  // Monthly breakdown
  const monthlyMap = {};
  entries.forEach(e => {
    const m = getMonth(e.date);
    if (!monthlyMap[m]) monthlyMap[m] = [];
    monthlyMap[m].push(e.pct);
  });
  const monthlyData = Object.entries(monthlyMap).sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([m, pcts]) => ({ month: m.slice(5)+"/"+m.slice(2,4), pct: compoundPct(pcts), count: pcts.length }));

  // Yearly breakdown
  const yearlyMap = {};
  entries.forEach(e => {
    const y = getYear(e.date);
    if (!yearlyMap[y]) yearlyMap[y] = [];
    yearlyMap[y].push(e.pct);
  });
  const yearlyData = Object.entries(yearlyMap).sort().map(([y,pcts])=>({ year:y, pct:compoundPct(pcts), count:pcts.length }));

  return (
    <div>
      {/* Asset selector */}
      <div style={{ display:"flex",gap:8,marginBottom:24,flexWrap:"wrap",alignItems:"center" }}>
        <span style={{ fontSize:12,color:"#8a9aaa",letterSpacing:2,fontWeight:600 }}>ดูข้อมูลของ:</span>
        {["ALL",...assets].map(a=>(
          <div key={a} className={`asset-chip ${selectedAsset===a?"active":""}`} onClick={()=>setSelectedAsset(a)}
            style={{ fontSize:11 }}>{a==="ALL"?"ภาพรวม":a}</div>
        ))}
      </div>

      {/* Period cards */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:12 }}>
        <MiniCard label="วันนี้" value={todayPct!==null?fmtPct(todayPct):"—"} color={todayPct!==null?pctColor(todayPct):"#334"} sub={todayEntries.length?`${todayEntries.length} รายการ`:""} />
        <MiniCard label={`สัปดาห์นี้ (${week.start} – ${week.end.slice(5)})`} value={weekPct!==null?fmtPct(weekPct):"—"} color={weekPct!==null?pctColor(weekPct):"#334"} sub={`${weekEntries.length} วัน (อา–ส)`} />
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:28 }}>
        <MiniCard label={`เดือนนี้ (${MONTHS_TH[parseInt(month.slice(5))-1]})`} value={monthPct!==null?fmtPct(monthPct):"—"} color={monthPct!==null?pctColor(monthPct):"#334"} sub={`${monthEntries.length} วัน`} />
        <MiniCard label={`ปีนี้ (${year})`} value={yearPct!==null?fmtPct(yearPct):"—"} color={yearPct!==null?pctColor(yearPct):"#334"} sub={`${yearEntries.length} วัน`} />
      </div>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"22px",marginBottom:24 }}>
          <div style={{ fontSize:13,color:"#8ab4d4",letterSpacing:3,marginBottom:16,fontWeight:700,textTransform:"uppercase" }}>ผลตอบแทนรายเดือน</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2e42" />
              <XAxis dataKey="month" tick={{ fill:"#8ab4d4",fontSize:11 }} />
              <YAxis tick={{ fill:"#8ab4d4",fontSize:11 }} tickFormatter={v=>`${v}%`} />
              <Tooltip contentStyle={{ background:"#0d1825",border:"1px solid #2a3a50",borderRadius:6,fontFamily:"monospace",fontSize:12,color:"#e8eaf0",padding:"8px 12px" }}
                formatter={(v,n,p)=>[fmtPct(v),`${p.payload.count} วัน`]} />
              <Bar dataKey="pct" radius={[2,2,0,0]}>
                {monthlyData.map((m,i)=><Cell key={i} fill={m.pct>=0?"#00e5a0":"#ff4d6d"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Yearly table */}
      {yearlyData.length > 0 && (
        <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"22px" }}>
          <div style={{ fontSize:13,color:"#8ab4d4",letterSpacing:3,marginBottom:14,fontWeight:700,textTransform:"uppercase" }}>ผลตอบแทนรายปี</div>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1a2535" }}>
                {["ปี","ผลตอบแทน","จำนวนวัน"].map(h=><th key={h} style={{ textAlign:"left",padding:"8px 10px",fontSize:11,color:"#5a7a9a",letterSpacing:2,fontWeight:600,borderBottom:"1px solid #1e2e42" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {yearlyData.map(y=>(
                <tr key={y.year} className="entry-row">
                  <td style={{ padding:"11px 10px",color:"#c8dff0",fontSize:15,fontWeight:600 }}>{y.year}</td>
                  <td style={{ padding:"11px 10px",color:pctColor(y.pct),fontWeight:700,fontSize:16 }}>{fmtPct(y.pct)}</td>
                  <td style={{ padding:"11px 10px",color:"#8ab4d4",fontSize:13 }}>{y.count} วัน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ANALYSIS TAB ─────────────────────────────────────────────
function AnalysisTab({ assets, data, pctColor }) {
  const [selectedAsset, setSelectedAsset] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resultFilter, setResultFilter] = useState("ALL"); // ALL | WIN | LOSS
  const [selectedDays, setSelectedDays] = useState([]); // 0-6

  const allEntries = useMemo(() => {
    if (selectedAsset === "ALL") {
      const map = {};
      assets.forEach(a => {
        (data[a]?.entries || []).forEach(e => {
          if (!map[e.date]) map[e.date] = { pcts:[], deposits:[] };
          map[e.date].pcts.push(e.pct);
        });
      });
      return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, pct: parseFloat((v.pcts.reduce((s,x)=>s+x,0)/v.pcts.length).toFixed(4)), dow: getDayOfWeek(date) }));
    }
    return (data[selectedAsset]?.entries||[]).slice().sort((a,b)=>a.date.localeCompare(b.date))
      .map(e=>({...e, dow: getDayOfWeek(e.date)}));
  }, [selectedAsset, assets, data]);

  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (resultFilter === "WIN" && e.pct <= 0) return false;
      if (resultFilter === "LOSS" && e.pct >= 0) return false;
      if (selectedDays.length > 0 && !selectedDays.includes(e.dow)) return false;
      return true;
    });
  }, [allEntries, dateFrom, dateTo, resultFilter, selectedDays]);

  const totalPct = filtered.length ? compoundPct(filtered.map(e=>e.pct)) : null;
  const tradedFiltered = filtered.filter(e=>e.pct!==0); // ไม่นับ 0%
  const wins = tradedFiltered.filter(e=>e.pct>0).length;
  const losses = tradedFiltered.filter(e=>e.pct<0).length;
  const wr = tradedFiltered.length ? ((wins/tradedFiltered.length)*100).toFixed(1) : 0;
  const avgPct = tradedFiltered.length ? (tradedFiltered.reduce((s,e)=>s+e.pct,0)/tradedFiltered.length).toFixed(2) : null;
  const best = tradedFiltered.length ? Math.max(...tradedFiltered.map(e=>e.pct)) : null;
  const worst = tradedFiltered.length ? Math.min(...tradedFiltered.map(e=>e.pct)) : null;

  // Day of week analysis (from filtered if days selected, else from allEntries)
  const dowBase = selectedDays.length > 0 ? allEntries : allEntries;
  const dowStats = DAYS_TH.map((name, i) => {
    const dayEntries = allEntries.filter(e=>e.dow===i);
    if (!dayEntries.length) return { name, pct:0, count:0, wr:0 };
    const dp = compoundPct(dayEntries.map(e=>e.pct));
    const dw = dayEntries.filter(e=>e.pct>0).length;
    return { name, pct:dp, count:dayEntries.length, wr:parseFloat(((dw/dayEntries.length)*100).toFixed(1)) };
  });

  const toggleDay = (d) => setSelectedDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d]);

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setResultFilter("ALL"); setSelectedDays([]); };

  return (
    <div>
      {/* Asset selector */}
      <div style={{ display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center" }}>
        <span style={{ fontSize:12,color:"#8a9aaa",letterSpacing:2,fontWeight:600 }}>สินทรัพย์:</span>
        {["ALL",...assets].map(a=>(
          <div key={a} className={`asset-chip ${selectedAsset===a?"active":""}`} onClick={()=>setSelectedAsset(a)} style={{ fontSize:11 }}>{a==="ALL"?"ทั้งหมด":a}</div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"22px",marginBottom:20 }}>
        <div style={{ fontSize:13,color:"#8ab4d4",letterSpacing:3,marginBottom:14,fontWeight:700 }}>FILTERS</div>
        <div style={{ display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:11,color:"#7a8fa6",marginBottom:6,letterSpacing:1 }}>จากวันที่</div>
            <input type="date" className="inp" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ padding:"6px 10px",fontSize:12 }} />
          </div>
          <div>
            <div style={{ fontSize:11,color:"#7a8fa6",marginBottom:6,letterSpacing:1 }}>ถึงวันที่</div>
            <input type="date" className="inp" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ padding:"6px 10px",fontSize:12 }} />
          </div>
          <div>
            <div style={{ fontSize:11,color:"#7a8fa6",marginBottom:6,letterSpacing:1 }}>ผลลัพธ์</div>
            <div style={{ display:"flex",gap:6 }}>
              {[["ALL","ทั้งหมด"],["WIN","ชนะ"],["LOSS","แพ้"]].map(([v,l])=>(
                <button key={v} onClick={()=>setResultFilter(v)}
                  style={{ padding:"6px 12px",fontSize:11,fontFamily:"inherit",cursor:"pointer",borderRadius:2,transition:"all .15s",
                    background: resultFilter===v ? (v==="WIN"?"#00e5a020":v==="LOSS"?"#ff4d6d20":"#1e2a3a") : "transparent",
                    border: `1px solid ${resultFilter===v?(v==="WIN"?"#00e5a0":v==="LOSS"?"#ff4d6d":"#445"):"#1e2a3a"}`,
                    color: resultFilter===v?(v==="WIN"?"#00e5a0":v==="LOSS"?"#ff4d6d":"#e8eaf0"):"#8a9aaa",fontWeight:resultFilter===v?700:400 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-outline" onClick={clearFilters} style={{ fontSize:11,padding:"6px 14px" }}>ล้าง Filter</button>
        </div>

        {/* Day of week filter */}
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:11,color:"#7a8fa6",marginBottom:8,letterSpacing:1 }}>กรองตามวัน (ไม่เลือก = ทุกวัน)</div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            {DAYS_TH.map((name,i)=>(
              <button key={i} onClick={()=>toggleDay(i)}
                style={{ padding:"4px 10px",fontSize:11,fontFamily:"inherit",cursor:"pointer",borderRadius:2,transition:"all .15s",
                  background: selectedDays.includes(i)?"#6eb5ff20":"transparent",
                  border: `1px solid ${selectedDays.includes(i)?"#6eb5ff":"#1e2a3a"}`,
                  color: selectedDays.includes(i)?"#6eb5ff":"#8a9aaa",fontWeight:selectedDays.includes(i)?700:400 }}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20 }}>
        <MiniCard label="ผลตอบแทนสะสม" value={totalPct!==null?fmtPct(totalPct):"—"} color={totalPct!==null?pctColor(totalPct):"#334"} sub={`${filtered.length} วัน`} />
        <MiniCard label="เฉลี่ยต่อวัน" value={avgPct!==null?fmtPct(parseFloat(avgPct)):"—"} color={avgPct!==null?pctColor(parseFloat(avgPct)):"#334"} />
        <MiniCard label="WIN RATE" value={tradedFiltered.length?`${wr}%`:"—"} color="#00e5a0" sub={`ชนะ ${wins} วัน`} />
        <MiniCard label="LOSS RATE" value={tradedFiltered.length?`${((losses/tradedFiltered.length)*100).toFixed(1)}%`:"—"} color="#ff4d6d" sub={`แพ้ ${losses} วัน`} />
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12,marginBottom:24 }}>
        <MiniCard label="ดีที่สุด" value={best!==null?fmtPct(best):"—"} color="#00e5a0" />
        <MiniCard label="แย่ที่สุด" value={worst!==null?fmtPct(worst):"—"} color="#ff4d6d" />
      </div>

      {/* Day of week stats */}
      <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"22px",marginBottom:24 }}>
        <div style={{ fontSize:13,color:"#8ab4d4",letterSpacing:3,marginBottom:16,fontWeight:700,textTransform:"uppercase" }}>วิเคราะห์ตามวันในสัปดาห์</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dowStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2e42" />
            <XAxis dataKey="name" tick={{ fill:"#8ab4d4",fontSize:12 }} />
            <YAxis tick={{ fill:"#8ab4d4",fontSize:11 }} tickFormatter={v=>`${v}%`} />
            <Tooltip contentStyle={{ background:"#0d1825",border:"1px solid #2a3a50",borderRadius:6,fontFamily:"monospace",fontSize:12,color:"#e8eaf0",padding:"8px 12px" }}
              formatter={(v,n,p)=>[`${fmtPct(v)} (${p.payload.count} วัน, WR ${p.payload.wr}%)`,""]} />
            <ReferenceLine y={0} stroke="#1e2a3a" />
            <Bar dataKey="pct" radius={[2,2,0,0]}>
              {dowStats.map((d,i)=><Cell key={i} fill={d.pct>=0?"#00e5a0":"#ff4d6d"} opacity={d.count===0?0.2:1} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginTop:12 }}>
          {dowStats.filter(d=>d.count>0).map(d=>(
            <div key={d.name} style={{ fontSize:12,background:"#131e2e",padding:"6px 12px",borderRadius:4,border:"1px solid #1e2e3e" }}>
              <span style={{ color:"#c0cfe0",fontWeight:600 }}>{d.name}</span>
              <span style={{ color:pctColor(d.pct),marginLeft:8,fontWeight:700 }}>{fmtPct(d.pct)}</span>
              <span style={{ color:"#7a8fa6",marginLeft:6,fontSize:11 }}>W:{d.wr}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filtered entries table */}
      {filtered.length > 0 && (
        <div style={{ background:"#111c2d",border:"1px solid #2a3a50",borderRadius:8,padding:"22px" }}>
          <div style={{ fontSize:13,color:"#8ab4d4",letterSpacing:3,marginBottom:12,fontWeight:700 }}>รายการที่กรองแล้ว <span style={{ color:"#7a8fa6",fontSize:11 }}>({filtered.length} รายการ)</span></div>
          <div style={{ maxHeight:300,overflowY:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
              <thead style={{ position:"sticky",top:0,background:"#0d1520" }}>
                <tr style={{ borderBottom:"1px solid #1a2535" }}>
                  {["วันที่","วัน","% วันนั้น","% สะสม"].map(h=><th key={h} style={{ textAlign:"left",padding:"9px 10px",fontSize:11,color:"#5a7a9a",letterSpacing:2,fontWeight:600,borderBottom:"1px solid #1e2e42",background:"#0d1825" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e,i)=>{
                  const cum = compoundPct(filtered.slice(0,i+1).map(x=>x.pct));
                  return (
                    <tr key={e.date+i} className="entry-row">
                      <td style={{ padding:"10px 10px",color:"#9ab4cc",fontSize:13 }}>{e.date}</td>
                      <td style={{ padding:"10px 10px",color:"#8ab4d4",fontSize:13 }}>{DAYS_TH[e.dow]}</td>
                      <td style={{ padding:"9px 10px",color:pctColor(e.pct),fontWeight:700,fontSize:14 }}>{fmtPct(e.pct)}</td>
                      <td style={{ padding:"9px 10px",color:pctColor(cum),fontSize:13 }}>{fmtPct(cum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────
export default function App() {
  const [assets, setAssets] = useState(defaultAssets);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(defaultAssets[0]);
  const [form, setForm] = useState({ date: todayStr(), pct: "", deposit: "", depositCurrency: "THB", profitShare: "" });
  const [newAsset, setNewAsset] = useState("");
  const [tab, setTab] = useState("overview");
  const [editMode, setEditMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordGate, setShowPasswordGate] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showMoney, setShowMoney] = useState(true);
  const [fxRate, setFxRate] = useState(DEFAULT_RATE);
  const [fxUpdated, setFxUpdated] = useState("");

  const notify = (msg, type="success") => { setNotification({msg,type}); setTimeout(()=>setNotification(null),2500); };

  // Load FX rate from separate storage key
  const loadFxRate = useCallback(async () => {
    try {
      const r = await window.storage.get("fx-rate-v1", true);
      if (r && r.value) { const p = JSON.parse(r.value); setFxRate(p.rate || DEFAULT_RATE); setFxUpdated(p.updated || ""); }
    } catch {}
  }, []);

  const handleFxUpdate = useCallback(async (rate, isLive) => {
    setFxRate(rate);
    const updated = isLive ? new Date().toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"}) : "กรอกเอง";
    setFxUpdated(updated);
    try { await window.storage.set("fx-rate-v1", JSON.stringify({ rate, updated }), true); } catch {}
  }, []);

  const loadData = useCallback(async () => {
    try {
      const result = await window.storage.get(STORAGE_KEY, true);
      if (result && result.value) {
        const parsed = JSON.parse(result.value);
        setAssets(parsed.assets || defaultAssets);
        setData(parsed.data || seedData(parsed.assets || defaultAssets));
        setSelectedAsset((parsed.assets || defaultAssets)[0]);
      } else { setData(seedData(defaultAssets)); }
    } catch { setData(seedData(defaultAssets)); }
    setLoading(false);
  }, []);
  useEffect(() => { loadData(); loadFxRate(); }, [loadData, loadFxRate]);

  // Auto-sync deposit currency to match selected asset
  useEffect(() => {
    const assetCur = data[selectedAsset]?.currency || "THB";
    setForm(f => ({ ...f, depositCurrency: assetCur }));
  }, [selectedAsset, data]);

  const saveAll = useCallback(async (newAssets, newData) => {
    setSaving(true);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ assets: newAssets, data: newData }), true); }
    catch { notify("บันทึกไม่สำเร็จ","error"); }
    setSaving(false);
  }, []);

  const handleUnlock = () => { setIsAdmin(true); setShowPasswordGate(false); setEditMode(true); notify("ปลดล็อคสำเร็จ ✓"); };
  const handleLock = () => { setIsAdmin(false); setEditMode(false); setTab("overview"); setShowMoney(true); notify("ออกจากโหมดแก้ไขแล้ว"); };
  const handleShare = () => { const url=window.location.href; navigator.clipboard.writeText(url).then(()=>notify("คัดลอกลิงก์แล้ว! 🔗")).catch(()=>window.prompt("ลิงก์:",url)); };

  const addEntry = async () => {
    if (!isAdmin) return;
    if (!form.date || form.pct==="") return notify("กรุณากรอกวันที่และ %","error");
    const pct = parseFloat(form.pct); if (isNaN(pct)) return notify("% ต้องเป็นตัวเลข","error");
    // Convert deposit to asset's native currency
    let depositRaw = form.deposit!=="" ? parseFloat(form.deposit) : 0;
    const assetCurrency = data[selectedAsset]?.currency || "THB";
    let deposit = depositRaw;
    if (form.depositCurrency === "USD" && assetCurrency === "THB") deposit = depositRaw * fxRate;
    else if (form.depositCurrency === "THB" && assetCurrency === "USD") deposit = depositRaw / fxRate;
    deposit = parseFloat(deposit.toFixed(4));
    const updated = {...data};
    if (!updated[selectedAsset]) updated[selectedAsset] = {principal:0,entries:[]};
    const psManual = form.profitShare !== "" ? parseFloat(form.profitShare) : undefined;
    const entryObj = {
      id: genId(), date: form.date, pct,
      deposit,                          // stored in asset's native currency (for calculation)
      depositOrig: depositRaw,          // original amount user typed (for display)
      depositOrigCurrency: form.depositCurrency, // original currency user selected
      ...(psManual !== undefined && { profitShare: psManual })
    };
    updated[selectedAsset].entries = [...updated[selectedAsset].entries, entryObj]
      .sort((a,b) => a.date.localeCompare(b.date) || (a.id||"").localeCompare(b.id||""));
    notify("บันทึกแล้ว");
    setData(updated); setForm({date:todayStr(),pct:"",deposit:"",depositCurrency:"THB",profitShare:""}); await saveAll(assets,updated);
  };

  const deleteEntry = async (asset, id) => {
    if (!isAdmin) return;
    const updated={...data,[asset]:{...data[asset],entries:data[asset].entries.filter(e=>(e.id||e.date)!==id)}};
    setData(updated); await saveAll(assets,updated); notify("ลบแล้ว");
  };

  const editField = async (asset, id, field, value) => {
    if (!isAdmin) return;
    const updated={...data};
    if (field==="date") {
      updated[asset].entries=updated[asset].entries
        .map(e=>(e.id||e.date)===id?{...e,date:value}:e)
        .sort((a,b)=>a.date.localeCompare(b.date)||(a.id||"").localeCompare(b.id||""));
    } else { updated[asset].entries=updated[asset].entries.map(e=>(e.id||e.date)===id?{...e,[field]:value}:e); }
    setData(updated); await saveAll(assets,updated); notify("แก้ไขแล้ว ✓");
  };

  const setPrincipal = async (asset, value) => {
    if (!isAdmin) return;
    const updated={...data,[asset]:{...data[asset],principal:value}};
    setData(updated); await saveAll(assets,updated); notify("บันทึกทุนตั้งต้นแล้ว ✓");
  };

  const addAsset = async () => {
    if (!isAdmin) return; const name=newAsset.trim().toUpperCase();
    if (!name||assets.includes(name)) return notify("ชื่อซ้ำหรือว่างเปล่า","error");
    const newAssets=[...assets,name]; const newData={...data,[name]:{principal:0,entries:[]}};
    setAssets(newAssets); setData(newData); setSelectedAsset(name); setNewAsset(""); await saveAll(newAssets,newData); notify(`เพิ่ม ${name} แล้ว`);
  };

  const removeAsset = async (a) => {
    if (!isAdmin) return; const newAssets=assets.filter(x=>x!==a); const newData={...data}; delete newData[a];
    setAssets(newAssets); setData(newData); setSelectedAsset(newAssets[0]||""); await saveAll(newAssets,newData); notify(`ลบ ${a} แล้ว`);
  };

  const renameAsset = async (oldName, newName) => {
    if (!isAdmin||oldName===newName) { setRenameTarget(null); return; }
    if (assets.includes(newName)) { notify("มีชื่อนี้อยู่แล้ว","error"); return; }
    const newAssets=assets.map(a=>a===oldName?newName:a);
    const newData={}; Object.keys(data).forEach(k=>{newData[k===oldName?newName:k]=data[k];});
    setAssets(newAssets); setData(newData); setSelectedAsset(p=>p===oldName?newName:p); setRenameTarget(null);
    await saveAll(newAssets,newData); notify(`เปลี่ยนชื่อเป็น ${newName} แล้ว`);
  };

  const getAssetStats = useCallback((asset) => {
    const d = data[asset] || {principal:0,entries:[],currency:"THB"};
    const entries = d.entries || []; const principal = d.principal || 0;
    const currency = d.currency || "THB";
    const totalDeposited = entries.reduce((s,e)=>s+(e.deposit||0),0);
    const totalProfitShare = entries.reduce((s,e)=>s+(e.profitShare||0),0);
    const totalInvested = principal + totalDeposited;
    const withCum = calcCumulative(entries);
    const withMoney = calcMoneyHistory(principal, entries);
    const currentBalance = withMoney.length>0 ? withMoney[withMoney.length-1].balance : principal;
    const total = withCum.length>0 ? withCum[withCum.length-1].cumulative : 0;
    const realPct = totalInvested>0 ? parseFloat(((currentBalance-totalInvested)/totalInvested*100).toFixed(2)) : total;
    const todayEntry = withCum.find(e=>e.date===todayStr());
    // Exclude 0% entries from trading stats (those are deposit/withdrawal only days)
    const tradedEntries = entries.filter(e=>e.pct!==0);
    const wins = tradedEntries.filter(e=>e.pct>0).length;
    const wr = tradedEntries.length ? ((wins/tradedEntries.length)*100).toFixed(1) : 0;
    const best = tradedEntries.length ? Math.max(...tradedEntries.map(e=>e.pct)) : null;
    const worst = tradedEntries.length ? Math.min(...tradedEntries.map(e=>e.pct)) : null;
    // Convert to both currencies
    const balanceTHB = currency==="USD" ? currentBalance * fxRate : currentBalance;
    const balanceUSD = currency==="USD" ? currentBalance : currentBalance / fxRate;
    const investedTHB = currency==="USD" ? totalInvested * fxRate : totalInvested;
    const investedUSD = currency==="USD" ? totalInvested : totalInvested / fxRate;
    const hasPS = entries.some(e => e.profitShare !== undefined && e.profitShare !== null);
    const losses = tradedEntries.filter(e=>e.pct<0).length;
    const lr = tradedEntries.length ? ((losses/tradedEntries.length)*100).toFixed(1) : 0;
    return {entries,principal,totalDeposited,totalInvested,totalProfitShare,hasPS,withCum,withMoney,total,realPct,currentBalance,balanceTHB,balanceUSD,investedTHB,investedUSD,currency,todayEntry,best,worst,wr,lr,wins,losses,count:tradedEntries.length};
  }, [data, fxRate]);

  // Portfolio totals in THB (normalised) - recalculates whenever data or fxRate changes
  const portfolioTotals = useMemo(() => {
    const stats = assets.map(a=>getAssetStats(a));
    const balTHB = stats.reduce((s,st)=>s+st.balanceTHB,0);
    const invTHB = stats.reduce((s,st)=>s+st.investedTHB,0);
    return { balTHB, invTHB, balUSD: balTHB/fxRate, invUSD: invTHB/fxRate };
  }, [assets, data, fxRate, getAssetStats]);
  const totalPortfolioBalanceTHB = portfolioTotals.balTHB;
  const totalPortfolioInvestedTHB = portfolioTotals.invTHB;
  const totalPortfolioBalanceUSD = portfolioTotals.balUSD;
  const totalPortfolioInvestedUSD = portfolioTotals.invUSD;
  const totalPortfolioBalance = totalPortfolioBalanceTHB;
  const totalPortfolioInvested = totalPortfolioInvestedTHB;
  const hasMoney = useMemo(()=>assets.some(a=>{ const d=data[a]||{}; const p=d.principal||0; const deps=(d.entries||[]).reduce((s,e)=>s+(e.deposit||0),0); return p+deps>0; }),[assets,data]);

  const overallPct = useMemo(() => {
    if (assets.length===0) return "0.00";
    const allStats = assets.map(a=>getAssetStats(a));

    // Assets ที่มีเงินลงทุน: ใช้ weighted % จากเงินจริง (ใน THB)
    const moneyAssets = allStats.filter(st=>st.totalInvested>0);
    const noMoneyAssets = allStats.filter(st=>st.totalInvested===0);

    if (moneyAssets.length > 0) {
      // weighted average: (sum of gain in THB) / (sum of invested in THB)
      const totalGainTHB = moneyAssets.reduce((s,st)=>s+(st.balanceTHB-st.investedTHB),0);
      const totalInvTHB  = moneyAssets.reduce((s,st)=>s+st.investedTHB,0);
      const weightedPct  = (totalGainTHB/totalInvTHB*100);
      // ถ้ามี Asset ที่ไม่มีเงินด้วย ให้เฉลี่ย compound % ของมันรวมเข้าไปด้วย
      if (noMoneyAssets.length > 0) {
        const noMoneyAvg = noMoneyAssets.reduce((s,st)=>s+st.total,0)/noMoneyAssets.length;
        return ((weightedPct + noMoneyAvg) / 2).toFixed(2);
      }
      return weightedPct.toFixed(2);
    }
    // ไม่มีเงินลงทุนเลย: เฉลี่ย compound % ธรรมดา
    return (allStats.reduce((s,st)=>s+st.total,0)/assets.length).toFixed(2);
  }, [assets, data, fxRate, getAssetStats]);

  const cs = getAssetStats(selectedAsset);
  const chartData = cs.withCum.map((e,i)=>({ date:e.date.slice(5), pct:e.pct, cumulative:e.cumulative, balance:cs.withMoney[i]?.balance??0 }));
  const pctColor = (v) => (v>0?"#00e5a0":v<0?"#ff4d6d":"#888");

  const TABS = isAdmin
    ? [{id:"overview",label:"OVERVIEW"},{id:"detail",label:"DETAIL"},{id:"stats",label:"📊 STATS"},{id:"analysis",label:"🔍 ANALYSIS"},{id:"add",label:"+ บันทึก"}]
    : [{id:"overview",label:"OVERVIEW"},{id:"detail",label:"DETAIL"},{id:"stats",label:"📊 STATS"},{id:"analysis",label:"🔍 ANALYSIS"}];

  if (loading) return (
    <div style={{ background:"#080d14",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div style={{ color:"#00e5a0",fontFamily:"monospace",fontSize:20,letterSpacing:4 }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ background:"#080d14",minHeight:"100vh",fontFamily:"'Space Mono','Courier New',monospace",color:"#e8eaf0",padding:"0 0 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0d1520}::-webkit-scrollbar-thumb{background:#00e5a040}
        .tab-btn{background:none;border:none;cursor:pointer;padding:10px 18px;font-family:inherit;font-size:12px;letter-spacing:1px;transition:all .2s;white-space:nowrap}
        .tab-btn.active{color:#00e5a0;border-bottom:2px solid #00e5a0;font-weight:700}.tab-btn:not(.active){color:#6a7a8a}
        .asset-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:2px;font-size:12px;letter-spacing:1px;cursor:pointer;border:1px solid;transition:all .15s}
        .asset-chip.active{background:#00e5a015;border-color:#00e5a0;color:#00e5a0}.asset-chip:not(.active){background:transparent;border-color:#2a3a4a;color:#8a9aaa}
        .inp{background:#0d1520;border:1px solid #2a3a4a;color:#f0f4f8;padding:9px 14px;font-family:inherit;font-size:13px;outline:none;border-radius:2px}
        .inp:focus{border-color:#00e5a060}
        .btn{background:#00e5a0;color:#080d14;border:none;padding:9px 22px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;border-radius:2px;transition:all .15s}
        .btn:hover{background:#00ffb3}
        .btn-outline{background:transparent;border:1px solid #1e2a3a;color:#778;padding:7px 14px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:2px;transition:all .15s}
        .btn-outline:hover{border-color:#ff4d6d;color:#ff4d6d}
        .btn-icon{background:transparent;border:1px solid #1e2a3a;color:#556;padding:3px 8px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:2px;transition:all .15s;margin-left:4px}
        .btn-icon:hover{border-color:#6eb5ff;color:#6eb5ff}
        .stat-card{background:#0d1520;border:1px solid #1a2535;padding:20px;border-radius:4px} .stat-label{font-size:11px;color:#7a8fa6;letter-spacing:2px;margin-bottom:6px;text-transform:uppercase}
        .entry-row{transition:background .1s;border-bottom:1px solid #111820}.entry-row:hover{background:#0f1a28}
        .badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:2px;font-size:12px;letter-spacing:1px;cursor:pointer;border:1px solid;transition:all .15s;font-family:inherit;font-weight:600}
        .eye-btn{background:none;border:none;cursor:pointer;font-size:15px;color:#445;padding:2px 4px;transition:color .15s;line-height:1}
        .eye-btn:hover{color:#e8eaf0}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
        @keyframes slideIn{from{transform:translateY(-10px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {showPasswordGate && <PasswordGate onUnlock={handleUnlock} onClose={()=>setShowPasswordGate(false)} />}
      <FxRateBar fxRate={fxRate} fxUpdated={fxUpdated} isAdmin={isAdmin} onUpdate={handleFxUpdate} />
      {renameTarget && <RenameModal asset={renameTarget} existing={assets} onSave={n=>renameAsset(renameTarget,n)} onClose={()=>setRenameTarget(null)} />}
      {notification && (
        <div style={{ position:"fixed",top:20,right:20,zIndex:1000,background:notification.type==="error"?"#ff4d6d20":"#00e5a020",border:`1px solid ${notification.type==="error"?"#ff4d6d":"#00e5a0"}`,color:notification.type==="error"?"#ff4d6d":"#00e5a0",padding:"10px 20px",borderRadius:2,fontSize:13,letterSpacing:1,animation:"slideIn .2s ease" }}>
          {notification.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1a2535",padding:"24px 32px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue'",fontSize:32,letterSpacing:6,color:"#e8eaf0" }}>PROFIT TRACKER</div>
          <div style={{ fontSize:11,color:"#445",letterSpacing:3,marginTop:2 }}>DAILY PERFORMANCE DASHBOARD</div>
        </div>
        <div style={{ textAlign:"right" }}>
          {hasMoney && (
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:2 }}>PORTFOLIO VALUE</div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6 }}>
                <div>
                  <span style={{ fontFamily:"'Bebas Neue'",fontSize:28,color:"#6eb5ff",letterSpacing:2 }}>
                    {isAdmin?(showMoney?fmtTHB(totalPortfolioBalanceTHB):"฿ ••••••"):"฿ ••••••"}
                  </span>
                  {isAdmin&&showMoney&&<div style={{ fontSize:11,color:"#445",textAlign:"right" }}>{fmtUSD(totalPortfolioBalanceUSD)}</div>}
                </div>
                {isAdmin && <button className="eye-btn" onClick={()=>setShowMoney(!showMoney)}>{showMoney?"👁":"🙈"}</button>}
              </div>
              {isAdmin&&showMoney&&totalPortfolioInvestedTHB>0&&<div style={{ fontSize:10,color:"#445",letterSpacing:1,marginTop:1 }}>ทุนรวม: {fmtTHB(totalPortfolioInvestedTHB)} / {fmtUSD(totalPortfolioInvestedUSD)}</div>}
            </div>
          )}
          <div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:2 }}>PORTFOLIO TOTAL</div>
          <div style={{ fontFamily:"'Bebas Neue'",fontSize:42,color:pctColor(parseFloat(overallPct)),letterSpacing:2 }}>
            {parseFloat(overallPct)>0?"+":""}{overallPct}%
          </div>
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center",marginTop:6 }}>
            {saving&&<span style={{ fontSize:10,color:"#445",letterSpacing:2 }}>SYNCING...</span>}
            <button className="badge" onClick={handleShare} style={{ background:"transparent",borderColor:"#2a3545",color:"#6eb5ff" }}>🔗 แชร์</button>
            {isAdmin
              ? <button className="badge" onClick={handleLock} style={{ background:"#00e5a010",borderColor:"#00e5a050",color:"#00e5a0" }}>🔓 ADMIN — ล็อค</button>
              : <button className="badge" onClick={()=>setShowPasswordGate(true)} style={{ background:"transparent",borderColor:"#2a3545",color:"#445" }}>🔒 VIEW ONLY</button>
            }
          </div>
        </div>
      </div>

      {/* Asset chips */}
      <div style={{ padding:"16px 32px",borderBottom:"1px solid #1a2535",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center" }}>
        {assets.map(a=>{
          const s=getAssetStats(a);
          return (
            <div key={a} style={{ display:"inline-flex",alignItems:"center" }}>
              <div className={`asset-chip ${selectedAsset===a?"active":""}`} onClick={()=>{setSelectedAsset(a);setTab("detail");}} style={{ borderRadius:isAdmin&&editMode?"2px 0 0 2px":"2px" }}>
                {a} <span style={{ opacity:0.7,fontSize:11,color:pctColor(s.total) }}>{s.total>0?"+":""}{s.total.toFixed(1)}%</span>
              </div>
              {isAdmin&&editMode&&<button className="btn-icon" onClick={()=>setRenameTarget(a)} style={{ borderLeft:"none",borderRadius:"0 2px 2px 0",padding:"5px 8px" }}>✏️</button>}
            </div>
          );
        })}
        {isAdmin&&editMode&&(
          <div style={{ display:"flex",gap:6 }}>
            <input className="inp" placeholder="ชื่อสินทรัพย์" value={newAsset} onChange={e=>setNewAsset(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addAsset()} style={{ width:130,padding:"5px 10px",fontSize:12 }} />
            <button className="btn" onClick={addAsset} style={{ padding:"5px 14px",fontSize:12 }}>+ เพิ่ม</button>
          </div>
        )}
        {isAdmin&&<button className="btn-outline" onClick={()=>setEditMode(!editMode)} style={{ marginLeft:"auto",fontSize:11,letterSpacing:1 }}>{editMode?"✓ เสร็จ":"⚙ จัดการ"}</button>}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex",borderBottom:"1px solid #1a2535",padding:"0 32px",overflowX:"auto" }}>
        {TABS.map(t=>(
          <button key={t.id} className={`tab-btn ${tab===t.id?"active":""}`} onClick={()=>{ setTab(t.id); if(t.id==="add") setForm(f=>({...f,depositCurrency:data[selectedAsset]?.currency||"THB"})); }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding:"28px 32px" }}>

        {/* OVERVIEW */}
        {tab==="overview"&&(
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))",gap:20 }}>
            {assets.map(a=>{
              const s=getAssetStats(a);
              const todayPct = s.todayEntry?.pct;
              return (
                <div key={a} className="stat-card" style={{ cursor:"pointer",transition:"all .2s",borderRadius:6,padding:"22px 24px" }}
                  onClick={()=>{setSelectedAsset(a);setTab("detail");}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#00e5a060";e.currentTarget.style.transform="translateY(-2px)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a2535";e.currentTarget.style.transform="translateY(0)";}}>

                  {/* Asset name + today badge */}
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
                    <div style={{ fontSize:13,color:"#c0cfe0",letterSpacing:3,fontWeight:700 }}>{a}</div>
                    {todayPct!==undefined&&(
                      <div style={{ fontSize:11,padding:"2px 8px",borderRadius:2,fontWeight:700,
                        background: todayPct>0?"#00e5a015":todayPct<0?"#ff4d6d15":"#ffffff10",
                        color: pctColor(todayPct),border:`1px solid ${pctColor(todayPct)}40` }}>
                        {fmtPct(todayPct)}
                      </div>
                    )}
                  </div>

                  {/* Main % */}
                  <div style={{ fontFamily:"'Bebas Neue'",fontSize:42,color:pctColor(s.total),letterSpacing:2,lineHeight:1 }}>
                    {s.total>0?"+":""}{s.total.toFixed(2)}%
                  </div>
                  <div style={{ fontSize:11,color:"#5a6a7a",marginTop:2,marginBottom:12 }}>กำไรสะสม</div>

                  {/* Balance */}
                  {s.totalInvested>0&&(
                    <div style={{ background:"#0a1220",borderRadius:4,padding:"8px 12px",marginBottom:12 }}>
                      <div style={{ fontSize:10,color:"#5a6a7a",letterSpacing:2,marginBottom:3 }}>ยอดปัจจุบัน</div>
                      <div style={{ fontSize:15,color:"#6eb5ff",fontWeight:700 }}>
                        {isAdmin?(showMoney?(
                          <span>
                            {fmtMoney(s.currentBalance,s.currency)}
                            {s.currency==="USD"&&<span style={{ fontSize:11,color:"#5a6a7a",marginLeft:6 }}>{fmtTHB(s.balanceTHB)}</span>}
                            {s.currency==="THB"&&<span style={{ fontSize:11,color:"#5a6a7a",marginLeft:6 }}>{fmtUSD(s.balanceUSD)}</span>}
                          </span>
                        ):"฿ •••••••"):"฿ •••••••"}
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  <div style={{ display:"flex",gap:0,borderTop:"1px solid #1a2535",paddingTop:10 }}>
                    <div style={{ flex:1,textAlign:"center" }}>
                      <div style={{ fontSize:10,color:"#5a6a7a",marginBottom:2 }}>W RATE</div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#00e5a0" }}>{s.wr}%</div>
                    </div>
                    <div style={{ width:1,background:"#1a2535" }}/>
                    <div style={{ flex:1,textAlign:"center" }}>
                      <div style={{ fontSize:10,color:"#5a6a7a",marginBottom:2 }}>L RATE</div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#ff4d6d" }}>{s.lr}%</div>
                    </div>
                    <div style={{ width:1,background:"#1a2535" }}/>
                    <div style={{ flex:1,textAlign:"center" }}>
                      <div style={{ fontSize:10,color:"#5a6a7a",marginBottom:2 }}>วันเทรด</div>
                      <div style={{ fontSize:14,fontWeight:700,color:"#c0cfe0" }}>{s.count}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DETAIL */}
        {tab==="detail"&&selectedAsset&&(
          <div>
            <div style={{ display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Bebas Neue'",fontSize:24,letterSpacing:4,color:"#00e5a0" }}>{selectedAsset}</span>
              {isAdmin&&editMode&&(
                <>
                  <button className="btn-icon" onClick={()=>setRenameTarget(selectedAsset)}>✏️ เปลี่ยนชื่อ</button>
                  {assets.length>1&&<button className="btn-outline" onClick={()=>removeAsset(selectedAsset)}>ลบ</button>}
                </>
              )}
            </div>

            {isAdmin&&(
              <div className="stat-card" style={{ marginBottom:16 }}>
                <div style={{ display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
                  <div>
                    <div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:4 }}>สกุลเงิน</div>
                    <div style={{ display:"flex",gap:4 }}>
                      {["THB","USD"].map(c=>(
                        <button key={c} onClick={async()=>{ if(!isAdmin)return; const upd={...data,[selectedAsset]:{...data[selectedAsset],currency:c}}; setData(upd); await saveAll(assets,upd); notify(`เปลี่ยนเป็น ${c} แล้ว`); }}
                          style={{ padding:"3px 12px",fontSize:11,fontFamily:"inherit",cursor:"pointer",borderRadius:2,border:`1px solid ${cs.currency===c?"#6eb5ff":"#1e2a3a"}`,background:cs.currency===c?"#6eb5ff20":"transparent",color:cs.currency===c?"#6eb5ff":"#556",transition:"all .15s" }}>
                          {c==="THB"?"฿ THB":"$ USD"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ width:1,height:32,background:"#1a2535" }} />
                  <div><div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:4 }}>ทุนตั้งต้น</div><EditableNumCell value={cs.principal} color="#6eb5ff" prefix={cs.currency==="USD"?"$":"฿"} onSave={v=>setPrincipal(selectedAsset,v)} /></div>
                  <div style={{ width:1,height:32,background:"#1a2535" }} />
                  <div>
                    <div style={{ fontSize:10,color:"#f5a623",letterSpacing:2,marginBottom:4 }}>PROFIT SHARING สะสม</div>
                    <span style={{ fontFamily:"'Bebas Neue'",fontSize:22,color:"#f5a623",letterSpacing:2 }}>
                      {cs.totalProfitShare>0 ? `-${fmtMoney(cs.totalProfitShare,cs.currency)}` : "—"}
                    </span>
                  </div>
                  <div style={{ width:1,height:32,background:"#1a2535" }} />
                  <div><div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:4 }}>ฝากสะสม</div>
                    <span style={{ color:cs.totalDeposited>=0?"#00e5a0":"#ff4d6d",fontSize:13 }}>{showMoney?`${cs.totalDeposited>=0?"+":""}${fmtMoney(cs.totalDeposited,cs.currency)}`:"•••••"}</span>
                  </div>
                  <div style={{ width:1,height:32,background:"#1a2535" }} />
                  <div><div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:4 }}>ทุนรวม</div>
                    <div>
                      <span style={{ color:"#e8eaf0",fontSize:13,fontWeight:700 }}>{showMoney?(cs.totalInvested>0?fmtMoney(cs.totalInvested,cs.currency):"—"):"•••••"}</span>
                      {showMoney&&cs.currency==="USD"&&<div style={{ fontSize:10,color:"#445" }}>{fmtTHB(cs.investedTHB)}</div>}
                      {showMoney&&cs.currency==="THB"&&<div style={{ fontSize:10,color:"#445" }}>{fmtUSD(cs.investedUSD)}</div>}
                    </div>
                  </div>
                  <div style={{ marginLeft:"auto",textAlign:"right" }}>
                    <div style={{ fontSize:10,color:"#445",letterSpacing:2,marginBottom:4 }}>ยอดปัจจุบัน</div>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div>
                        <span style={{ fontFamily:"'Bebas Neue'",fontSize:22,color:"#6eb5ff",letterSpacing:2 }}>{showMoney?fmtMoney(cs.currentBalance,cs.currency):"•••••"}</span>
                        {showMoney&&cs.currency==="USD"&&<div style={{ fontSize:10,color:"#445",marginTop:1 }}>{fmtTHB(cs.balanceTHB)}</div>}
                        {showMoney&&cs.currency==="THB"&&<div style={{ fontSize:10,color:"#445",marginTop:1 }}>{fmtUSD(cs.balanceUSD)}</div>}
                      </div>
                      <button className="eye-btn" onClick={()=>setShowMoney(!showMoney)}>{showMoney?"👁":"🙈"}</button>
                    </div>
                    {cs.totalInvested>0&&<div style={{ fontSize:11,color:pctColor(cs.realPct),marginTop:2 }}>{cs.realPct>0?"+":""}{cs.realPct}% จากทุน</div>}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:8 }}>
              {[
                {label:"กำไรสะสม",value:fmtPct(cs.total),color:pctColor(cs.total)},
                {label:"ดีที่สุด",value:cs.best!==null?fmtPct(cs.best):"—",color:"#00e5a0"},
                {label:"แย่ที่สุด",value:cs.worst!==null?fmtPct(cs.worst):"—",color:"#ff4d6d"},
              ].map(s=>(
                <div key={s.label} className="stat-card">
                  <div style={{ fontSize:11,color:"#6eb5ff88",letterSpacing:2,marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue'",fontSize:30,color:s.color,letterSpacing:2 }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24 }}>
              <div className="stat-card">
                <div style={{ fontSize:11,color:"#6eb5ff88",letterSpacing:2,marginBottom:6 }}>WIN RATE</div>
                <div style={{ fontFamily:"'Bebas Neue'",fontSize:30,color:"#00e5a0",letterSpacing:2 }}>{cs.wr}%</div>
                <div style={{ fontSize:11,color:"#00e5a066",marginTop:4 }}>ชนะ {cs.wins} วัน</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize:11,color:"#6eb5ff88",letterSpacing:2,marginBottom:6 }}>LOSS RATE</div>
                <div style={{ fontFamily:"'Bebas Neue'",fontSize:30,color:"#ff4d6d",letterSpacing:2 }}>{cs.lr}%</div>
                <div style={{ fontSize:11,color:"#ff4d6d66",marginTop:4 }}>แพ้ {cs.losses} วัน</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize:11,color:"#6eb5ff88",letterSpacing:2,marginBottom:6 }}>วันเทรด</div>
                <div style={{ fontFamily:"'Bebas Neue'",fontSize:30,color:"#e8eaf0",letterSpacing:2 }}>{cs.count}</div>
                <div style={{ fontSize:11,color:"#445",marginTop:4 }}>ไม่นับวัน 0%</div>
              </div>
            </div>

            {isAdmin&&cs.hasPS&&(
              <div className="stat-card" style={{ marginBottom:12, display:"flex",alignItems:"center",gap:16 }}>
                <div style={{ fontSize:10,color:"#f5a623",letterSpacing:2 }}>PROFIT SHARING สะสม</div>
                <span style={{ fontFamily:"'Bebas Neue'",fontSize:24,color:"#f5a623",letterSpacing:2 }}>
                  {cs.totalProfitShare>0 ? `-${fmtMoney(cs.totalProfitShare,cs.currency)}` : "—"}
                </span>
                <span style={{ fontSize:10,color:"#445",marginLeft:"auto" }}>{cs.entries.filter(e=>e.profitShare).length} รายการ</span>
              </div>
            )}
            {chartData.length>0?(
              <div className="stat-card" style={{ marginBottom:24 }}>
                <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:16 }}>CUMULATIVE PERFORMANCE</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2535" />
                    <XAxis dataKey="date" tick={{ fill:"#445",fontSize:11 }} />
                    <YAxis yAxisId="pct" tick={{ fill:"#445",fontSize:11 }} tickFormatter={v=>`${v}%`} />
                    {cs.totalInvested>0&&isAdmin&&showMoney&&<YAxis yAxisId="bal" orientation="right" tick={{ fill:"#445",fontSize:10 }} tickFormatter={v=>`฿${(v/1000).toFixed(0)}K`} />}
                    <Tooltip contentStyle={{ background:"#0d1520",border:"1px solid #1a2535",borderRadius:2,fontFamily:"monospace",fontSize:11 }}
                      formatter={(v,n)=>n==="ยอดเงิน"?[fmtMoney(v),n]:[fmtPct(v),n]} />
                    <ReferenceLine yAxisId="pct" y={0} stroke="#1e2a3a" />
                    <Line yAxisId="pct" type="monotone" dataKey="cumulative" stroke="#00e5a0" strokeWidth={2} dot={{ fill:"#00e5a0",r:3 }} name="สะสม %" />
                    <Line yAxisId="pct" type="monotone" dataKey="pct" stroke="#6eb5ff33" strokeWidth={1} dot={false} name="รายวัน %" />
                    {cs.totalInvested>0&&isAdmin&&showMoney&&<Line yAxisId="bal" type="monotone" dataKey="balance" stroke="#f5a623" strokeWidth={1.5} dot={false} name="ยอดเงิน" strokeDasharray="4 2" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ):(
              <div style={{ textAlign:"center",color:"#334",padding:"40px 0",fontSize:13,letterSpacing:2 }}>ยังไม่มีข้อมูล</div>
            )}

            {cs.withCum.length>0&&(
              <div className="stat-card">
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                  <div style={{ fontSize:11,color:"#445",letterSpacing:2 }}>ประวัติรายวัน</div>
                  {isAdmin&&editMode&&<div style={{ fontSize:10,color:"#334" }}>✏️ คลิกที่ค่าเพื่อแก้ไข</div>}
                </div>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid #1a2535" }}>
                      <th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#445",letterSpacing:2,fontWeight:400 }}>วันที่</th>
                      <th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#445",letterSpacing:2,fontWeight:400 }}>วัน</th>
                      <th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#445",letterSpacing:2,fontWeight:400 }}>% วันนั้น</th>
                      <th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#445",letterSpacing:2,fontWeight:400 }}>% สะสม</th>
                      {isAdmin&&<th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#6eb5ff66",letterSpacing:2,fontWeight:400 }}>
                        ฝาก/ถอน ({cs.currency}) <button className="eye-btn" style={{ fontSize:12 }} onClick={()=>setShowMoney(!showMoney)}>{showMoney?"👁":"🙈"}</button>
                      </th>}
                      {isAdmin&&cs.hasPS&&<th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#f5a62388",letterSpacing:2,fontWeight:400 }}>PS หัก</th>}
                      {isAdmin&&cs.totalInvested>0&&<th style={{ textAlign:"left",padding:"6px 8px",fontSize:10,color:"#6eb5ff66",letterSpacing:2,fontWeight:400 }}>ยอดเงิน</th>}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cs.withCum.map((e,eIdx)=>{ const entryId = e.id || e.date;
                      const mRow=cs.withMoney[eIdx];
                      return (
                        <tr key={entryId} className="entry-row">
                          <td style={{ padding:"8px 8px" }}>
                            {isAdmin&&editMode?<EditableDateCell value={e.date} onSave={v=>editField(selectedAsset,entryId,"date",v)} />:<span style={{ color:"#8a9aaa" }}>{e.date}</span>}
                            {(() => { const sameDay = cs.withCum.filter(x=>x.date===e.date); const n = sameDay.indexOf(e)+1; return sameDay.length>1 ? <span style={{ fontSize:9,color:"#445",marginLeft:4 }}>รอบ {n}</span> : null; })()}
                          </td>
                          <td style={{ padding:"8px 8px",color:"#556",fontSize:11 }}>{DAYS_TH[getDayOfWeek(e.date)]}</td>
                          <td style={{ padding:"8px 8px" }}>{isAdmin&&editMode?<EditableNumCell value={e.pct} color={pctColor(e.pct)} suffix="%" onSave={v=>editField(selectedAsset,entryId,"pct",v)} />:<span style={{ color:pctColor(e.pct),fontWeight:700 }}>{fmtPct(e.pct)}</span>}</td>
                          <td style={{ padding:"8px 8px",color:pctColor(e.cumulative) }}>{fmtPct(e.cumulative)}</td>
                          {isAdmin&&<td style={{ padding:"8px 8px" }}>
                            {isAdmin&&editMode
                              ? <EditableNumCell value={e.deposit||0} color={e.deposit>0?"#00e5a0":e.deposit<0?"#ff4d6d":"#445"} prefix={cs.currency==="USD"?"$":"฿"} onSave={v=>editField(selectedAsset,entryId,"deposit",v)} />
                              : <span style={{ color:e.deposit>0?"#00e5a0":e.deposit<0?"#ff4d6d":"#334",fontSize:11 }}>
                                  {showMoney ? (e.deposit ? (() => {
                                    const origAmt = e.depositOrig !== undefined ? e.depositOrig : e.deposit;
                                    const origCur = e.depositOrigCurrency || cs.currency;
                                    const sign = origAmt > 0 ? "+" : "";
                                    const mainStr = `${sign}${fmtMoney(Math.abs(origAmt), origCur)}`;
                                    const isDiff = origCur !== cs.currency;
                                    return (
                                      <span>
                                        {mainStr}
                                        {isDiff && <span style={{ fontSize:9,color:"#445",marginLeft:3 }}>≈{fmtMoney(Math.abs(e.deposit),cs.currency)}</span>}
                                      </span>
                                    );
                                  })() : "—") : "•••••"}
                                </span>
                            }
                          </td>}
                          {isAdmin&&cs.hasPS&&<td style={{ padding:"8px 8px" }}>
                            {isAdmin&&editMode
                              ? <EditableNumCell value={e.profitShare||0} color="#f5a623" prefix={cs.currency==="USD"?"$":"฿"} onSave={v=>editField(selectedAsset,entryId,"profitShare",v)} />
                              : <span style={{ color:"#f5a623",fontSize:11 }}>
                                  {showMoney ? (e.profitShare>0 ? `-${fmtMoney(e.profitShare,cs.currency)}` : "—") : "•••••"}
                                </span>
                            }
                          </td>}
                          {isAdmin&&cs.totalInvested>0&&<td style={{ padding:"8px 8px" }}>
                        {showMoney&&mRow?(
                          <span style={{ color:"#6eb5ff",fontSize:11 }}>{fmtMoney(mRow.balance,cs.currency)}<span style={{ color:"#334",fontSize:10,marginLeft:4 }}>{cs.currency==="USD"?fmtTHB(mRow.balance*fxRate):fmtUSD(mRow.balance/fxRate)}</span></span>
                        ):<span style={{ color:"#334",fontSize:11 }}>•••••</span>}
                      </td>}
                          <td style={{ padding:"8px 8px",textAlign:"right" }}>{isAdmin&&editMode&&<button className="btn-outline" style={{ fontSize:10,padding:"3px 8px" }} onClick={()=>deleteEntry(selectedAsset,entryId)}>ลบ</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* STATS */}
        {tab==="stats"&&<StatsTab assets={assets} data={data} getAssetStats={getAssetStats} pctColor={pctColor} isAdmin={isAdmin} showMoney={showMoney} />}

        {/* ANALYSIS */}
        {tab==="analysis"&&<AnalysisTab assets={assets} data={data} pctColor={pctColor} />}

        {/* ADD */}
        {tab==="add"&&isAdmin&&(
          <div style={{ maxWidth:480 }}>
            <div style={{ fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:4,color:"#e8eaf0",marginBottom:24 }}>บันทึกกำไร/ขาดทุน</div>
            <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
              <div>
                <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:8 }}>สินทรัพย์</div>
                <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                  {assets.map(a=><div key={a} className={`asset-chip ${selectedAsset===a?"active":""}`}
                    onClick={()=>{ setSelectedAsset(a); setForm(f=>({...f,depositCurrency:data[a]?.currency||"THB"})); }}>{a}</div>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:8 }}>วันที่</div>
                <input type="date" className="inp" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{ width:"100%" }} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:8 }}>% กำไร/ขาดทุน</div>
                <input type="number" step="0.01" className="inp" placeholder="เช่น 3.5 หรือ -1.2" value={form.pct} onChange={e=>setForm({...form,pct:e.target.value})} style={{ width:"100%" }} />
              </div>
              <div>
                <div style={{ fontSize:11,color:"#445",letterSpacing:2,marginBottom:4 }}>
                  ฝาก/ถอนเพิ่ม <span style={{ color:"#334" }}>— ไม่กรอก = 0</span>
                </div>
                <div style={{ fontSize:10,color:"#334",marginBottom:8 }}>ฝากเพิ่มใส่บวก เช่น 5000 / ถอนออกใส่ลบ เช่น -2000</div>
                <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                  <input type="number" step="1" className="inp" placeholder="0" value={form.deposit}
                    onChange={e=>setForm({...form,deposit:e.target.value})} style={{ flex:1 }} />
                  <div style={{ display:"flex",gap:0,flexShrink:0 }}>
                    {["THB","USD"].map(c=>(
                      <button key={c} onClick={()=>setForm({...form,depositCurrency:c})}
                        style={{ padding:"9px 14px",fontSize:12,fontFamily:"inherit",cursor:"pointer",
                          background:form.depositCurrency===c?(c==="USD"?"#6eb5ff20":"#00e5a020"):"transparent",
                          border:`1px solid ${form.depositCurrency===c?(c==="USD"?"#6eb5ff":"#00e5a0"):"#1e2a3a"}`,
                          borderLeft: c==="USD"?"none":"1px solid",
                          color:form.depositCurrency===c?(c==="USD"?"#6eb5ff":"#00e5a0"):"#556",
                          borderRadius:c==="THB"?"2px 0 0 2px":"0 2px 2px 0",
                          transition:"all .15s" }}>
                        {c==="THB"?"฿":"$"}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const assetCur = data[selectedAsset]?.currency || "THB";
                  const raw = parseFloat(form.deposit) || 0;
                  if (!raw || form.depositCurrency === assetCur) return null;
                  const converted = form.depositCurrency==="USD" ? raw*fxRate : raw/fxRate;
                  return <div style={{ fontSize:10,color:"#445",marginTop:4 }}>≈ {fmtMoney(converted, assetCur)} (จะบันทึกในสกุล {assetCur})</div>;
                })()}
              </div>
              <div>
                <div style={{ fontSize:11,color:"#f5a623",letterSpacing:2,marginBottom:4 }}>
                  Profit Sharing <span style={{ color:"#334",fontSize:10 }}>— ไม่กรอก = 0</span>
                </div>
                <div style={{ fontSize:10,color:"#334",marginBottom:8 }}>กรอกจำนวนที่ถูกหักในวันนั้น (ใส่เป็นค่าบวก)</div>
                <input type="number" step="0.01" className="inp" placeholder="0"
                  value={form.profitShare} onChange={e=>setForm({...form,profitShare:e.target.value})} style={{ width:"100%" }} />
              </div>
              <button className="btn" onClick={addEntry} style={{ width:"100%",padding:"13px" }}>บันทึก {selectedAsset}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
