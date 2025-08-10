// src/engine.js
import { World } from './world.js';

export const ASSETS = {};
export function loadAssets(done){
  function makeSprite(body, accent, weapon){
    const c=document.createElement('canvas'); c.width=c.height=32;
    const g=c.getContext('2d');
    g.fillStyle='rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(16,22,10,4,0,0,Math.PI*2); g.fill();
    g.fillStyle=body; g.beginPath(); g.arc(16,16,10,0,Math.PI*2); g.fill();
    g.fillStyle='#f3f4f6'; g.fillRect(14,12,4,2);
    g.fillStyle=accent; g.fillRect(8,12,4,4); g.fillRect(20,12,4,4);
    g.fillStyle=weapon; g.fillRect(22,18,8,2);
    return c;
  }
  ASSETS.warrior = makeSprite('#eab308','#a78bfa','#9ca3af');
  ASSETS.ranger  = makeSprite('#10b981','#86efac','#8b5cf6');
  ASSETS.mage    = makeSprite('#60a5fa','#93c5fd','#f472b6');
  ASSETS.rogue   = makeSprite('#f59e0b','#fbbf24','#374151');
  ASSETS.cleric  = makeSprite('#facc15','#93c5fd','#a3e635');
  ASSETS.slime   = makeSprite('#93c5fd','#60a5fa','#3b82f6');
  ASSETS.boss    = makeSprite('#ef4444','#f87171','#991b1b');
  done();
}

export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keys = { key:{}, code:{} };
    this.mouse = { x:0,y:0, wx:0, wy:0, downL:false, downR:false };
    this.dt = 0; this.last = 0;
    this.world = new World(this);
    this.runToggle = false; // SHIFT toggles run

    // Keyboard
    window.addEventListener('keydown', e=>{
      this.keys.key[e.key]=true; this.keys.code[e.code]=true;
      if(e.key==='Shift' || e.code==='ShiftLeft' || e.code==='ShiftRight') this.runToggle = !this.runToggle;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
    }, {passive:false});
    window.addEventListener('keyup',   e=>{ this.keys.key[e.key]=false; this.keys.code[e.code]=false; });
    window.addEventListener('blur', ()=>{ this.keys = {key:{},code:{}}; this.mouse.downL=false; this.mouse.downR=false; });

    // Mouse -> world coords
    const updateMouse = (e)=>{
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top)  * (this.canvas.height / r.height);
      // project to world using current camera (set each frame)
      this.mouse.wx = this.mouse.x + (this.camX||0);
      this.mouse.wy = this.mouse.y + (this.camY||0);
    };
    this.canvas.addEventListener('mousemove', updateMouse);
    this.canvas.addEventListener('mousedown', (e)=>{
      updateMouse(e);
      if(e.button===0){ this.mouse.downL=true; }     // left
      if(e.button===2){ this.mouse.downR=true; }     // right
    });
    this.canvas.addEventListener('mouseup', (e)=>{
      if(e.button===0){ this.mouse.downL=false; }
      if(e.button===2){ this.mouse.downR=false; }
    });
    this.canvas.addEventListener('contextmenu', e=>e.preventDefault()); // disable context menu
  }

  start(){ requestAnimationFrame(this.loop.bind(this)); }
  loop(ts){
    this.dt = Math.min(0.033, (ts - this.last)/1000 || 0);
    this.last = ts;
    this.update(this.dt);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt){
    const k=this.keys;
    let dx=0,dy=0;
    if(k.key['w']||k.code['KeyW']||k.key['ArrowUp'])    dy-=1;
    if(k.key['s']||k.code['KeyS']||k.key['ArrowDown'])  dy+=1;
    if(k.key['a']||k.code['KeyA']||k.key['ArrowLeft'])  dx-=1;
    if(k.key['d']||k.code['KeyD']||k.key['ArrowRight']) dx+=1;

    // Mouse aiming: rotate player towards cursor each tick
    const p = this.world.player;
    const ang = Math.atan2(this.mouse.wy - p.y, this.mouse.wx - p.x);
    if(!Number.isNaN(ang)) p.dir = ang;

    // Click to attack/dodge (J/Space still work)
    const attackClick = this.mouse.downL;
    const dodgeClick  = this.mouse.downR;
    const attackKey   = !!(k.key['j']||k.key['J']);
    const dodgeKey    = !!(k.key[' ']||k.key['Space']);

    this.world.player.move(dx, dy, this.runToggle, dt, this.world);

    if((attackClick || attackKey) && !this._atkHeld){ this.world.player.attack(this.world); }
    if((dodgeClick  || dodgeKey ) && !this._dodgeHeld){ this.world.player.dodge(this.world); }
    this._atkHeld = attackClick || attackKey;
    this._dodgeHeld = dodgeClick || dodgeKey;

    this.world.update(dt);
  }

  draw(){
    const ctx = this.ctx, W=this.canvas.width, H=this.canvas.height;
    const p=this.world.player;
    this.camX = Math.max(0, Math.min(this.world.w - W, p.x - W/2));
    this.camY = Math.max(0, Math.min(this.world.h - H, p.y - H/2));
    // keep mouse world coords in sync even if mouse is idle
    this.mouse.wx = this.mouse.x + this.camX;
    this.mouse.wy = this.mouse.y + this.camY;

    ctx.save(); ctx.clearRect(0,0,W,H); ctx.translate(-this.camX,-this.camY);
    this.world.draw(ctx, this.mouse);
    ctx.restore();
  }
}

// helpers
export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
export function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
export function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
export function wrapAngle(a){ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; }
