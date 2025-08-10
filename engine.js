// src/engine.js
import { World } from './world.js';

export const ASSETS = {};

// Creates simple 32x32 pixel sprites with class colors (no external PNGs needed)
export function loadAssets(done){
  function makeSprite(body, accent, weapon){
    const c=document.createElement('canvas'); c.width=c.height=32;
    const g=c.getContext('2d');
    // shadow
    g.fillStyle='rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(16,22,10,4,0,0,Math.PI*2); g.fill();
    // body
    g.fillStyle=body; g.beginPath(); g.arc(16,16,10,0,Math.PI*2); g.fill();
    // face-ish highlight
    g.fillStyle='#f3f4f6'; g.fillRect(14,12,4,2);
    // accent (pauldrons/scarf)
    g.fillStyle=accent; g.fillRect(8,12,4,4); g.fillRect(20,12,4,4);
    // weapon hint
    g.fillStyle=weapon; g.fillRect(22,18,8,2);
    return c;
  }
  ASSETS.warrior = makeSprite('#eab308','#a78bfa','#9ca3af');
  ASSETS.ranger  = makeSprite('#10b981','#86efac','#8b5cf6');
  ASSETS.mage    = makeSprite('#60a5fa','#93c5fd','#f472b6');
  ASSETS.rogue   = makeSprite('#f59e0b','#fbbf24','#374151');
  ASSETS.slime   = makeSprite('#93c5fd','#60a5fa','#3b82f6');
  ASSETS.boss    = makeSprite('#ef4444','#f87171','#991b1b');
  done();
}

export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keys = {};
    this.dt = 0; this.last = 0;
    this.binds = JSON.parse(localStorage.getItem('cb_binds')||'null') || structuredClone(DEFAULT_BINDS);
    this.world = new World();           // world holds player, enemies, etc.
    this.player = this.world.player;

    window.addEventListener('keydown', e=>{
      this.keys[e.key] = true;
      // skills 1–4 would go here later (per-class)
    });
    window.addEventListener('keyup', e=>{ this.keys[e.key] = false; });

    window.__game = this; // for quick console testing
  }
  saveBinds(){ localStorage.setItem('cb_binds', JSON.stringify(this.binds)); }
  start(){ requestAnimationFrame(this.loop.bind(this)); }
  loop(ts){
    this.dt = Math.min(0.033, (ts - this.last)/1000 || 0);
    this.last = ts;
    this.update(this.dt);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
  update(dt){
    const b = this.binds, k = this.keys;

    let dx=0,dy=0;
    if(anyMatch(b.up, k)) dy-=1;
    if(anyMatch(b.down, k)) dy+=1;
    if(anyMatch(b.left, k)) dx-=1;
    if(anyMatch(b.right, k)) dx+=1;

    const run = anyMatch(b.run, k);
    this.player.move(dx, dy, run, dt, this.world);

    if(keyDownOnce(this, 'attack')) this.player.attack(this.world);
    if(keyDownOnce(this, 'dodge'))  this.player.dodge(this.world);

    this.world.update(dt);
  }
  draw(){
    const ctx = this.ctx, W=this.canvas.width, H=this.canvas.height;
    const camX = clamp(this.player.x - W/2, 0, Math.max(0, this.world.w - W));
    const camY = clamp(this.player.y - H/2, 0, Math.max(0, this.world.h - H));
    ctx.save(); ctx.clearRect(0,0,W,H); ctx.translate(-camX,-camY);
    this.world.draw(ctx);
    ctx.restore();
  }
}

export const DEFAULT_BINDS = {
  up:['w','ArrowUp'], down:['s','ArrowDown'], left:['a','ArrowLeft'], right:['d','ArrowRight'],
  run:['Shift'], interact:['e','E'], attack:['j','J'], dodge:[' '],
  skill1:['1'], skill2:['2'], skill3:['3'], skill4:['4']
};

export function anyMatch(list, keys){ return (list||[]).some(k => keys[k]); }
export function keyDownOnce(game, action){
  if(!game._edge) game._edge = {};
  const pressed = anyMatch(game.binds[action]||[], game.keys);
  const prev = game._edge[action]||false;
  game._edge[action] = pressed;
  return pressed && !prev;
}
export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
export function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
export function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
export function wrapAngle(a){ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; }
