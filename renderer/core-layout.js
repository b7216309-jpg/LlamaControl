const _collapsed = safeJsonParse(localStorage.getItem('nerv-collapsed'), {});
function toggleBox(id) {
  const box = document.getElementById(id);
  if (!box) return;
  const body = box.querySelector('.box-body');
  const btn = box.querySelector('.box-collapse');
  if (!body) return;
  const hide = body.style.display !== 'none';
  body.style.display = hide ? 'none' : '';
  if (btn) btn.textContent = hide ? '+' : '-';
  // Collapse: shrink box to title-only height
  if (hide) { box.dataset.prevFlex = box.style.flex; box.style.flex = '0 0 16px'; box.style.minHeight = '16px'; }
  else { box.style.flex = box.dataset.prevFlex || '0 0 auto'; box.style.minHeight = ''; }
  _collapsed[id] = hide;
  localStorage.setItem('nerv-collapsed', JSON.stringify(_collapsed));
}
// Restore collapsed state on load
function restoreCollapsed() {
  for (const [id, val] of Object.entries(_collapsed)) { if (val) toggleBox(id); }
}

// â”€â”€ CLOCK â”€â”€
function clock(){
  const now=new Date();
  setT('sb-clk',now.toTimeString().slice(0,8));
  if(!t0){setT('sb-up','--');return;}
  const up=Math.floor((Date.now()-t0)/1000);
  const d=Math.floor(up/86400),h=Math.floor((up%86400)/3600),mn=Math.floor((up%3600)/60),s=up%60;
  setT('sb-up', d>0 ? d+'d '+String(h).padStart(2,'0')+':'+String(mn).padStart(2,'0') : h>0 ? h+'h'+String(mn).padStart(2,'0') : mn+'m'+String(s).padStart(2,'0')+'s');
}

// â”€â”€ RESIZE ENGINE with localStorage â”€â”€
const LS_KEY='nerv-tui-v3-sizes';
const FLEX_FILL_BOXES = {
  'box-prc': { flex: '1 1 60px', minHeight: '60px' },
  'box-chat': { flex: '1 0 60px', minHeight: '60px' },
};

function normalizeFillBoxes() {
  Object.entries(FLEX_FILL_BOXES).forEach(([id, cfg]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.flex = cfg.flex;
    el.style.minHeight = cfg.minHeight;
    el.style.height = '';
  });
}

function saveSizes(){
  try{
    const o={};
    ['box-cpu','box-gpu','box-mem','box-net','box-dsk','box-prc',
     'box-hero','box-kvc','box-flg','box-slt','box-hist','box-log','box-chat'].forEach(id=>{
      const e=document.getElementById(id);
      if(e&&e.style.height&&!FLEX_FILL_BOXES[id])o[id]=e.style.height;
    });
    const sb=document.getElementById('sidebar');
    if(sb&&sb.style.width)o['__sb']=sb.style.width;
    localStorage.setItem(LS_KEY,JSON.stringify(o));
  }catch(e){}
}

function restoreSizes(){
  try{
    const o=safeJsonParse(localStorage.getItem(LS_KEY), {});
    Object.entries(o).forEach(([id,h])=>{
      if(id==='__sb'){
        const e=document.getElementById('sidebar');
        if(e){e.style.width=h;e.style.flex='none';}
      }else{
        const e=document.getElementById(id);
        if(e&&h){
          e.style.height=h;e.style.flex='none';
        }
      }
    });
    normalizeFillBoxes();
  }catch(e){}
}

// Vertical drag
(()=>{
  const handle=document.getElementById('drag-main');
  const sidebar=document.getElementById('sidebar');
  let drag=false,sx=0,sw=0;
  handle.addEventListener('mousedown',e=>{drag=true;sx=e.clientX;sw=sidebar.offsetWidth;handle.classList.add('on');document.body.style.cursor='col-resize';e.preventDefault();});
  document.addEventListener('mousemove',e=>{if(!drag)return;const nw=Math.max(180,Math.min(600,sw+(e.clientX-sx)));sidebar.style.width=nw+'px';sidebar.style.flex='none';});
  document.addEventListener('mouseup',()=>{if(!drag)return;drag=false;handle.classList.remove('on');document.body.style.cursor='';normalizeFillBoxes();saveSizes();});
})();

// Horizontal drags
document.querySelectorAll('.drag-h').forEach(handle=>{
  const aId=handle.dataset.a,bId=handle.dataset.b;
  let drag=false,sy=0,sah=0,sbh=0;
  handle.addEventListener('mousedown',e=>{
    const a=document.getElementById(aId),b=document.getElementById(bId);
    if(!a||!b)return;
    drag=true;sy=e.clientY;sah=a.offsetHeight;sbh=b.offsetHeight;
    handle.classList.add('on');document.body.style.cursor='row-resize';e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!drag)return;
    const a=document.getElementById(aId),b=document.getElementById(bId);
    if(!a||!b)return;
    const dy=e.clientY-sy;
    const minA=38, minB=38;
    const na=Math.max(minA,sah+dy),nb=Math.max(minB,sbh-dy);
    a.style.flex='none';a.style.height=na+'px';
    b.style.flex='none';b.style.height=nb+'px';
  });
  document.addEventListener('mouseup',()=>{if(!drag)return;drag=false;handle.classList.remove('on');document.body.style.cursor='';normalizeFillBoxes();saveSizes();});
});

window.addEventListener('resize', normalizeFillBoxes);
