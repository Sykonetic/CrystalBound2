// server/relay.js
// Tiny WebSocket relay for multiplayer. No game logic; just relays messages by room.
// Usage:
//   npm init -y && npm i ws
//   node server/relay.js
// Then in the client UI, put ws://localhost:8080 into the WS box and click Start/Join.

import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const rooms = new Map(); // room -> Set(ws)

function joinRoom(ws, room){
  if(!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
  ws._room = room;
  console.log('join', room);
}
function leaveRoom(ws){
  const r = ws._room;
  if(r && rooms.has(r)){ rooms.get(r).delete(ws); }
  ws._room = null;
}

wss.on('connection', (ws)=>{
  ws.on('message', (buf)=>{
    let msg; try{ msg = JSON.parse(buf.toString()); }catch{ return; }
    if(msg.t==='join'){ joinRoom(ws, msg.room); return; }
    // relay to room peers
    const r = ws._room; if(!r) return;
    const set = rooms.get(r)||new Set();
    set.forEach(peer=>{ if(peer!==ws && peer.readyState===1){ peer.send(JSON.stringify(msg)); } });
  });
  ws.on('close', ()=> leaveRoom(ws));
});
console.log('Relay listening on ws://localhost:8080');
