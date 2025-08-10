export const ASSETS = {};
export function loadAssets(cb){
  const list = {
    warrior: 'assets/warrior.png',
    ranger: 'assets/ranger.png',
    mage: 'assets/mage.png',
    rogue: 'assets/rogue.png',
    slime: 'assets/slime.png',
    boss: 'assets/boss.png'
  };
  let loaded = 0, total = Object.keys(list).length;
  for(const [k,src] of Object.entries(list)){
    const img = new Image();
    img.src = src;
    img.onload = ()=>{ if(++loaded>=total) cb(); };
    ASSETS[k] = img;
  }
}

// src/engine.js
import { World } from './world.js';

export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keys = {};
    this.dt = 0; this.last = 0;
    this.binds = JSON.parse(localStorage.getItem('cb_binds')||'null') || structuredClone(DEFAULT_BINDS);
    this.world = new World();
    this.player = this.world.player;

    window.addEventListener('keydown', e=>{
      this.keys[e.key] = true;
      // skills 1-4 by binding
      for(let i=1;i<=4;i++){
        if(keyMatches(this.binds, 'skill'+i, e)) { e.preventDefault(); this.player.useSkill(i, this.world); }
      }
    });
    window.addEventListener('keyup', e=>{ this.keys[e.key] = false; });

    // expose for quick testing
    window.__game = this;
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
    if(keyDownOnce(this, 'menu'))   this.world.toggleMenu();

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
  run:['Shift'], menu:['m','M'], interact:['e','E'], attack:['j','J'], dodge:[' '],
  skill1:['1'], skill2:['2'], skill3:['3'], skill4:['4']
};

export function keyMatches(binds, action, e){
  return (binds[action]||[]).some(k=>k===e.key);
}
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
export function lerp(a,b,t){ return a+(b-a)*t; }
