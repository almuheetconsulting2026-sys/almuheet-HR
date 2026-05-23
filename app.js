(function(){
// ===================== STATE =====================
let DB = {
  employees:[],attendance:[],leaves:[],performances:[],
  trainings:[],tasks:[],documents:[],disciplinary:[],
  payroll:[],payrollHistory:[],auditLogs:[],notifications:[],
  nextId:{emp:1,att:1,leave:1,perf:1,train:1,task:1,doc:1,disc:1,pay:1,audit:1,notif:1}
};
let currentRole='admin';
let currentLang='ar';
let currentUser={name:'مدير النظام',role:'مدير موارد بشرية',initials:'مد'};
let activePage='dashboard';

// ===================== PERSIST — Supabase + localStorage =====================
// حالة التزامن
let _syncPending = false;
let _syncTimer = null;
let _isSupabaseReady = false;

function saveDB(){
  // دائماً احفظ محلياً كنسخة احتياطية
  try{localStorage.setItem('mueheet_hr_v2',JSON.stringify(DB));}catch(e){}
  // زامن مع Supabase بعد تأخير قصير لتجميع التغييرات
  if(STORAGE_MODE==='supabase' && _isSupabaseReady){
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(()=>syncToSupabase(), 500);
  }
}

async function syncToSupabase(){
  // لا نزامن كل DB دفعة واحدة — التغييرات تُحفظ عبر DB_API مباشرة
  // هذه الدالة تُستخدم للتحديث الفوري
}

function loadDB(){
  try{
    const d=localStorage.getItem('mueheet_hr_v2');
    if(d){
      const parsed=JSON.parse(d);
      DB=parsed;
      if(!DB.payrollHistory) DB.payrollHistory=[];
    }
  }catch(e){}
}

async function initApp(){
  // تهيئة Supabase
  initSupabase();
  loadDB();

  if(STORAGE_MODE==='supabase' && supabaseClient){
    try{
      showLoadingOverlay('جارٍ الاتصال بقاعدة البيانات...');
      const cloud = await DB_API.syncAll();
      // دمج البيانات السحابية
      if(cloud.employees.length > 0 || DB.employees.length === 0){
        DB.employees = cloud.employees.map(mapEmployee);
        DB.attendance = cloud.attendance.map(mapAttendance);
        DB.leaves = cloud.leaves.map(mapLeave);
        DB.performances = cloud.performances || [];
        DB.tasks = cloud.tasks.map(mapTask);
        DB.documents = cloud.documents.map(mapDocument);
        DB.disciplinary = cloud.disciplinary || [];
        DB.payrollHistory = cloud.payrollHistory.map(ph=>({...ph, snapshot: typeof ph.snapshot==='string'?JSON.parse(ph.snapshot):ph.snapshot}));
        DB.auditLogs = (cloud.auditLogs||[]).map(a=>({...a, user: a.user_name, ts: a.ts}));
        DB.notifications = (cloud.notifications||[]).map(n=>({...n, read: n.is_read}));
        saveLocalOnly();
      } else if(!localStorage.getItem('almuhit_migrated') && DB.employees.length > 0){
        await migrateLocalToSupabase();
      }
      _isSupabaseReady = true;
      hideLoadingOverlay();
    } catch(e){
      console.error('Supabase sync error:',e);
      hideLoadingOverlay();
      showToast('تحذير','تعذر الاتصال بالسحابة — يعمل وضع محلي','warn');
    }
  }
}

// دوال تحويل أسماء الحقول (snake_case → camelCase)
const mapEmployee = e => ({
  id: e.id, name: e.name, nameEn: e.name_en, title: e.title, dept: e.dept,
  phone: e.phone, email: e.email, nationalId: e.national_id, nationality: e.nationality,
  joinDate: e.join_date, salary: +e.salary||0, housing: +e.housing||0,
  transport: +e.transport||0, otherAllowance: +e.other_allowance||0,
  deductions: +e.deductions||0, status: e.status||'نشط', notes: e.notes
});
const mapAttendance = a => ({
  id: a.id, empId: a.emp_id, date: a.date, checkIn: a.check_in,
  checkOut: a.check_out, status: a.status||'حاضر', notes: a.notes
});
const mapLeave = l => ({
  id: l.id, empId: l.emp_id, type: l.type, startDate: l.start_date,
  endDate: l.end_date, reason: l.reason, status: l.status||'معلقة',
  approvedBy: l.approved_by
});
const mapTask = t => ({
  id: t.id, title: t.title, description: t.description, assignee: t.assignee,
  empId: t.emp_id, priority: t.priority||'متوسطة', dueDate: t.due_date,
  completed: t.completed||false
});
const mapDocument = d => ({
  id: d.id, empId: d.emp_id, title: d.title||d.name, name: d.title||d.name,
  type: d.type, issueDate: d.issue_date, expiryDate: d.expiry_date, notes: d.notes
});

// حفظ محلي فقط (بدون Supabase)
function saveLocalOnly(){
  try{localStorage.setItem('mueheet_hr_v2',JSON.stringify(DB));}catch(e){}
}

// overlay تحميل
function showLoadingOverlay(msg){
  let el = document.getElementById('loadingOverlay');
  if(!el){
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.style.cssText='position:fixed;inset:0;background:rgba(15,25,35,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Cairo,sans-serif;gap:16px;';
    el.innerHTML='<div style="font-size:32px;animation:spin 1s linear infinite">⚙️</div><div id="loadingMsg" style="font-size:16px;font-weight:600;"></div>';
    document.body.appendChild(el);
    const style=document.createElement('style');
    style.textContent='@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }
  document.getElementById('loadingMsg').textContent = msg || 'جارٍ التحميل...';
  el.style.display = 'flex';
}
function hideLoadingOverlay(){
  const el = document.getElementById('loadingOverlay');
  if(el) el.style.display = 'none';
}
// Settings persistence
const DEFAULT_SETTINGS={workStart:8,workEnd:17,companyName:'المحيط للاستشارات الهندسية',sessionTimeout:30};
let SETTINGS={...DEFAULT_SETTINGS};
function saveSettings(){try{localStorage.setItem('mueheet_settings',JSON.stringify(SETTINGS));}catch(e){}}
function loadSettings(){
  try{
    const s=localStorage.getItem('mueheet_settings');
    if(s) SETTINGS={...DEFAULT_SETTINGS,...JSON.parse(s)};
  }catch(e){}
}
loadSettings();

// ===================== AUTH =====================
// SHA-256 hashing via Web Crypto API
async function hashPassword(pass){
  if(pass.startsWith('sha256:')){return pass;}
  const enc=new TextEncoder();
  const hashBuffer=await crypto.subtle.digest('SHA-256',enc.encode(pass));
  const hashArray=Array.from(new Uint8Array(hashBuffer));
  return 'sha256:'+hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function verifyPassword(input,stored){
  const hashed=await hashPassword(input);
  // Handle plaintext legacy passwords (migrate on first use)
  if(!stored.startsWith('sha256:')) return input===stored;
  return hashed===stored;
}
// Migrate plaintext passwords to hashed on load
async function migratePasswords(){
  let changed=false;
  for(const [uname,u] of Object.entries(USERS)){
    if(!u.pass.startsWith('sha256:')){
      u.pass=await hashPassword(u.pass);
      changed=true;
    }
  }
  if(changed) saveUsers(USERS);
}

// Dynamic users stored separately in localStorage
function loadUsers(){
  try{
    const u=localStorage.getItem('mueheet_users_v2');
    if(u) return JSON.parse(u);
  }catch(e){}
  return {
    admin:{pass:'admin123',name:'مدير النظام',role:'admin',label:'مدير موارد بشرية',labelEn:'HR Manager',initials:'مد',nameEn:'System Admin'},
    manager:{pass:'mgr123',name:'أحمد المهندس',role:'manager',label:'مدير مشروع',labelEn:'Project Manager',initials:'أح',nameEn:'Ahmed Al-Muhandis'},
    employee:{pass:'emp123',name:'سارة علي',role:'employee',label:'موظف',labelEn:'Employee',initials:'سع',nameEn:'Sara Ali'},
  };
}
function saveUsers(u){try{localStorage.setItem('mueheet_users_v2',JSON.stringify(u));}catch(e){}}
let USERS=loadUsers();
migratePasswords();

// XSS sanitization
function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// SESSION TIMEOUT (inactivity)
let sessionTimer=null;
let sessionActive=false;
function resetSessionTimer(){
  if(!sessionActive) return;
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>{
    if(sessionActive){
      sessionActive=false;
      showToast('انتهت جلستك بسبب عدم النشاط','تسجيل خروج تلقائي','warn');
      setTimeout(()=>doLogout(true),2000);
    }
  },SETTINGS.sessionTimeout*60*1000);
}
['click','keydown','mousemove','touchstart'].forEach(e=>{
  document.addEventListener(e,resetSessionTimer,{passive:true});
});

window.doLogin=async function(){
  const u=document.getElementById('loginUser').value.trim();
  const p=document.getElementById('loginPass').value;
  const user=USERS[u];
  const errEl=document.getElementById('loginErr');
  if(user && await verifyPassword(p,user.pass)){
    startSession(user);
  } else {
    errEl.textContent='اسم المستخدم أو كلمة المرور غير صحيحة';
    errEl.style.animation='none';
    requestAnimationFrame(()=>errEl.style.animation='shake 0.4s ease');
  }
  // Allow Enter key
};
window.quickLogin=function(role){
  startSession(USERS[role]);
};
// Allow Enter key on login
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'){
    const loginScreen=document.getElementById('loginScreen');
    if(loginScreen&&loginScreen.style.display!=='none') window.doLogin();
  }
});
function startSession(user){
  currentUser=user;
  currentRole=user.role;
  sessionActive=true;
  resetSessionTimer();
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('userAv').textContent=user.initials;
  document.getElementById('userName').textContent=user.name;
  document.getElementById('userRoleLabel').textContent=user.label;
  // عرض حالة التخزين
  const modeEl=document.getElementById('storageModeLabel');
  if(modeEl){
    if(STORAGE_MODE==='supabase'&&supabaseClient) modeEl.textContent='☁️ Supabase — متصل';
    else modeEl.textContent='💾 تخزين محلي';
  }
  buildRoleTabs();
  buildNav();
  checkSmartAlerts();
  renderPage('dashboard');
  addAudit('تسجيل دخول',`${user.name} - ${user.label}`);
  startLiveClock();
}

function buildRoleTabs(){
  if(currentRole!=='admin'){document.getElementById('roleTabs').innerHTML='';return;}
  document.getElementById('roleTabs').innerHTML=
    ['admin','manager','employee'].map(r=>
      `<button class="role-tab ${currentRole===r?'active':''}" onclick="switchRole('${r}')">${r==='admin'?'مدير':r==='manager'?'م.مشروع':'موظف'}</button>`
    ).join('');
}
window.switchRole=function(r){
  currentRole=r;
  buildRoleTabs();
  buildNav();
  renderPage('dashboard');
};

// ===================== PERMISSIONS =====================
const PERMS={
  admin:['dashboard','employees','salary','attendance','leaves','performance','tasks','documents','disciplinary','reports','portal','audit','settings'],
  manager:['dashboard','employees','attendance','leaves','performance','tasks','documents','reports'],
  employee:['dashboard','portal','tasks','documents','leaves']
};
function can(page){return PERMS[currentRole]?.includes(page);}

