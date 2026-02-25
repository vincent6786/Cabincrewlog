import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { INITIAL_CREW } from "./crewData";

const APP_PASSCODE = "crew2026";

const PRESET_TAGS = ["#好咖","#難搞","#細心","#新人","#好笑","#專業","#八卦","#準時"];
const AIRCRAFT    = ["A321N","A330","A350"];
//const POSITIONS   = ["G1","G2","G3","G4","G5","L1","L2","L3","SA","PA"];
const POSITIONS = ["CIC","1L","1R","1LC","1LA","2L","2R","2LC","2RC","3L","3R","3RA","3LA","4L","4R","4LA","4RA","4RC","4C"];
const STATUS_MAP  = {
  red:    { emoji:"🔴", label:"注意 / Warning", color:"#FF453A", bg:"rgba(255,69,58,0.13)",  border:"rgba(255,69,58,0.45)"  },
  yellow: { emoji:"🟡", label:"普通 / Neutral",  color:"#FFD60A", bg:"rgba(255,214,10,0.13)", border:"rgba(255,214,10,0.45)" },
  green:  { emoji:"🟢", label:"推薦 / Great!",   color:"#30D158", bg:"rgba(48,209,88,0.13)",  border:"rgba(48,209,88,0.45)"  },
};

const mkId  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const today = () => new Date().toISOString().slice(0,10);

const DARK = { bg:"#0B0C14", card:"#111320", cardAlt:"#181A28", border:"#232538", text:"#ECEDFA", sub:"#6B7499", accent:"#F5B731", adk:"#0B0C14", pill:"#1C1F32", input:"#181A28" };
const LITE = { bg:"#EEEEF7", card:"#FFFFFF", cardAlt:"#F4F5FF", border:"#DDE0F0", text:"#0D0E1E", sub:"#6672A0", accent:"#C58C00", adk:"#FFFFFF", pill:"#E4E6F7", input:"#F0F1FA" };

const SHARED_DOC = doc(db, "crewlog", "shared");
const flightDoc  = (u) => doc(db, "crewlog", `flights-${u}`);

const EMPTY_FORM = { crewId:"", crewTxt:"", date:"", flightNum:"", route:"", aircraft:"", position:"", memo:"", status:null, tags:[] };

// ─── Shared UI primitives ───────────────────────────────────────────────────
function Dot({ status, sz=10, c }) {
  const col = status ? STATUS_MAP[status].color : c.border;
  return <span style={{display:"inline-block",width:sz,height:sz,borderRadius:"50%",background:col,flexShrink:0,boxShadow:status?`0 0 6px ${col}70`:0}}/>;
}

