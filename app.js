// FocusTrack MVP. Starts in local mode; configure Supabase below to enable cloud sync.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const cloudEnabled = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const sb = cloudEnabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString("en-CA");
const key = "focustrack_v1";
let state = loadLocal();
let user = null;
let chart = null;

function loadLocal(){ try{return JSON.parse(localStorage.getItem(key)) || {records:{},goals:{},theme:"dark"};}catch{return {records:{},goals:{},theme:"dark"};} }
function saveLocal(){localStorage.setItem(key,JSON.stringify(state));}
function minutes(h,m){return Math.max(0,Number(h||0)*60+Number(m||0));}
function formatTime(n){const h=Math.floor(n/60),m=n%60;return h?`${h}h ${m}m`:`${m}m`;}
function dateLabel(d){return new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});}
function recordFor(d=today()){return state.records[d] || {screen:0,study:0,studyTarget:240,screenLimit:180};}
function goalsFor(d=today()){return state.goals[d] || [];}
function streakData(){
  const completed = Object.keys(state.records).filter(d=>isComplete(d)).sort();
  let best=0,run=0,last=null;
  for(const d of completed){const dt=new Date(d+"T12:00:00");const prev=last?new Date(last+"T12:00:00"):null;const diff=prev?(dt-prev)/86400000:0;run=last&&diff===1?run+1:1;best=Math.max(best,run);last=d;}
  let current=0, cursor=new Date(today()+"T12:00:00");
  while(completed.includes(cursor.toLocaleDateString("en-CA"))){current++;cursor.setDate(cursor.getDate()-1);}
  return {current,best,total:completed.length};
}
function isComplete(d){
  const r=state.records[d];if(!r)return false;
  const mandatory=goalsFor(d).filter(g=>g.mandatory);
  return r.study>=r.studyTarget && r.screen<=r.screenLimit && mandatory.length>0 && mandatory.every(g=>g.done);
}
function render(){
  document.body.classList.toggle("light",state.theme==="light");
  $("theme-toggle").textContent=state.theme==="light"?"☾":"☼";
  $("today-label").textContent=dateLabel(today()).toUpperCase();
  $("date-pill").textContent=dateLabel(today());
  const r=recordFor();
  $("screen-stat").textContent=formatTime(r.screen);$("study-stat").textContent=formatTime(r.study);
  $("screen-foot").textContent=`Limit: ${formatTime(r.screenLimit)}`;
  $("study-foot").textContent=`Target: ${formatTime(r.studyTarget)}`;
  const s=streakData();$("current-streak").innerHTML=`${s.current} <small>days</small>`;$("best-streak").innerHTML=`${s.best} <small>days</small>`;$("total-days").textContent=`${s.total} total completed days`;
  const goals=goalsFor();const done=goals.filter(g=>g.done).length;const pct=goals.length?Math.round(done/goals.length*100):0;
  $("goal-count").textContent=`${done} of ${goals.length} completed`;$("goal-percent").textContent=pct+"%";$("goal-progress-fill").style.width=pct+"%";
  $("goal-list").innerHTML=goals.length?goals.map((g,i)=>`<div class="goal-item ${g.done?"done":""}"><input type="checkbox" data-goal="${i}" ${g.done?"checked":""} aria-label="Complete ${escapeHtml(g.title)}"><span>${escapeHtml(g.title)}</span><small>${g.mandatory?"MANDATORY":"OPTIONAL"}</small><button class="goal-delete" data-delete="${i}" aria-label="Delete goal">×</button></div>`).join(""):'<div class="empty-state">No goals yet. Add your first goal for today.</div>';
  $("screen-hours").value=Math.floor(r.screen/60);$("screen-minutes").value=r.screen%60;$("study-hours").value=Math.floor(r.study/60);$("study-minutes").value=r.study%60;$("study-target").value=r.studyTarget/60;$("screen-limit").value=r.screenLimit/60;
  renderChart();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderChart(){
  const days=Number($("chart-range").value||7), labels=[],study=[],screen=[];
  for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=d.toLocaleDateString("en-CA");const r=recordFor(k);labels.push(d.toLocaleDateString(undefined,{month:"short",day:"numeric"}));study.push(+(r.study/60).toFixed(1));screen.push(+(r.screen/60).toFixed(1));}
  if(chart)chart.destroy();
  const css=getComputedStyle(document.body),text=css.getPropertyValue("--muted").trim(),grid=css.getPropertyValue("--line").trim();
  chart=new Chart($("progress-chart"),{type:"line",data:{labels,datasets:[{label:"Study hours",data:study,borderColor:"#8b9cff",backgroundColor:"#8b9cff22",fill:true,tension:.35,pointRadius:3},{label:"Screen time",data:screen,borderColor:"#f5a65b",backgroundColor:"#f5a65b12",fill:false,tension:.35,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:text,maxRotation:0},grid:{display:false}},y:{beginAtZero:true,ticks:{color:text},grid:{color:grid}}}}});
}
$("record-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const rec={screen:minutes($("screen-hours").value,$("screen-minutes").value),study:minutes($("study-hours").value,$("study-minutes").value),studyTarget:Math.round(Number($("study-target").value)*60),screenLimit:Math.round(Number($("screen-limit").value)*60)};
  if(rec.screen>1440||rec.study>1440||rec.studyTarget<=0||rec.screenLimit<0){$("record-message").textContent="Please enter valid daily values.";return;}
  state.records[today()]=rec;saveLocal();
  const ok=await cloudSaveRecord(rec);$("record-message").textContent=ok?"Saved and synced.":"Saved on this device.";
  render();
});
$("add-goal").addEventListener("click",()=>$("goal-dialog").showModal());
$("quick-add").addEventListener("click",()=>$("screen-hours").focus());
$("goal-form").addEventListener("submit",e=>{
  e.preventDefault();const title=$("goal-title").value.trim();if(!title)return;
  state.goals[today()] ||= [];state.goals[today()].push({title,mandatory:$("goal-mandatory").checked,done:false});saveLocal();$("goal-title").value="";$("goal-dialog").close();render();cloudSaveGoals();
});
$("goal-list").addEventListener("change",e=>{
  if(e.target.matches("[data-goal]")){const i=Number(e.target.dataset.goal);goalsFor()[i].done=e.target.checked;saveLocal();render();cloudSaveGoals();}
});
$("goal-list").addEventListener("click",e=>{
  if(e.target.matches("[data-delete]")){goalsFor().splice(Number(e.target.dataset.delete),1);saveLocal();render();cloudSaveGoals();}
});
$("theme-toggle").addEventListener("click",()=>{state.theme=state.theme==="light"?"dark":"light";saveLocal();render();});
$("chart-range").addEventListener("change",renderChart);
$("auth-open").addEventListener("click",()=>$("auth-dialog").showModal());
$("auth-close").addEventListener("click",()=>$("auth-dialog").close());
$("sign-up").addEventListener("click",async()=>{if(!sb){$("auth-message").textContent="Add your Supabase URL and anon key in app.js first.";return;}const {error}=await sb.auth.signUp({email:$("auth-email").value,password:$("auth-password").value});$("auth-message").textContent=error?.message||"Account created. Check your email if confirmation is enabled.";});
$("auth-form").addEventListener("submit",async e=>{e.preventDefault();if(!sb){$("auth-message").textContent="Add your Supabase URL and anon key in app.js first.";return;}const {data,error}=await sb.auth.signInWithPassword({email:$("auth-email").value,password:$("auth-password").value});if(error){$("auth-message").textContent=error.message;return;}user=data.user;await cloudLoad();$("auth-dialog").close();updateUser();render();});
$("sign-out").addEventListener("click",async()=>{if(sb)await sb.auth.signOut();user=null;updateUser();$("auth-message").textContent="Signed out. Local data remains on this device.";});
function updateUser(){$("user-label").textContent=user?"Signed in":"Guest mode";$("user-email").textContent=user?.email||"Local device storage";$("avatar").textContent=(user?.email||"G").slice(0,1).toUpperCase();}
async function cloudSaveRecord(r){if(!sb||!user)return false;const {error}=await sb.from("daily_records").upsert({user_id:user.id,record_date:today(),screen_minutes:r.screen,study_minutes:r.study,study_target_minutes:r.studyTarget,screen_limit_minutes:r.screenLimit},{onConflict:"user_id,record_date"});return !error;}
async function cloudSaveGoals(){if(!sb||!user)return;const rows=goalsFor().map(g=>({user_id:user.id,goal_date:today(),title:g.title,is_mandatory:g.mandatory,completed:g.done}));await sb.from("daily_goals").delete().eq("user_id",user.id).eq("goal_date",today());if(rows.length)await sb.from("daily_goals").insert(rows);}
async function cloudLoad(){
  const [{data:records},{data:goals}]=await Promise.all([sb.from("daily_records").select("*").eq("user_id",user.id),sb.from("daily_goals").select("*").eq("user_id",user.id)]);
  (records||[]).forEach(x=>state.records[x.record_date]={screen:x.screen_minutes,study:x.study_minutes,studyTarget:x.study_target_minutes,screenLimit:x.screen_limit_minutes});
  const grouped={};(goals||[]).forEach(g=>(grouped[g.goal_date]||=[]).push({title:g.title,mandatory:g.is_mandatory,done:g.completed}));
  state.goals={...state.goals,...grouped};saveLocal();
}
if(sb){sb.auth.getSession().then(async({data})=>{if(data.session){user=data.session.user;await cloudLoad();updateUser();render();}});sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;updateUser();});}
updateUser();render();
