// binds the two buttons you already see so they don't error
export function setupUI(game, net){
  const log = (m)=>{ const el=document.getElementById('log'); el.textContent = (m+"\n"+el.textContent).slice(0,8000); };
  const list = document.getElementById('controlsList');
  list.innerHTML = `<div style="padding:6px 8px;border:1px solid #242a43;border-radius:8px">Use WASD/Arrows to move the yellow circle.</div>`;
  document.getElementById('btnResetBinds').onclick = ()=> log('Binds reset (placeholder).');
  document.getElementById('btnRebind').onclick = ()=> log('Rebind clicked (placeholder).');
  document.getElementById('btnMPStart').onclick = ()=> log('Multiplayer start (placeholder).');
  document.getElementById('btnMPLeave').onclick = ()=> log('Multiplayer leave (placeholder).');
}