// ===================== NAV =====================
const NAV_ITEMS=[
  {id:'dashboard',icon:'grid',label:'لوحة التحكم',labelEn:'Dashboard'},
  {id:'employees',icon:'users',label:'الموظفون',labelEn:'Employees'},
  {id:'salary',icon:'dollar',label:'الرواتب',labelEn:'Payroll'},
  {id:'attendance',icon:'clock',label:'الحضور',labelEn:'Attendance'},
  {id:'leaves',icon:'calendar',label:'الإجازات',labelEn:'Leaves'},
  {id:'performance',icon:'star',label:'تقييم الأداء',labelEn:'Performance'},

  {id:'tasks',icon:'check',label:'المهام',labelEn:'Tasks'},
  {id:'documents',icon:'file',label:'المستندات',labelEn:'Documents'},
  {id:'disciplinary',icon:'alert',label:'تأديبي',labelEn:'Disciplinary'},
  {id:'reports',icon:'chart',label:'التقارير',labelEn:'Reports'},
  {id:'portal',icon:'user',label:'بوابة الموظف',labelEn:'Portal'},
  {id:'audit',icon:'log',label:'سجل التدقيق',labelEn:'Audit'},
  {id:'settings',icon:'settings',label:'الإعدادات',labelEn:'Settings'},
];
const ICONS={
  grid:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  users:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  dollar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  clock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  calendar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  star:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  book:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  file:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  alert:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  chart:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`,
  user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  log:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  settings:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
};

function buildNav(){
  const nav=document.getElementById('sidebarNav');
  const items=NAV_ITEMS.filter(i=>can(i.id));
  nav.innerHTML=items.map(i=>{
    const pendingLeaves=i.id==='leaves'?DB.leaves.filter(l=>l.status==='معلقة').length:0;
    const pendingTasks=i.id==='tasks'?DB.tasks.filter(t=>!t.completed).length:0;
    const badge=pendingLeaves||pendingTasks?`<span class="nav-badge">${pendingLeaves||pendingTasks}</span>`:'';
    const lbl=currentLang==='ar'?i.label:i.labelEn;
    return `<div class="nav-item ${i.id===activePage?'active':''}" onclick="navTo('${i.id}')">${ICONS[i.icon]}<span>${lbl}</span>${badge}</div>`;
  }).join('');
}

window.navTo=function(page){
  if(!can(page)){addNotifItem('⛔ غير مصرح بالوصول');return;}
  activePage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById(`page-${page}`);
  if(el){el.classList.add('active');}
  buildNav();
  renderPage(page);
  addAudit('عرض صفحة',page);
};

const getEmp=id=>DB.employees.find(e=>e.id===id);
const getInitials=n=>(n||'').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
const avClass=n=>['av-1','av-2','av-3','av-4','av-5','av-6'][((n||'').charCodeAt(0)||0)%6];
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const fmtNum=n=>(+n||0).toLocaleString();
const yearsService=joinDate=>{
  const ms=new Date()-new Date(joinDate);
  return Math.max(0,ms/(1000*60*60*24*365));
};
// Qatar Labor Law EOS: 3 weeks (21 days) salary per year for first 5 years, then 4 weeks (28 days) per year after
const calcEOS=(salary,joinDate)=>{
  const yrs=yearsService(joinDate);
  if(yrs<=0) return 0;
  const dailyRate=salary/30;
  let eos=0;
  if(yrs<=5){
    eos=dailyRate*21*yrs;
  } else {
    eos=dailyRate*21*5 + dailyRate*28*(yrs-5);
  }
  return Math.round(eos);
};
const calcLeaveUsed=empId=>{
  return DB.leaves.filter(l=>l.empId===empId&&l.status==='موافق').reduce((s,l)=>{
    const days=(new Date(l.endDate)-new Date(l.startDate))/(1000*60*60*24)+1;
    return s+days;
  },0);
};
const calcLeaveBalance=empId=>{
  const emp=getEmp(empId);
  if(!emp) return 0;
  const yrs=yearsService(emp.joinDate);
  const earned=Math.floor(yrs*21);
  return Math.max(0,earned-calcLeaveUsed(empId));
};

// ===================== TOAST =====================
function showToast(title,msg='',type='info',duration=4000){
  const icons={success:'✅',error:'❌',info:'ℹ️',warn:'⚠️'};
  const container=document.getElementById('toastContainer');
  if(!container) return;
  const t=document.createElement('div');
  t.className=`toast toast-${type}`;
  t.innerHTML=`<div class="toast-icon">${icons[type]||'🔔'}</div><div class="toast-body"><div class="toast-title">${escHtml(title)}</div>${msg?`<div class="toast-msg">${escHtml(msg)}</div>`:''}</div>`;
  container.appendChild(t);
  setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300);},duration);
}


// ===================== CUSTOM CONFIRM =====================
function showConfirm(msg, onYes, title='تأكيد الإجراء'){
  showModal(`<div class="modal-title">⚠️ ${title}</div>
    <div style="font-size:14px;padding:8px 0 20px;">${msg}</div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="closeModal();(${onYes.toString()})();">نعم، متأكد</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`);
}

// ===================== MOBILE SIDEBAR =====================
window.toggleSidebar=function(){
  const sb=document.querySelector('.sidebar');
  const ov=document.getElementById('sidebarOverlay');
  sb.classList.toggle('open');
  ov.classList.toggle('visible');
};
window.closeSidebar=function(){
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('visible');
};

function statusBadge(s){
  const map={'نشط':'badge-success','تجربة':'badge-warning','إجازة':'badge-info','منتهي':'badge-secondary','موافق':'badge-success','معلقة':'badge-warning','مرفوض':'badge-danger','حاضر':'badge-success','متأخر':'badge-warning','غياب':'badge-danger'};
  return `<span class="badge ${map[s]||'badge-secondary'}">${s}</span>`;
}

function renderStars(rating){
  const map={'ممتاز':5,'جيد جداً':4,'جيد':3,'مقبول':2,'ضعيف':1};
  const n=map[rating]||3;
  return `<span class="stars">${Array.from({length:5},(_,i)=>`<svg class="star ${i<n?'':'empty'}" viewBox="0 0 24 24" fill="${i<n?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`).join('')}</span>`;
}

// ===================== AUDIT & NOTIFICATIONS =====================
function addAudit(action,details){
  DB.auditLogs.push({id:DB.nextId.audit++,ts:new Date().toISOString(),user:currentUser.name||'system',action,details});
  if(DB.auditLogs.length>1000) DB.auditLogs=DB.auditLogs.slice(-1000);
  saveDB();
}
function addNotifItem(text,type='info'){
  DB.notifications.unshift({id:DB.nextId.notif++,text,type,read:false,ts:new Date().toISOString()});
  if(DB.notifications.length>100) DB.notifications=DB.notifications.slice(0,100);
  updateNotifBadge();
  saveDB();
}
function updateNotifBadge(){
  const c=DB.notifications.filter(n=>!n.read).length;
  const el=document.getElementById('notifCount');
  if(el) el.textContent=c;
}
window.toggleNotif=function(){
  const p=document.getElementById('notifPanel');
  p.classList.toggle('open');
  if(p.classList.contains('open')) renderNotifList();
};
function renderNotifList(){
  const list=document.getElementById('notifList');
  if(!DB.notifications.length){list.innerHTML='<div class="notif-item"><div class="notif-text">لا توجد إشعارات</div></div>';return;}
  list.innerHTML=DB.notifications.slice(0,25).map(n=>`
    <div class="notif-item ${n.read?'':'unread'}" onclick="readNotif(${n.id})">
      <div class="notif-text">${escHtml(n.text)}</div>
      <div class="notif-time">${new Date(n.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    </div>`).join('');
}
window.readNotif=function(id){
  const n=DB.notifications.find(x=>x.id===id);
  if(n) n.read=true;
  updateNotifBadge();
  renderNotifList();
  saveDB();
};
window.markAllRead=function(){
  DB.notifications.forEach(n=>n.read=true);
  updateNotifBadge();
  renderNotifList();
  saveDB();
};

function checkSmartAlerts(){
  const today_=new Date();
  const todayStr=today();
  // Work anniversaries
  DB.employees.forEach(e=>{
    const yrs=yearsService(e.joinDate);
    if(yrs>0 && Math.abs(yrs-Math.round(yrs))<0.05){
      addNotifItem(`🎂 الذكرى السنوية ${Math.round(yrs)} للموظف ${e.name}`,'success');
    }
    // Leave balance low
    const bal=calcLeaveBalance(e.id);
    if(bal<5) addNotifItem(`⚠️ رصيد إجازة ${e.name} منخفض (${bal} أيام)`,'warn');
  });
  // Pending leaves
  const pending=DB.leaves.filter(l=>l.status==='معلقة').length;
  if(pending>0) addNotifItem(`📋 يوجد ${pending} طلب إجازة بانتظار الموافقة`,'info');
  // Document expiry alerts (30 days)
  const soon=new Date(today_);soon.setDate(soon.getDate()+30);
  const soonStr=soon.toISOString().slice(0,10);
  DB.documents.forEach(d=>{
    if(d.expiryDate){
      const emp=getEmp(d.empId);
      if(d.expiryDate<=todayStr){
        addNotifItem(`🚨 مستند منتهي: ${d.name} - ${emp?.name||'—'}`,'danger');
      } else if(d.expiryDate<=soonStr){
        addNotifItem(`⏰ مستند سينتهي قريباً: ${d.name} - ${emp?.name||'—'}`,'warn');
      }
    }
  });
  // Overdue tasks
  const overdue=DB.tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<todayStr).length;
  if(overdue>0) addNotifItem(`⏰ يوجد ${overdue} مهمة متأخرة`,'warn');
}

// ===================== GLOBAL SEARCH =====================
window.globalSearchHandler=function(){
  const q=document.getElementById('globalSearch').value.trim().toLowerCase();
  let dropdown=document.getElementById('searchDropdown');
  if(!dropdown){
    dropdown=document.createElement('div');
    dropdown.id='searchDropdown';
    dropdown.style.cssText='position:absolute;top:calc(100% + 6px);right:0;left:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);z-index:300;max-height:360px;overflow-y:auto;';
    document.querySelector('.global-search').appendChild(dropdown);
  }
  if(!q||q.length<2){dropdown.style.display='none';return;}
  const empResults=DB.employees.filter(e=>(e.name||'').toLowerCase().includes(q)||(e.dept||'').toLowerCase().includes(q)||(e.title||'').toLowerCase().includes(q)).slice(0,4);
  const taskResults=DB.tasks.filter(t=>(t.title||'').toLowerCase().includes(q)||(t.assignee||'').toLowerCase().includes(q)).slice(0,3);
  const docResults=DB.documents.filter(d=>(d.title||'').toLowerCase().includes(q)||(d.type||'').toLowerCase().includes(q)).slice(0,2);
  if(!empResults.length&&!taskResults.length&&!docResults.length){
    dropdown.innerHTML='<div style="padding:14px 16px;font-size:13px;color:var(--text3);text-align:center;">لا توجد نتائج</div>';
    dropdown.style.display='block';return;
  }
  let html='';
  if(empResults.length){
    html+=`<div style="padding:8px 14px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);">👥 موظفون</div>`;
    html+=empResults.map(e=>`<div style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;" onmousedown="navTo('employees');document.getElementById('globalSearch').value='';document.getElementById('searchDropdown').style.display='none';" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div class="avatar ${avClass(e.name)}" style="width:30px;height:30px;font-size:11px;">${getInitials(e.name)}</div>
      <div><div style="font-size:13px;font-weight:600;">${e.name}</div><div style="font-size:11px;color:var(--text2);">${e.dept} · ${e.title||''}</div></div>
    </div>`).join('');
  }
  if(taskResults.length){
    html+=`<div style="padding:8px 14px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);">✅ مهام</div>`;
    html+=taskResults.map(t=>`<div style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);" onmousedown="navTo('tasks');document.getElementById('globalSearch').value='';document.getElementById('searchDropdown').style.display='none';" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-size:13px;font-weight:600;">${t.title}</div>
      <div style="font-size:11px;color:var(--text2);">${t.assignee||''} · ${t.completed?'✅ مكتملة':'⏳ معلقة'}</div>
    </div>`).join('');
  }
  if(docResults.length){
    html+=`<div style="padding:8px 14px;font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border-bottom:1px solid var(--border);">📁 مستندات</div>`;
    html+=docResults.map(d=>`<div style="padding:10px 16px;cursor:pointer;" onmousedown="navTo('documents');document.getElementById('globalSearch').value='';document.getElementById('searchDropdown').style.display='none';" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <div style="font-size:13px;font-weight:600;">${d.title}</div>
      <div style="font-size:11px;color:var(--text2);">${d.type||''}</div>
    </div>`).join('');
  }
  dropdown.innerHTML=html;
  dropdown.style.display='block';
};

// Hide search dropdown on outside click

// ===================== RENDER ROUTER =====================
function renderPage(page){
  const fns={dashboard:renderDashboard,employees:renderEmployees,salary:renderSalary,attendance:renderAttendance,leaves:renderLeaves,performance:renderPerformance,training:renderTraining,tasks:renderTasks,documents:renderDocuments,disciplinary:renderDisciplinary,reports:renderReports,portal:renderPortal,audit:renderAudit,settings:renderSettings};
  if(fns[page]) fns[page]();
}

// ===================== DASHBOARD =====================
function renderDashboard(){
  const active=DB.employees.filter(e=>e.status==='نشط').length;
  const todayAtt=DB.attendance.filter(a=>a.date===today()).length;
  const pendingLeaves=DB.leaves.filter(l=>l.status==='معلقة').length;
  const totalSalary=DB.employees.reduce((s,e)=>s+(e.salary||0),0);
  const pendingTasks=DB.tasks.filter(t=>!t.completed).length;
  const totalTrainings=DB.trainings.length;

  // Chart data
  const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو'];
  const attByMonth=months.map((_,i)=>DB.attendance.filter(a=>{const m=new Date(a.date).getMonth();return m===i&&a.status==='حاضر';}).length);
  const maxAtt=Math.max(...attByMonth,1);

  // Dept distribution
  const depts={};
  DB.employees.forEach(e=>{depts[e.dept]=(depts[e.dept]||0)+1;});
  const deptColors=['#1B4F8A','#00B4D8','#2D9D6E','#F4A261','#E74C3C','#8E44AD'];
  const deptKeys=Object.keys(depts);

  let html=`<div class="topbar">
    <div><div class="page-title">🏠 لوحة التحكم</div><div class="page-sub">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>
    ${currentRole==='admin'?`<div class="topbar-actions"><button class="btn btn-primary" onclick="openModal('addEmp')">+ موظف جديد</button></div>`:''}
  </div>`;

  // Smart alerts
  const alerts=[];
  if(pendingLeaves>0) alerts.push(`<div class="smart-alert warn">⚠️ يوجد ${pendingLeaves} طلب إجازة بانتظار موافقتك</div>`);
  if(pendingTasks>0) alerts.push(`<div class="smart-alert info">📋 ${pendingTasks} مهمة لم تُنجز بعد</div>`);
  if(DB.employees.length===0) alerts.push(`<div class="smart-alert info">👋 مرحباً! ابدأ بإضافة موظفين للنظام</div>`);
  html+=alerts.join('');

  // Live stats widget
  html+=`<div class="live-stats-widget">
    <div class="live-clock-ring">
      <canvas id="liveClockCanvas" width="64" height="64" style="position:absolute;top:0;left:0;"></canvas>
      <div style="position:relative;z-index:1;text-align:center;">
        <div id="liveTimeDisplay" style="font-size:13px;font-weight:800;letter-spacing:1px;"></div>
        <div style="font-size:8px;opacity:0.7;">الوقت</div>
      </div>
    </div>
    <div class="live-stats-items">
      <div class="live-stat-item">
        <div class="live-stat-val" id="liveRemainHours">—</div>
        <div class="live-stat-lbl" id="liveWorkStatus">Remaining</div>
      </div>
      <div class="live-stat-item">
        <div class="live-stat-val">${active}</div>
        <div class="live-stat-lbl">موظف نشط</div>
      </div>
      <div class="live-stat-item">
        <div class="live-stat-val">${todayAtt}</div>
        <div class="live-stat-lbl">حضور اليوم</div>
      </div>
      <div class="live-stat-item">
        <div class="live-stat-val">${pendingLeaves}</div>
        <div class="live-stat-lbl">إجازة معلقة</div>
      </div>
      <div class="live-stat-item">
        <div class="live-stat-val">${pendingTasks}</div>
        <div class="live-stat-lbl">مهمة معلقة</div>
      </div>
    </div>
  </div>`;

  html+=`<div class="cards-grid">
    <div class="metric-card blue"><div class="metric-icon blue">👥</div><div class="metric-label">إجمالي الموظفين</div><div class="metric-value">${DB.employees.length}</div><div class="metric-sub">${active} نشط</div></div>
    <div class="metric-card teal"><div class="metric-icon teal">✅</div><div class="metric-label">الحضور اليوم</div><div class="metric-value">${todayAtt}</div><div class="metric-sub">من ${DB.employees.length} موظف</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">🌴</div><div class="metric-label">طلبات الإجازة</div><div class="metric-value">${pendingLeaves}</div><div class="metric-sub">معلقة</div></div>
    <div class="metric-card green"><div class="metric-icon green">💰</div><div class="metric-label">إجمالي الرواتب</div><div class="metric-value">${fmtNum(totalSalary)}</div><div class="metric-sub">ر.ق شهرياً</div></div>
    <div class="metric-card purple"><div class="metric-icon purple">📚</div><div class="metric-label">التدريبات</div><div class="metric-value">${totalTrainings}</div><div class="metric-sub">دورة مسجلة</div></div>
    <div class="metric-card red"><div class="metric-icon red">📌</div><div class="metric-label">المهام المعلقة</div><div class="metric-value">${pendingTasks}</div><div class="metric-sub">تحتاج إنجاز</div></div>
  </div>`;

  // Charts row
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
    <div class="section">
      <div class="section-header"><div class="section-title">📊 الحضور الشهري</div></div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div class="chart-bar-wrap" style="direction:ltr;">
          ${attByMonth.map((v,i)=>`
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
              <div class="chart-bar" style="width:100%;height:${Math.max(4,(v/maxAtt)*130)}px;background:linear-gradient(180deg,#00B4D8,#1B4F8A);" title="${months[i]}: ${v}">
                <div class="chart-bar-val">${v}</div>
              </div>
              <div class="chart-bar-label">${months[i].slice(0,3)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-header"><div class="section-title">🏢 توزيع الأقسام</div></div>
      ${deptKeys.length===0?'<div class="empty"><div class="empty-icon">🏢</div><div class="empty-desc">لا توجد بيانات</div></div>':
      `<div>${deptKeys.map((d,i)=>{
        const pct=Math.round((depts[d]/DB.employees.length)*100);
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>${d}</span><span style="font-weight:700;">${depts[d]} (${pct}%)</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${deptColors[i%deptColors.length]};"></div></div>
        </div>`;}).join('')}</div>`}
    </div>
  </div>`;

  // Recent employees table
  html+=`<div class="section">
    <div class="section-header"><div class="section-title">👤 آخر الموظفين المضافين</div><button class="btn btn-sm" onclick="navTo('employees')">عرض الكل</button></div>`;
  if(DB.employees.length===0){
    html+=`<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">لا يوجد موظفون</div><div class="empty-desc">ابدأ بإضافة موظفك الأول</div></div>`;
  } else {
    const recent=[...DB.employees].reverse().slice(0,5);
    html+=`<div class="table-wrap"><table><thead><tr><th>الموظف</th><th>المسمى</th><th>القسم</th><th>الراتب</th><th>الحالة</th></tr></thead><tbody>
      ${recent.map(e=>`<tr><td><div class="emp-cell"><div class="avatar ${avClass(e.name)}">${getInitials(e.name)}</div><div class="emp-info"><div class="emp-name">${e.name}</div></div></div></td><td>${e.title||'—'}</td><td>${e.dept}</td><td>${fmtNum(e.salary)} ر.ق</td><td>${statusBadge(e.status)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  html+=`</div>`;
  document.getElementById('page-dashboard').innerHTML=html;
}

// ===================== EMPLOYEES =====================
function renderEmployees(){
  let html=`<div class="topbar">
    <div><div class="page-title">👥 الموظفون</div><div class="page-sub">${DB.employees.length} موظف مسجل</div></div>
    <div class="topbar-actions">
      <input class="search-input" id="empSearch" placeholder="بحث بالاسم أو القسم..." onkeyup="filterEmpTable()">
      <select class="search-input" id="empDeptFilter" onchange="filterEmpTable()">
        <option value="">كل الأقسام</option>
        ${['هندسة مدنية','إدارة مشاريع','موارد بشرية','هندسة كهربائية','هندسة معمارية','هندسة ميكانيكية','BIM'].map(d=>`<option>${d}</option>`).join('')}
      </select>
      <select class="search-input" id="empStatusFilter" onchange="filterEmpTable()">
        <option value="">كل الحالات</option>
        <option>نشط</option><option>تجربة</option><option>إجازة</option><option>منتهي</option>
      </select>
      ${can('employees')&&currentRole==='admin'?`<button class="btn btn-primary" onclick="openModal('addEmp')">+ موظف جديد</button>`:''}
    </div>
  </div>`;
  html+=`<div class="section">
    <div class="table-wrap">
      <table>
        <thead><tr><th>الموظف</th><th>القسم</th><th>الجوال</th><th>الراتب</th><th>تاريخ الانضمام</th><th>رصيد الإجازة</th><th>نهاية الخدمة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody id="empTbody"></tbody>
      </table>
    </div>
    ${DB.employees.length===0?`<div class="empty"><div class="empty-icon">👤</div><div class="empty-title">لا يوجد موظفون</div><div class="empty-desc"><a href="#" onclick="openModal('addEmp')" style="color:var(--primary)">أضف أول موظف</a></div></div>`:''}
  </div>`;
  document.getElementById('page-employees').innerHTML=html;
  renderEmpTable();
}
function renderEmpTable(q='',dept='',status=''){
  const tbody=document.getElementById('empTbody');
  if(!tbody) return;
  let list=DB.employees;
  if(q) list=list.filter(e=>(e.name||'').includes(q)||(e.dept||'').includes(q)||(e.title||'').includes(q));
  if(dept) list=list.filter(e=>e.dept===dept);
  if(status) list=list.filter(e=>e.status===status);
  if(!list.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text2)">لا توجد نتائج</td></tr>`;return;}
  tbody.innerHTML=list.map(e=>{
    const bal=calcLeaveBalance(e.id);
    const eos=calcEOS(e.salary,e.joinDate);
    const acts=currentRole==='admin'?
      `<button class="btn btn-sm" onclick="openEditEmp(${e.id})">✏️</button> <button class="btn btn-sm btn-danger" onclick="delEmp(${e.id})">🗑️</button>`:'';
    return `<tr>
      <td><div class="emp-cell"><div class="avatar ${avClass(e.name)}">${getInitials(e.name)}</div><div class="emp-info"><div class="emp-name">${e.name}</div><div class="emp-title">${e.title||''}</div></div></div></td>
      <td>${e.dept}</td><td dir="ltr">${e.phone||'—'}</td>
      <td>${fmtNum(e.salary)} <small style="color:var(--text3)">ر.ق</small></td>
      <td>${fmtDate(e.joinDate)}</td>
      <td><span class="badge ${bal<5?'badge-danger':bal<10?'badge-warning':'badge-success'}">${bal} يوم</span></td>
      <td>${fmtNum(eos)} <small style="color:var(--text3)">ر.ق</small></td>
      <td>${statusBadge(e.status)}</td>
      <td>${acts}</td>
    </tr>`;
  }).join('');
}
window.filterEmpTable=function(){
  renderEmpTable(
    document.getElementById('empSearch')?.value||'',
    document.getElementById('empDeptFilter')?.value||'',
    document.getElementById('empStatusFilter')?.value||''
  );
};

// ===================== SALARY =====================
function renderSalary(){
  let html=`<div class="topbar">
    <div><div class="page-title">💰 إدارة الرواتب</div><div class="page-sub">مسير الرواتب الشهري</div></div>
    <div class="topbar-actions">
      <select class="search-input" id="salaryMonth"><option value="${new Date().toISOString().slice(0,7)}">${new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long'})}</option></select>
      ${currentRole==='admin'?`<button class="btn btn-primary" onclick="generatePayroll()">إنشاء مسير الرواتب</button>`:''}
      <button class="btn btn-outline" onclick="exportSalaryCSV()">📥 تصدير</button>
    </div>
  </div>`;

  const totalBasic=DB.employees.reduce((s,e)=>s+(e.salary||0),0);
  const totalHousing=DB.employees.reduce((s,e)=>s+(e.housing||0),0);
  const totalTransport=DB.employees.reduce((s,e)=>s+(e.transport||0),0);
  const totalNet=totalBasic+totalHousing+totalTransport;

  html+=`<div class="cards-grid">
    <div class="metric-card green"><div class="metric-icon green">💼</div><div class="metric-label">إجمالي الرواتب الأساسية</div><div class="metric-value">${fmtNum(totalBasic)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card blue"><div class="metric-icon blue">🏠</div><div class="metric-label">بدل السكن</div><div class="metric-value">${fmtNum(totalHousing)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card teal"><div class="metric-icon teal">🚗</div><div class="metric-label">بدل المواصلات</div><div class="metric-value">${fmtNum(totalTransport)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">💳</div><div class="metric-label">صافي الرواتب</div><div class="metric-value">${fmtNum(totalNet)}</div><div class="metric-sub">ر.ق</div></div>
  </div>`;

  html+=`<div class="section">
    <div class="section-header"><div class="section-title">📋 تفاصيل الرواتب</div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>الموظف</th><th>القسم</th><th>الراتب الأساسي</th><th>بدل السكن</th><th>بدل المواصلات</th><th>بدل أخرى</th><th>خصومات</th><th>الصافي</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${DB.employees.length===0?`<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text2)">لا يوجد موظفون</td></tr>`:
        DB.employees.map(e=>{
          const housing=e.housing||0;
          const transport=e.transport||0;
          const other=e.otherAllowance||0;
          const deductions=e.deductions||0;
          const net=e.salary+housing+transport+other-deductions;
          return `<tr>
            <td><div class="emp-cell"><div class="avatar ${avClass(e.name)}">${getInitials(e.name)}</div><span>${e.name}</span></div></td>
            <td>${e.dept}</td>
            <td>${fmtNum(e.salary)}</td>
            <td>${fmtNum(housing)}</td>
            <td>${fmtNum(transport)}</td>
            <td>${fmtNum(other)}</td>
            <td style="color:var(--danger)">${fmtNum(deductions)}</td>
            <td style="font-weight:700;color:var(--success)">${fmtNum(net)}</td>
            <td>
              ${currentRole==='admin'?`<button class="btn btn-sm" onclick="openEditSalary(${e.id})">✏️</button>`:''}
              <button class="btn btn-sm btn-outline" onclick="showPaySlip(${e.id})">🖨️ قسيمة</button>
            </td>
          </tr>`;}).join('')}
      </tbody>
    </table></div>
  </div>`;
  html+=`<div class="section" style="margin-top:16px;">
    <div class="section-header"><div class="section-title">🗂️ أرشيف مسيرات الرواتب</div></div>
    ${DB.payrollHistory.length===0?'<div class="empty"><div class="empty-icon">🗂️</div><div class="empty-desc">لا يوجد أرشيف بعد — أنشئ أول مسير من الزر أعلاه</div></div>':
    DB.payrollHistory.map(ph=>`
      <div class="payroll-history-item">
        <div><b>${ph.label}</b> <span style="color:var(--text3);font-size:11px;">${new Date(ph.createdAt).toLocaleDateString('en-GB')}</span></div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-weight:700;color:var(--success)">${fmtNum(ph.total)} ر.ق</span>
          <span style="font-size:11px;color:var(--text3)">${ph.snapshot.length} موظف</span>
          <button class="btn btn-xs btn-outline" onclick="showPayrollHistoryDetail('${ph.month}')">عرض</button>
        </div>
      </div>`).join('')}
  </div>`;

  document.getElementById('page-salary').innerHTML=html;
}

window.showPayrollHistoryDetail=function(month){
  const ph=DB.payrollHistory.find(x=>x.month===month);
  if(!ph) return;
  const rows=ph.snapshot.map(s=>`<tr>
    <td>${escHtml(s.name)}</td><td>${escHtml(s.dept)}</td>
    <td>${fmtNum(s.basic)}</td><td>${fmtNum(s.housing)}</td><td>${fmtNum(s.transport)}</td>
    <td style="color:var(--danger)">${fmtNum(s.deductions)}</td>
    <td style="font-weight:700;color:var(--success)">${fmtNum(s.net)}</td>
  </tr>`).join('');
  showModal(`<div class="modal-title">📋 مسير رواتب — ${ph.label}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>الموظف</th><th>القسم</th><th>الأساسي</th><th>السكن</th><th>المواصلات</th><th>الخصومات</th><th>الصافي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="margin-top:12px;padding:10px;background:var(--surface2);border-radius:var(--radius);font-size:13px;text-align:center;">
      <b>إجمالي الصافي: ${fmtNum(ph.total)} ر.ق</b>
    </div>
    <div class="modal-footer"><button class="btn" onclick="closeModal()">إغلاق</button></div>`);
};

window.openEditSalary=function(empId){
  const e=getEmp(empId);
  if(!e) return;
  showModal(`<div class="modal-title">✏️ تعديل راتب ${e.name}</div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">الراتب الأساسي</label><input class="form-input" id="sBasic" type="number" value="${e.salary||0}"></div>
      <div class="form-group"><label class="form-label">بدل السكن</label><input class="form-input" id="sHousing" type="number" value="${e.housing||0}"></div>
      <div class="form-group"><label class="form-label">بدل المواصلات</label><input class="form-input" id="sTransport" type="number" value="${e.transport||0}"></div>
      <div class="form-group"><label class="form-label">بدلات أخرى</label><input class="form-input" id="sOther" type="number" value="${e.otherAllowance||0}"></div>
      <div class="form-group"><label class="form-label">الخصومات</label><input class="form-input" id="sDeduct" type="number" value="${e.deductions||0}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveSalary(${empId})">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.saveSalary=async function(empId){
  const e=getEmp(empId);
  if(!e) return;
  e.salary=+document.getElementById('sBasic').value||0;
  e.housing=+document.getElementById('sHousing').value||0;
  e.transport=+document.getElementById('sTransport').value||0;
  e.otherAllowance=+document.getElementById('sOther').value||0;
  e.deductions=+document.getElementById('sDeduct').value||0;
  if(supabaseClient) await DB_API.update('employees',empId,{salary:e.salary,housing:e.housing,transport:e.transport,other_allowance:e.otherAllowance,deductions:e.deductions,updated_at:new Date().toISOString()});
  addAudit('تعديل راتب',`${e.name}: ${e.salary} ر.ق`);
  closeModal();
  renderSalary();
  saveDB();
};

window.showPaySlip=function(empId){
  const e=getEmp(empId);
  if(!e) return;
  const housing=e.housing||0,transport=e.transport||0,other=e.otherAllowance||0,deduct=e.deductions||0;
  const gross=e.salary+housing+transport+other;
  const net=gross-deduct;
  const eos=calcEOS(e.salary,e.joinDate);
  const monthYear=new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long'});
  showModal(`<div class="modal-title">🖨️ قسيمة راتب - ${monthYear}</div>
    <div class="salary-slip">
      <div class="salary-header">
        <div style="font-size:18px;font-weight:800;color:var(--primary)">المحيط للاستشارات الهندسية</div>
        <div style="font-size:13px;color:var(--text2)">قسيمة راتب - ${monthYear}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;font-size:13px;">
        <div><b>الموظف:</b> ${e.name}</div>
        <div><b>القسم:</b> ${e.dept}</div>
        <div><b>المسمى:</b> ${e.title||'—'}</div>
        <div><b>تاريخ الانضمام:</b> ${fmtDate(e.joinDate)}</div>
      </div>
      <table class="salary-table" style="width:100%;margin-bottom:12px;">
        <tr><td style="background:#f8fafc;font-weight:700;" colspan="2">الاستحقاقات</td></tr>
        <tr><td>الراتب الأساسي</td><td style="text-align:left;">${fmtNum(e.salary)} ر.ق</td></tr>
        <tr><td>بدل السكن</td><td style="text-align:left;">${fmtNum(housing)} ر.ق</td></tr>
        <tr><td>بدل المواصلات</td><td style="text-align:left;">${fmtNum(transport)} ر.ق</td></tr>
        ${other?`<tr><td>بدلات أخرى</td><td style="text-align:left;">${fmtNum(other)} ر.ق</td></tr>`:''}
        <tr><td style="background:#f8fafc;font-weight:700;">إجمالي الاستحقاقات</td><td style="text-align:left;font-weight:700;">${fmtNum(gross)} ر.ق</td></tr>
        ${deduct?`<tr><td style="color:var(--danger)">الخصومات</td><td style="text-align:left;color:var(--danger)">- ${fmtNum(deduct)} ر.ق</td></tr>`:''}
        <tr class="total-row"><td>صافي الراتب</td><td style="text-align:left;">${fmtNum(net)} ر.ق</td></tr>
      </table>
      <div style="background:#f8fafc;padding:10px;border-radius:var(--radius);font-size:12px;color:var(--text2);">
        مخصص نهاية الخدمة المتراكم: <b>${fmtNum(eos)} ر.ق</b> | رصيد الإجازة: <b>${calcLeaveBalance(e.id)} يوم</b>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة</button>
      <button class="btn" onclick="closeModal()">إغلاق</button>
    </div>`);
};

window.generatePayroll=function(){
  const monthYear=new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long'});
  const monthKey=new Date().toISOString().slice(0,7);
  // Check if already generated this month
  if(DB.payrollHistory.find(p=>p.month===monthKey)){
    showToast('تنبيه','تم إنشاء مسير هذا الشهر مسبقاً','warn');return;
  }
  const snapshot=DB.employees.map(e=>{
    const housing=e.housing||0,transport=e.transport||0,other=e.otherAllowance||0,deduct=e.deductions||0;
    const gross=e.salary+housing+transport+other;
    const net=gross-deduct;
    return {empId:e.id,name:e.name,dept:e.dept,basic:e.salary,housing,transport,other,deductions:deduct,gross,net};
  });
  DB.payrollHistory.unshift({month:monthKey,label:monthYear,createdAt:new Date().toISOString(),snapshot,total:snapshot.reduce((s,x)=>s+x.net,0)});
  if(DB.payrollHistory.length>24) DB.payrollHistory=DB.payrollHistory.slice(0,24);
  addAudit('إنشاء مسير رواتب',monthYear);
  addNotifItem(`✅ تم إنشاء مسير رواتب ${monthYear}`,'success');
  saveDB();
  renderSalary();
  showToast('تم إنشاء مسير الرواتب',`${monthYear} — ${fmtNum(snapshot.reduce((s,x)=>s+x.net,0))} ر.ق`,'success');
};

window.exportSalaryCSV=function(){
  if(!DB.employees.length){showToast('لا توجد بيانات','','warn');return;}
  let csv="الموظف,القسم,الراتب الأساسي,بدل السكن,بدل المواصلات,الخصومات,الصافي\n";
  DB.employees.forEach(e=>{
    const net=e.salary+(e.housing||0)+(e.transport||0)+(e.otherAllowance||0)-(e.deductions||0);
    csv+=`"${e.name}","${e.dept}","${e.salary}","${e.housing||0}","${e.transport||0}","${e.deductions||0}","${net}"\n`;
  });
  const blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`payroll_${today()}.csv`;
  a.click();
};

// ===================== ATTENDANCE =====================
function renderAttendance(){
  let html=`<div class="topbar">
    <div><div class="page-title">⏰ الحضور والانصراف</div><div class="page-sub">إدارة سجلات الحضور</div></div>
    <div class="topbar-actions">
      ${currentRole==='admin'?`<button class="btn btn-primary" onclick="openModal('attendance')">+ تسجيل حضور</button>
      <button class="btn btn-outline" onclick="exportAttCSV()">📥 تصدير</button>`:''}
    </div>
  </div>
  <div class="filter-bar">
    <select id="attEmpF" onchange="renderAttTable()"><option value="">كل الموظفين</option>${DB.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select>
    <input type="month" id="attMonthF" value="${today().slice(0,7)}" onchange="renderAttTable()">
    <select id="attStatusF" onchange="renderAttTable()"><option value="">كل الحالات</option><option>حاضر</option><option>غياب</option><option>متأخر</option><option>إجازة</option></select>
    <button class="btn btn-sm" onclick="document.getElementById('attEmpF').value='';document.getElementById('attMonthF').value='${today().slice(0,7)}';document.getElementById('attStatusF').value='';renderAttTable();">إعادة ضبط</button>
  </div>`;

  // Summary
  const todayRecs=DB.attendance.filter(a=>a.date===today());
  const presentT=todayRecs.filter(a=>a.status==='حاضر').length;
  const lateT=todayRecs.filter(a=>a.status==='متأخر').length;
  const absentT=todayRecs.filter(a=>a.status==='غياب').length;
  html+=`<div class="cards-grid" style="margin-bottom:16px;">
    <div class="metric-card green" style="padding:14px;"><div class="metric-label">حاضر اليوم</div><div class="metric-value" style="font-size:22px;">${presentT}</div></div>
    <div class="metric-card orange" style="padding:14px;"><div class="metric-label">متأخر</div><div class="metric-value" style="font-size:22px;">${lateT}</div></div>
    <div class="metric-card red" style="padding:14px;"><div class="metric-label">غائب</div><div class="metric-value" style="font-size:22px;">${absentT}</div></div>
  </div>`;

  html+=`<div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>التاريخ</th><th>وقت الدخول</th><th>وقت الخروج</th><th>ساعات العمل</th><th>الإضافي</th><th>الحالة</th><th>ملاحظات</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="attTbody"></tbody>
  </table></div>
  ${DB.attendance.length===0?`<div class="empty"><div class="empty-icon">⏰</div><div class="empty-title">لا توجد سجلات حضور</div></div>`:''}
  </div>`;
  document.getElementById('page-attendance').innerHTML=html;
  renderAttTable();
}
window.renderAttTable=function(){
  const tbody=document.getElementById('attTbody');
  if(!tbody) return;
  const empF=document.getElementById('attEmpF')?.value;
  const monthF=document.getElementById('attMonthF')?.value;
  const statusF=document.getElementById('attStatusF')?.value;
  let list=[...DB.attendance];
  if(empF) list=list.filter(a=>String(a.empId)===empF);
  if(monthF) list=list.filter(a=>a.date.startsWith(monthF));
  if(statusF) list=list.filter(a=>a.status===statusF);
  list.sort((a,b)=>b.date.localeCompare(a.date));
  const stdHours=(SETTINGS.workEnd-SETTINGS.workStart)*60;
  if(!list.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text2)">لا توجد سجلات</td></tr>`;return;}
  tbody.innerHTML=list.map(a=>{
    const emp=getEmp(a.empId);
    let hours='—'; let overtime='—';
    if(a.timeIn&&a.timeOut){
      const [hi,mi]=a.timeIn.split(':').map(Number);
      const [ho,mo]=a.timeOut.split(':').map(Number);
      const diff=(ho*60+mo)-(hi*60+mi);
      if(diff>0){
        hours=`${Math.floor(diff/60)}:${String(diff%60).padStart(2,'0')}`;
        const ot=diff-stdHours;
        if(ot>0) overtime=`<span style="color:var(--success);font-weight:600">+${Math.floor(ot/60)}:${String(ot%60).padStart(2,'0')}</span>`;
        else overtime='<span style="color:var(--text3)">—</span>';
      }
    }
    const acts=currentRole==='admin'?`<button class="btn btn-xs" onclick="delAtt(${a.id})">🗑️</button>`:'';
    return `<tr><td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${emp?.name||'—'}</span></div></td>
      <td>${fmtDate(a.date)}</td><td>${a.timeIn||'—'}</td><td>${a.timeOut||'—'}</td><td>${hours}</td><td>${overtime}</td>
      <td>${statusBadge(a.status)}</td><td style="font-size:11px;color:var(--text2)">${escHtml(a.notes||'')}</td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
};
window.delAtt=function(id){
  showConfirm('هل تريد حذف هذا السجل؟',async()=>{
    if(supabaseClient) await DB_API.delete('attendance',id);
    DB.attendance=DB.attendance.filter(a=>a.id!==id);
    addAudit('حذف حضور',id);saveDB();renderAttendance();
  });
};
window.exportAttCSV=function(){
  if(!DB.attendance.length){showToast('لا توجد بيانات','','warn');return;}
  let csv="الموظف,التاريخ,الدخول,الخروج,الحالة\n";
  DB.attendance.forEach(a=>{csv+=`"${getEmp(a.empId)?.name||''}","${a.date}","${a.timeIn||''}","${a.timeOut||''}","${a.status}"\n`;});
  const blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`attendance_${today()}.csv`;a.click();
};

// ===================== LEAVES =====================
function renderLeaves(){
  let html=`<div class="topbar">
    <div><div class="page-title">🌴 الإجازات</div><div class="page-sub">طلبات وإدارة الإجازات</div></div>
    <div class="topbar-actions"><button class="btn btn-primary" onclick="openModal('leave')">+ طلب إجازة</button></div>
  </div>`;

  const tabs=['كل الطلبات','معلقة','موافق','مرفوض'];
  html+=`<div class="tabs">${tabs.map((t,i)=>`<div class="tab ${i===0?'active':''}" onclick="filterLeaves('${t==='كل الطلبات'?'':t}',this)">${t}</div>`).join('')}</div>`;
  html+=`<div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>نوع الإجازة</th><th>من</th><th>إلى</th><th>الأيام</th><th>السبب</th><th>الحالة</th><th>رصيد الموظف</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="leaveTbody"></tbody>
  </table></div>
  ${DB.leaves.length===0?`<div class="empty"><div class="empty-icon">🌴</div><div class="empty-title">لا توجد طلبات إجازة</div></div>`:''}
  </div>`;
  document.getElementById('page-leaves').innerHTML=html;
  renderLeaveTable('');
}
window.filterLeaves=function(status,el){
  document.querySelectorAll('#page-leaves .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderLeaveTable(status);
};
function renderLeaveTable(status){
  const tbody=document.getElementById('leaveTbody');
  if(!tbody) return;
  let list=DB.leaves;
  if(status) list=list.filter(l=>l.status===status);
  list=[...list].reverse();
  if(!list.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text2)">لا توجد سجلات</td></tr>`;return;}
  tbody.innerHTML=list.map(l=>{
    const emp=getEmp(l.empId);
    const days=Math.round((new Date(l.endDate)-new Date(l.startDate))/(1000*60*60*24))+1;
    const bal=calcLeaveBalance(l.empId);
    const acts=currentRole==='admin'&&l.status==='معلقة'?
      `<button class="btn btn-xs btn-success" onclick="approveLeave(${l.id},true)">✅</button> <button class="btn btn-xs btn-danger" onclick="approveLeave(${l.id},false)">❌</button>`:
      (currentRole==='admin'?`<button class="btn btn-xs btn-danger" onclick="delLeave(${l.id})">🗑️</button>`:'');
    return `<tr><td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${emp?.name||'—'}</span></div></td>
      <td>${l.type}</td><td>${fmtDate(l.startDate)}</td><td>${fmtDate(l.endDate)}</td>
      <td><span class="badge badge-info">${days} يوم</span></td>
      <td style="font-size:12px;">${l.reason||'—'}</td>
      <td>${statusBadge(l.status)}</td>
      <td><span class="badge ${bal<5?'badge-danger':'badge-success'}">${bal} يوم</span></td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
}
window.approveLeave=async function(id,approve){
  const l=DB.leaves.find(x=>x.id===id);
  if(!l) return;
  l.status=approve?'موافق':'مرفوض';
  if(supabaseClient) await DB_API.update('leaves',id,{status:l.status,approved_by:currentUser.name,updated_at:new Date().toISOString()});
  const emp=getEmp(l.empId);
  addNotifItem(`${approve?'✅ تمت الموافقة':'❌ تم الرفض'} على إجازة ${emp?.name}`);
  addAudit(approve?'موافقة إجازة':'رفض إجازة',`${emp?.name}`);
  saveDB();renderLeaves();
};
window.delLeave=function(id){
  showConfirm('هل تريد حذف هذا الطلب؟',()=>{DB.leaves=DB.leaves.filter(l=>l.id!==id);saveDB();renderLeaves();});
};

// ===================== PERFORMANCE =====================
function renderPerformance(){
  let html=`<div class="topbar">
    <div><div class="page-title">⭐ تقييم الأداء</div></div>
    <div class="topbar-actions">${currentRole!=='employee'?`<button class="btn btn-primary" onclick="openModal('performance')">+ تقييم جديد</button>`:''}
    </div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>السنة</th><th>التقييم</th><th>الدرجة</th><th>ملاحظات</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="perfTbody"></tbody>
  </table></div>
  ${DB.performances.length===0?`<div class="empty"><div class="empty-icon">⭐</div><div class="empty-title">لا توجد تقييمات</div></div>`:''}
  </div>`;
  document.getElementById('page-performance').innerHTML=html;
  const tbody=document.getElementById('perfTbody');
  if(!tbody) return;
  if(!DB.performances.length){tbody.innerHTML='';return;}
  tbody.innerHTML=[...DB.performances].reverse().map(p=>{
    const emp=getEmp(p.empId);
    const acts=currentRole==='admin'?`<button class="btn btn-xs btn-danger" onclick="delPerf(${p.id})">🗑️</button>`:'';
    return `<tr><td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${emp?.name||'—'}</span></div></td>
      <td>${p.year}</td><td>${renderStars(p.rating)}</td><td><span class="badge badge-info">${p.rating}</span></td>
      <td style="font-size:12px;">${p.comments||'—'}</td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
}
window.delPerf=function(id){showConfirm('حذف هذا التقييم؟',()=>{DB.performances=DB.performances.filter(p=>p.id!==id);saveDB();renderPerformance();});};

// ===================== TRAINING =====================
function renderTraining(){
  const totalCost=DB.trainings.reduce((s,t)=>s+(t.cost||0),0);
  let html=`<div class="topbar">
    <div><div class="page-title">📚 التدريب والتطوير</div><div class="page-sub">إجمالي التكلفة: ${fmtNum(totalCost)} ر.ق</div></div>
    <div class="topbar-actions"><button class="btn btn-primary" onclick="openModal('training')">+ دورة تدريبية</button></div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>الدورة</th><th>التاريخ</th><th>التكلفة</th><th>الحالة</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="trainTbody"></tbody>
  </table></div>
  ${DB.trainings.length===0?`<div class="empty"><div class="empty-icon">📚</div><div class="empty-title">لا توجد دورات مسجلة</div></div>`:''}
  </div>`;
  document.getElementById('page-training').innerHTML=html;
  const tbody=document.getElementById('trainTbody');
  if(!tbody) return;
  if(!DB.trainings.length) return;
  tbody.innerHTML=[...DB.trainings].reverse().map(t=>{
    const emp=getEmp(t.empId);
    const acts=currentRole==='admin'?`<button class="btn btn-xs btn-danger" onclick="delTrain(${t.id})">🗑️</button>`:'';
    return `<tr><td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${emp?.name||'—'}</span></div></td>
      <td>${t.course}</td><td>${fmtDate(t.date)}</td>
      <td>${t.cost?fmtNum(t.cost)+' ر.ق':'مجانية'}</td>
      <td>${statusBadge(t.status||'نشط')}</td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
}
window.delTrain=function(id){showConfirm('حذف هذه الدورة؟',()=>{DB.trainings=DB.trainings.filter(t=>t.id!==id);saveDB();renderTraining();});};

// ===================== TASKS =====================
function renderTasks(){
  const pending=DB.tasks.filter(t=>!t.completed).length;
  let html=`<div class="topbar">
    <div><div class="page-title">✅ المهام</div><div class="page-sub">${pending} مهمة معلقة</div></div>
    <div class="topbar-actions">
      ${currentRole!=='employee'?`<button class="btn btn-primary" onclick="openModal('task')">+ مهمة جديدة</button>`:''}
    </div>
  </div>
  <div class="tabs">
    <div class="tab active" onclick="filterTasks('all',this)">الكل (${DB.tasks.length})</div>
    <div class="tab" onclick="filterTasks('pending',this)">معلقة (${pending})</div>
    <div class="tab" onclick="filterTasks('done',this)">مكتملة (${DB.tasks.filter(t=>t.completed).length})</div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>المهمة</th><th>الأولوية</th><th>الاستحقاق</th><th>الحالة</th><th>إجراءات</th></tr></thead>
    <tbody id="taskTbody"></tbody>
  </table></div>
  ${DB.tasks.length===0?`<div class="empty"><div class="empty-icon">✅</div><div class="empty-title">لا توجد مهام</div></div>`:''}
  </div>`;
  document.getElementById('page-tasks').innerHTML=html;
  renderTaskTable('all');
}
window.filterTasks=function(filter,el){
  document.querySelectorAll('#page-tasks .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');renderTaskTable(filter);
};
function renderTaskTable(filter){
  const tbody=document.getElementById('taskTbody');
  if(!tbody) return;
  let list=DB.tasks;
  if(filter==='pending') list=list.filter(t=>!t.completed);
  if(filter==='done') list=list.filter(t=>t.completed);
  if(!list.length){tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">لا توجد مهام</td></tr>`;return;}
  const prioColor={'عالية':'badge-danger','متوسطة':'badge-warning','منخفضة':'badge-secondary'};
  tbody.innerHTML=[...list].reverse().map(t=>{
    const emp=getEmp(t.empId);
    const overdue=!t.completed&&t.dueDate&&t.dueDate<today();
    const acts=currentRole!=='employee'?
      `<button class="btn btn-xs" onclick="toggleTask(${t.id})">${t.completed?'↩️':'✅'}</button> <button class="btn btn-xs btn-danger" onclick="delTask(${t.id})">🗑️</button>`:
      `<input type="checkbox" ${t.completed?'checked':''} onchange="toggleTask(${t.id})">`;
    return `<tr style="${overdue?'background:#fff5f5':''}">
      <td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${emp?.name||'—'}</span></div></td>
      <td style="${t.completed?'text-decoration:line-through;color:var(--text2)':''}">${t.title}</td>
      <td><span class="badge ${prioColor[t.priority]||'badge-secondary'}">${t.priority||'متوسطة'}</span></td>
      <td style="${overdue?'color:var(--danger);font-weight:700':''}">
        ${fmtDate(t.dueDate)} ${overdue?'⚠️ متأخرة':''}
      </td>
      <td>${t.completed?'<span class="badge badge-success">✅ مكتملة</span>':'<span class="badge badge-warning">⏳ معلقة</span>'}</td>
      <td>${acts}</td>
    </tr>`;
  }).join('');
}
window.toggleTask=async function(id){const t=DB.tasks.find(x=>x.id===id);if(t){t.completed=!t.completed;if(supabaseClient) await DB_API.update('tasks',id,{completed:t.completed,updated_at:new Date().toISOString()});addAudit('تحديث مهمة',t.title);saveDB();renderTasks();}};
window.delTask=function(id){showConfirm('حذف هذه المهمة؟',async()=>{if(supabaseClient) await DB_API.delete('tasks',id);DB.tasks=DB.tasks.filter(t=>t.id!==id);saveDB();renderTasks();});};

// ===================== DOCUMENTS =====================
function renderDocuments(){
  let html=`<div class="topbar">
    <div><div class="page-title">📁 المستندات</div><div class="page-sub">${DB.documents.length} مستند</div></div>
    <div class="topbar-actions">
      <select class="search-input" id="docEmpFilter" onchange="renderDocTable()"><option value="">كل الموظفين</option>${DB.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}</select>
      <button class="btn btn-primary" onclick="openModal('document')">+ رفع مستند</button>
    </div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>المستند</th><th>النوع</th><th>تاريخ الرفع</th><th>انتهاء الصلاحية</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="docTbody"></tbody>
  </table></div>
  ${DB.documents.length===0?`<div class="empty"><div class="empty-icon">📁</div><div class="empty-title">لا توجد مستندات</div></div>`:''}
  </div>`;
  document.getElementById('page-documents').innerHTML=html;renderDocTable();
}
window.renderDocTable=function(){
  const tbody=document.getElementById('docTbody');
  if(!tbody) return;
  const empF=document.getElementById('docEmpFilter')?.value;
  let list=DB.documents;
  if(empF) list=list.filter(d=>String(d.empId)===empF);
  if(!list.length){tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">لا توجد مستندات</td></tr>`;return;}
  tbody.innerHTML=[...list].reverse().map(d=>{
    const emp=getEmp(d.empId);
    const expired=d.expiryDate&&d.expiryDate<today();
    const acts=currentRole==='admin'?`<button class="btn btn-xs btn-danger" onclick="delDoc(${d.id})">🗑️</button>`:'';
    return `<tr>
      <td>${emp?.name||'—'}</td>
      <td>${d.name}</td>
      <td><span class="badge badge-info">${d.type}</span></td>
      <td>${fmtDate(d.uploadDate)}</td>
      <td style="${expired?'color:var(--danger);font-weight:700':''}">${d.expiryDate?fmtDate(d.expiryDate)+'  '+(expired?'⚠️ منتهية':''):'—'}</td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
};
window.delDoc=function(id){showConfirm('حذف هذا المستند؟',()=>{DB.documents=DB.documents.filter(d=>d.id!==id);saveDB();renderDocuments();});};

// ===================== DISCIPLINARY =====================
function renderDisciplinary(){
  let html=`<div class="topbar">
    <div><div class="page-title">⚖️ الإجراءات التأديبية</div></div>
    <div class="topbar-actions">${currentRole==='admin'?`<button class="btn btn-primary" onclick="openModal('disciplinary')">+ مخالفة</button>`:''}
    </div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>الموظف</th><th>نوع المخالفة</th><th>التاريخ</th><th>الإجراء</th><th>الملاحظات</th>${currentRole==='admin'?'<th>إجراءات</th>':''}</tr></thead>
    <tbody id="discTbody"></tbody>
  </table></div>
  ${DB.disciplinary.length===0?`<div class="empty"><div class="empty-icon">⚖️</div><div class="empty-title">لا توجد مخالفات</div></div>`:''}
  </div>`;
  document.getElementById('page-disciplinary').innerHTML=html;
  const tbody=document.getElementById('discTbody');
  if(!tbody) return;
  if(!DB.disciplinary.length) return;
  tbody.innerHTML=[...DB.disciplinary].reverse().map(d=>{
    const emp=getEmp(d.empId);
    const acts=currentRole==='admin'?`<button class="btn btn-xs btn-danger" onclick="delDisc(${d.id})">🗑️</button>`:'';
    return `<tr><td>${emp?.name||'—'}</td><td><span class="badge badge-danger">${d.type}</span></td><td>${fmtDate(d.date)}</td>
      <td><span class="badge badge-warning">${d.action}</span></td><td style="font-size:12px;">${d.notes||'—'}</td>
      ${currentRole==='admin'?`<td>${acts}</td>`:''}</tr>`;
  }).join('');
}
window.delDisc=function(id){showConfirm('حذف هذا السجل؟',()=>{DB.disciplinary=DB.disciplinary.filter(d=>d.id!==id);saveDB();renderDisciplinary();});};

// ===================== REPORTS =====================
let activeReportTab='summary';
function renderReports(){
  const html=`
  <div class="topbar">
    <div><div class="page-title">📊 التقارير والإحصائيات</div><div class="page-sub">تحليل شامل لبيانات الموارد البشرية</div></div>
    <div class="topbar-actions">
      <button class="btn btn-outline" onclick="exportReportCSV()">📥 تصدير CSV</button>
      <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة</button>
    </div>
  </div>
  <div class="tabs" id="reportTabs">
    <div class="tab ${activeReportTab==='summary'?'active':''}" onclick="switchReportTab('summary',this)">📋 ملخص عام</div>
    <div class="tab ${activeReportTab==='salary'?'active':''}" onclick="switchReportTab('salary',this)">💰 الرواتب</div>
    <div class="tab ${activeReportTab==='attendance'?'active':''}" onclick="switchReportTab('attendance',this)">⏰ الحضور</div>
    <div class="tab ${activeReportTab==='leaves'?'active':''}" onclick="switchReportTab('leaves',this)">🌴 الإجازات</div>
    <div class="tab ${activeReportTab==='tasks'?'active':''}" onclick="switchReportTab('tasks',this)">✅ المهام</div>
    <div class="tab ${activeReportTab==='org'?'active':''}" onclick="switchReportTab('org',this)">🏢 الهيكل التنظيمي</div>
  </div>
  <div id="reportContent"></div>`;
  document.getElementById('page-reports').innerHTML=html;
  renderReportTab(activeReportTab);
}

window.switchReportTab=function(tab,el){
  activeReportTab=tab;
  document.querySelectorAll('#reportTabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  renderReportTab(tab);
};

function renderReportTab(tab){
  const el=document.getElementById('reportContent');
  if(!el) return;
  if(tab==='summary') el.innerHTML=buildReportSummary();
  else if(tab==='salary') el.innerHTML=buildReportSalary();
  else if(tab==='attendance') el.innerHTML=buildReportAttendance();
  else if(tab==='leaves') el.innerHTML=buildReportLeaves();
  else if(tab==='tasks') el.innerHTML=buildReportTasks();
  else if(tab==='org') el.innerHTML=buildReportOrg();
}

function buildReportSummary(){
  const totalSalary=DB.employees.reduce((s,e)=>s+(e.salary||0),0);
  const totalNet=DB.employees.reduce((s,e)=>s+(e.salary||0)+(e.housing||0)+(e.transport||0)+(e.otherAllowance||0)-(e.deductions||0),0);
  const avgSalary=DB.employees.length?Math.round(totalSalary/DB.employees.length):0;
  const presentRate=DB.attendance.length?Math.round((DB.attendance.filter(a=>a.status==='حاضر').length/DB.attendance.length)*100):0;
  const completedTasks=DB.tasks.filter(t=>t.completed).length;
  const taskRate=DB.tasks.length?Math.round((completedTasks/DB.tasks.length)*100):0;
  const pendingLeaves=DB.leaves.filter(l=>l.status==='معلقة').length;
  const activeEmps=DB.employees.filter(e=>e.status==='نشط').length;

  const depts={};DB.employees.forEach(e=>{depts[e.dept]=(depts[e.dept]||0)+1;});
  const statusDist={};DB.employees.forEach(e=>{statusDist[e.status]=(statusDist[e.status]||0)+1;});

  return `
  <div class="cards-grid">
    <div class="metric-card blue"><div class="metric-icon blue">👥</div><div class="metric-label">إجمالي الموظفين</div><div class="metric-value">${DB.employees.length}</div><div class="metric-sub">${activeEmps} نشط</div></div>
    <div class="metric-card green"><div class="metric-icon green">⏰</div><div class="metric-label">نسبة الحضور</div><div class="metric-value">${presentRate}%</div><div class="metric-sub">${DB.attendance.length} سجل</div></div>
    <div class="metric-card teal"><div class="metric-icon teal">✅</div><div class="metric-label">إنجاز المهام</div><div class="metric-value">${taskRate}%</div><div class="metric-sub">${completedTasks} من ${DB.tasks.length}</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">🌴</div><div class="metric-label">إجازات معلقة</div><div class="metric-value">${pendingLeaves}</div><div class="metric-sub">تنتظر الموافقة</div></div>
    <div class="metric-card purple"><div class="metric-icon" style="background:#F4ECF7;color:#8E44AD;">💰</div><div class="metric-label">متوسط الراتب</div><div class="metric-value">${fmtNum(avgSalary)}</div><div class="metric-sub">ر.ق شهرياً</div></div>
    <div class="metric-card red"><div class="metric-icon red">📋</div><div class="metric-label">صافي الرواتب الكلي</div><div class="metric-value">${fmtNum(totalNet)}</div><div class="metric-sub">ر.ق شهرياً</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div class="section">
      <div class="section-title" style="margin-bottom:16px;">🏢 توزيع الموظفين بالأقسام</div>
      ${Object.keys(depts).length?Object.entries(depts).sort((a,b)=>b[1]-a[1]).map(([d,c])=>{
        const pct=Math.round((c/DB.employees.length)*100);
        return `<div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;"><span style="font-weight:600;">${d}</span><span class="badge badge-info">${c} موظف — ${pct}%</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--primary);"></div></div>
        </div>`;}).join(''):`<div class="empty"><div class="empty-icon">🏢</div><div class="empty-title">لا يوجد موظفون</div></div>`}
    </div>
    <div class="section">
      <div class="section-title" style="margin-bottom:16px;">📊 توزيع حالات الموظفين</div>
      ${Object.keys(statusDist).length?Object.entries(statusDist).map(([s,c])=>{
        const pct=Math.round((c/DB.employees.length)*100);
        const colors={'نشط':'var(--success)','تجربة':'var(--warning)','إجازة':'var(--info)','منتهي':'var(--text3)'};
        return `<div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;"><span style="font-weight:600;">${s}</span><span>${c} (${pct}%)</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${colors[s]||'var(--primary)'};"></div></div>
        </div>`;}).join(''):`<div class="empty"><div class="empty-icon">📊</div><div class="empty-title">لا يوجد بيانات</div></div>`}
    </div>
  </div>`;
}

function buildReportSalary(){
  const totalBasic=DB.employees.reduce((s,e)=>s+(e.salary||0),0);
  const totalHousing=DB.employees.reduce((s,e)=>s+(e.housing||0),0);
  const totalTransport=DB.employees.reduce((s,e)=>s+(e.transport||0),0);
  const totalOther=DB.employees.reduce((s,e)=>s+(e.otherAllowance||0),0);
  const totalDeduct=DB.employees.reduce((s,e)=>s+(e.deductions||0),0);
  const totalNet=totalBasic+totalHousing+totalTransport+totalOther-totalDeduct;
  const totalEOS=DB.employees.reduce((s,e)=>s+calcEOS(e.salary,e.joinDate),0);

  // Group by dept
  const deptSalary={};
  DB.employees.forEach(e=>{
    if(!deptSalary[e.dept]) deptSalary[e.dept]={count:0,total:0,net:0};
    deptSalary[e.dept].count++;
    deptSalary[e.dept].total+=(e.salary||0);
    deptSalary[e.dept].net+=(e.salary||0)+(e.housing||0)+(e.transport||0)+(e.otherAllowance||0)-(e.deductions||0);
  });

  return `
  <div class="cards-grid">
    <div class="metric-card blue"><div class="metric-icon blue">💵</div><div class="metric-label">إجمالي الرواتب الأساسية</div><div class="metric-value">${fmtNum(totalBasic)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card teal"><div class="metric-icon teal">🏠</div><div class="metric-label">بدل السكن الكلي</div><div class="metric-value">${fmtNum(totalHousing)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">🚗</div><div class="metric-label">بدل المواصلات الكلي</div><div class="metric-value">${fmtNum(totalTransport)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card green"><div class="metric-icon green">💰</div><div class="metric-label">صافي الرواتب الكلي</div><div class="metric-value">${fmtNum(totalNet)}</div><div class="metric-sub">ر.ق شهرياً</div></div>
    <div class="metric-card red"><div class="metric-icon red">➖</div><div class="metric-label">إجمالي الخصومات</div><div class="metric-value">${fmtNum(totalDeduct)}</div><div class="metric-sub">ر.ق</div></div>
    <div class="metric-card purple"><div class="metric-icon" style="background:#F4ECF7;color:#8E44AD;">📦</div><div class="metric-label">مخصص نهاية الخدمة</div><div class="metric-value">${fmtNum(totalEOS)}</div><div class="metric-sub">ر.ق متراكم</div></div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">💰 تفصيل الرواتب بالأقسام</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>القسم</th><th>عدد الموظفين</th><th>إجمالي الأساسي</th><th>صافي الكلي</th><th>متوسط الأساسي</th></tr></thead>
        <tbody>
          ${Object.entries(deptSalary).sort((a,b)=>b[1].net-a[1].net).map(([dept,d])=>`
          <tr>
            <td style="font-weight:600;">${dept}</td>
            <td><span class="badge badge-info">${d.count}</span></td>
            <td>${fmtNum(d.total)} ر.ق</td>
            <td style="font-weight:700;color:var(--success);">${fmtNum(d.net)} ر.ق</td>
            <td>${fmtNum(Math.round(d.total/d.count))} ر.ق</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">👤 قائمة رواتب الموظفين</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الموظف</th><th>القسم</th><th>الأساسي</th><th>بدل السكن</th><th>بدل المواصلات</th><th>خصومات</th><th>الصافي</th><th>نهاية الخدمة</th></tr></thead>
        <tbody>
          ${DB.employees.length?DB.employees.map(e=>{
            const net=(e.salary||0)+(e.housing||0)+(e.transport||0)+(e.otherAllowance||0)-(e.deductions||0);
            const eos=calcEOS(e.salary,e.joinDate);
            return `<tr>
              <td><div class="emp-cell"><div class="avatar ${avClass(e.name)}">${getInitials(e.name)}</div><span>${escHtml(e.name)}</span></div></td>
              <td><span class="badge badge-secondary">${escHtml(e.dept||'—')}</span></td>
              <td>${fmtNum(e.salary||0)}</td>
              <td>${fmtNum(e.housing||0)}</td>
              <td>${fmtNum(e.transport||0)}</td>
              <td style="color:var(--danger);">${e.deductions?'-'+fmtNum(e.deductions):'—'}</td>
              <td style="font-weight:700;color:var(--success);">${fmtNum(net)} ر.ق</td>
              <td style="color:var(--text2);font-size:12px;">${fmtNum(eos)} ر.ق</td>
            </tr>`;}).join(''):`<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text2)">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function buildReportAttendance(){
  const total=DB.attendance.length;
  const present=DB.attendance.filter(a=>a.status==='حاضر').length;
  const late=DB.attendance.filter(a=>a.status==='متأخر').length;
  const absent=DB.attendance.filter(a=>a.status==='غياب').length;
  const presentRate=total?Math.round((present/total)*100):0;
  const lateRate=total?Math.round((late/total)*100):0;
  const absentRate=total?Math.round((absent/total)*100):0;

  // Per employee attendance summary
  const empAtt={};
  DB.attendance.forEach(a=>{
    if(!empAtt[a.empId]) empAtt[a.empId]={present:0,late:0,absent:0,total:0};
    empAtt[a.empId].total++;
    if(a.status==='حاضر') empAtt[a.empId].present++;
    else if(a.status==='متأخر') empAtt[a.empId].late++;
    else if(a.status==='غياب') empAtt[a.empId].absent++;
  });

  return `
  <div class="cards-grid">
    <div class="metric-card green"><div class="metric-icon green">✅</div><div class="metric-label">حاضر</div><div class="metric-value">${present}</div><div class="metric-sub">${presentRate}% من السجلات</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">⏰</div><div class="metric-label">متأخر</div><div class="metric-value">${late}</div><div class="metric-sub">${lateRate}% من السجلات</div></div>
    <div class="metric-card red"><div class="metric-icon red">❌</div><div class="metric-label">غياب</div><div class="metric-value">${absent}</div><div class="metric-sub">${absentRate}% من السجلات</div></div>
    <div class="metric-card blue"><div class="metric-icon blue">📋</div><div class="metric-label">إجمالي السجلات</div><div class="metric-value">${total}</div><div class="metric-sub">سجل حضور</div></div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">📊 مؤشر الحضور العام</div></div>
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;"><span style="font-weight:600;color:var(--success);">حاضر</span><span>${presentRate}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${presentRate}%;background:var(--success);"></div></div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;"><span style="font-weight:600;color:var(--warning);">متأخر</span><span>${lateRate}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${lateRate}%;background:var(--warning);"></div></div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;"><span style="font-weight:600;color:var(--danger);">غياب</span><span>${absentRate}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${absentRate}%;background:var(--danger);"></div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">👤 سجل حضور الموظفين</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الموظف</th><th>القسم</th><th>حاضر</th><th>متأخر</th><th>غياب</th><th>إجمالي</th><th>نسبة الحضور</th></tr></thead>
        <tbody>
          ${Object.keys(empAtt).length?Object.entries(empAtt).map(([empId,a])=>{
            const emp=getEmp(+empId);
            const rate=a.total?Math.round((a.present/a.total)*100):0;
            const rateColor=rate>=90?'var(--success)':rate>=70?'var(--warning)':'var(--danger)';
            return `<tr>
              <td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${escHtml(emp?.name||'—')}</span></div></td>
              <td><span class="badge badge-secondary">${escHtml(emp?.dept||'—')}</span></td>
              <td style="color:var(--success);font-weight:700;">${a.present}</td>
              <td style="color:var(--warning);font-weight:700;">${a.late}</td>
              <td style="color:var(--danger);font-weight:700;">${a.absent}</td>
              <td>${a.total}</td>
              <td><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="width:80px;display:inline-block;"><div class="progress-fill" style="width:${rate}%;background:${rateColor};"></div></div><span style="font-weight:700;color:${rateColor};">${rate}%</span></div></td>
            </tr>`;}).join(''):`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text2)">لا توجد سجلات حضور</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function buildReportLeaves(){
  const approved=DB.leaves.filter(l=>l.status==='موافق').length;
  const pending=DB.leaves.filter(l=>l.status==='معلقة').length;
  const rejected=DB.leaves.filter(l=>l.status==='مرفوض').length;
  const total=DB.leaves.length;

  // Leave type distribution
  const typeMap={};
  DB.leaves.forEach(l=>{typeMap[l.type]=(typeMap[l.type]||0)+1;});

  return `
  <div class="cards-grid">
    <div class="metric-card green"><div class="metric-icon green">✅</div><div class="metric-label">موافق</div><div class="metric-value">${approved}</div><div class="metric-sub">طلب إجازة</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">⏳</div><div class="metric-label">معلقة</div><div class="metric-value">${pending}</div><div class="metric-sub">تنتظر الموافقة</div></div>
    <div class="metric-card red"><div class="metric-icon red">❌</div><div class="metric-label">مرفوض</div><div class="metric-value">${rejected}</div><div class="metric-sub">طلب إجازة</div></div>
    <div class="metric-card blue"><div class="metric-icon blue">📋</div><div class="metric-label">إجمالي الطلبات</div><div class="metric-value">${total}</div><div class="metric-sub">طلب</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div class="section">
      <div class="section-title" style="margin-bottom:16px;">📊 توزيع أنواع الإجازات</div>
      ${Object.keys(typeMap).length?Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).map(([t,c])=>{
        const pct=total?Math.round((c/total)*100):0;
        return `<div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span style="font-weight:600;">${t}</span><span class="badge badge-accent">${c} (${pct}%)</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--accent);"></div></div>
        </div>`;}).join(''):`<div class="empty"><div class="empty-icon">🌴</div><div class="empty-title">لا توجد إجازات</div></div>`}
    </div>
    <div class="section">
      <div class="section-title" style="margin-bottom:16px;">🏦 رصيد الإجازات السنوية</div>
      ${DB.employees.length?DB.employees.map(e=>{
        const bal=calcLeaveBalance(e.id);
        const balColor=bal>=15?'var(--success)':bal>=7?'var(--warning)':'var(--danger)';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div class="emp-cell" style="gap:8px;"><div class="avatar ${avClass(e.name)}" style="width:28px;height:28px;font-size:10px;">${getInitials(e.name)}</div><span>${escHtml(e.name)}</span></div>
          <span style="font-weight:700;color:${balColor};">${bal} يوم</span>
        </div>`;}).join(''):`<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">لا يوجد موظفون</div></div>`}
    </div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">📋 تفاصيل طلبات الإجازات</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الموظف</th><th>نوع الإجازة</th><th>من</th><th>إلى</th><th>الأيام</th><th>الحالة</th><th>السبب</th></tr></thead>
        <tbody>
          ${DB.leaves.length?[...DB.leaves].reverse().map(l=>{
            const emp=getEmp(l.empId);
            const days=l.startDate&&l.endDate?Math.round((new Date(l.endDate)-new Date(l.startDate))/(1000*60*60*24))+1:0;
            return `<tr>
              <td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${escHtml(emp?.name||'—')}</span></div></td>
              <td><span class="badge badge-accent">${l.type}</span></td>
              <td>${fmtDate(l.startDate)}</td>
              <td>${fmtDate(l.endDate)}</td>
              <td style="font-weight:700;">${days} يوم</td>
              <td>${statusBadge(l.status)}</td>
              <td style="font-size:12px;color:var(--text2);">${l.reason||'—'}</td>
            </tr>`;}).join(''):`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text2)">لا توجد طلبات إجازة</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function buildReportTasks(){
  const total=DB.tasks.length;
  const done=DB.tasks.filter(t=>t.completed).length;
  const pending=total-done;
  const overdue=DB.tasks.filter(t=>!t.completed&&t.dueDate&&t.dueDate<today()).length;
  const high=DB.tasks.filter(t=>t.priority==='عالية'&&!t.completed).length;

  const empTasks={};
  DB.tasks.forEach(t=>{
    if(!empTasks[t.empId]) empTasks[t.empId]={done:0,pending:0,overdue:0};
    if(t.completed) empTasks[t.empId].done++;
    else {
      empTasks[t.empId].pending++;
      if(t.dueDate&&t.dueDate<today()) empTasks[t.empId].overdue++;
    }
  });

  return `
  <div class="cards-grid">
    <div class="metric-card green"><div class="metric-icon green">✅</div><div class="metric-label">مكتملة</div><div class="metric-value">${done}</div><div class="metric-sub">${total?Math.round(done/total*100):0}% إنجاز</div></div>
    <div class="metric-card orange"><div class="metric-icon orange">⏳</div><div class="metric-label">معلقة</div><div class="metric-value">${pending}</div><div class="metric-sub">مهمة</div></div>
    <div class="metric-card red"><div class="metric-icon red">⚠️</div><div class="metric-label">متأخرة</div><div class="metric-value">${overdue}</div><div class="metric-sub">تجاوزت الموعد</div></div>
    <div class="metric-card blue"><div class="metric-icon blue">🔴</div><div class="metric-label">أولوية عالية</div><div class="metric-value">${high}</div><div class="metric-sub">مهمة معلقة</div></div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title">👤 إنتاجية الموظفين</div></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الموظف</th><th>القسم</th><th>مكتملة</th><th>معلقة</th><th>متأخرة</th><th>معدل الإنجاز</th></tr></thead>
        <tbody>
          ${Object.keys(empTasks).length?Object.entries(empTasks).map(([empId,t])=>{
            const emp=getEmp(+empId);
            const totalEmp=t.done+t.pending;
            const rate=totalEmp?Math.round((t.done/totalEmp)*100):0;
            const rateColor=rate>=80?'var(--success)':rate>=50?'var(--warning)':'var(--danger)';
            return `<tr>
              <td><div class="emp-cell"><div class="avatar ${avClass(emp?.name||'?')}">${getInitials(emp?.name||'?')}</div><span>${escHtml(emp?.name||'—')}</span></div></td>
              <td><span class="badge badge-secondary">${escHtml(emp?.dept||'—')}</span></td>
              <td style="color:var(--success);font-weight:700;">${t.done}</td>
              <td style="color:var(--warning);font-weight:700;">${t.pending}</td>
              <td style="color:${t.overdue?'var(--danger)':'var(--text2)'};font-weight:${t.overdue?700:400};">${t.overdue||'—'}</td>
              <td><div style="display:flex;align-items:center;gap:8px;"><div class="progress-bar" style="width:80px;display:inline-block;"><div class="progress-fill" style="width:${rate}%;background:${rateColor};"></div></div><span style="font-weight:700;color:${rateColor};">${rate}%</span></div></td>
            </tr>`;}).join(''):`<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2)">لا توجد مهام</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;
}

function buildReportOrg(){
  if(!DB.employees.length) return `<div class="section"><div class="empty"><div class="empty-icon">🏢</div><div class="empty-title">لا يوجد موظفون</div><div class="empty-desc">أضف موظفين أولاً</div></div></div>`;
  const deptMap={};
  DB.employees.forEach(e=>{
    if(!deptMap[e.dept]) deptMap[e.dept]=[];
    deptMap[e.dept].push(e);
  });
  let html=`<div class="section"><div class="section-header"><div class="section-title">🏢 الهيكل التنظيمي حسب الأقسام</div><span class="badge badge-info">${DB.employees.length} موظف — ${Object.keys(deptMap).length} قسم</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:16px;">`;
  Object.entries(deptMap).sort((a,b)=>b[1].length-a[1].length).forEach(([dept,emps])=>{
    html+=`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;min-width:200px;flex:1;">
      <div class="org-dept-header" style="margin-bottom:12px;">${escHtml(dept)} <span style="background:rgba(255,255,255,0.25);border-radius:10px;padding:1px 8px;font-size:10px;">${emps.length}</span></div>
      ${emps.map(e=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div class="avatar ${avClass(e.name)}" style="width:32px;height:32px;font-size:11px;">${getInitials(e.name)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${escHtml(e.name)}</div>
            <div style="color:var(--text3);font-size:11px;">${escHtml(e.title||'—')}</div>
          </div>
          ${statusBadge(e.status)}
        </div>`).join('')}
    </div>`;
  });
  html+=`</div></div>`;
  return html;
}

window.exportReportCSV=function(){
  let csv="\ufeff";
  csv+="تقرير شامل - نظام المحيط للموارد البشرية\n";
  csv+=`التاريخ,${new Date().toLocaleDateString('ar-QA')}\n\n`;

  csv+="=== الموظفون ===\n";
  csv+="الاسم,القسم,المسمى,الراتب الأساسي,بدل السكن,بدل المواصلات,الصافي,الحالة,تاريخ الانضمام\n";
  DB.employees.forEach(e=>{
    const net=(e.salary||0)+(e.housing||0)+(e.transport||0)+(e.otherAllowance||0)-(e.deductions||0);
    csv+=`"${e.name}","${e.dept}","${e.title||''}","${e.salary||0}","${e.housing||0}","${e.transport||0}","${net}","${e.status}","${e.joinDate}"\n`;
  });

  csv+="\n=== الحضور ===\n";
  csv+="الموظف,التاريخ,وقت الدخول,وقت الخروج,الحالة\n";
  DB.attendance.forEach(a=>{
    const emp=getEmp(a.empId);
    csv+=`"${emp?.name||''}","${a.date}","${a.timeIn||''}","${a.timeOut||''}","${a.status}"\n`;
  });

  csv+="\n=== الإجازات ===\n";
  csv+="الموظف,النوع,من,إلى,الحالة,السبب\n";
  DB.leaves.forEach(l=>{
    const emp=getEmp(l.empId);
    csv+=`"${emp?.name||''}","${l.type}","${l.startDate}","${l.endDate}","${l.status}","${l.reason||''}"\n`;
  });

  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`almueheet_report_${today()}.csv`;a.click();
  showToast('تم التصدير',`تقرير شامل — ${today()}`,'success');
};

// ===================== PORTAL =====================
function renderPortal(){
  const empId=currentRole==='employee'?DB.employees[0]?.id:DB.employees[0]?.id;
  const emp=empId?getEmp(empId):null;
  let html=`<div class="topbar"><div><div class="page-title">👤 بوابة الموظف</div><div class="page-sub">عرض بياناتك الشخصية</div></div></div>`;
  if(!emp){html+=`<div class="empty"><div class="empty-icon">👤</div><div class="empty-title">لا توجد بيانات</div></div>`;document.getElementById('page-portal').innerHTML=html;return;}

  const myTasks=DB.tasks.filter(t=>t.empId===emp.id);
  const myLeaves=DB.leaves.filter(l=>l.empId===emp.id);
  const myTrainings=DB.trainings.filter(t=>t.empId===emp.id);
  const bal=calcLeaveBalance(emp.id);
  const eos=calcEOS(emp.salary,emp.joinDate);
  const yrs=yearsService(emp.joinDate);

  html+=`<div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:20px;">
    <div class="section" style="text-align:center;">
      <div style="width:80px;height:80px;border-radius:50%;background:var(--primary);color:#fff;font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">${getInitials(emp.name)}</div>
      <div style="font-size:18px;font-weight:800;">${emp.name}</div>
      <div style="color:var(--text2);font-size:13px;margin-top:4px;">${emp.title||'—'}</div>
      <div style="margin-top:8px;">${statusBadge(emp.status)}</div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;text-align:right;font-size:13px;">
        <div>🏢 <b>${emp.dept}</b></div>
        <div>📅 انضم: <b>${fmtDate(emp.joinDate)}</b></div>
        <div>⏱️ مدة الخدمة: <b>${yrs.toFixed(1)} سنة</b></div>
        <div>📱 <b>${emp.phone||'—'}</b></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="metric-card green"><div class="metric-icon green">🌴</div><div class="metric-label">رصيد الإجازة</div><div class="metric-value">${bal}</div><div class="metric-sub">يوم متبقي</div></div>
      <div class="metric-card blue"><div class="metric-icon blue">💰</div><div class="metric-label">الراتب</div><div class="metric-value">${fmtNum(emp.salary)}</div><div class="metric-sub">ر.ق</div></div>
      <div class="metric-card orange"><div class="metric-icon orange">🏦</div><div class="metric-label">نهاية الخدمة</div><div class="metric-value">${fmtNum(eos)}</div><div class="metric-sub">ر.ق متراكمة</div></div>
      <div class="metric-card purple"><div class="metric-icon purple">📚</div><div class="metric-label">الدورات</div><div class="metric-value">${myTrainings.length}</div><div class="metric-sub">دورة تدريبية</div></div>
    </div>
  </div>`;

  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div class="section">
      <div class="section-header"><div class="section-title">✅ مهامي (${myTasks.filter(t=>!t.completed).length} معلقة)</div></div>
      ${myTasks.length?myTasks.slice(0,5).map(t=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius);background:${t.completed?'#E8F8F2':'#FEF4E9'};margin-bottom:8px;">
          <span style="font-size:16px">${t.completed?'✅':'⏳'}</span>
          <div style="flex:1;font-size:13px;">${t.title}</div>
          <div style="font-size:11px;color:var(--text2)">${fmtDate(t.dueDate)}</div>
        </div>`).join(''):'<div class="empty-desc" style="padding:20px;text-align:center;">لا توجد مهام</div>'}
    </div>
    <div class="section">
      <div class="section-header"><div class="section-title">🌴 طلبات إجازتي</div><button class="btn btn-sm btn-primary" onclick="openModal('leave')">+ طلب</button></div>
      ${myLeaves.length?myLeaves.slice(0,5).map(l=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-radius:var(--radius);background:var(--surface2);margin-bottom:8px;font-size:12px;">
          <span>${l.type}: ${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}</span>
          ${statusBadge(l.status)}
        </div>`).join(''):'<div class="empty-desc" style="padding:20px;text-align:center;">لا توجد طلبات</div>'}
    </div>
  </div>`;
  document.getElementById('page-portal').innerHTML=html;
}

// ===================== AUDIT =====================
function renderAudit(){
  let html=`<div class="topbar">
    <div><div class="page-title">📋 سجل التدقيق</div><div class="page-sub">${DB.auditLogs.length} عملية مسجلة</div></div>
    <div class="topbar-actions"><button class="btn btn-sm btn-danger" onclick="showConfirm('مسح سجل التدقيق كاملاً؟',()=>{DB.auditLogs=[];saveDB();renderAudit();},'مسح السجل')">🗑️ مسح السجل</button></div>
  </div>
  <div class="section"><div class="table-wrap"><table>
    <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
    <tbody>
      ${DB.auditLogs.length===0?`<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text2)">لا توجد سجلات</td></tr>`:
      [...DB.auditLogs].reverse().slice(0,100).map(a=>`<tr>
        <td style="font-size:11px;color:var(--text2)">${new Date(a.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
        <td>${a.user}</td>
        <td><span class="badge badge-info">${a.action}</span></td>
        <td style="font-size:12px;">${a.details}</td>
      </tr>`).join('')}
    </tbody>
  </table></div></div>`;
  document.getElementById('page-audit').innerHTML=html;
}

// ===================== MODALS =====================
const DEPTS=['هندسة مدنية','إدارة مشاريع','موارد بشرية','هندسة كهربائية','هندسة معمارية','هندسة ميكانيكية','BIM','جيوتقنية'];
const empOptions=()=>DB.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');

window.openModal=function(type){
  if(type!=='addEmp'&&DB.employees.length===0){showToast('تنبيه','الرجاء إضافة موظف أولاً','warn');return;}
  let html='';
  if(type==='addEmp'){
    html=`<div class="modal-title">👤 إضافة موظف جديد</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الاسم الكامل *</label><input class="form-input" id="eN" placeholder="الاسم الكامل"></div>
      <div class="form-group"><label class="form-label">المسمى الوظيفي</label><input class="form-input" id="eT" placeholder="مهندس مدني"></div>
      <div class="form-group"><label class="form-label">القسم</label><select class="form-input" id="eD">${DEPTS.map(d=>`<option>${d}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">رقم الجوال</label><input class="form-input" id="ePh" placeholder="+974 5000 0000" dir="ltr"></div>
      <div class="form-group"><label class="form-label">البريد الإلكتروني</label><input class="form-input" id="eEm" type="email" placeholder="email@company.com" dir="ltr"></div>
      <div class="form-group"><label class="form-label">الجنسية</label><input class="form-input" id="eNat" placeholder="قطري"></div>
      <div class="form-group"><label class="form-label">الراتب الأساسي (ر.ق)</label><input class="form-input" id="eSal" type="number" placeholder="5000"></div>
      <div class="form-group"><label class="form-label">بدل السكن</label><input class="form-input" id="eHou" type="number" placeholder="0"></div>
      <div class="form-group"><label class="form-label">بدل المواصلات</label><input class="form-input" id="eTra" type="number" placeholder="0"></div>
      <div class="form-group"><label class="form-label">تاريخ الانضمام</label><input class="form-input" id="eJ" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">الحالة</label><select class="form-input" id="eSt"><option>نشط</option><option>تجربة</option><option>إجازة</option></select></div>
      <div class="form-group"><label class="form-label">نوع العقد</label><select class="form-input" id="eCon"><option>دوام كامل</option><option>دوام جزئي</option><option>استشاري</option><option>مؤقت</option></select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="addEmp()">💾 حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='attendance'){
    html=`<div class="modal-title">⏰ تسجيل حضور</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="aEmp">${empOptions()}</select></div>
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-input" id="aDate" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">وقت الدخول</label><input class="form-input" id="aIn" type="time" value="08:00"></div>
      <div class="form-group"><label class="form-label">وقت الخروج</label><input class="form-input" id="aOut" type="time" value="17:00"></div>
      <div class="form-group"><label class="form-label">الحالة</label><select class="form-input" id="aSt"><option>حاضر</option><option>متأخر</option><option>غياب</option><option>إجازة</option></select></div>
      <div class="form-group"><label class="form-label">ملاحظات</label><input class="form-input" id="aNotes" placeholder="اختياري"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveAtt()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='leave'){
    html=`<div class="modal-title">🌴 طلب إجازة</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="lEmp">${empOptions()}</select></div>
      <div class="form-group"><label class="form-label">نوع الإجازة</label><select class="form-input" id="lType"><option>سنوية</option><option>مرضية</option><option>طارئة</option><option>أمومة</option><option>حج</option><option>بدون راتب</option></select></div>
      <div class="form-group"><label class="form-label">من تاريخ</label><input class="form-input" id="lStart" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">إلى تاريخ</label><input class="form-input" id="lEnd" type="date" value="${today()}"></div>
      <div class="form-group full"><label class="form-label">السبب</label><textarea class="form-input" id="lReason" rows="2" placeholder="سبب الإجازة"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveLeave()">إرسال الطلب</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='performance'){
    html=`<div class="modal-title">⭐ تقييم أداء</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="pEmp">${empOptions()}</select></div>
      <div class="form-group"><label class="form-label">السنة</label><input class="form-input" id="pYear" type="number" value="${new Date().getFullYear()}"></div>
      <div class="form-group"><label class="form-label">التقييم العام</label><select class="form-input" id="pRating"><option>ممتاز</option><option>جيد جداً</option><option>جيد</option><option>مقبول</option><option>ضعيف</option></select></div>
      <div class="form-group"><label class="form-label">الإنتاجية</label><select class="form-input" id="pProd"><option>ممتاز</option><option>جيد جداً</option><option>جيد</option><option>مقبول</option></select></div>
      <div class="form-group"><label class="form-label">العمل الجماعي</label><select class="form-input" id="pTeam"><option>ممتاز</option><option>جيد جداً</option><option>جيد</option><option>مقبول</option></select></div>
      <div class="form-group full"><label class="form-label">ملاحظات وتوصيات</label><textarea class="form-input" id="pNotes" rows="3"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="savePerf()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='training'){
    html=`<div class="modal-title">📚 دورة تدريبية</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="tEmp">${empOptions()}</select></div>
      <div class="form-group full"><label class="form-label">اسم الدورة</label><input class="form-input" id="tCourse" placeholder="مثال: PMP, LEED, AutoCAD"></div>
      <div class="form-group"><label class="form-label">تاريخ البداية</label><input class="form-input" id="tDate" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">تاريخ الانتهاء</label><input class="form-input" id="tEnd" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">التكلفة (ر.ق)</label><input class="form-input" id="tCost" type="number" placeholder="0"></div>
      <div class="form-group"><label class="form-label">الجهة المنظمة</label><input class="form-input" id="tOrg" placeholder="اسم الجهة"></div>
      <div class="form-group"><label class="form-label">الحالة</label><select class="form-input" id="tStatus"><option>نشط</option><option>مكتمل</option><option>ملغى</option></select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveTrain()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='task'){
    html=`<div class="modal-title">✅ مهمة جديدة</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="tkEmp">${empOptions()}</select></div>
      <div class="form-group full"><label class="form-label">عنوان المهمة *</label><input class="form-input" id="tkTitle" placeholder="وصف المهمة"></div>
      <div class="form-group"><label class="form-label">تاريخ الاستحقاق</label><input class="form-input" id="tkDue" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">الأولوية</label><select class="form-input" id="tkPrio"><option>عالية</option><option>متوسطة</option><option>منخفضة</option></select></div>
      <div class="form-group full"><label class="form-label">الوصف</label><textarea class="form-input" id="tkDesc" rows="2" placeholder="تفاصيل المهمة"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveTask()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='document'){
    html=`<div class="modal-title">📁 رفع مستند</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="dEmp">${empOptions()}</select></div>
      <div class="form-group full"><label class="form-label">اسم المستند *</label><input class="form-input" id="dName" placeholder="مثال: جواز السفر، الشهادة الجامعية"></div>
      <div class="form-group"><label class="form-label">نوع المستند</label><select class="form-input" id="dType"><option>جواز سفر</option><option>بطاقة هوية</option><option>عقد عمل</option><option>شهادة</option><option>سيرة ذاتية</option><option>شهادة خبرة</option><option>ترخيص مهني</option><option>أخرى</option></select></div>
      <div class="form-group"><label class="form-label">تاريخ الانتهاء</label><input class="form-input" id="dExpiry" type="date"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveDoc()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  } else if(type==='disciplinary'){
    html=`<div class="modal-title">⚖️ مخالفة تأديبية</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الموظف</label><select class="form-input" id="dcEmp">${empOptions()}</select></div>
      <div class="form-group"><label class="form-label">نوع المخالفة</label><select class="form-input" id="dcType"><option>غياب بدون إذن</option><option>تأخير متكرر</option><option>سلوك غير لائق</option><option>إهمال في العمل</option><option>مخالفة سياسة الشركة</option><option>أخرى</option></select></div>
      <div class="form-group"><label class="form-label">التاريخ</label><input class="form-input" id="dcDate" type="date" value="${today()}"></div>
      <div class="form-group"><label class="form-label">الإجراء المتخذ</label><select class="form-input" id="dcAction"><option>إنذار شفهي</option><option>إنذار كتابي</option><option>خصم من الراتب</option><option>إيقاف</option><option>فصل</option></select></div>
      <div class="form-group full"><label class="form-label">ملاحظات</label><textarea class="form-input" id="dcNotes" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveDisc()">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`;
  }
  showModal(html);
};

function showModal(html){
  document.getElementById('modalContainer').innerHTML=`<div class="modal-overlay open" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
}
window.closeModal=function(){document.getElementById('modalContainer').innerHTML='';};

// ===================== CRUD SAVES =====================
window.addEmp=async function(){
  const name=document.getElementById('eN').value.trim();
  if(!name){showToast('خطأ','الاسم مطلوب','error');return;}
  
  showLoadingOverlay('جارٍ إضافة الموظف...');
  
  const empData={
    name:name,
    title:document.getElementById('eT').value,
    dept:document.getElementById('eD').value,
    phone:document.getElementById('ePh').value,
    email:document.getElementById('eEm').value,
    nationality:document.getElementById('eNat').value,
    salary:+document.getElementById('eSal').value||0,
    housing:+document.getElementById('eHou').value||0,
    transport:+document.getElementById('eTra').value||0,
    join_date:document.getElementById('eJ').value||null,
    status:document.getElementById('eSt').value,
    contract:document.getElementById('eCon').value,
    deductions:0,
    other_allowance:0
  };
  
  let emp = {...empData, joinDate: empData.join_date};
  let savedToSupabase = false;
  
  // حفظ في Supabase أولاً
  if(supabaseClient && STORAGE_MODE==='supabase'){
    try{
      const saved=await DB_API.insert('employees', empData);
      console.log('ℹ️ Supabase insert response:', saved);
      if(saved && saved.id){
        emp.id = saved.id;
        savedToSupabase = true;
        console.log('✅ تم حفظ الموظف في Supabase — ID:', emp.id);
      } else {
        console.warn('⚠️ فشل الحفظ في Supabase، سيتم الحفظ محلياً فقط');
        showToast('تنبيه', 'تم حفظ الموظف محلياً لأن Supabase لم يستجب', 'warn');
        emp.id = DB.nextId.emp++;
      }
    } catch(e){
      console.error('❌ خطأ في الحفظ:', e);
      showToast('خطأ', 'فشل الاتصال بقاعدة البيانات', 'error');
      emp.id = DB.nextId.emp++;
    }
  } else {
    emp.id = DB.nextId.emp++;
  }
  
  DB.employees.push(emp);
  addAudit('إضافة موظف', emp.name);
  addNotifItem(`👤 تمت إضافة الموظف ${emp.name}`, 'success');
  
  showToast('✅ تمت إضافة الموظف', emp.name + (savedToSupabase ? ' (محفوظ في السحابة)' : ''), 'success');
  
  hideLoadingOverlay();
  closeModal();
  saveDB();
  renderEmployees();
};

window.openEditEmp=function(id){
  const e=getEmp(id);if(!e) return;
  showModal(`<div class="modal-title">✏️ تعديل بيانات ${e.name}</div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">الاسم</label><input class="form-input" id="eN" value="${e.name}"></div>
      <div class="form-group"><label class="form-label">المسمى</label><input class="form-input" id="eT" value="${e.title||''}"></div>
      <div class="form-group"><label class="form-label">القسم</label><select class="form-input" id="eD">${DEPTS.map(d=>`<option ${d===e.dept?'selected':''}>${d}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">الجوال</label><input class="form-input" id="ePh" value="${e.phone||''}" dir="ltr"></div>
      <div class="form-group"><label class="form-label">الراتب</label><input class="form-input" id="eSal" type="number" value="${e.salary}"></div>
      <div class="form-group"><label class="form-label">تاريخ الانضمام</label><input class="form-input" id="eJ" type="date" value="${e.joinDate}"></div>
      <div class="form-group"><label class="form-label">الحالة</label><select class="form-input" id="eSt"><option ${e.status==='نشط'?'selected':''}>نشط</option><option ${e.status==='تجربة'?'selected':''}>تجربة</option><option ${e.status==='إجازة'?'selected':''}>إجازة</option><option ${e.status==='منتهي'?'selected':''}>منتهي</option></select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="updateEmp(${id})">حفظ</button>
      <button class="btn" onclick="closeModal()">إلغاء</button>
    </div>`);
};
window.updateEmp=async function(id){
  const e=getEmp(id);if(!e) return;
  e.name=document.getElementById('eN').value;
  e.title=document.getElementById('eT').value;
  e.dept=document.getElementById('eD').value;
  e.phone=document.getElementById('ePh').value;
  e.salary=+document.getElementById('eSal').value||0;
  e.joinDate=document.getElementById('eJ').value;
  e.status=document.getElementById('eSt').value;
  if(supabaseClient) await DB_API.update('employees',id,{
    name:e.name,title:e.title,dept:e.dept,phone:e.phone,
    salary:e.salary,join_date:e.joinDate||null,status:e.status,updated_at:new Date().toISOString()
  });
  addAudit('تعديل موظف',e.name);closeModal();saveDB();renderEmployees();
};
window.delEmp=function(id){
  const e=getEmp(id);
  showConfirm(`حذف الموظف ${e?.name}؟ سيتم حذف جميع بياناته.`,async()=>{
    if(supabaseClient) await DB_API.delete('employees',id);
    DB.employees=DB.employees.filter(x=>x.id!==id);
    addAudit('حذف موظف',e?.name);saveDB();renderEmployees();
  });
};

window.saveAtt=async function(){
  const empId=+document.getElementById('aEmp').value;
  const row={empId,date:document.getElementById('aDate').value,timeIn:document.getElementById('aIn').value,timeOut:document.getElementById('aOut').value,status:document.getElementById('aSt').value,notes:document.getElementById('aNotes').value};
  if(supabaseClient){
    const saved=await DB_API.insert('attendance',{emp_id:empId,date:row.date,check_in:row.timeIn||null,check_out:row.timeOut||null,status:row.status,notes:row.notes});
    if(saved) row.id=saved.id;
  }
  DB.attendance.push({id:row.id||DB.nextId.att++,...row});
  addAudit('تسجيل حضور',getEmp(empId)?.name);closeModal();saveDB();renderAttendance();
};
window.saveLeave=async function(){
  const empId=+document.getElementById('lEmp').value;
  const start=document.getElementById('lStart').value;
  const end=document.getElementById('lEnd').value;
  if(!start||!end||end<start){showToast('خطأ','تواريخ الإجازة غير صحيحة','error');return;}
  const row={empId,type:document.getElementById('lType').value,startDate:start,endDate:end,reason:document.getElementById('lReason').value,status:'معلقة'};
  if(supabaseClient){
    const saved=await DB_API.insert('leaves',{emp_id:empId,type:row.type,start_date:start,end_date:end,reason:row.reason,status:'معلقة'});
    if(saved) row.id=saved.id;
  }
  DB.leaves.push({id:row.id||DB.nextId.leave++,...row});
  const emp=getEmp(empId);
  addAudit('طلب إجازة',emp?.name);
  addNotifItem(`🌴 طلب إجازة جديد من ${emp?.name}`,'info');
  closeModal();saveDB();renderLeaves();
};
window.savePerf=async function(){
  const empId=+document.getElementById('pEmp').value;
  const row={empId,year:document.getElementById('pYear').value,rating:document.getElementById('pRating').value,productivity:document.getElementById('pProd').value,teamwork:document.getElementById('pTeam').value,comments:document.getElementById('pNotes').value};
  if(supabaseClient){
    const saved=await DB_API.insert('performances',{emp_id:empId,period:row.year,rating:row.rating,notes:row.comments,reviewer:currentUser.name});
    if(saved) row.id=saved.id;
  }
  DB.performances.push({id:row.id||DB.nextId.perf++,...row});
  addAudit('تقييم أداء',getEmp(empId)?.name);closeModal();saveDB();renderPerformance();
};
window.saveTrain=async function(){
  const empId=+document.getElementById('tEmp').value;
  const course=document.getElementById('tCourse').value;
  if(!course){showToast('خطأ','اسم الدورة مطلوب','error');return;}
  DB.trainings.push({id:DB.nextId.train++,empId,course,date:document.getElementById('tDate').value,endDate:document.getElementById('tEnd').value,cost:+document.getElementById('tCost').value||0,organization:document.getElementById('tOrg').value,status:document.getElementById('tStatus').value});
  addAudit('إضافة تدريب',course);closeModal();saveDB();renderTraining();
};
window.saveTask=async function(){
  const title=document.getElementById('tkTitle').value;
  if(!title){showToast('خطأ','عنوان المهمة مطلوب','error');return;}
  const empId=+document.getElementById('tkEmp').value;
  const row={empId,title,dueDate:document.getElementById('tkDue').value,priority:document.getElementById('tkPrio').value,description:document.getElementById('tkDesc').value,completed:false};
  if(supabaseClient){
    const saved=await DB_API.insert('tasks',{emp_id:empId,title,due_date:row.dueDate||null,priority:row.priority,description:row.description,completed:false});
    if(saved) row.id=saved.id;
  }
  DB.tasks.push({id:row.id||DB.nextId.task++,...row});
  addAudit('إضافة مهمة',title);closeModal();saveDB();renderTasks();
};
window.saveDoc=async function(){
  const name=document.getElementById('dName').value;
  if(!name){showToast('خطأ','اسم المستند مطلوب','error');return;}
  const empId=+document.getElementById('dEmp').value;
  const row={empId,name,title:name,type:document.getElementById('dType').value,expiryDate:document.getElementById('dExpiry').value||null,uploadDate:today()};
  if(supabaseClient){
    const saved=await DB_API.insert('documents',{emp_id:empId,title:name,type:row.type,expiry_date:row.expiryDate||null});
    if(saved) row.id=saved.id;
  }
  DB.documents.push({id:row.id||DB.nextId.doc++,...row});
  addAudit('رفع مستند',name);closeModal();saveDB();renderDocuments();
};
window.saveDisc=async function(){
  const empId=+document.getElementById('dcEmp').value;
  const row={empId,type:document.getElementById('dcType').value,date:document.getElementById('dcDate').value,action:document.getElementById('dcAction').value,notes:document.getElementById('dcNotes').value};
  if(supabaseClient){
    const saved=await DB_API.insert('disciplinary',{emp_id:empId,type:row.type,date:row.date,reason:row.notes,action:row.action});
    if(saved) row.id=saved.id;
  }
  DB.disciplinary.push({id:row.id||DB.nextId.disc++,...row});
  addAudit('مخالفة تأديبية',getEmp(empId)?.name);closeModal();saveDB();renderDisciplinary();
};

// ===================== TRANSLATIONS =====================
const TRANS={
  ar:{
    // General
    save:'حفظ',cancel:'إلغاء',delete:'حذف',edit:'تعديل',add:'إضافة',close:'إغلاق',
    print:'طباعة',export:'تصدير',search:'بحث',reset:'إعادة ضبط',yes:'نعم',no:'لا',
    actions:'إجراءات',all:'الكل',none:'—',required:'مطلوب',confirm:'تأكيد',
    // Login
    loginTitle:'المحيط للموارد البشرية',loginUser:'اسم المستخدم',loginPass:'كلمة المرور',
    loginBtn:'تسجيل الدخول',loginErr:'اسم المستخدم أو كلمة المرور غير صحيحة',
    loginSub:'AL MUEHEET Engineering Consulting',loginQuick:'أو اختر دوراً للتجربة السريعة:',
    loginAdmin:'👑 مدير',loginMgr:'📋 مدير مشروع',loginEmp:'👤 موظف',
    // Sidebar
    sidebarTitle:'نظام الموارد البشرية',sidebarSub:'HR Management System',
    // Dashboard
    dashTitle:'لوحة التحكم',dashNewEmp:'+ موظف جديد',
    totalEmp:'إجمالي الموظفين',todayAtt:'الحضور اليوم',pendingLeaves:'طلبات الإجازة',
    totalSalary:'إجمالي الرواتب',trainings:'التدريبات',pendingTasks:'المهام المعلقة',
    active:'نشط',from:'من',employees2:'موظف',pending:'معلقة',monthly:'شهرياً',
    currency:'ر.ق',registered:'دورة مسجلة',needDone:'تحتاج إنجاز',
    monthlyAtt:'الحضور الشهري',deptDist:'توزيع الأقسام',recentEmp:'آخر الموظفين المضافين',
    viewAll:'عرض الكل',noEmp:'لا يوجد موظفون',noEmpDesc:'ابدأ بإضافة موظفين للنظام',
    pendingLeavesAlert:'يوجد {n} طلب إجازة بانتظار موافقتك',
    pendingTasksAlert:'{n} مهمة لم تُنجز بعد',
    welcomeAlert:'مرحباً! ابدأ بإضافة موظفين للنظام',
    // Employees
    empTitle:'الموظفون',empCount:'{n} موظف مسجل',
    searchEmp:'بحث بالاسم أو القسم...',allDepts:'كل الأقسام',allStatus:'كل الحالات',
    newEmp:'+ موظف جديد',empName:'الموظف',dept:'القسم',phone:'الجوال',
    salary:'الراتب',joinDate:'تاريخ الانضمام',leaveBalance:'رصيد الإجازة',
    eos:'نهاية الخدمة',status:'الحالة',noResults:'لا توجد نتائج',
    noEmpRec:'لا يوجد موظفون',addFirstEmp:'أضف أول موظف',
    // Employee form
    empNameLabel:'الاسم',titleLabel:'المسمى الوظيفي',deptLabel:'القسم',
    phoneLabel:'الجوال',emailLabel:'البريد الإلكتروني',natLabel:'الجنسية',
    salaryLabel:'الراتب الأساسي',housingLabel:'بدل السكن',transportLabel:'بدل المواصلات',
    joinDateLabel:'تاريخ الانضمام',statusLabel:'الحالة',contractLabel:'نوع العقد',
    addEmpTitle:'➕ إضافة موظف جديد',editEmpTitle:'✏️ تعديل بيانات',
    nameRequired:'الاسم مطلوب',
    // Status values
    statusActive:'نشط',statusTrial:'تجربة',statusLeave:'إجازة',statusEnd:'منتهي',
    statusApproved:'موافق',statusPending:'معلقة',statusRejected:'مرفوض',
    statusPresent:'حاضر',statusLate:'متأخر',statusAbsent:'غياب',
    // Contract types
    fullTime:'دوام كامل',partTime:'دوام جزئي',consultant:'استشاري',temp:'مؤقت',
    // Departments
    depts:['هندسة مدنية','إدارة مشاريع','موارد بشرية','هندسة كهربائية','هندسة معمارية','هندسة ميكانيكية','BIM'],
    // Salary
    salaryTitle:'إدارة الرواتب',salarySubtitle:'مسير الرواتب الشهري',
    genPayroll:'إنشاء مسير الرواتب',totalBasic:'إجمالي الرواتب الأساسية',
    totalHousing:'بدل السكن',totalTransport:'بدل المواصلات',netSalary:'صافي الرواتب',
    salaryDetails:'تفاصيل الرواتب',empCol:'الموظف',deptCol:'القسم',
    basicSal:'الراتب الأساسي',housing:'بدل السكن',transport:'بدل المواصلات',
    otherAllowance:'بدل أخرى',deductions:'خصومات',net:'الصافي',
    payslip:'🖨️ قسيمة',editSalary:'✏️ تعديل راتب',
    payslipTitle:'قسيمة راتب',company:'المحيط للاستشارات الهندسية',
    entitlements:'الاستحقاقات',totalEnt:'إجمالي الاستحقاقات',
    netPay:'صافي الراتب',eosAcc:'مخصص نهاية الخدمة المتراكم',leaveBalLabel:'رصيد الإجازة',
    day:'يوم',exportSuccess:'تم إنشاء مسير الرواتب بنجاح ✅',noData:'لا توجد بيانات',
    free:'مجانية',
    // Attendance
    attTitle:'الحضور والانصراف',attSubtitle:'إدارة سجلات الحضور',
    addAtt:'+ تسجيل حضور',allEmps:'كل الموظفين',allStatuses:'كل الحالات',
    presentToday:'حاضر اليوم',late:'متأخر',absent:'غائب',
    empCol2:'الموظف',dateCol:'التاريخ',timeIn:'وقت الدخول',timeOut:'وقت الخروج',
    workHours:'ساعات العمل',notesCol:'ملاحظات',noAtt:'لا توجد سجلات حضور',noRecords:'لا توجد سجلات',
    attEmpLabel:'الموظف',attDateLabel:'التاريخ',attInLabel:'وقت الدخول',
    attOutLabel:'وقت الخروج',attStatusLabel:'الحالة',attNotesLabel:'ملاحظات',optional:'اختياري',
    attTitle2:'⏰ تسجيل حضور',
    // Leaves
    leavesTitle:'الإجازات',leavesSubtitle:'إدارة طلبات الإجازات',
    addLeave:'+ طلب إجازة',allRequests:'كل الطلبات',
    leaveType:'نوع الإجازة',from2:'من',to:'إلى',days:'الأيام',reason:'السبب',
    empBalance:'رصيد الموظف',leaveTypes:['سنوية','مرضية','طارئة','أمومة','حج','بدون راتب'],
    noLeaves:'لا توجد طلبات إجازة',leaveApproved:'تمت الموافقة',leaveRejected:'تم الرفض',
    submitRequest:'إرسال الطلب',leaveFromDate:'من تاريخ',leaveToDate:'إلى تاريخ',
    leaveReasonLabel:'السبب',dateError:'تواريخ الإجازة غير صحيحة',
    leaveTitle:'🌴 طلب إجازة',
    // Performance
    perfTitle:'تقييم الأداء',newPerf:'+ تقييم جديد',
    year:'السنة',rating:'التقييم',grade:'الدرجة',notes:'ملاحظات',
    noPerf:'لا توجد تقييمات',ratings:['ممتاز','جيد جداً','جيد','مقبول','ضعيف'],
    productivity:'الإنتاجية',teamwork:'العمل الجماعي',perfNotes:'ملاحظات وتوصيات',
    perfTitle2:'⭐ تقييم أداء',
    // Training
    trainTitle:'التدريب والتطوير',totalCost:'إجمالي التكلفة:',
    addTrain:'+ دورة تدريبية',course:'الدورة',date:'التاريخ',cost:'التكلفة',
    noTraining:'لا توجد دورات مسجلة',startDate:'تاريخ البداية',endDate:'تاريخ الانتهاء',
    costLabel:'التكلفة (ر.ق)',org:'الجهة المنظمة',trainStatus:['نشط','مكتمل','ملغى'],
    courseName:'اسم الدورة',courseHint:'مثال: PMP, LEED, AutoCAD',orgHint:'اسم الجهة',
    trainTitle2:'📚 دورة تدريبية',
    // Tasks
    tasksTitle:'المهام',pendingCount:'{n} مهمة معلقة',
    addTask:'+ مهمة جديدة',allTasks:'الكل',pendingTasks2:'معلقة',doneTasks:'مكتملة',
    taskTitle:'المهمة',priority:'الأولوية',dueDate:'الاستحقاق',
    overdue:'⚠️ متأخرة',completed:'✅ مكتملة',pendingStatus:'⏳ معلقة',
    priorities:['عالية','متوسطة','منخفضة'],noTasks:'لا توجد مهام',
    taskTitleLabel:'عنوان المهمة *',dueDateLabel:'تاريخ الاستحقاق',
    priorityLabel:'الأولوية',descLabel:'الوصف',taskDescHint:'تفاصيل المهمة',
    taskTitleHint:'وصف المهمة',taskTitle2:'✅ مهمة جديدة',
    // Documents
    docsTitle:'المستندات',docsCount:'{n} مستند',addDoc:'+ رفع مستند',
    docName:'المستند',docType:'النوع',uploadDate:'تاريخ الرفع',expiry:'انتهاء الصلاحية',
    expired:'⚠️ منتهية',noDocs:'لا توجد مستندات',
    docTypes:['جواز سفر','بطاقة هوية','عقد عمل','شهادة','سيرة ذاتية','شهادة خبرة','ترخيص مهني','أخرى'],
    docNameLabel:'اسم المستند *',docTypeLabel:'نوع المستند',expiryLabel:'تاريخ الانتهاء',
    docNameHint:'مثال: جواز السفر، الشهادة الجامعية',docTitle:'📁 رفع مستند',
    docNameRequired:'اسم المستند مطلوب',
    // Disciplinary
    discTitle:'الإجراءات التأديبية',addDisc:'+ مخالفة',
    violation:'نوع المخالفة',action:'الإجراء',
    noDisc:'لا توجد مخالفات',
    discTypes:['غياب بدون إذن','تأخير متكرر','سلوك غير لائق','إهمال في العمل','مخالفة سياسة الشركة','أخرى'],
    discActions:['إنذار شفهي','إنذار كتابي','خصم من الراتب','إيقاف','فصل'],
    discDateLabel:'التاريخ',discActionLabel:'الإجراء المتخذ',discNotesLabel:'ملاحظات',
    discTitle2:'⚖️ مخالفة تأديبية',
    // Reports
    reportsTitle:'التقارير والإحصائيات',hrOverview:'نظرة عامة على الموارد البشرية',
    totalEmpRep:'إجمالي الموظفين',activeEmp:'الموظفون النشطون',trialEmp:'فترة تجربة',
    onLeaveEmp:'في إجازة',salaryRep:'إجمالي الرواتب الأساسية',netSalaryRep:'صافي الرواتب الشهرية',
    pendingLeavesRep:'طلبات إجازة معلقة',completedTasks:'المهام المكتملة',
    deptDist2:'توزيع الموظفين حسب القسم',empCount2:'عدد الموظفين',
    datingDist:'توزيع التقييمات',ratingCount:'عدد التقييمات',
    leaveTypeDist:'توزيع أنواع الإجازات',leaveCount:'عدد الطلبات',
    expDocs:'المستندات المنتهية أو القريبة من الانتهاء',
    expDocsDesc:'المستندات التي انتهت صلاحيتها أو ستنتهي خلال 30 يوماً',
    docNameCol:'المستند',empCol3:'الموظف',expiryCol:'تاريخ الانتهاء',statusCol:'الحالة',
    expired2:'منتهية',expiringSoon:'ينتهي قريباً',
    noExpDocs:'لا توجد مستندات منتهية أو قريبة من الانتهاء',
    // Portal
    portalTitle:'بوابة الموظف',portalSub:'بياناتك الشخصية ومستحقاتك',
    myProfile:'الملف الشخصي',myName:'الاسم',myDept:'القسم',myTitle:'المسمى',
    myJoinDate:'تاريخ الانضمام',myService:'سنوات الخدمة',myContract:'نوع العقد',
    mySalary:'راتبي الشهري',myHousing:'بدل السكن',myTransport:'بدل المواصلات',
    myDeduct:'خصومات',myNet:'الصافي',viewPayslip:'🖨️ عرض القسيمة',
    myLeave:'رصيد إجازتي',myLeaveBalance:'رصيد الإجازة المتاح',
    earnedDays:'أيام مستحقة',usedDays:'أيام مستخدمة',remainingDays:'أيام متبقية',
    myTasks:'مهامي',pendingTasks3:'معلقة',myDocs:'مستنداتي',noPortal:'موظف غير موجود',
    // Audit
    auditTitle:'سجل التدقيق',auditSub:'سجل كامل لجميع العمليات',
    timeCol:'الوقت',userCol:'المستخدم',actionCol:'الإجراء',detailsCol:'التفاصيل',
    noAudit:'لا توجد سجلات',
    // Notifications
    notifications:'الإشعارات',markRead:'تحديد كمقروءة',noNotif:'لا توجد إشعارات',
    searchPlaceholder:'بحث شامل...',
    // Settings
    settingsTitle:'الإعدادات',settingsSubtitle:'إدارة المستخدمين وإعدادات النظام',
    usersSection:'إدارة المستخدمين',addUser:'+ مستخدم جديد',
    usernameCol:'اسم المستخدم',nameCol:'الاسم',roleCol:'الدور',
    usernameLabel:'اسم المستخدم *',passwordLabel:'كلمة المرور *',
    nameLabel:'الاسم بالعربية *',nameEnLabel:'الاسم بالإنجليزية',
    roleLabel:'الدور',initialsLabel:'الاختصار (حرفان)',
    addUserTitle:'➕ إضافة مستخدم جديد',editUserTitle:'✏️ تعديل مستخدم',
    changePwTitle:'🔑 تغيير كلمة المرور',newPassword:'كلمة المرور الجديدة *',
    confirmPassword:'تأكيد كلمة المرور *',pwMismatch:'كلمة المرور غير متطابقة',
    pwChanged:'تم تغيير كلمة المرور بنجاح ✅',
    userAdded:'تمت إضافة المستخدم بنجاح ✅',userDeleted:'تم حذف المستخدم',
    cannotDeleteSelf:'لا يمكن حذف المستخدم الحالي',
    usernameExists:'اسم المستخدم موجود مسبقاً',
    deleteUserConfirm:'هل أنت متأكد من حذف المستخدم',
    rolesAdmin:'مدير',rolesMgr:'مدير مشروع',rolesEmp:'موظف',
    roleAdmin:'admin',roleMgr:'manager',roleEmp:'employee',
    systemSettings:'إعدادات النظام',systemName:'اسم النظام',
    systemLang:'اللغة الافتراضية',systemReset:'إعادة تعيين البيانات',
    resetConfirm:'هل أنت متأكد من حذف جميع البيانات؟ لا يمكن التراجع عن هذا الإجراء!',
    resetDone:'تم إعادة تعيين البيانات بنجاح',
    notifSettings:'إعدادات الإشعارات',notifDesc:'تخصيص الإشعارات الذكية',
    years:'سنة',
  },
  en:{
    // General
    save:'Save',cancel:'Cancel',delete:'Delete',edit:'Edit',add:'Add',close:'Close',
    print:'Print',export:'Export',search:'Search',reset:'Reset',yes:'Yes',no:'No',
    actions:'Actions',all:'All',none:'—',required:'Required',confirm:'Confirm',
    // Login
    loginTitle:'Al Mueheet HR System',loginUser:'Username',loginPass:'Password',
    loginBtn:'Sign In',loginErr:'Invalid username or password',
    loginSub:'AL MUEHEET Engineering Consulting',loginQuick:'Or pick a role to quick demo:',
    loginAdmin:'👑 Admin',loginMgr:'📋 Manager',loginEmp:'👤 Employee',
    // Sidebar
    sidebarTitle:'HR Management System',sidebarSub:'Al Mueheet Engineering',
    // Dashboard
    dashTitle:'Dashboard',dashNewEmp:'+ New Employee',
    totalEmp:'Total Employees',todayAtt:"Today's Attendance",pendingLeaves:'Leave Requests',
    totalSalary:'Total Payroll',trainings:'Trainings',pendingTasks:'Pending Tasks',
    active:'Active',from:'from',employees2:'employees',pending:'pending',monthly:'monthly',
    currency:'QAR',registered:'courses registered',needDone:'need completion',
    monthlyAtt:'Monthly Attendance',deptDist:'Department Distribution',recentEmp:'Recently Added Employees',
    viewAll:'View All',noEmp:'No Employees',noEmpDesc:'Start by adding your first employee',
    pendingLeavesAlert:'{n} leave request(s) awaiting your approval',
    pendingTasksAlert:'{n} task(s) not completed yet',
    welcomeAlert:'Welcome! Start by adding employees to the system',
    // Employees
    empTitle:'Employees',empCount:'{n} employees registered',
    searchEmp:'Search by name or department...',allDepts:'All Departments',allStatus:'All Statuses',
    newEmp:'+ New Employee',empName:'Employee',dept:'Department',phone:'Phone',
    salary:'Salary',joinDate:'Join Date',leaveBalance:'Leave Balance',
    eos:'End of Service',status:'Status',noResults:'No results found',
    noEmpRec:'No Employees',addFirstEmp:'Add first employee',
    // Employee form
    empNameLabel:'Full Name',titleLabel:'Job Title',deptLabel:'Department',
    phoneLabel:'Phone',emailLabel:'Email',natLabel:'Nationality',
    salaryLabel:'Basic Salary',housingLabel:'Housing Allowance',transportLabel:'Transport Allowance',
    joinDateLabel:'Join Date',statusLabel:'Status',contractLabel:'Contract Type',
    addEmpTitle:'➕ Add New Employee',editEmpTitle:'✏️ Edit',
    nameRequired:'Name is required',
    // Status values
    statusActive:'Active',statusTrial:'Trial',statusLeave:'On Leave',statusEnd:'Terminated',
    statusApproved:'Approved',statusPending:'Pending',statusRejected:'Rejected',
    statusPresent:'Present',statusLate:'Late',statusAbsent:'Absent',
    // Contract types
    fullTime:'Full Time',partTime:'Part Time',consultant:'Consultant',temp:'Temporary',
    // Departments
    depts:['Civil Engineering','Project Management','Human Resources','Electrical Engineering','Architecture','Mechanical Engineering','BIM'],
    // Salary
    salaryTitle:'Payroll Management',salarySubtitle:'Monthly Payroll',
    genPayroll:'Generate Payroll',totalBasic:'Total Basic Salaries',
    totalHousing:'Housing Allowance',totalTransport:'Transport Allowance',netSalary:'Net Payroll',
    salaryDetails:'Salary Details',empCol:'Employee',deptCol:'Department',
    basicSal:'Basic Salary',housing:'Housing Allowance',transport:'Transport Allowance',
    otherAllowance:'Other Allowances',deductions:'Deductions',net:'Net',
    payslip:'🖨️ Payslip',editSalary:'✏️ Edit Salary',
    payslipTitle:'Pay Slip',company:'Al Mueheet Engineering Consulting',
    entitlements:'Entitlements',totalEnt:'Total Entitlements',
    netPay:'Net Salary',eosAcc:'Accrued End of Service',leaveBalLabel:'Leave Balance',
    day:'day(s)',exportSuccess:'Payroll generated successfully ✅',noData:'No data available',
    free:'Free',
    // Attendance
    attTitle:'Attendance',attSubtitle:'Manage attendance records',
    addAtt:'+ Record Attendance',allEmps:'All Employees',allStatuses:'All Statuses',
    presentToday:'Present Today',late:'Late',absent:'Absent',
    empCol2:'Employee',dateCol:'Date',timeIn:'Time In',timeOut:'Time Out',
    workHours:'Work Hours',notesCol:'Notes',noAtt:'No attendance records',noRecords:'No records found',
    attEmpLabel:'Employee',attDateLabel:'Date',attInLabel:'Time In',
    attOutLabel:'Time Out',attStatusLabel:'Status',attNotesLabel:'Notes',optional:'Optional',
    attTitle2:'⏰ Record Attendance',
    // Leaves
    leavesTitle:'Leave Management',leavesSubtitle:'Manage leave requests',
    addLeave:'+ Request Leave',allRequests:'All Requests',
    leaveType:'Leave Type',from2:'From',to:'To',days:'Days',reason:'Reason',
    empBalance:"Employee's Balance",
    leaveTypes:['Annual','Sick','Emergency','Maternity','Hajj','Unpaid'],
    noLeaves:'No leave requests',leaveApproved:'Approved',leaveRejected:'Rejected',
    submitRequest:'Submit Request',leaveFromDate:'From Date',leaveToDate:'To Date',
    leaveReasonLabel:'Reason',dateError:'Invalid leave dates',
    leaveTitle:'🌴 Leave Request',
    // Performance
    perfTitle:'Performance Review',newPerf:'+ New Review',
    year:'Year',rating:'Rating',grade:'Grade',notes:'Notes',
    noPerf:'No performance reviews',ratings:['Excellent','Very Good','Good','Acceptable','Poor'],
    productivity:'Productivity',teamwork:'Teamwork',perfNotes:'Notes & Recommendations',
    perfTitle2:'⭐ Performance Review',
    // Training
    trainTitle:'Training & Development',totalCost:'Total Cost:',
    addTrain:'+ Add Course',course:'Course',date:'Date',cost:'Cost',
    noTraining:'No courses registered',startDate:'Start Date',endDate:'End Date',
    costLabel:'Cost (QAR)',org:'Organization',trainStatus:['Active','Completed','Cancelled'],
    courseName:'Course Name',courseHint:'e.g. PMP, LEED, AutoCAD',orgHint:'Organization name',
    trainTitle2:'📚 Training Course',
    // Tasks
    tasksTitle:'Tasks',pendingCount:'{n} pending tasks',
    addTask:'+ New Task',allTasks:'All',pendingTasks2:'Pending',doneTasks:'Completed',
    taskTitle:'Task',priority:'Priority',dueDate:'Due Date',
    overdue:'⚠️ Overdue',completed:'✅ Completed',pendingStatus:'⏳ Pending',
    priorities:['High','Medium','Low'],noTasks:'No tasks',
    taskTitleLabel:'Task Title *',dueDateLabel:'Due Date',
    priorityLabel:'Priority',descLabel:'Description',taskDescHint:'Task details',
    taskTitleHint:'Task description',taskTitle2:'✅ New Task',
    // Documents
    docsTitle:'Documents',docsCount:'{n} documents',addDoc:'+ Upload Document',
    docName:'Document',docType:'Type',uploadDate:'Upload Date',expiry:'Expiry Date',
    expired:'⚠️ Expired',noDocs:'No documents',
    docTypes:['Passport','ID Card','Employment Contract','Certificate','CV','Experience Letter','Professional License','Other'],
    docNameLabel:'Document Name *',docTypeLabel:'Document Type',expiryLabel:'Expiry Date',
    docNameHint:'e.g. Passport, University Certificate',docTitle:'📁 Upload Document',
    docNameRequired:'Document name is required',
    // Disciplinary
    discTitle:'Disciplinary Actions',addDisc:'+ New Violation',
    violation:'Violation Type',action:'Action Taken',
    noDisc:'No disciplinary records',
    discTypes:['Unauthorized Absence','Repeated Lateness','Inappropriate Behavior','Negligence','Policy Violation','Other'],
    discActions:['Verbal Warning','Written Warning','Salary Deduction','Suspension','Termination'],
    discDateLabel:'Date',discActionLabel:'Action Taken',discNotesLabel:'Notes',
    discTitle2:'⚖️ Disciplinary Action',
    // Reports
    reportsTitle:'Reports & Analytics',hrOverview:'HR Overview',
    totalEmpRep:'Total Employees',activeEmp:'Active Employees',trialEmp:'On Trial',
    onLeaveEmp:'On Leave',salaryRep:'Total Basic Salaries',netSalaryRep:'Net Monthly Payroll',
    pendingLeavesRep:'Pending Leave Requests',completedTasks:'Completed Tasks',
    deptDist2:'Employee Distribution by Department',empCount2:'Employee Count',
    datingDist:'Performance Ratings Distribution',ratingCount:'Rating Count',
    leaveTypeDist:'Leave Type Distribution',leaveCount:'Request Count',
    expDocs:'Expiring or Expired Documents',
    expDocsDesc:'Documents that have expired or will expire within 30 days',
    docNameCol:'Document',empCol3:'Employee',expiryCol:'Expiry Date',statusCol:'Status',
    expired2:'Expired',expiringSoon:'Expiring Soon',
    noExpDocs:'No expiring or expired documents',
    // Portal
    portalTitle:'Employee Portal',portalSub:'Your personal data and entitlements',
    myProfile:'My Profile',myName:'Name',myDept:'Department',myTitle:'Title',
    myJoinDate:'Join Date',myService:'Years of Service',myContract:'Contract Type',
    mySalary:'My Monthly Salary',myHousing:'Housing Allowance',myTransport:'Transport Allowance',
    myDeduct:'Deductions',myNet:'Net Salary',viewPayslip:'🖨️ View Payslip',
    myLeave:'My Leave Balance',myLeaveBalance:'Available Leave Balance',
    earnedDays:'Earned Days',usedDays:'Used Days',remainingDays:'Remaining Days',
    myTasks:'My Tasks',pendingTasks3:'Pending',myDocs:'My Documents',noPortal:'Employee not found',
    // Audit
    auditTitle:'Audit Log',auditSub:'Complete record of all operations',
    timeCol:'Time',userCol:'User',actionCol:'Action',detailsCol:'Details',
    noAudit:'No records',
    // Notifications
    notifications:'Notifications',markRead:'Mark All Read',noNotif:'No notifications',
    searchPlaceholder:'Global search...',
    // Settings
    settingsTitle:'Settings',settingsSubtitle:'Manage users and system configuration',
    usersSection:'User Management',addUser:'+ Add User',
    usernameCol:'Username',nameCol:'Name',roleCol:'Role',
    usernameLabel:'Username *',passwordLabel:'Password *',
    nameLabel:'Full Name (Arabic) *',nameEnLabel:'Full Name (English)',
    roleLabel:'Role',initialsLabel:'Initials (2 chars)',
    addUserTitle:'➕ Add New User',editUserTitle:'✏️ Edit User',
    changePwTitle:'🔑 Change Password',newPassword:'New Password *',
    confirmPassword:'Confirm Password *',pwMismatch:'Passwords do not match',
    pwChanged:'Password changed successfully ✅',
    userAdded:'User added successfully ✅',userDeleted:'User deleted',
    cannotDeleteSelf:'Cannot delete the current user',
    usernameExists:'Username already exists',
    deleteUserConfirm:'Are you sure you want to delete user',
    rolesAdmin:'Admin',rolesMgr:'Project Manager',rolesEmp:'Employee',
    roleAdmin:'admin',roleMgr:'manager',roleEmp:'employee',
    systemSettings:'System Settings',systemName:'System Name',
    systemLang:'Default Language',systemReset:'Reset All Data',
    resetConfirm:'Are you sure you want to delete all data? This cannot be undone!',
    resetDone:'Data reset successfully',
    notifSettings:'Notification Settings',notifDesc:'Customize smart notifications',
    years:'years',
  }
};
function T(key,params){
  let s=(TRANS[currentLang]||TRANS.ar)[key]||(TRANS.ar)[key]||key;
  if(params) Object.keys(params).forEach(k=>{s=s.replace('{'+k+'}',params[k]);});
  return s;
}
function TStatus(s){
  const map={
    'نشط':T('statusActive'),'تجربة':T('statusTrial'),'إجازة':T('statusLeave'),'منتهي':T('statusEnd'),
    'موافق':T('statusApproved'),'معلقة':T('statusPending'),'مرفوض':T('statusRejected'),
    'حاضر':T('statusPresent'),'متأخر':T('statusLate'),'غياب':T('statusAbsent'),
    'Active':T('statusActive'),'Trial':T('statusTrial'),'On Leave':T('statusLeave'),'Terminated':T('statusEnd'),
  };
  return map[s]||s;
}
function statusBadgeT(s){
  const arMap={'نشط':'badge-success','تجربة':'badge-warning','إجازة':'badge-info','منتهي':'badge-secondary','موافق':'badge-success','معلقة':'badge-warning','مرفوض':'badge-danger','حاضر':'badge-success','متأخر':'badge-warning','غياب':'badge-danger'};
  const enMap={'Active':'badge-success','Trial':'badge-warning','On Leave':'badge-info','Terminated':'badge-secondary','Approved':'badge-success','Pending':'badge-warning','Rejected':'badge-danger','Present':'badge-success','Late':'badge-warning','Absent':'badge-danger'};
  const cls=arMap[s]||enMap[s]||'badge-secondary';
  return `<span class="badge ${cls}">${TStatus(s)}</span>`;
}

// ===================== SETTINGS PAGE =====================
function renderSettings(){
  const isEn=currentLang==='en';
  const html=`
  <div class="topbar">
    <div><div class="page-title">⚙️ ${T('settingsTitle')}</div><div class="page-sub">${T('settingsSubtitle')}</div></div>
  </div>

  <!-- Users Section -->
  <div class="section">
    <div class="section-header">
      <div class="section-title">👥 ${T('usersSection')}</div>
      <button class="btn btn-primary" onclick="openSettingsModal('addUser')">${T('addUser')}</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${T('usernameCol')}</th>
          <th>${T('nameCol')}</th>
          <th>${T('roleCol')}</th>
          <th>${T('actions')}</th>
        </tr></thead>
        <tbody>
          ${Object.entries(USERS).map(([uname,u])=>{
            const roleLabel=u.role==='admin'?T('rolesAdmin'):u.role==='manager'?T('rolesMgr'):T('rolesEmp');
            const roleBadge=u.role==='admin'?'badge-danger':u.role==='manager'?'badge-warning':'badge-info';
            const isCurrent=currentUser.name===u.name;
            return `<tr>
              <td><code style="background:var(--surface2);padding:2px 8px;border-radius:4px;font-size:12px;">${uname}</code></td>
              <td>
                <div class="emp-cell">
                  <div class="user-av" style="width:32px;height:32px;font-size:11px;">${u.initials||uname.slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style="font-weight:600;">${isEn&&u.nameEn?u.nameEn:u.name}</div>
                    <div style="font-size:11px;color:var(--text2);">${isEn&&u.labelEn?u.labelEn:u.label||''}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge ${roleBadge}">${roleLabel}</span></td>
              <td>
                <button class="btn btn-sm" onclick="openSettingsModal('editUser','${uname}')">✏️</button>
                <button class="btn btn-sm btn-warning" onclick="openSettingsModal('changePassword','${uname}')">🔑</button>
                ${!isCurrent?`<button class="btn btn-sm btn-danger" onclick="confirmDeleteUser('${uname}')">🗑️</button>`:'<span style="font-size:11px;color:var(--text3);margin-right:6px;">●</span>'}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- System Settings -->
  <div class="section">
    <div class="section-header"><div class="section-title">🔧 ${T('systemSettings')}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div style="font-weight:700;margin-bottom:8px;font-size:13px;">🌐 ${T('systemLang')}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn ${currentLang==='ar'?'btn-primary':''}" onclick="setLang('ar');renderSettings();">عربي</button>
          <button class="btn ${currentLang==='en'?'btn-primary':''}" onclick="setLang('en');renderSettings();">English</button>
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--radius);padding:16px;border:1px solid var(--border);">
        <div style="font-weight:700;margin-bottom:8px;font-size:13px;">🌙 ${isEn?'Dark Mode':'الوضع الداكن'}</div>
        <button class="btn" onclick="toggleDarkMode()">${isDark?(isEn?'Switch to Light':'تفعيل الوضع الفاتح'):(isEn?'Switch to Dark':'تفعيل الوضع الداكن')}</button>
      </div>
    </div>
  </div>

  <!-- Work Hours Settings -->
  <div class="section">
    <div class="section-header"><div class="section-title">⏰ ${isEn?'Work Hours':'إعدادات ساعات العمل'}</div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
      <div class="form-group">
        <label class="form-label">${isEn?'Work Start Hour':'وقت بداية العمل'}</label>
        <input class="form-input" id="settWorkStart" type="number" min="0" max="12" value="${SETTINGS.workStart}" placeholder="8">
      </div>
      <div class="form-group">
        <label class="form-label">${isEn?'Work End Hour':'وقت نهاية العمل'}</label>
        <input class="form-input" id="settWorkEnd" type="number" min="13" max="23" value="${SETTINGS.workEnd}" placeholder="17">
      </div>
      <div class="form-group">
        <label class="form-label">${isEn?'Session Timeout (min)':'انتهاء الجلسة (دقيقة)'}</label>
        <input class="form-input" id="settTimeout" type="number" min="5" max="120" value="${SETTINGS.sessionTimeout}" placeholder="30">
      </div>
      <div class="form-group">
        <label class="form-label">${isEn?'Company Name':'اسم الشركة'}</label>
        <input class="form-input" id="settCompany" value="${escHtml(SETTINGS.companyName)}" placeholder="اسم الشركة">
      </div>
    </div>
    <div style="margin-top:12px;">
      <button class="btn btn-primary" onclick="saveSystemSettings()">${isEn?'Save Settings':'💾 حفظ الإعدادات'}</button>
    </div>
  </div>

  <!-- Data Backup & Restore -->
  <div class="section">
    <div class="section-header"><div class="section-title">💾 ${isEn?'Data Backup & Restore':'النسخ الاحتياطي واستعادة البيانات'}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:#E8F8F2;border-radius:var(--radius);padding:16px;border:1px solid #2D9D6E;">
        <div style="font-weight:700;margin-bottom:6px;font-size:13px;color:var(--success);">📤 ${isEn?'Export Backup':'تصدير نسخة احتياطية'}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${isEn?'Download all HR data as a JSON file.':'تنزيل جميع البيانات كملف JSON.'}</div>
        <button class="btn btn-success btn-sm" onclick="exportBackup()">${isEn?'Export JSON':'📥 تصدير JSON'}</button>
      </div>
      <div style="background:#EBF3FB;border-radius:var(--radius);padding:16px;border:1px solid var(--primary);">
        <div style="font-weight:700;margin-bottom:6px;font-size:13px;color:var(--primary);">📥 ${isEn?'Restore Backup':'استعادة نسخة احتياطية'}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${isEn?'Restore data from a JSON backup file.':'استعادة البيانات من ملف JSON.'}</div>
        <input type="file" id="restoreFile" accept=".json" style="display:none" onchange="importBackup(this)">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('restoreFile').click()">${isEn?'Import JSON':'📤 استيراد JSON'}</button>
      </div>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="section">
    <div class="section-header"><div class="section-title" style="color:var(--danger);">⚠️ ${isEn?'Danger Zone':'منطقة الخطر'}</div></div>
    <div style="background:#fff5f5;border-radius:var(--radius);padding:16px;border:1px solid #fdd;">
      <div style="font-weight:700;margin-bottom:8px;font-size:13px;color:var(--danger);">🗑️ ${T('systemReset')}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${isEn?'Permanently delete all HR data. Cannot be undone.':'حذف دائم لجميع بيانات الموارد البشرية. لا يمكن التراجع.'}</div>
      <button class="btn btn-danger btn-sm" onclick="confirmResetData()">${T('systemReset')}</button>
    </div>
  </div>
  `;
  document.getElementById('page-settings').innerHTML=html;
}

window.openSettingsModal=function(type,username){
  let html='';
  const isEn=currentLang==='en';
  if(type==='addUser'){
    html=`<div class="modal-title">${T('addUserTitle')}</div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">${T('usernameLabel')}</label><input class="form-input" id="suUsername" placeholder="admin2" dir="ltr"></div>
      <div class="form-group"><label class="form-label">${T('passwordLabel')}</label><input class="form-input" id="suPass" type="password" placeholder="••••••••" dir="ltr"></div>
      <div class="form-group"><label class="form-label">${T('nameLabel')}</label><input class="form-input" id="suName" placeholder="${isEn?'Arabic Name':'الاسم بالعربية'}"></div>
      <div class="form-group"><label class="form-label">${T('nameEnLabel')}</label><input class="form-input" id="suNameEn" placeholder="English Name" dir="ltr"></div>
      <div class="form-group"><label class="form-label">${T('roleLabel')}</label>
        <select class="form-input" id="suRole">
          <option value="admin">${T('rolesAdmin')}</option>
          <option value="manager" selected>${T('rolesMgr')}</option>
          <option value="employee">${T('rolesEmp')}</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">${T('initialsLabel')}</label><input class="form-input" id="suInitials" maxlength="2" placeholder="مد" style="font-size:18px;text-align:center;"></div>
      <div class="form-group"><label class="form-label">${isEn?'Label (Arabic)':'المسمى'}</label><input class="form-input" id="suLabel" placeholder="${isEn?'Job role in Arabic':'مدير مشروع'}"></div>
      <div class="form-group"><label class="form-label">${isEn?'Label (English)':'المسمى بالإنجليزية'}</label><input class="form-input" id="suLabelEn" placeholder="Project Manager" dir="ltr"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="doAddUser()">${T('save')}</button>
      <button class="btn" onclick="closeModal()">${T('cancel')}</button>
    </div>`;
  } else if(type==='editUser'){
    const u=USERS[username];
    if(!u) return;
    html=`<div class="modal-title">${T('editUserTitle')}: <code>${username}</code></div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">${T('nameLabel')}</label><input class="form-input" id="euName" value="${u.name||''}"></div>
      <div class="form-group"><label class="form-label">${T('nameEnLabel')}</label><input class="form-input" id="euNameEn" value="${u.nameEn||''}" dir="ltr"></div>
      <div class="form-group"><label class="form-label">${T('roleLabel')}</label>
        <select class="form-input" id="euRole">
          <option value="admin" ${u.role==='admin'?'selected':''}>${T('rolesAdmin')}</option>
          <option value="manager" ${u.role==='manager'?'selected':''}>${T('rolesMgr')}</option>
          <option value="employee" ${u.role==='employee'?'selected':''}>${T('rolesEmp')}</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">${T('initialsLabel')}</label><input class="form-input" id="euInitials" maxlength="2" value="${u.initials||''}" style="font-size:18px;text-align:center;"></div>
      <div class="form-group"><label class="form-label">${isEn?'Label (Arabic)':'المسمى'}</label><input class="form-input" id="euLabel" value="${u.label||''}"></div>
      <div class="form-group"><label class="form-label">${isEn?'Label (English)':'المسمى بالإنجليزية'}</label><input class="form-input" id="euLabelEn" value="${u.labelEn||''}" dir="ltr"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="doEditUser('${username}')">${T('save')}</button>
      <button class="btn" onclick="closeModal()">${T('cancel')}</button>
    </div>`;
  } else if(type==='changePassword'){
    const u=USERS[username];
    if(!u) return;
    html=`<div class="modal-title">${T('changePwTitle')}: <code>${username}</code></div>
    <div class="form-grid">
      <div class="form-group full"><label class="form-label">${T('newPassword')}</label><input class="form-input" id="cpNew" type="password" placeholder="••••••••" dir="ltr"></div>
      <div class="form-group full"><label class="form-label">${T('confirmPassword')}</label><input class="form-input" id="cpConfirm" type="password" placeholder="••••••••" dir="ltr"></div>
      <div id="cpErr" style="color:var(--danger);font-size:12px;grid-column:1/-1;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="doChangePassword('${username}')">${T('save')}</button>
      <button class="btn" onclick="closeModal()">${T('cancel')}</button>
    </div>`;
  }
  showModal(html);
};

window.doAddUser=async function(){
  const uname=document.getElementById('suUsername').value.trim().toLowerCase();
  const pass=document.getElementById('suPass').value;
  const name=document.getElementById('suName').value.trim();
  const nameEn=document.getElementById('suNameEn').value.trim();
  const role=document.getElementById('suRole').value;
  const initials=document.getElementById('suInitials').value.trim()||uname.slice(0,2).toUpperCase();
  const label=document.getElementById('suLabel').value.trim();
  const labelEn=document.getElementById('suLabelEn').value.trim();
  if(!uname){showToast('خطأ','اسم المستخدم مطلوب','error');return;}
  if(!pass){showToast('خطأ','كلمة المرور مطلوبة','error');return;}
  if(!name){showToast('خطأ',T('nameRequired'),'error');return;}
  if(USERS[uname]){showToast('خطأ',T('usernameExists'),'error');return;}
  const hashedPass=await hashPassword(pass);
  USERS[uname]={pass:hashedPass,name,nameEn,role,label:label||(role==='admin'?'مدير':role==='manager'?'مدير مشروع':'موظف'),
    labelEn:labelEn||(role==='admin'?'Admin':role==='manager'?'Project Manager':'Employee'),initials};
  saveUsers(USERS);
  addAudit(currentLang==='en'?'Add User':'إضافة مستخدم',uname);
  addNotifItem(`👤 ${T('userAdded')} - ${uname}`,'success');
  showToast(T('userAdded'),'','success');
  closeModal();renderSettings();
};

window.doEditUser=function(username){
  const u=USERS[username];if(!u) return;
  u.name=document.getElementById('euName').value.trim()||u.name;
  u.nameEn=document.getElementById('euNameEn').value.trim();
  u.role=document.getElementById('euRole').value;
  u.initials=document.getElementById('euInitials').value.trim()||u.initials;
  u.label=document.getElementById('euLabel').value.trim()||u.label;
  u.labelEn=document.getElementById('euLabelEn').value.trim()||u.labelEn;
  saveUsers(USERS);
  addAudit(currentLang==='en'?'Edit User':'تعديل مستخدم',username);
  closeModal();renderSettings();
};

window.doChangePassword=async function(username){
  const np=document.getElementById('cpNew').value;
  const cp=document.getElementById('cpConfirm').value;
  if(!np){document.getElementById('cpErr').textContent=T('newPassword').replace(' *','')+' '+T('required');return;}
  if(np!==cp){document.getElementById('cpErr').textContent=T('pwMismatch');return;}
  USERS[username].pass=await hashPassword(np);
  saveUsers(USERS);
  addAudit(currentLang==='en'?'Change Password':'تغيير كلمة مرور',username);
  closeModal();
  showToast(T('pwChanged'),'','success');
};

window.confirmDeleteUser=function(username){
  if(currentUser.name===USERS[username]?.name){showToast('خطأ',T('cannotDeleteSelf'),'error');return;}
  showConfirm(T('deleteUserConfirm')+' "'+username+'"?',()=>{delete USERS[username];saveUsers(USERS);addAudit(currentLang==='en'?'Delete User':'حذف مستخدم',username);renderSettings();});
};

window.confirmResetData=function(){
  showConfirm(T('resetConfirm'),()=>{
    DB={employees:[],attendance:[],leaves:[],performances:[],
      trainings:[],tasks:[],documents:[],disciplinary:[],
      payroll:[],payrollHistory:[],auditLogs:[],notifications:[],
      nextId:{emp:1,att:1,leave:1,perf:1,train:1,task:1,doc:1,disc:1,pay:1,audit:1,notif:1}};
    saveDB();
    showToast(T('resetDone'),'','success');
    renderPage(activePage);
  },'⚠️ '+T('systemReset'));
};

window.saveSystemSettings=function(){
  const start=+document.getElementById('settWorkStart')?.value||8;
  const end=+document.getElementById('settWorkEnd')?.value||17;
  const timeout=+document.getElementById('settTimeout')?.value||30;
  const company=document.getElementById('settCompany')?.value||SETTINGS.companyName;
  if(start>=end){showToast('خطأ','وقت البداية يجب أن يكون قبل وقت النهاية','error');return;}
  SETTINGS.workStart=start;SETTINGS.workEnd=end;SETTINGS.sessionTimeout=timeout;SETTINGS.companyName=company;
  saveSettings();resetSessionTimer();
  showToast('تم حفظ الإعدادات','','success');
};

window.exportBackup=function(){
  const backup={version:'v4',exported:new Date().toISOString(),db:DB,settings:SETTINGS};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mueheet_backup_${today()}.json`;a.click();
  showToast('تم التصدير',`نسخة احتياطية — ${today()}`,'success');
};

window.importBackup=function(input){
  const file=input.files[0];if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const backup=JSON.parse(e.target.result);
      if(!backup.db){showToast('خطأ','ملف غير صالح','error');return;}
      showConfirm('سيتم استبدال جميع البيانات الحالية. هل تريد المتابعة؟',()=>{
        DB=backup.db;
        if(!DB.payrollHistory) DB.payrollHistory=[];
        if(backup.settings) Object.assign(SETTINGS,backup.settings);
        saveDB();saveSettings();
        showToast('تم الاستيراد','تمت استعادة البيانات بنجاح','success');
        renderPage(activePage);renderSettings();
      },'استعادة النسخة الاحتياطية');
    }catch(err){showToast('خطأ','فشل قراءة الملف: '+err.message,'error');}
  };
  reader.readAsText(file);input.value='';
};

// ===================== LANGUAGE =====================
window.doLogout=function(auto=false){
  addAudit('تسجيل خروج', currentUser.name||(auto?'timeout':''));
  sessionActive=false;
  clearTimeout(sessionTimer);
  document.getElementById('app').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  currentUser={};currentRole='admin';activePage='dashboard';
  if(liveClockInterval){clearInterval(liveClockInterval);liveClockInterval=null;}
};

window.setLang=function(lang){
  currentLang=lang;
  document.querySelectorAll('.lang-opt').forEach(el=>el.classList.remove('active'));
  document.querySelector(`.lang-opt[onclick="setLang('${lang}')"]`)?.classList.add('active');
  document.documentElement.lang=lang;
  buildNav();
};

// ===================== INIT =====================
initApp().then(()=>{
  updateNotifBadge();
  // اختبار الاتصال بـ Supabase
  if(typeof testSupabaseConnection === 'function'){
    setTimeout(()=>testSupabaseConnection(), 500);
  }
});

// ===================== DARK MODE =====================
let isDark = localStorage.getItem('mueheet_dark') === '1';
function applyDark(){
  document.body.classList.toggle('dark-mode', isDark);
  const btn = document.getElementById('darkModeBtn');
  if(btn) btn.textContent = isDark ? '☀️' : '🌙';
}
window.toggleDarkMode = function(){
  isDark = !isDark;
  localStorage.setItem('mueheet_dark', isDark ? '1' : '0');
  applyDark();
  // Re-render settings if on that page
  if(activePage === 'settings') renderSettings();
};
applyDark();

// ===================== PUSH NOTIFICATIONS =====================
let pushEnabled = localStorage.getItem('mueheet_push') === '1';
async function requestPushPermission(){
  if(!('Notification' in window)) return false;
  if(Notification.permission === 'granted'){ pushEnabled = true; return true; }
  if(Notification.permission !== 'denied'){
    const result = await Notification.requestPermission();
    pushEnabled = result === 'granted';
    localStorage.setItem('mueheet_push', pushEnabled ? '1' : '0');
    return pushEnabled;
  }
  return false;
}
function sendPushNotif(title, body, icon='🔔'){
  if(!pushEnabled || Notification.permission !== 'granted') return;
  try { new Notification(title, {body, icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">' + icon + '</text></svg>'}); } catch(e){}
}
window.togglePushNotif = async function(){
  if(!pushEnabled){
    const ok = await requestPushPermission();
    if(!ok){ showToast('تنبيه','يرجى السماح بالإشعارات من إعدادات المتصفح','warn');return; }
  } else {
    pushEnabled = false;
    localStorage.setItem('mueheet_push', '0');
  }
  if(activePage === 'settings') renderSettings();
};

// ===================== LIVE STATS CLOCK =====================
let liveClockInterval = null;
function startLiveClock(){
  if(liveClockInterval) clearInterval(liveClockInterval);
  updateLiveClock();
  liveClockInterval = setInterval(updateLiveClock, 1000);
}
function updateLiveClock(){
  const now = new Date();
  const timeEl = document.getElementById('liveTimeDisplay');
  const progressEl = document.getElementById('liveWorkProgress');
  const remainEl = document.getElementById('liveRemainHours');
  const workStartEl = document.getElementById('liveWorkStatus');
  if(!timeEl) { clearInterval(liveClockInterval); liveClockInterval = null; return; }
  // Current time display
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  timeEl.textContent = h + ':' + m + ':' + s;
  // Work hours based on settings
  const workStart = SETTINGS.workStart * 60;
  const workEnd = SETTINGS.workEnd * 60;
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const totalWorkMins = workEnd - workStart; // 540 mins
  const elapsed = Math.max(0, Math.min(currentMins - workStart, totalWorkMins));
  const remaining = Math.max(0, workEnd - currentMins);
  const progress = Math.round((elapsed / totalWorkMins) * 100);
  const remH = Math.floor(remaining / 60);
  const remM = remaining % 60;
  if(remainEl) {
    if(currentMins < workStart) remainEl.textContent = '9h 00m';
    else if(currentMins >= workEnd) remainEl.textContent = '0h 00m';
    else remainEl.textContent = remH + 'h ' + String(remM).padStart(2,'0') + 'm';
  }
  if(workStartEl){
    if(currentMins < workStart) workStartEl.textContent = 'يبدأ الدوام '+SETTINGS.workStart+':00 ص';
    else if(currentMins >= workEnd) workStartEl.textContent = 'انتهى الدوام';
    else workStartEl.textContent = 'الوقت المتبقي';
  }
  // Draw canvas arc
  const canvas = document.getElementById('liveClockCanvas');
  if(canvas){
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,64,64);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(32,32,26,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle = '#00B4D8';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const angle = (progress / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(32,32,26,-Math.PI/2,angle); ctx.stroke();
  }
}

(function(){
  const d = new Date();
  const opts = {weekday:'long',year:'numeric',month:'long',day:'numeric'};
  const el = document.getElementById('headerDate');
  if(el) el.textContent = d.toLocaleDateString('en-US', opts);
})();

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') closeModal();
});

// Close notif panel on outside click
document.addEventListener('click',e=>{
  const panel=document.getElementById('notifPanel');
  const btn=e.target.closest('.notif-btn');
  if(!btn&&panel&&!panel.contains(e.target)) panel.classList.remove('open');
  const dd=document.getElementById('searchDropdown');
  if(dd&&!e.target.closest('.global-search')) dd.style.display='none';
});

})();