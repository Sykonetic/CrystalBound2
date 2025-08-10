// src/ui.js
import { DEFAULT_BINDS, BIND_STORAGE_KEY } from './engine.js';

/**
 * Simple UI wiring for:
 * - Keybind list with rebind + reset
 * - Hook into Game.setBinds so the engine uses the new keys immediately
 */
export function setupUI(game /*, net */){
  const el = id => document.getElementById(id);

  // Load current binds from storage (or defaults)
  let binds = JSON.parse(localStorage.getItem(BIND_STORAGE_KEY) || 'null') || clone(DEFAULT_BINDS);

  // --- controls list
  let selected = null;
  function renderControls(){
    const box = el('controlsList');
    if(!box) return;
    box.innerHTML = '';
    for(const [action, list] of Object.entries(binds)){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid #242a43;border-radius:8px;margin-bottom:6px;'+
                          (selected===action?'background:#0d1328':'');
      row.innerHTML = `<div><div style="font-weight:700">${label(action)}</div>
                       <div class="muted">${list.join(', ')||'—'}</div></div>
                       <div class="pill">bind</div>`;
      row.onclick = ()=>{ selected=action; renderControls(); };
      box.appendChild(row);
    }
  }
  renderControls();

  el('btnResetBinds')?.addEventListener('click', ()=>{
    binds = clone(DEFAULT_BINDS);
    save();
  });

  el('btnRebind')?.addEventListener('click', ()=>{
    if(!selected){ log('Select an action first.'); return; }
    log(`Press a key or mouse button for ${label(selected)}…`);
    const onKey = (e)=>{
      e.preventDefault();
      const key = normalizeKey(e.key, e.code);
      if(!key){ cleanup(); return; }
      binds[selected] = [key];
      cleanup(); save();
    };
    const onMouse = (e)=>{
      e.preventDefault();
      const v = e.button===0 ? 'MouseLeft' : e.button===2 ? 'MouseRight' : null;
      if(!v){ return; }
      binds[selected] = [v];
      cleanup(); save();
    };
    const cleanup = ()=>{
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
  });

  function save(){
    localStorage.setItem(BIND_STORAGE_KEY, JSON.stringify(binds));
    game.setBinds(binds);
    renderControls();
    log('Controls updated.');
  }

  function log(m){
    const box = el('log'); if(box) box.textContent = (m+"\n"+box.textContent).slice(0,9000);
  }
}

/** helpers */
function label(k){
  const names = {
    up:'Move Up', down:'Move Down', left:'Move Left', right:'Move Right',
    runToggle:'Run (toggle)', attack:'Attack', dodge:'Dodge'
  };
  return names[k] || k;
}
function normalizeKey(key, code){
  if(key===' ' || key==='Space') return ' ';
  if(key && key.length===1) return key.toLowerCase();
  if(code && code.startsWith('Key')) return code.replace('Key','').toLowerCase();
  // allow arrows/Shift explicitly
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Shift'].includes(key)) return key;
  return null;
}
function clone(o){ return JSON.parse(JSON.stringify(o)); }
