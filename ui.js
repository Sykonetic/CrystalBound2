// src/ui.js
import { DEFAULT_BINDS } from './engine.js';

export function setupUI(game, net){
  const log = (m)=>{ const el=document.getElementById('log'); el.textContent = (m+"\n"+el.textContent).slice(0,8000); };
  const list = document.getElementById('controlsList');
  let selected = null;

  const render = ()=>{
    list.innerHTML='';
    Object.entries(game.binds).forEach(([action,keys])=>{
      const row=document.createElement('div');
      row.style.display='flex'; row.style.justifyContent='space-between';
      row.style.border='1px solid #242a43'; row.style.borderRadius='8px';
      row.style.padding='6px 8px'; row.style.marginBottom='6px';
      row.style.background = selected===action ? '#0d1328' : 'transparent';
      row.innerHTML = `<div><div style="font-weight:700">${action}</div><div style="color:#7e8aa0">${keys.join(', ')}</div></div><div class="pill">bound</div>`;
      row.onclick=()=>{ selected=action; render(); };
      list.appendChild(row);
    });
  };
  render();

  document.getElementById('btnResetBinds').onclick=()=>{
    game.binds = structuredClone(DEFAULT_BINDS);
    game.saveBinds(); render(); log('Binds reset.');
  };
  document.getElementById('btnRebind').onclick=()=>{
    if(!selected){ log('Select an action first.'); return; }
    log('Press a key for '+selected+'...');
    const once=(e)=>{
      e.preventDefault();
      game.binds[selected]=[e.key];
      window.removeEventListener('keydown', once, true);
      game.saveBinds(); render(); log(selected+' bound to '+e.key);
    };
    window.addEventListener('keydown', once, true);
  };

  // Multiplayer UI
  document.getElementById('btnMPStart').onclick=()=>{
    const room = document.getElementById('roomInput').value || 'public-room';
    const ws = document.getElementById('wsInput').value || '';
    net.join(room, ws);
  };
  document.getElementById('btnMPLeave').onclick=()=> net.leave();
}
