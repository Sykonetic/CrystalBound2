// src/engine.js
import { World } from './world.js';

/** ====== Assets (generated sprites, no image files) ====== */
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

/** ====== Keybinds ====== */
export const BIND_STORAGE_KEY = 'cb_keybinds';
export const DEFAULT_BINDS = {
  up:        ['w','ArrowUp'],
  down:      ['s','ArrowDown'],
  left:      ['a','ArrowLeft'],
  right:     ['d','ArrowRight'],
  runToggle: ['Shift'],                // toggle run
  attack:    ['j','J','MouseLeft'],
  dodge:     [' ','Space','MouseRight']
};

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function anyPressed(map, tokens){
  // tokens is an array of candidate keys/codes like ['w','KeyW']
  return tokens.some(t => map.key[t] || map.code[t] || map.mouse[t]);
}

/** ====== Game ====== */
export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // input state
    this.keys  = { key:{}, code:{}, mouse:{} };
    this.mouse = { x:0,y:0, wx:0, wy:0, downL:false, downR:false };

    // binds (from storage or defaults)
    this.binds = JSON.parse(localStorage.getItem(BIND_STORAGE_KEY) || 'null') || clone(DEFAULT_BINDS);
    this.runToggle = false; // SHIFT toggles this

    this.dt = 0; this.last = 0;
    this.world = new World(this);

    /** Keyboard */
    window.addEventListener('keydown', e=>{
      this.keys.key[e.key]=true; this.keys.code[e.code]=true;
      if(this.binds.runToggle?.includes('Shift') && (e.key==='Shift' || e.code==='ShiftLeft' || e.code==='ShiftRight')){
        this.runToggle = !this.runToggle;
      }
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
    }, {passive:false});
    window.addEventListener('keyup',   e=>{ this.keys.key[e.key]=false; this.keys.code[e.code]=false; });

    /** Mouse */
    const updateMouse = (e)=>{
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top)  * (this.canvas.height / r.height);
      this.mouse.wx = this.mouse.x + (this.camX||0);
      this.mouse.wy = this.mouse.y + (this.camY||0);
    };
    this.canvas.addEventListener('mousemove', updateMouse);
    this.canvas.addEventListener('mousedown', (e)=>{
      updateMouse(e);
      if(e.button===0){ this.mouse.downL=true; this.keys.mouse['MouseLeft']=true; }
      if(e.button===2){ this.mouse.downR=true; this.keys.mouse['MouseRight']=true; }
    });
    this.canvas.addEventListener('mouseup', (e)=>{
      if(e.button===0){ this.mouse.downL=false; this.keys.mouse['MouseLeft']=false; }
      if(e.button===2){ this.mouse.downR=false; this.keys.mouse['MouseRight']=false; }
    });
    this.canvas.addEventListener('contextmenu', e=>e.preventDefault()); // no context menu
    window.addEventListener('blur', ()=>{
      this.keys = { key:{}, code:{}, mouse:{} };
      this.mouse.downL=false; this.mouse.downR=false;
    });
  }

  /** Allow UI to push new binds */
  setBinds(newBinds){
    this.binds = clone(newBinds || DEFAULT_BINDS);
    localStorage.setItem(BIND_STORAGE_KEY, JSON.stringify(this.binds));
  }

  start(){ requestAnimationFrame(this.loop.bind(this)); }
  loop(ts){
    this.dt = Math.min(0.033, (ts - this.last)/1000 || 0);
    this.last = ts;
    this.update(this.dt);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }

  /** Helpers to test actions with current binds */
  actionPressed(name){
    const b = this.binds[name] || DEFAULT_BINDS[name] || [];
    // map both key and code forms
    const tokens = [];
    b.forEach(v=>{
      tokens.push(v);
      if(v.length===1){ // letter -> also allow code form
        const upper = v.toUpperCase();
        const code = 'Key' + upper;
        tokens.push(code);
      }
    });
    return anyPressed(this.keys, tokens);
  }

  update(dt){
    const p = this.world.player;
    // movement
    let dx=0,dy=0;
    if(this.actionPressed('up'))    dy-=1;
    if(this.actionPressed('down'))  dy+=1;
    if(this.actionPressed('left'))  dx-=1;
    if(this.actionPressed('right')) dx+=1;

    // mouse turns the player to face cursor
    const ang = Math.atan2(this.mouse.wy - p.y, this.mouse.wx - p.x);
    if(!Number.isNaN(ang)) p.dir = ang;

    const attack = this.actionPressed('attack');
    const dodge  = this.actionPressed('dodge');

    p.move(dx, dy, this.runToggle, dt, this.world);
    if(attack && !this._atkHeld){ p.attack(this.world); }
    if(dodge  && !this._dodgeHeld){ p.dodge(this.world); }
    this._atkHeld = attack; this._dodgeHeld = dodge;

    this.world.update(dt);
  }

  draw(){
    const ctx = this.ctx, W=this.canvas.width, H=this.canvas.height;
    const p=this.world.player;
    this.camX = Math.max(0, Math.min(this.world.w - W, p.x - W/2));
    this.camY = Math.max(0, Math.min(this.world.h - H, p.y - H/2));
    // keep mouse world coords in sync even if idle
    this.mouse.wx = this.mouse.x + this.camX;
    this.mouse.wy = this.mouse.y + this.camY;

    ctx.save(); ctx.clearRect(0,0,W,H); ctx.translate(-this.camX,-this.camY);
    this.world.draw(ctx, this.mouse);
    ctx.restore();
  }
}

/** Small helpers used by world.js too */
export function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
export function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
export function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
export function wrapAngle(a){ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; }