function Tag({ on, onClick, children, c }) {
  return (
    <button onClick={onClick} style={{background:on?c.accent:c.pill,color:on?c.adk:c.sub,border:"none",borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
      {children}
    </button>
  );
}

function NavBar({ title, sub, onBack, right, c }) {
  return (
    <div style={{padding:"16px 16px 12px",background:c.card,borderBottom:`1px solid ${c.border}`,flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
      {onBack && <button onClick={onBack} style={{background:c.pill,border:"none",color:c.sub,borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:18,flexShrink:0}}>←</button>}
      <div style={{flex:1}}>
        <div style={{fontSize:9,letterSpacing:4,color:c.accent,fontWeight:700}}>{sub}</div>
        <div style={{fontSize:18,fontWeight:800,color:c.text}}>{title}</div>
      </div>
      {right}
    </div>
  );
}

function Sect({ label, children, c }) {
  return (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:10,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8}}>{label}</div>
      {children}
    </div>
  );
}

function SyncBadge({ syncStatus, c }) {
  const map = { loading:{icon:"⏳",color:c.sub}, synced:{icon:"☁️",color:"#30D158"}, error:{icon:"⚠️",color:"#FF453A"} };
  const s = map[syncStatus];
  return <span style={{fontSize:13,color:s.color}}>{s.icon}</span>;
}

// ─── Settings Row helper ─────────────────────────────────────────────────────
function SettingsRow({ icon, label, sub, onClick, right, c, danger }) {
  return (
    <div onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",background:c.card,border:`1px solid ${danger?"rgba(255,69,58,0.3)":c.border}`,borderRadius:14,cursor:onClick?"pointer":"default",marginBottom:8}}>
      <span style={{fontSize:20,flexShrink:0,width:28,textAlign:"center"}}>{icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:danger?"#FF453A":c.text}}>{label}</div>
        {sub && <div style={{fontSize:11,color:c.sub,marginTop:1}}>{sub}</div>}
      </div>
      {right || (onClick && <span style={{color:c.sub,fontSize:16}}>›</span>)}
    </div>
  );
}

// ─── Stats View ──────────────────────────────────────────────────────────────
function StatsView({ crew, flights, onBack, c }) {
  const totalFlights = flights.length;
  const uniqueCrew = [...new Set(flights.map(f => f.crewId))].length;
  const uniqueRoutes = [...new Set(flights.filter(f => f.route).map(f => f.route))].length;

  // Most flown crew
  const crewCount = {};
  flights.forEach(f => { crewCount[f.crewId] = (crewCount[f.crewId]||0) + 1; });
  const topCrew = Object.entries(crewCount)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const m = crew.find(x => x.id === id);
      return { id, count, name: m ? m.nickname : id, fullName: m ? m.name : "" };
    });

  // Most flown routes
  const routeCount = {};
  flights.forEach(f => { if (f.route) routeCount[f.route] = (routeCount[f.route]||0) + 1; });
  const topRoutes = Object.entries(routeCount).sort((a,b) => b[1]-a[1]).slice(0, 5);

  // Most used aircraft
  const acCount = {};
  flights.forEach(f => { if (f.aircraft) acCount[f.aircraft] = (acCount[f.aircraft]||0) + 1; });
  const topAc = Object.entries(acCount).sort((a,b) => b[1]-a[1]);

  // Flights by month
  const monthCount = {};
  flights.forEach(f => { if (f.date) { const m = f.date.slice(0,7); monthCount[m] = (monthCount[m]||0) + 1; } });
  const months = Object.entries(monthCount).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 6);

  // Status breakdown
  const statusCount = { green:0, yellow:0, red:0, none:0 };
  crew.forEach(m => { statusCount[m.status || "none"]++; });

  const StatCard = ({ icon, value, label }) => (
    <div style={{background:c.cardAlt,border:`1px solid ${c.border}`,borderRadius:14,padding:"14px 12px",textAlign:"center",flex:1}}>
      <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
      <div style={{fontSize:24,fontWeight:800,color:c.accent}}>{value}</div>
      <div style={{fontSize:10,color:c.sub,letterSpacing:1,fontWeight:600,marginTop:2}}>{label}</div>
    </div>
  );

  const Bar = ({ label, count, max }) => (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
      <span style={{fontSize:13,fontWeight:700,color:c.text,minWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
      <div style={{flex:1,height:20,background:c.pill,borderRadius:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${max?Math.round(count/max*100):0}%`,background:`${c.accent}99`,borderRadius:8,minWidth:count?24:0,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:6}}>
          <span style={{fontSize:10,fontWeight:700,color:c.adk}}>{count}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <NavBar sub="STATISTICS" title="飛行統計 📊" onBack={onBack} c={c}/>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 16px 40px",WebkitOverflowScrolling:"touch"}}>

        {/* Overview cards */}
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          <StatCard icon="✈" value={totalFlights} label="FLIGHTS"/>
          <StatCard icon="👥" value={uniqueCrew} label="CREW"/>
          <StatCard icon="🗺" value={uniqueRoutes} label="ROUTES"/>
        </div>

        {totalFlights === 0 ? (
          <div style={{textAlign:"center",color:c.sub,fontSize:14,padding:"40px 0"}}>
            尚無紀錄，開始新增飛行吧！<br/>No flights logged yet.
          </div>
        ) : (
          <>
            {/* Top Crew */}
            {topCrew.length > 0 && (
              <Sect label="最常合飛 TOP CREW" c={c}>
                <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
                  {topCrew.map((t,i) => (
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<topCrew.length-1?`1px solid ${c.border}`:"none"}}>
                      <span style={{fontSize:16,fontWeight:800,color:i===0?c.accent:c.sub,width:24,textAlign:"center"}}>{i+1}</span>
                      <div style={{flex:1}}>
                        <span style={{fontWeight:700,color:c.text}}>{t.name}</span>
                        <span style={{color:c.sub,fontSize:12,marginLeft:8}}>{t.fullName}</span>
                      </div>
                      <span style={{fontWeight:800,color:c.accent,fontSize:15}}>{t.count}</span>
                      <span style={{fontSize:10,color:c.sub}}>次</span>
                    </div>
                  ))}
                </div>
              </Sect>
            )}

            {/* Top Routes */}
            {topRoutes.length > 0 && (
              <Sect label="熱門航線 TOP ROUTES" c={c}>
                <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
                  {topRoutes.map(([route, count]) => (
                    <Bar key={route} label={route} count={count} max={topRoutes[0][1]}/>
                  ))}
                </div>
              </Sect>
            )}

            {/* Aircraft */}
            {topAc.length > 0 && (
              <Sect label="機型統計 AIRCRAFT" c={c}>
                <div style={{display:"flex",gap:8}}>
                  {topAc.map(([ac, count]) => (
                    <div key={ac} style={{flex:1,background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:800,color:c.text}}>{ac}</div>
                      <div style={{fontSize:22,fontWeight:800,color:c.accent,marginTop:4}}>{count}</div>
                      <div style={{fontSize:10,color:c.sub}}>次</div>
                    </div>
                  ))}
                </div>
              </Sect>
            )}

            {/* Monthly */}
            {months.length > 0 && (
              <Sect label="月份紀錄 BY MONTH" c={c}>
                <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
                  {months.map(([month, count]) => (
                    <Bar key={month} label={month} count={count} max={months[0][1]}/>
                  ))}
                </div>
              </Sect>
            )}

            {/* Status breakdown */}
            <Sect label="組員燈號分佈 STATUS" c={c}>
              <div style={{display:"flex",gap:8}}>
                {Object.entries(STATUS_MAP).map(([k,v]) => (
                  <div key={k} style={{flex:1,background:v.bg,border:`1px solid ${v.border}`,borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
                    <div style={{fontSize:20}}>{v.emoji}</div>
                    <div style={{fontSize:20,fontWeight:800,color:v.color,marginTop:4}}>{statusCount[k]}</div>
                  </div>
                ))}
                <div style={{flex:1,background:c.cardAlt,border:`1px solid ${c.border}`,borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:20}}>⚪</div>
                  <div style={{fontSize:20,fontWeight:800,color:c.sub,marginTop:4}}>{statusCount.none}</div>
                </div>
              </div>
            </Sect>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Settings View ───────────────────────────────────────────────────────────
function SettingsView({
  onBack, c, dark, setDark, username, onLogout, onExport, onGoGuide, onGoStats,
  defaultAircraft, setDefaultAircraft, defaultPosition, setDefaultPosition,
  customTags, setCustomTags, onImport, routes, setRoutes, flights,
}) {
  const [newTag, setNewTag] = useState("");
  const [addTagErr, setAddTagErr] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [nameEdit, setNameEdit] = useState(false);
  const [tempName, setTempName] = useState(username);
  const [nameErr, setNameErr] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [editRoutes, setEditRoutes] = useState(false);
  const fileRef = useRef(null);

  const inp = { background:c.input, border:`1px solid ${c.border}`, borderRadius:12, padding:"11px 14px", color:c.text, fontSize:14, fontFamily:"inherit", outline:"none", width:"100%" };

  const allTags = [...PRESET_TAGS, ...customTags];

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        onImport(data);
        setImportMsg("✅ 匯入成功 Import successful!");
      } catch {
        setImportMsg("❌ 檔案格式錯誤 Invalid JSON file");
      }
      setTimeout(() => setImportMsg(""), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleNameSave = () => {
    const name = tempName.trim();
    if (!name) { setNameErr("請輸入名字"); return; }
    if (name.length > 20) { setNameErr("名字太長了"); return; }
    localStorage.setItem("cl-username", name);
    // We need to reload to switch flight docs
    window.location.reload();
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <NavBar sub="SETTINGS" title="設定 ⚙" onBack={onBack} c={c}/>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 16px 40px",WebkitOverflowScrolling:"touch"}}>

        {/* Account */}
        <Sect label="帳號 ACCOUNT" c={c}>
          <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:nameEdit?12:0}}>
              <span style={{fontSize:22}}>👤</span>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:800,color:c.text}}>{username}</div>
                <div style={{fontSize:11,color:c.sub}}>{flights.length} 筆私人飛行紀錄</div>
              </div>
              <button onClick={()=>{setNameEdit(!nameEdit);setTempName(username);setNameErr("");}}
                style={{background:c.pill,border:"none",color:c.accent,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                {nameEdit ? "取消" : "✏ 改名"}
              </button>
            </div>
            {nameEdit && (
              <div>
                <input value={tempName} onChange={e=>setTempName(e.target.value)} placeholder="新名字..."
                  autoComplete="off" style={{...inp,marginBottom:nameErr?6:10,fontSize:14}}/>
                {nameErr && <div style={{color:"#FF453A",fontSize:11,marginBottom:6}}>{nameErr}</div>}
                <div style={{fontSize:10,color:"#FF453A",marginBottom:8}}>⚠ 改名後會重新載入，新的飛行紀錄會存在新名字下</div>
                <button onClick={handleNameSave}
                  style={{width:"100%",background:c.accent,color:c.adk,border:"none",borderRadius:10,padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  💾 儲存新名字
                </button>
              </div>
            )}
          </div>
        </Sect>

        {/* Quick Actions */}
        <Sect label="快速操作 QUICK ACTIONS" c={c}>
          <SettingsRow icon="📊" label="飛行統計 Stats" sub="查看你的飛行數據摘要" onClick={onGoStats} c={c}/>
          <SettingsRow icon="❓" label="使用說明 Guide" sub="如何使用 CrewLog" onClick={onGoGuide} c={c}/>
          <SettingsRow icon="🌙" label="深色模式 Dark Mode" sub={dark?"目前：深色":"目前：淺色"} c={c}
            right={
              <button onClick={()=>setDark(d=>!d)}
                style={{background:dark?c.accent:c.pill,color:dark?c.adk:c.sub,border:"none",borderRadius:20,padding:"6px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {dark ? "☀ 淺色" : "🌙 深色"}
              </button>
            }
          />
        </Sect>

        {/* Defaults */}
        <Sect label="預設值 DEFAULTS" c={c}>
          <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14,marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:700,color:c.text,marginBottom:8}}>✈ 預設機型 Default Aircraft</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setDefaultAircraft("")}
                style={{background:!defaultAircraft?c.accent:c.pill,color:!defaultAircraft?c.adk:c.sub,border:"none",borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                無 None
              </button>
              {AIRCRAFT.map(a => (
                <button key={a} onClick={()=>setDefaultAircraft(defaultAircraft===a?"":a)}
                  style={{flex:1,background:defaultAircraft===a?c.accent:c.pill,color:defaultAircraft===a?c.adk:c.sub,border:"none",borderRadius:10,padding:"8px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
            <div style={{fontSize:12,fontWeight:700,color:c.text,marginBottom:8}}>💺 預設職位 Default Position</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <button onClick={()=>setDefaultPosition("")}
                style={{background:!defaultPosition?c.accent:c.pill,color:!defaultPosition?c.adk:c.sub,border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                無 None
              </button>
              {POSITIONS.map(p => (
                <button key={p} onClick={()=>setDefaultPosition(defaultPosition===p?"":p)}
                  style={{background:defaultPosition===p?c.accent:c.pill,color:defaultPosition===p?c.adk:c.sub,border:"none",borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </Sect>

        {/* Custom Tags */}
        <Sect label="自訂標籤 CUSTOM TAGS" c={c}>
          <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
            <div style={{fontSize:11,color:c.sub,marginBottom:10}}>內建標籤不可刪除，自訂標籤可新增刪除</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {PRESET_TAGS.map(t => (
                <span key={t} style={{background:c.pill,color:c.sub,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:600}}>
                  {t} <span style={{fontSize:9,opacity:0.5}}>🔒</span>
                </span>
              ))}
              {customTags.map(t => (
                <span key={t} style={{background:c.accent+"22",color:c.accent,borderRadius:20,padding:"5px 8px 5px 12px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                  {t}
                  <button onClick={()=>setCustomTags(ct=>ct.filter(x=>x!==t))}
                    style={{background:"none",border:"none",color:"#FF453A",fontSize:14,cursor:"pointer",padding:"0 2px",lineHeight:1}}>×</button>
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input value={newTag} onChange={e=>setNewTag(e.target.value)}
                placeholder="#自訂標籤..." autoComplete="off"
                onKeyDown={e=>{if(e.key==="Enter"){
                  const tag = newTag.trim().startsWith("#") ? newTag.trim() : `#${newTag.trim()}`;
                  if(!tag||tag==="#"){return;}
                  if(allTags.includes(tag)){setAddTagErr("此標籤已存在");return;}
                  setCustomTags(ct=>[...ct,tag]);setNewTag("");setAddTagErr("");
                }}}
                style={{...inp,flex:1,fontSize:13,padding:"9px 12px"}}/>
              <button onClick={()=>{
                const tag = newTag.trim().startsWith("#") ? newTag.trim() : `#${newTag.trim()}`;
                if(!tag||tag==="#"){return;}
                if(allTags.includes(tag)){setAddTagErr("此標籤已存在");return;}
                setCustomTags(ct=>[...ct,tag]);setNewTag("");setAddTagErr("");
              }} style={{background:c.accent,color:c.adk,border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                + 新增
              </button>
            </div>
            {addTagErr && <div style={{color:"#FF453A",fontSize:11,marginTop:6}}>{addTagErr}</div>}
          </div>
        </Sect>

        {/* Saved Routes */}
        <Sect label="已存航班 SAVED ROUTES" c={c}>
          <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:14,padding:14}}>
            {routes.length === 0 ? (
              <div style={{color:c.sub,fontSize:13,textAlign:"center",padding:"8px 0"}}>尚無已存航班<br/>No saved routes</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {routes.map(r => (
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,background:c.cardAlt,borderRadius:10,padding:"8px 10px"}}>
                    <span style={{fontWeight:700,color:c.text,fontSize:13}}>{r.flightNum}</span>
                    {r.route && <span style={{color:c.sub,fontSize:12}}>{r.route}</span>}
                    {r.aircraft && <span style={{background:c.pill,color:c.accent,borderRadius:6,padding:"2px 6px",fontSize:10,fontWeight:700}}>{r.aircraft}</span>}
                    <button onClick={()=>setRoutes(rs=>rs.filter(x=>x.id!==r.id))}
                      style={{marginLeft:"auto",background:"none",border:"none",color:"#FF453A",cursor:"pointer",fontSize:14,padding:"0 4px"}}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Sect>

        {/* Data Management */}
        <Sect label="資料管理 DATA" c={c}>
          <SettingsRow icon="⬇" label="備份資料 Backup" sub="下載 JSON 備份檔" onClick={onExport} c={c}/>
          <SettingsRow icon="📤" label="匯入備份 Import" sub="從 JSON 檔案還原資料" onClick={()=>fileRef.current?.click()} c={c}/>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} style={{display:"none"}}/>
          {importMsg && (
            <div style={{background:importMsg.startsWith("✅")?`rgba(48,209,88,0.1)`:"rgba(255,69,58,0.1)",
              border:`1px solid ${importMsg.startsWith("✅")?"rgba(48,209,88,0.4)":"rgba(255,69,58,0.4)"}`,
              borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:600,color:importMsg.startsWith("✅")?"#30D158":"#FF453A",marginBottom:8}}>
              {importMsg}
            </div>
          )}
        </Sect>

        {/* Danger */}
        <Sect label="危險區域 DANGER ZONE" c={c}>
          {confirmClear ? (
            <div style={{background:"rgba(255,69,58,0.1)",border:"1px solid rgba(255,69,58,0.4)",borderRadius:14,padding:16}}>
              <div style={{fontSize:14,fontWeight:700,color:"#FF453A",marginBottom:6}}>確定要清除所有飛行紀錄？</div>
              <div style={{fontSize:12,color:c.sub,marginBottom:12}}>This will delete ALL your private flight logs. Shared crew data will NOT be affected.<br/>⚠ Cannot be undone.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{onImport({flights:[]});setConfirmClear(false);}}
                  style={{flex:1,background:"#FF453A",color:"#fff",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer"}}>確認清除</button>
                <button onClick={()=>setConfirmClear(false)}
                  style={{flex:1,background:c.pill,color:c.sub,border:"none",borderRadius:10,padding:"11px",fontSize:13,cursor:"pointer"}}>取消</button>
              </div>
            </div>
          ) : (
            <SettingsRow icon="🗑" label="清除飛行紀錄 Clear Logs" sub="刪除所有私人飛行紀錄" onClick={()=>setConfirmClear(true)} c={c} danger/>
          )}
          <div style={{marginTop:4}}>
            <SettingsRow icon="🚪" label="登出 Logout" sub={`目前登入：${username}`} onClick={onLogout} c={c} danger/>
          </div>
        </Sect>

        {/* About */}
        <div style={{textAlign:"center",padding:"16px 0 4px",color:c.sub,fontSize:11,lineHeight:1.8}}>
          CrewLog v2.0 · Built with ✈ & ❤<br/>
          <span style={{color:c.accent,fontWeight:700}}>Your logs are safe & private.</span>
        </div>
      </div>
    </div>
  );
}

// ─── QuickLogView ────────────────────────────────────────────────────────────
function QuickLogView({ crew, routes, setRoutes, initialForm, editFlightId, onSave, onBack, dark, c, profileId, allTags }) {
  const [form, setForm] = useState(initialForm);
  const [sugg, setSugg] = useState([]);
  const [addR, setAddR] = useState(false);
  const [rf,   setRf]   = useState({ num:"", route:"", ac:"" });

  const prevEdit = useRef(editFlightId);
  useEffect(() => {
    if (prevEdit.current !== editFlightId) {
      setForm(initialForm);
      prevEdit.current = editFlightId;
    }
  }, [editFlightId, initialForm]);

  const handleCrewInput = (val) => {
    setForm(f => ({ ...f, crewTxt: val, crewId: "" }));
    if (!val.trim()) { setSugg([]); return; }
    const q = val.toLowerCase();
    setSugg(crew.filter(m => m.id.includes(q) || m.name.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q)).slice(0, 5));
  };

  const pickCrew = (m) => {
    setForm(f => ({ ...f, crewId: m.id, crewTxt: `${m.nickname} — ${m.name}`, status: m.status ?? f.status, tags: [...m.tags] }));
    setSugg([]);
  };

  const saveRoute = () => {
    if (!rf.num.trim()) return;
    setRoutes(r => [...r, { id: mkId(), flightNum: rf.num.trim(), route: rf.route.trim(), aircraft: rf.ac }]);
    setRf({ num:"", route:"", ac:"" });
    setAddR(false);
  };

  const inp = { background:c.input, border:`1px solid ${c.border}`, borderRadius:12, padding:"11px 14px", color:c.text, fontSize:14, fontFamily:"inherit", outline:"none", width:"100%" };
  const tagsToShow = allTags || PRESET_TAGS;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <NavBar
        sub={editFlightId ? "EDIT LOG" : "QUICK-LOG"}
        title={editFlightId ? "編輯飛行紀錄" : "新增飛行紀錄"}
        onBack={onBack}
        c={c}
      />
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 16px 40px",WebkitOverflowScrolling:"touch"}}>

        <Sect label="組員 CREW MEMBER" c={c}>
          <div style={{position:"relative"}}>
            <input
              value={form.crewTxt}
              onChange={e => handleCrewInput(e.target.value)}
              placeholder="搜尋 ID / 姓名 / Nickname..."
              disabled={!!editFlightId}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              style={{...inp, border:`1px solid ${form.crewId ? c.accent : c.border}`, opacity: editFlightId ? 0.7 : 1}}
            />
            {sugg.length > 0 && (
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:c.card,border:`1px solid ${c.border}`,borderRadius:12,overflow:"hidden",zIndex:99,boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}>
                {sugg.map(m => (
                  <div key={m.id} onMouseDown={e => { e.preventDefault(); pickCrew(m); }}
                    style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${c.border}`,display:"flex",alignItems:"center",gap:10}}>
                    <Dot status={m.status} sz={9} c={c}/>
                    <span style={{fontWeight:700,color:c.text}}>{m.nickname}</span>
                    <span style={{color:c.sub,fontSize:12}}>{m.name}</span>
                    <span style={{color:c.sub,fontSize:11,marginLeft:"auto"}}>#{m.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {form.crewId && <div style={{marginTop:5,fontSize:12,color:c.accent,fontWeight:600}}>✓ ID: {form.crewId}</div>}
        </Sect>

        <Sect label="日期 DATE" c={c}>
          <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))} style={inp}/>
        </Sect>

        <Sect label="航班 FLIGHT" c={c}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {routes.map(r => (
              <button key={r.id}
                onClick={() => setForm(f => ({...f, flightNum:r.flightNum, route:r.route, aircraft:r.aircraft}))}
                style={{background:form.flightNum===r.flightNum?c.accent:c.pill,color:form.flightNum===r.flightNum?c.adk:c.sub,border:"none",borderRadius:10,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {r.flightNum}{r.route && ` · ${r.route}`}
              </button>
            ))}
            <button onClick={() => setAddR(v => !v)}
              style={{background:"transparent",border:`1px dashed ${c.border}`,color:c.sub,borderRadius:10,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>
              {addR ? "▲" : "+"} 新增航班
            </button>
          </div>
          {addR && (
            <div style={{background:c.cardAlt,border:`1px solid ${c.border}`,borderRadius:12,padding:12,marginBottom:10}}>
              <div style={{fontSize:9,letterSpacing:3,color:c.accent,fontWeight:700,marginBottom:8}}>ADD ROUTE</div>
              <input value={rf.num} onChange={e => setRf(r => ({...r, num:e.target.value}))} placeholder="航班號 e.g. CI001" autoComplete="off" style={{...inp,marginBottom:6,borderRadius:10,padding:"8px 12px",fontSize:13}}/>
              <input value={rf.route} onChange={e => setRf(r => ({...r, route:e.target.value}))} placeholder="航線 e.g. TPE→NRT" autoComplete="off" style={{...inp,marginBottom:6,borderRadius:10,padding:"8px 12px",fontSize:13}}/>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                {AIRCRAFT.map(a => <button key={a} onClick={() => setRf(r => ({...r, ac:a}))} style={{flex:1,background:rf.ac===a?c.accent:c.pill,color:rf.ac===a?c.adk:c.sub,border:"none",borderRadius:8,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{a}</button>)}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={saveRoute} style={{flex:1,background:c.accent,color:c.adk,border:"none",borderRadius:10,padding:"9px",fontSize:13,fontWeight:700,cursor:"pointer"}}>儲存</button>
                <button onClick={() => setAddR(false)} style={{flex:1,background:c.pill,color:c.sub,border:"none",borderRadius:10,padding:"9px",fontSize:13,cursor:"pointer"}}>取消</button>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:8}}>
            <input value={form.flightNum} onChange={e => setForm(f => ({...f, flightNum:e.target.value}))} placeholder="航班號 No." autoComplete="off" style={{...inp,width:"auto",flex:1}}/>
            <input value={form.route} onChange={e => setForm(f => ({...f, route:e.target.value}))} placeholder="航線 Route" autoComplete="off" style={{...inp,width:"auto",flex:1}}/>
          </div>
        </Sect>

        <Sect label="機型 AIRCRAFT" c={c}>
          <div style={{display:"flex",gap:8}}>
            {AIRCRAFT.map(a => (
              <button key={a} onClick={() => setForm(f => ({...f, aircraft:f.aircraft===a?"":a}))}
                style={{flex:1,background:form.aircraft===a?c.accent:c.pill,color:form.aircraft===a?c.adk:c.sub,border:"none",borderRadius:12,padding:"11px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {a}
              </button>
            ))}
          </div>
        </Sect>

        <Sect label="職位 POSITION" c={c}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {POSITIONS.map(p => (
              <button key={p} onClick={() => setForm(f => ({...f, position:f.position===p?"":p}))}
                style={{background:form.position===p?c.accent:c.pill,color:form.position===p?c.adk:c.sub,border:"none",borderRadius:8,padding:"6px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                {p}
              </button>
            ))}
          </div>
          <input value={form.position} onChange={e => setForm(f => ({...f, position:e.target.value}))} placeholder="或自行輸入..." autoComplete="off" style={inp}/>
        </Sect>

        {!editFlightId && (
          <>
            <Sect label="紅黃綠燈 STATUS" c={c}>
              <div style={{display:"flex",gap:8}}>
                {Object.entries(STATUS_MAP).map(([k,v]) => (
                  <button key={k} onClick={() => setForm(f => ({...f, status:f.status===k?null:k}))}
                    style={{flex:1,background:form.status===k?v.bg:c.pill,border:`2px solid ${form.status===k?v.color:c.border}`,color:form.status===k?v.color:c.sub,borderRadius:14,padding:"13px 4px",fontSize:22,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <span>{v.emoji}</span>
                    <span style={{fontSize:9,fontWeight:700,letterSpacing:1}}>{k.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </Sect>
            <Sect label="標籤 TAGS" c={c}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {tagsToShow.map(t => (
                  <button key={t} onClick={() => setForm(f => ({...f, tags:f.tags.includes(t)?f.tags.filter(x=>x!==t):[...f.tags,t]}))}
                    style={{background:form.tags.includes(t)?c.accent:c.pill,color:form.tags.includes(t)?c.adk:c.sub,border:"none",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    {t}
                  </button>
                ))}
              </div>
            </Sect>
          </>
        )}

        <Sect label="備忘 MEMO" c={c}>
          <textarea value={form.memo} onChange={e => setForm(f => ({...f, memo:e.target.value}))} rows={3}
            placeholder="這次飛行的備忘..." style={{...inp,resize:"vertical"}}/>
        </Sect>

        <button onClick={() => onSave(form)} disabled={!form.crewId}
          style={{width:"100%",background:form.crewId?c.accent:"#2a2a2a",color:form.crewId?c.adk:"#555",border:"none",borderRadius:16,padding:"15px",fontSize:16,fontWeight:800,cursor:form.crewId?"pointer":"not-allowed",letterSpacing:1,fontFamily:"inherit",boxShadow:form.crewId?`0 4px 24px ${c.accent}55`:"none"}}>
          {editFlightId ? "✏ 更新紀錄 UPDATE LOG" : "✈ 儲存紀錄 SAVE LOG"}
        </button>
      </div>
    </div>
  );
}

// ─── GuideView ────────────────────────────────────────────────────────────────
function GuideView({ onBack, c }) {
  const sections = [
    { emoji:"✈", title:"什麼是 CrewLog？", en:"What is CrewLog?",
      content:"CrewLog 是你的私人空中生存指南。記錄合飛組員，留下備忘，用紅黃綠燈標記好壞，幫助你下次飛行前做好心理準備。\n\nCrewLog is your private cabin crew companion — log who you fly with, leave notes, and mark them green, yellow, or red so you're never caught off-guard again." },
    { emoji:"🔒", title:"隱私設計", en:"Privacy",
      content:"飛行紀錄 (備忘、航班) 是完全私人的 — 只有你看得到，不會同步給其他用戶。\n\n組員的基本資料 (名字、期別) 和紅黃綠燈、標籤則是大家共享的，讓整個 app 的資料保持最新。\n\nYour flight logs and memos are private (only you see them). Crew info, status lights, and tags are shared so everyone benefits." },
    { emoji:"🔴🟡🟢", title:"紅黃綠燈", en:"Status Lights", isList:true,
      content:[ { icon:"🟢", label:"推薦 Great!", desc:"好合作、專業、值得信任的組員" }, { icon:"🟡", label:"普通 Neutral", desc:"一般，沒有特別好或壞" }, { icon:"🔴", label:"注意 Warning", desc:"需要注意，可搭配備忘說明原因" } ] },
    { emoji:"🏷", title:"標籤 Tags", en:"Tags", isList:true,
      content:[ { icon:"#好咖", desc:"優秀的組員，合作愉快" }, { icon:"#難搞", desc:"不好合作，注意一下" }, { icon:"#細心", desc:"工作細心，注意到小細節" }, { icon:"#新人", desc:"新組員，需要多幫忙" }, { icon:"#好笑", desc:"幽默風趣，飛起來很開心" }, { icon:"#專業", desc:"工作態度專業" }, { icon:"#八卦", desc:"愛說話，要注意嘴型 👀" }, { icon:"#準時", desc:"很守時，不拖拖拉拉" } ] },
    { emoji:"📝", title:"如何新增飛行紀錄", en:"How to Log a Flight",
      content:"1. 點右下角的 ＋ 按鈕，或點組員卡片上的 ＋\n2. 搜尋組員名字、ID 或 Nickname\n3. 選擇日期、航班、機型、職位\n4. 設定紅黃綠燈和標籤\n5. 寫下備忘，然後儲存！\n\nHit + → search crew → fill in details → save. Easy." },
    { emoji:"🔍", title:"搜尋功能", en:"Search",
      content:"搜尋欄可以搜尋：\n• 組員 ID (員工號碼)\n• 中文姓名\n• 英文 Nickname\n• 飛行備忘的內容 (輸入兩個字以上)\n\n有備忘符合的組員會顯示 📝 提示。" },
    { emoji:"👤", title:"組員頁面", en:"Crew Profile",
      content:"點任何組員可以進入個人頁面：\n• 查看你們所有的合飛紀錄\n• 編輯組員基本資料（大家共享）\n• 新增長期筆記（大家共享）\n• 快速設定紅黃綠燈\n• 編輯或刪除個別飛行紀錄" },
    { emoji:"⬇", title:"備份資料", en:"Backup",
      content:"設定頁面的「備份」可以將所有資料下載成 JSON 檔案。建議定期備份，以防萬一。\n\nGo to Settings → Backup to download all your data as a JSON file." },
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <NavBar sub="USER GUIDE" title="使用說明 ✈" onBack={onBack} c={c}/>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 16px 40px",WebkitOverflowScrolling:"touch"}}>
        <div style={{background:`linear-gradient(135deg, ${c.accent}22, ${c.accent}08)`,border:`1px solid ${c.accent}44`,borderRadius:20,padding:"20px 16px",marginBottom:20,textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>✈</div>
          <div style={{fontSize:20,fontWeight:800,color:c.text,marginBottom:4}}>空中生存指南</div>
          <div style={{fontSize:13,color:c.sub,lineHeight:1.6}}>記錄每一次合飛 · 留住每一個細節<br/>Log every flight · Remember every detail</div>
        </div>
        {sections.map((s, i) => (
          <div key={i} style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:22}}>{s.emoji}</span>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:c.text}}>{s.title}</div>
                <div style={{fontSize:11,color:c.sub}}>{s.en}</div>
              </div>
            </div>
            {s.isList ? (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {s.content.map((item, j) => (
                  <div key={j} style={{display:"flex",gap:10,alignItems:"flex-start",background:c.cardAlt,borderRadius:10,padding:"8px 10px"}}>
                    <span style={{fontSize:14,flexShrink:0,fontWeight:700,minWidth:60,color:c.accent}}>{item.icon}</span>
                    <span style={{fontSize:13,color:c.sub,lineHeight:1.5}}>{item.desc}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{fontSize:13,color:c.sub,lineHeight:1.8,whiteSpace:"pre-line"}}>{s.content}</div>
            )}
          </div>
        ))}
        <div style={{textAlign:"center",padding:"20px 0 4px",color:c.sub,fontSize:11,lineHeight:1.8}}>
          CrewLog v2.0 · Built with ✈ & ❤<br/>
          <span style={{color:c.accent,fontWeight:700}}>Your logs are safe & private.</span>
        </div>
      </div>
    </div>
  );
}

// ─── MyLogView ────────────────────────────────────────────────────────────────
function MyLogView({ flights, crew, username, onBack, onGoProfile, onEdit, c }) {
  const [search, setSearch] = useState("");

  const sorted = [...flights].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = sorted.filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const m = crew.find(x => x.id === f.crewId);
    return (
      (m && (m.nickname.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))) ||
      (f.memo || "").toLowerCase().includes(q)
    );
  });

  // Group by month, newest first
  const grouped = {};
  filtered.forEach(f => {
    const month = f.date ? f.date.slice(0, 7) : "—";
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(f);
  });
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const inp = {
    background: c.input, border: `1px solid ${c.border}`, borderRadius: 12,
    padding: "9px 14px 9px 36px", color: c.text, fontSize: 14,
    fontFamily: "inherit", outline: "none", width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <NavBar
        sub="MY LOGBOOK"
        title={`${username} 的飛行日誌`}
        onBack={onBack}
        c={c}
        right={
          <span style={{ fontSize: 12, color: c.sub, fontWeight: 700, background: c.pill, borderRadius: 8, padding: "4px 10px" }}>
            {flights.length} 筆
          </span>
        }
      />

      {/* Search */}
      <div style={{ padding: "10px 16px", background: c.card, borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: c.sub, fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋組員姓名或備忘..."
            autoComplete="off"
            style={inp}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
              ×
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 16px 48px", WebkitOverflowScrolling: "touch" }}>

        {flights.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: c.sub }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✈</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>尚無飛行紀錄</div>
            <div style={{ fontSize: 13 }}>點右下角 + 開始記錄你的第一次飛行</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 0", color: c.sub, fontSize: 14 }}>
            找不到符合「{search}」的紀錄
          </div>
        ) : (
          months.map(month => (
            <div key={month} style={{ marginBottom: 28 }}>

              {/* Month divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3, color: c.accent, flexShrink: 0 }}>
                  {month}
                </span>
                <div style={{ flex: 1, height: 1, background: c.border }} />
                <span style={{ fontSize: 10, color: c.sub, flexShrink: 0 }}>{grouped[month].length} 筆</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped[month].map(f => {
                  const m = crew.find(x => x.id === f.crewId);
                  const si = m?.status ? STATUS_MAP[m.status] : null;
                  const hasMemo = !!f.memo?.trim();

                  return (
                    <div key={f.id} style={{
                      background: c.card,
                      border: `1px solid ${c.border}`,
                      borderLeft: `3px solid ${si ? si.color : c.border}`,
                      borderRadius: 14,
                      padding: "12px 14px",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}>

                      {/* Left: date column */}
                      <div style={{ flexShrink: 0, width: 36, paddingTop: 2, textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: c.text, lineHeight: 1 }}>
                          {f.date ? f.date.slice(8) : "—"}
                        </div>
                        <div style={{ fontSize: 9, color: c.sub, fontWeight: 600, marginTop: 2 }}>
                          {f.date ? ["SUN","MON","TUE","WED","THU","FRI","SAT"][new Date(f.date).getDay()] : ""}
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ width: 1, alignSelf: "stretch", background: c.border, flexShrink: 0 }} />

                      {/* Right: content */}
                      <div style={{ flex: 1, minWidth: 0 }}>

                        {/* Crew row — tappable */}
                        <div
                          onClick={() => m && onGoProfile(m.id)}
                          style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: hasMemo ? 7 : 0, cursor: m ? "pointer" : "default" }}>
                          {si
                            ? <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{si.emoji}</span>
                            : <Dot status={null} sz={8} c={c} />
                          }
                          <span style={{ fontWeight: 800, fontSize: 15, color: c.text }}>
                            {m ? m.nickname : `#${f.crewId}`}
                          </span>
                          {m?.name && (
                            <span style={{ fontSize: 12, color: c.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {m.name}
                            </span>
                          )}
                          {/* subtle flight badge if exists */}
                          {f.flightNum && (
                            <span style={{ marginLeft: "auto", fontSize: 10, color: c.accent, fontWeight: 700, background: c.pill, borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>
                              {f.flightNum}
                            </span>
                          )}
                        </div>

                        {/* Memo preview */}
                        {hasMemo && (
                          <div style={{
                            fontSize: 12, color: c.sub, lineHeight: 1.55,
                            background: c.cardAlt, borderRadius: 8,
                            padding: "6px 10px",
                            display: "-webkit-box", WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical", overflow: "hidden",
                          }}>
                            📝 {f.memo}
                          </div>
                        )}
                      </div>

                      {/* Edit button */}
                      <button
                        onClick={() => onEdit(f)}
                        style={{ background: "none", border: "none", color: c.sub, cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0, alignSelf: "flex-start" }}>
                        ✏
                      </button>

                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("cl-dark");
    return saved !== null ? saved === "true" : true;
  });
  const [authStep, setAuthStep]           = useState("loading");
  const [username, setUsername]            = useState("");
  const [passcodeInput, setPasscodeInput]  = useState("");
  const [passcodeErr, setPasscodeErr]      = useState("");
  const [usernameInput, setUsernameInput]  = useState("");
  const [usernameErr, setUsernameErr]      = useState("");

  const [crew,    setCrew]    = useState([]);
  const [routes,  setRoutes]  = useState([]);
  const [flights, setFlights] = useState([]);
  const [ready,   setReady]   = useState(false);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [view,      setView]        = useState("dashboard");
  const [profileId, setProfileId]   = useState(null);

  const [qlInitialForm,   setQlInitialForm]   = useState({ ...EMPTY_FORM, date: today() });
  const [qlEditFlightId,  setQlEditFlightId]  = useState(null);

  const isRemoteShared  = useRef(false);
  const isRemoteFlights = useRef(false);

  const [search,    setSearch]    = useState("");
  const [filterTag, setFilterTag] = useState(null);
  const [sortMode,  setSortMode]  = useState("alpha");

  const [newCrew,    setNewCrew]    = useState({ id:"", name:"", nickname:"", seniority:"" });
  const [addCrewErr, setAddCrewErr] = useState("");
  const [editCrewInfo, setEditCrewInfo] = useState(false);
  const [tempCrewInfo, setTempCrewInfo] = useState({ name:"", nickname:"", seniority:"" });

  const [editNotes,  setEditNotes]  = useState(false);
  const [tempNotes,  setTempNotes]  = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmDelCrew, setConfirmDelCrew] = useState(false);

  // ── New settings state ──
  const [customTags, setCustomTags] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cl-customTags") || "[]"); } catch { return []; }
  });
  const [defaultAircraft, setDefaultAircraft] = useState(() => localStorage.getItem("cl-defaultAC") || "");
  const [defaultPosition, setDefaultPosition] = useState(() => localStorage.getItem("cl-defaultPos") || "");

  const allTags = [...PRESET_TAGS, ...customTags];
  const c = dark ? DARK : LITE;

  // Persist settings to localStorage
  useEffect(() => { localStorage.setItem("cl-dark", String(dark)); }, [dark]);
  useEffect(() => { localStorage.setItem("cl-customTags", JSON.stringify(customTags)); }, [customTags]);
  useEffect(() => { localStorage.setItem("cl-defaultAC", defaultAircraft); }, [defaultAircraft]);
  useEffect(() => { localStorage.setItem("cl-defaultPos", defaultPosition); }, [defaultPosition]);

  useEffect(() => {
    const saved = localStorage.getItem("cl-username");
    const auth  = localStorage.getItem("cl-auth");
    if (auth==="ok" && saved) { setUsername(saved); setAuthStep("app"); }
    else if (auth==="ok")     { setAuthStep("username"); }
    else                      { setAuthStep("passcode"); }
  }, []);

  useEffect(() => {
    if (authStep !== "app") return;
    const unsub = onSnapshot(SHARED_DOC, (snap) => {
      isRemoteShared.current = true;
      if (snap.exists()) { const d=snap.data(); setCrew(d.crew||INITIAL_CREW); setRoutes(d.routes||[]); }
      else { setCrew(INITIAL_CREW); setRoutes([]); }
      setSyncStatus("synced"); setReady(true);
    }, () => { setSyncStatus("error"); setReady(true); });
    return () => unsub();
  }, [authStep]);

  useEffect(() => {
    if (authStep !== "app" || !username) return;
    const unsub = onSnapshot(flightDoc(username), (snap) => {
      isRemoteFlights.current = true;
      setFlights(snap.exists() ? (snap.data().flights || []) : []);
    }, () => {});
    return () => unsub();
  }, [authStep, username]);

  useEffect(() => {
    if (!ready || authStep !== "app") return;
    if (isRemoteShared.current) { isRemoteShared.current = false; return; }
    setDoc(SHARED_DOC, { crew, routes }).catch(() => setSyncStatus("error"));
  }, [crew, routes, ready, authStep]);

  useEffect(() => {
    if (!ready || authStep !== "app" || !username) return;
    if (isRemoteFlights.current) { isRemoteFlights.current = false; return; }
    setDoc(flightDoc(username), { flights }).catch(() => setSyncStatus("error"));
  }, [flights, ready, authStep, username]);

  const submitPasscode = () => {
    if (passcodeInput === APP_PASSCODE) {
      localStorage.setItem("cl-auth", "ok"); setPasscodeErr("");
      const saved = localStorage.getItem("cl-username");
      if (saved) { setUsername(saved); setAuthStep("app"); } else setAuthStep("username");
    } else { setPasscodeErr("密碼錯誤 Wrong passcode ✈"); setPasscodeInput(""); }
  };

  const submitUsername = () => {
    const name = usernameInput.trim();
    if (!name)          { setUsernameErr("請輸入你的名字 Enter your name"); return; }
    if (name.length>20) { setUsernameErr("名字太長了 Too long"); return; }
    localStorage.setItem("cl-username", name); setUsername(name); setAuthStep("app");
  };

  const logout = () => {
    localStorage.removeItem("cl-auth"); localStorage.removeItem("cl-username");
    setUsername(""); setPasscodeInput(""); setAuthStep("passcode");
    setReady(false); setCrew([]); setFlights([]); setRoutes([]);
  };

  const exportJSON = () => {
    const data = { crew, flights, routes, customTags, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `crewlog-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = useCallback((data) => {
    if (data.crew && Array.isArray(data.crew)) setCrew(data.crew);
    if (data.routes && Array.isArray(data.routes)) setRoutes(data.routes);
    if (Array.isArray(data.flights)) setFlights(data.flights);
    if (Array.isArray(data.customTags)) setCustomTags(data.customTags);
  }, []);

  const patchCrew = (id, patch) => setCrew(cr => cr.map(m => m.id===id ? {...m,...patch} : m));
  const flipTag   = (id, tag)   => setCrew(cr => cr.map(m => {
    if (m.id !== id) return m;
    return { ...m, tags: m.tags.includes(tag) ? m.tags.filter(t => t!==tag) : [...m.tags, tag] };
  }));

  const deleteCrew = (id) => {
    setCrew(cr => cr.filter(m => m.id !== id));
    setFlights(fl => fl.filter(f => f.crewId !== id));
    setConfirmDelCrew(false);
    setView("dashboard");
  };

  const goProfile = (id) => {
    setProfileId(id); setEditNotes(false); setConfirmDel(null); setConfirmDelCrew(false);
    setView("profile");
  };

  const openQL = (crewId = null, flightToEdit = null) => {
    if (flightToEdit) {
      const m = crew.find(x => x.id === flightToEdit.crewId);
      setQlInitialForm({ crewId:flightToEdit.crewId, crewTxt:m?`${m.nickname} — ${m.name}`:"", date:flightToEdit.date, flightNum:flightToEdit.flightNum||"", route:flightToEdit.route||"", aircraft:flightToEdit.aircraft||"", position:flightToEdit.position||"", memo:flightToEdit.memo||"", status:null, tags:[] });
      setQlEditFlightId(flightToEdit.id);
    } else {
      const f = { ...EMPTY_FORM, date: today(), aircraft: defaultAircraft, position: defaultPosition };
      if (crewId) {
        const m = crew.find(x => x.id === crewId);
        if (m) { f.crewId=m.id; f.crewTxt=`${m.nickname} — ${m.name}`; f.status=m.status; f.tags=[...m.tags]; }
      }
      setQlInitialForm(f);
      setQlEditFlightId(null);
    }
    setView("quicklog");
  };

  const handleSaveLog = (form) => {
    if (!form.crewId || !form.date) return;
    const entry = { id: qlEditFlightId || mkId(), crewId:form.crewId, date:form.date, flightNum:form.flightNum, route:form.route, aircraft:form.aircraft, position:form.position, memo:form.memo };
    if (qlEditFlightId) {
      setFlights(fl => fl.map(f => f.id===qlEditFlightId ? entry : f));
    } else {
      setFlights(fl => [...fl, entry]);
      setCrew(cr => cr.map(m => {
        if (m.id !== form.crewId) return m;
        return { ...m, status: form.status ?? m.status, tags: [...new Set([...m.tags, ...form.tags])] };
      }));
    }
    setQlEditFlightId(null);
    setView(profileId === form.crewId ? "profile" : "dashboard");
  };

  const lastFlownMap = {};
  flights.forEach(f => { if (!lastFlownMap[f.crewId] || f.date > lastFlownMap[f.crewId]) lastFlownMap[f.crewId] = f.date; });
  const recentIds = [...new Set([...flights].sort((a,b) => new Date(b.date)-new Date(a.date)).map(f => f.crewId))].slice(0, 3);

  const filtered = crew
    .filter(m => {
      const q = search.toLowerCase();
      const memoMatch = search.length>1 && flights.filter(f => f.crewId===m.id).some(f => (f.memo||"").toLowerCase().includes(q));
      const basic = !q || m.id.includes(q) || m.name.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q) || memoMatch;
      return basic && (!filterTag || m.tags.includes(filterTag));
    })
    .sort((a,b) => {
      if (sortMode==="recent") { const la=lastFlownMap[a.id]||"0000", lb=lastFlownMap[b.id]||"0000"; return lb.localeCompare(la); }
      return a.nickname.localeCompare(b.nickname, "ja");
    });

  const pMember  = crew.find(m => m.id === profileId);
  const pFlights = flights.filter(f => f.crewId === profileId).sort((a,b) => new Date(b.date)-new Date(a.date));

  const gs = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Noto+Sans+JP:wght@300;400;500;700&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    html,body,#root{overflow-x:hidden;touch-action:pan-y;overscroll-behavior-x:none;background:${c.bg};min-height:100vh;min-height:100dvh;}
    input,textarea,button{font-family:'Syne','Noto Sans JP',sans-serif;}
    input::placeholder,textarea::placeholder{color:${c.sub};opacity:1;}
    ::-webkit-scrollbar{width:3px;height:3px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:${c.border};border-radius:2px;}
    input[type=date]::-webkit-calendar-picker-indicator{filter:${dark?"invert(0.65)":"none"};opacity:0.7;}
    button{transition:transform .1s,opacity .1s;}
    button:active{transform:scale(0.93);opacity:0.8;}
    textarea{outline:none;}
  `;

  const inp = { background:c.input, border:`1px solid ${c.border}`, borderRadius:12, padding:"11px 14px", color:c.text, fontSize:14, fontFamily:"inherit", outline:"none", width:"100%" };

  // ── Auth screens ──
  if (authStep === "loading") return (
    <>
      <style>{gs}</style>
      <div style={{background:"#0B0C14",minHeight:"100vh",minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{color:"#F5B731",fontSize:20,letterSpacing:4,fontFamily:"'Syne',sans-serif"}}>✈ LOADING...</span>
      </div>
    </>
  );

  if (authStep === "passcode") return (
    <div style={{background:c.bg,minHeight:"100vh",minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,overflowX:"hidden"}}>
      <style>{gs}</style>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <img src="/logo.png" alt="CrewLog" style={{width:80,height:80,objectFit:"contain",marginBottom:12,borderRadius:18}}/>
          <div style={{fontSize:9,letterSpacing:5,color:c.accent,fontWeight:700,marginBottom:6}}>CREW LOG</div>
          <div style={{fontSize:26,fontWeight:800,color:c.text,lineHeight:1.2}}>空中生存指南</div>
          <div style={{fontSize:13,color:c.sub,marginTop:8}}>Enter passcode to continue</div>
        </div>
        <div style={{background:c.card,borderRadius:20,padding:24,border:`1px solid ${c.border}`}}>
          <div style={{fontSize:10,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8}}>通關密語 PASSCODE</div>
          <input type="password" value={passcodeInput} onChange={e=>setPasscodeInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submitPasscode()}
            placeholder="••••••••" autoFocus
            style={{...inp,marginBottom:passcodeErr?8:16,fontSize:20,letterSpacing:6,textAlign:"center"}}/>
          {passcodeErr && <div style={{color:"#FF453A",fontSize:12,marginBottom:12,textAlign:"center"}}>{passcodeErr}</div>}
          <button onClick={submitPasscode} style={{width:"100%",background:c.accent,color:c.adk,border:"none",borderRadius:14,padding:"14px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",letterSpacing:1}}>進入 ENTER ✈</button>
        </div>
      </div>
    </div>
  );

  if (authStep === "username") return (
    <div style={{background:c.bg,minHeight:"100vh",minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,overflowX:"hidden"}}>
      <style>{gs}</style>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:40,marginBottom:10}}>👋</div>
          <div style={{fontSize:22,fontWeight:800,color:c.text}}>你叫什麼名字？</div>
          <div style={{fontSize:13,color:c.sub,marginTop:8,lineHeight:1.7}}>Pick a name — your flight logs will be<br/><strong style={{color:c.accent}}>private</strong> and only visible to you.</div>
        </div>
        <div style={{background:c.card,borderRadius:20,padding:24,border:`1px solid ${c.border}`}}>
          <div style={{fontSize:10,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8}}>你的名字 YOUR NAME</div>
          <input value={usernameInput} onChange={e=>setUsernameInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submitUsername()}
            placeholder="e.g. Erika, Hanae..." autoFocus
            style={{...inp,marginBottom:usernameErr?8:16,fontSize:18,textAlign:"center"}}/>
          {usernameErr && <div style={{color:"#FF453A",fontSize:12,marginBottom:12,textAlign:"center"}}>{usernameErr}</div>}
          <button onClick={submitUsername} style={{width:"100%",background:c.accent,color:c.adk,border:"none",borderRadius:14,padding:"14px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>開始 START 🚀</button>
        </div>
      </div>
    </div>
  );

  if (!ready) return (
    <>
      <style>{gs}</style>
      <div style={{background:"#0B0C14",minHeight:"100vh",minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
        <span style={{color:"#F5B731",fontSize:20,letterSpacing:4,fontFamily:"'Syne',sans-serif"}}>✈ LOADING...</span>
        <span style={{color:"#6B7499",fontSize:12,letterSpacing:2}}>連接雲端資料庫...</span>
      </div>
    </>
  );

  // ── Dashboard (called as function, not component) ──
  const DashView = () => (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <div style={{padding:"18px 16px 12px",background:c.card,borderBottom:`1px solid ${c.border}`,flexShrink:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:9,letterSpacing:4,color:c.accent,fontWeight:700,marginBottom:2}}>CREW LOG ✈ 空中生存指南</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontSize:22,fontWeight:800,color:c.text}}>Dashboard</div>
              <SyncBadge syncStatus={syncStatus} c={c}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>setDark(d=>!d)} style={{background:c.pill,border:"none",color:c.sub,borderRadius:10,padding:"8px 10px",cursor:"pointer",fontSize:16}}>{dark?"☀":"🌙"}</button>
            <button onClick={()=>setView("settings")} style={{background:c.pill,border:"none",color:c.sub,borderRadius:10,padding:"8px 10px",cursor:"pointer",fontSize:16}}>⚙</button>
          </div>
        </div>
        <div
          onClick={() => setView("mylog")}
          style={{background:c.pill,borderRadius:12,padding:"8px 12px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>👤</span>
            <span style={{fontSize:13,fontWeight:700,color:c.text}}>{username}</span>
            <span style={{fontSize:11,color:c.sub}}>· {flights.length} 筆</span>
          </div>
          <span style={{fontSize:11,color:c.accent,fontWeight:700}}>日誌 ›</span>
        </div>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:c.sub}}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ID / 姓名 / Nickname / 備忘..."
            autoComplete="off" autoCorrect="off" style={{...inp,paddingLeft:36}}/>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"14px 16px 80px",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
          <Tag on={!filterTag} onClick={()=>setFilterTag(null)} c={c}>ALL</Tag>
          {allTags.map(t => <Tag key={t} on={filterTag===t} onClick={()=>setFilterTag(filterTag===t?null:t)} c={c}>{t}</Tag>)}
          <div style={{marginLeft:"auto",display:"flex",gap:4}}>
            <button onClick={()=>setSortMode("alpha")} style={{background:sortMode==="alpha"?c.accent:c.pill,color:sortMode==="alpha"?c.adk:c.sub,border:"none",borderRadius:10,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}}>A–Z</button>
            <button onClick={()=>setSortMode("recent")} style={{background:sortMode==="recent"?c.accent:c.pill,color:sortMode==="recent"?c.adk:c.sub,border:"none",borderRadius:10,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}}>最近</button>
          </div>
        </div>

        {recentIds.length > 0 && !search && !filterTag && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8}}>我的最近合飛 MY RECENT</div>
            <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:8,touchAction:"pan-x",WebkitOverflowScrolling:"touch"}}>
              {recentIds.map(id => {
                const m = crew.find(x => x.id===id); if (!m) return null;
                const last = flights.filter(f => f.crewId===id).sort((a,b) => new Date(b.date)-new Date(a.date))[0];
                const si = m.status ? STATUS_MAP[m.status] : null;
                return (
                  <div key={id} onClick={()=>goProfile(id)}
                    style={{background:si?si.bg:c.card,border:`1px solid ${si?si.border:c.border}`,borderRadius:14,padding:"10px 12px",minWidth:115,flexShrink:0,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <Dot status={m.status} sz={8} c={c}/>
                      <span style={{fontWeight:800,fontSize:15,color:c.text}}>{m.nickname}</span>
                    </div>
                    <div style={{fontSize:11,color:c.sub,marginBottom:5}}>{m.name}</div>
                    {last && <div style={{fontSize:11,color:c.accent,fontWeight:600}}>{last.date}</div>}
                    <button onClick={e=>{e.stopPropagation();openQL(id)}}
                      style={{marginTop:5,background:c.accent,color:c.adk,border:"none",borderRadius:8,padding:"3px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                      + 新增
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:10}}>全部組員 ALL CREW ({filtered.length})</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(m => {
            const si = m.status ? STATUS_MAP[m.status] : null;
            const last = flights.filter(f => f.crewId===m.id).sort((a,b) => new Date(b.date)-new Date(a.date))[0];
            const memoMatch = search.length>1 && flights.filter(f => f.crewId===m.id).some(f => (f.memo||"").toLowerCase().includes(search.toLowerCase()));
            return (
              <div key={m.id} onClick={()=>goProfile(m.id)}
                style={{background:si?si.bg:c.card,border:`1px solid ${si?si.border:c.border}`,borderRadius:14,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,outline:memoMatch?`2px solid ${c.accent}`:"none"}}>
                <Dot status={m.status} sz={12} c={c}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:3}}>
                    <span style={{fontWeight:800,fontSize:16,color:c.text}}>{m.nickname}</span>
                    <span style={{fontSize:13,color:c.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
                    <span style={{fontSize:10,color:c.accent,fontWeight:700,marginLeft:"auto",flexShrink:0}}>{m.seniority}</span>
                  </div>
                  <div style={{fontSize:11,color:c.sub,marginBottom:m.tags.length?4:0}}>
                    #{m.id}{memoMatch && <span style={{color:c.accent,marginLeft:6}}>📝 備忘符合</span>}
                  </div>
                  {m.tags.length > 0 && (
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {m.tags.map(t => <span key={t} style={{background:c.pill,color:c.sub,borderRadius:10,padding:"2px 7px",fontSize:10,fontWeight:600}}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div style={{flexShrink:0,textAlign:"right"}}>
                  <div style={{fontSize:11,color:last?c.sub:c.border}}>{last?last.date:"—"}</div>
                  <button onClick={e=>{e.stopPropagation();openQL(m.id)}}
                    style={{marginTop:4,background:c.pill,color:c.accent,border:"none",borderRadius:8,padding:"4px 10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new crew */}
        <div style={{marginTop:24,background:c.card,border:`1px dashed ${c.border}`,borderRadius:16,padding:16}}>
          <div style={{fontSize:10,letterSpacing:3,color:c.accent,fontWeight:700,marginBottom:4}}>新增組員 ADD CREW</div>
          <div style={{fontSize:10,color:c.sub,marginBottom:12}}>⚠ Shared with all users</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <input value={newCrew.id} onChange={e=>setNewCrew(n=>({...n,id:e.target.value}))} placeholder="員工 ID *" autoComplete="off" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
            <input value={newCrew.nickname} onChange={e=>setNewCrew(n=>({...n,nickname:e.target.value}))} placeholder="Nickname *" autoComplete="off" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
            <input value={newCrew.name} onChange={e=>setNewCrew(n=>({...n,name:e.target.value}))} placeholder="姓名 (中文/日文)" autoComplete="off" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
            <input value={newCrew.seniority} onChange={e=>setNewCrew(n=>({...n,seniority:e.target.value}))} placeholder="期別 e.g. 24G" autoComplete="off" style={{...inp,fontSize:13,padding:"9px 12px"}}/>
          </div>
          {addCrewErr && <div style={{color:"#FF453A",fontSize:12,marginBottom:8}}>{addCrewErr}</div>}
          <button onClick={()=>{
            setAddCrewErr("");
            if (!newCrew.id.trim()||!newCrew.nickname.trim()){setAddCrewErr("ID 和英文名為必填");return;}
            if (crew.find(m=>m.id===newCrew.id.trim())){setAddCrewErr("此 ID 已存在");return;}
            const dupNick=crew.find(m=>m.nickname.toLowerCase()===newCrew.nickname.trim().toLowerCase());
            if (dupNick){setAddCrewErr(`"${newCrew.nickname}" 已有同名組員 (${dupNick.name} · ${dupNick.seniority})`);return;}
            setCrew(cr=>[...cr,{id:newCrew.id.trim(),name:newCrew.name.trim(),nickname:newCrew.nickname.trim(),seniority:newCrew.seniority.trim(),status:null,tags:[],notes:""}]);
            setNewCrew({id:"",name:"",nickname:"",seniority:""});
          }} style={{width:"100%",background:c.accent,color:c.adk,border:"none",borderRadius:12,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            + 新增 Add Member
          </button>
        </div>
      </div>

      <button onClick={()=>openQL()}
        style={{position:"fixed",bottom:24,right:24,background:c.accent,color:c.adk,border:"none",borderRadius:"50%",width:58,height:58,fontSize:28,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 24px ${c.accent}66`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:50}}>
        +
      </button>
    </div>
  );

  // ── Profile View ──
  const ProfView = () => {
    if (!pMember) return null;
    const m = pMember;
    const si = m.status ? STATUS_MAP[m.status] : null;
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
        <div style={{padding:"16px 16px 14px",background:si?si.bg:c.card,borderBottom:`2px solid ${si?si.border:c.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <button onClick={()=>setView("dashboard")} style={{background:"rgba(128,128,128,0.15)",border:"none",color:c.text,borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:18}}>←</button>
            <div style={{flex:1}}/>
            <button onClick={()=>openQL(m.id)} style={{background:c.accent,color:c.adk,border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ 新增飛行</button>
          </div>
          {si && <div style={{background:si.bg,border:`1px solid ${si.border}`,borderRadius:10,padding:"7px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:16}}>{si.emoji}</span><span style={{color:si.color,fontWeight:800,fontSize:13}}>{si.label}</span></div>}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
            <div style={{width:54,height:54,borderRadius:16,flexShrink:0,background:si?si.bg:c.pill,border:`2px solid ${si?si.color:c.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:si?si.color:c.accent}}>{m.nickname[0]}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:22,fontWeight:800,color:c.text,lineHeight:1.1}}>{m.nickname}</div>
              <div style={{fontSize:14,color:c.sub}}>{m.name}</div>
              <div style={{fontSize:11,color:c.accent,fontWeight:700,marginTop:2}}>{m.seniority} · #{m.id} · {pFlights.length} 次 (我的)</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            {Object.entries(STATUS_MAP).map(([k,v]) => (
              <button key={k} onClick={()=>patchCrew(m.id,{status:m.status===k?null:k})}
                style={{flex:1,background:m.status===k?v.bg:c.pill,border:`1px solid ${m.status===k?v.color:c.border}`,color:m.status===k?v.color:c.sub,borderRadius:10,padding:"7px 4px",fontSize:16,cursor:"pointer"}}>
                {v.emoji}
              </button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"14px 16px 32px",WebkitOverflowScrolling:"touch"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>組員資料 CREW INFO</span>
              <button onClick={()=>{
                if (editCrewInfo) { if(tempCrewInfo.nickname.trim()) patchCrew(m.id,tempCrewInfo); setEditCrewInfo(false); }
                else { setTempCrewInfo({name:m.name,nickname:m.nickname,seniority:m.seniority}); setEditCrewInfo(true); }
              }} style={{background:"none",border:"none",color:c.accent,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {editCrewInfo ? "💾 儲存" : "✏ 編輯"}
              </button>
            </div>
            {editCrewInfo ? (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input value={tempCrewInfo.nickname} onChange={e=>setTempCrewInfo(t=>({...t,nickname:e.target.value}))} placeholder="Nickname *" autoComplete="off" style={{...inp,borderRadius:12,padding:"10px 14px"}}/>
                <input value={tempCrewInfo.name} onChange={e=>setTempCrewInfo(t=>({...t,name:e.target.value}))} placeholder="姓名" autoComplete="off" style={{...inp,borderRadius:12,padding:"10px 14px"}}/>
                <input value={tempCrewInfo.seniority} onChange={e=>setTempCrewInfo(t=>({...t,seniority:e.target.value}))} placeholder="期別 e.g. 24G" autoComplete="off" style={{...inp,borderRadius:12,padding:"10px 14px"}}/>
              </div>
            ) : (
              <div style={{background:c.cardAlt,border:`1px solid ${c.border}`,borderRadius:12,padding:"10px 14px",fontSize:13,color:c.sub,lineHeight:1.8}}>
                <span style={{color:c.text,fontWeight:700}}>{m.nickname}</span> · {m.name}<br/>
                期別 {m.seniority} · #{m.id}
              </div>
            )}
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8}}>標籤 TAGS</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allTags.map(t => (
                <button key={t} onClick={()=>flipTag(m.id,t)}
                  style={{background:m.tags.includes(t)?c.accent:c.pill,color:m.tags.includes(t)?c.adk:c.sub,border:"none",borderRadius:20,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>長期筆記 NOTES</span>
              <button onClick={()=>{ if(editNotes){patchCrew(m.id,{notes:tempNotes});setEditNotes(false);}else{setTempNotes(m.notes);setEditNotes(true);} }}
                style={{background:"none",border:"none",color:c.accent,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {editNotes ? "💾 儲存" : "✏ 編輯"}
              </button>
            </div>
            {editNotes
              ? <textarea value={tempNotes} onChange={e=>setTempNotes(e.target.value)} rows={3} style={{...inp,resize:"vertical",border:`1px solid ${c.accent}`,borderRadius:12}}/>
              : <div style={{background:c.cardAlt,border:`1px solid ${c.border}`,borderRadius:12,padding:"11px 14px",color:m.notes?c.text:c.sub,fontSize:14,minHeight:48,lineHeight:1.6}}>{m.notes||"尚無備忘。No notes yet."}</div>
            }
          </div>

          <div>
            <div style={{fontSize:9,letterSpacing:3,color:c.sub,fontWeight:700,marginBottom:14}}>
              我的合飛紀錄 MY HISTORY ({pFlights.length}) <span style={{fontWeight:400,fontSize:8}}>🔒 only you</span>
            </div>
            {pFlights.length === 0
              ? <div style={{textAlign:"center",color:c.sub,fontSize:14,padding:"28px 0"}}>尚無紀錄<br/>No flights logged yet</div>
              : <div style={{position:"relative"}}>
                  <div style={{position:"absolute",left:15,top:6,bottom:6,width:1,background:c.border}}/>
                  {pFlights.map(f => (
                    <div key={f.id} style={{position:"relative",paddingLeft:38,marginBottom:14}}>
                      <div style={{position:"absolute",left:9,top:14,width:13,height:13,borderRadius:"50%",background:c.accent,border:`2px solid ${c.bg}`}}/>
                      <div style={{background:c.card,border:`1px solid ${c.border}`,borderRadius:12,padding:"10px 12px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                          <span style={{fontWeight:700,color:c.text,fontSize:14}}>
                            {f.flightNum||"—"}{f.route && <span style={{color:c.sub,fontSize:12,fontWeight:400,marginLeft:8}}>{f.route}</span>}
                          </span>
                          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,marginLeft:8}}>
                            <span style={{fontSize:11,color:c.sub}}>{f.date}</span>
                            <button onClick={()=>openQL(null,f)} style={{background:"none",border:"none",color:c.sub,cursor:"pointer",fontSize:13,padding:"0 2px"}}>✏</button>
                            {confirmDel === f.id
                              ? <div style={{display:"flex",gap:4}}>
                                  <button onClick={()=>{setFlights(fl=>fl.filter(x=>x.id!==f.id));setConfirmDel(null);}} style={{background:"#FF453A",color:"#fff",border:"none",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>確認刪除</button>
                                  <button onClick={()=>setConfirmDel(null)} style={{background:c.pill,color:c.sub,border:"none",borderRadius:6,padding:"2px 6px",fontSize:11,cursor:"pointer"}}>取消</button>
                                </div>
                              : <button onClick={()=>setConfirmDel(f.id)} style={{background:"none",border:"none",color:"#FF453A",cursor:"pointer",fontSize:13,padding:"0 2px"}}>🗑</button>
                            }
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:f.memo?5:0}}>
                          {f.aircraft && <span style={{background:c.pill,color:c.accent,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:700}}>{f.aircraft}</span>}
                          {f.position && <span style={{background:c.pill,color:c.sub,borderRadius:8,padding:"2px 8px",fontSize:11}}>{f.position}</span>}
                        </div>
                        {f.memo && <div style={{fontSize:13,color:c.sub,borderTop:`1px solid ${c.border}`,paddingTop:5,marginTop:2}}>📝 {f.memo}</div>}
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          <div style={{marginTop:32,borderTop:`1px solid ${c.border}`,paddingTop:20}}>
            <div style={{fontSize:9,letterSpacing:3,color:"#FF453A",fontWeight:700,marginBottom:10}}>危險區域 DANGER ZONE</div>
            {confirmDelCrew
              ? <div style={{background:"rgba(255,69,58,0.1)",border:"1px solid rgba(255,69,58,0.4)",borderRadius:14,padding:16}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#FF453A",marginBottom:6}}>確定要刪除 {m.nickname}？</div>
                  <div style={{fontSize:12,color:c.sub,marginBottom:14}}>This removes them from the shared crew list for everyone. Your personal flight logs will also be deleted.<br/>⚠ Cannot be undone.</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>deleteCrew(m.id)} style={{flex:1,background:"#FF453A",color:"#fff",border:"none",borderRadius:10,padding:"11px",fontSize:13,fontWeight:800,cursor:"pointer"}}>確認刪除 DELETE</button>
                    <button onClick={()=>setConfirmDelCrew(false)} style={{flex:1,background:c.pill,color:c.sub,border:"none",borderRadius:10,padding:"11px",fontSize:13,cursor:"pointer"}}>取消 Cancel</button>
                  </div>
                </div>
              : <button onClick={()=>setConfirmDelCrew(true)}
                  style={{width:"100%",background:"transparent",color:"#FF453A",border:"1px solid rgba(255,69,58,0.35)",borderRadius:12,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  🗑 刪除此組員 Delete Crew Member
                </button>
            }
          </div>
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <>
      <style>{gs}</style>
      <div style={{fontFamily:"'Syne','Noto Sans JP',sans-serif",background:c.bg,color:c.text,minHeight:"100vh",maxWidth:440,margin:"0 auto",boxShadow:"0 0 80px rgba(0,0,0,0.5)",overflowX:"hidden",touchAction:"pan-y"}}>
        {view === "dashboard" && DashView()}
        {view === "quicklog"  && (
          <QuickLogView
            crew={crew}
            routes={routes}
            setRoutes={setRoutes}
            initialForm={qlInitialForm}
            editFlightId={qlEditFlightId}
            onSave={handleSaveLog}
            onBack={() => { setView(profileId ? "profile" : "dashboard"); setQlEditFlightId(null); }}
            dark={dark}
            c={c}
            profileId={profileId}
            allTags={allTags}
          />
        )}
        {view === "profile"   && ProfView()}
        {view === "mylog" && (
          <MyLogView
            flights={flights}
            crew={crew}
            username={username}
            onBack={() => setView("dashboard")}
            onGoProfile={(id) => { setProfileId(id); setView("profile"); }}
            onEdit={(f) => { openQL(null, f); }}
            c={c}
          />
        )}
        {view === "guide"     && <GuideView onBack={() => setView("settings")} c={c}/>}
        {view === "stats"     && <StatsView crew={crew} flights={flights} onBack={() => setView("settings")} c={c}/>}
        {view === "settings"  && (
          <SettingsView
            onBack={() => setView("dashboard")}
            c={c}
            dark={dark}
            setDark={setDark}
            username={username}
            onLogout={logout}
            onExport={exportJSON}
            onGoGuide={() => setView("guide")}
            onGoStats={() => setView("stats")}
            defaultAircraft={defaultAircraft}
            setDefaultAircraft={setDefaultAircraft}
            defaultPosition={defaultPosition}
            setDefaultPosition={setDefaultPosition}
            customTags={customTags}
            setCustomTags={setCustomTags}
            onImport={handleImport}
            routes={routes}
            setRoutes={setRoutes}
            flights={flights}
          />
        )}
      </div>
    </>
  );
}
