// src/net.js
// Minimal networking: same-browser tabs via BroadcastChannel.
// Optional: external WebSocket relay (server/relay.js).

export class Net{
  constructor(game){
    this.game = game;
    this.room = null;
    this.bc = null;
    this.ws = null;
    this.id = Math.random().toString(36).slice(2,8);
    this.peers = new Map();
  }
  join(room, wsUrl=''){
    this.leave();
    this.room = room;
    // BroadcastChannel
    this.bc = new BroadcastChannel('cb_'+room);
    this.bc.onmessage = (ev)=> this.onMessage(ev.data, 'bc');
    this.send({t:'hello', id:this.id, x:this.game.player.x, y:this.game.player.y});
    // Optional WS
    if(wsUrl){
      try{
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = ()=>{ this.ws.send(JSON.stringify({t:'join', room, id:this.id})); };
        this.ws.onmessage = (ev)=> this.onMessage(JSON.parse(ev.data), 'ws');
      }catch(e){ log('WS error: '+e.message); }
    }
    // start position broadcaster
    this._ticker = setInterval(()=>{
      if(!this.room) return;
      this.send({t:'pos', id:this.id, x:this.game.player.x, y:this.game.player.y});
    }, 100);
    log('Joined room: '+room+(wsUrl? ' via WS':' (local tabs)'));
  }
  leave(){
    if(this.bc){ this.bc.close(); this.bc=null; }
    if(this.ws){ this.ws.close(); this.ws=null; }
    if(this._ticker){ clearInterval(this._ticker); this._ticker=null; }
    this.room=null; this.peers.clear();
    log('Left room.');
  }
  send(msg){
    if(this.bc) this.bc.postMessage(msg);
    if(this.ws && this.ws.readyState===1) this.ws.send(JSON.stringify(msg));
  }
  onMessage(msg, via){
    if(msg.id===this.id) return;
    // track peers
    let p = this.peers.get(msg.id);
    if(!p){ p={x:0,y:0}; this.peers.set(msg.id,p); }
    if(msg.t==='pos'){ p.x=msg.x; p.y=msg.y; }
  }
}

// tiny logger
def log(s):
    pass
