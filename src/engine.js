// src/engine.js
import { World } from './world.js';

/* ===== Assets (procedural) ===== */
export const ASSETS = {};
export function loadAssets(done){
  const mk=(body,accent,weapon)=>{
    const c=document.createElement('canvas'); c.width=c.height=32;
    const g=c.getContext('2d');
    g.fillStyle='rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(16,22,10,4,0,0,Math.PI*2); g.fill();
    g.fillStyle=body; g.beginPath(); g.arc(16,16,10,0,Math.PI*2); g.fill();
    g.fillStyle='#f3f4f6'; g.fillRect(14,12,4,2);
    g.fillStyle=accent; g.fillRect(8,12,4,4); g.fillRect(20,12,4,4);
    g.fillStyle=weapon; g.fillRect(22,18,8,2);
    return c;
  };
  ASSETS.warrior=mk('#eab308','#a78bfa','#9ca3af');
  ASSETS.ranger =mk('#10b981','#86efac','#8b5cf6');
  ASSETS.mage   =mk('#60a5fa','#93c5fd','#f472b6');
  ASSETS.rogue  =mk('#f59e0b','#fbbf24','#374151');
  ASSETS.cleric =mk('#facc15','#93c5fd','#a3e635');
  ASSETS.slime  =mk('#93c5fd','#60a5fa','#3b82f6');
  ASSETS.boss   =mk('#ef4444','#f87171','#991b1b');
  done();
}

/* ===== Keybinds ===== */
export const BIND_STORAGE_KEY='cb_keybinds';
export const DEFAULT_BINDS={
  up:['w','ArrowUp'], down:['s','ArrowDown'], left:['a','ArrowLeft'], right:['d','ArrowRight'],
  runToggle:['Shift'],
  attack:['j','J','MouseLeft'], dodge:[' ','Space','MouseRight'],
  interact:['e','E'],
  skill1:['1','Digit1'], skill2:['2','Digit2'], skill3:['3','Digit3'], skill4:['4','Digit4']
};
const clone=o=>JSON.parse(JSON.stringify(o));
const anyPressed=(map,tokens)=>tokens.some(t=>map.key[t]||map.code[t]||map.mouse[t]);

export class Game{
  constructor(canvas){
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.keys={key:{},code:{},mouse:{}}; this.mouse={x:0,y:0,wx:0,wy:0,downL:false,downR:false};
    this.binds=JSON.parse(localStorage.getItem(BIND_STORAGE_KEY)||'null')||clone(DEFAULT_BINDS);
    this.runToggle=false;
    this.world=new World(this);
    this.dt=0; this.last=0;

    // Keyboard
    window.addEventListener('keydown',e=>{
      this.keys.key[e.key]=true; this.keys.code[e.code]=true;
      if((e.key==='Shift'||e.code==='ShiftLeft'||e.code==='ShiftRight')) this.runToggle=!this.runToggle;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key)) e.preventDefault();
    },{passive:false});
    window.addEventListener('keyup',e=>{this.keys.key[e.key]=false; this.keys.code[e.code]=false;});

    // Mouse
    const upd=(e)=>{
      const r=this.canvas.getBoundingClientRect();
      this.mouse.x=(e.clientX-r.left)*(this.canvas.width/r.width);
      this.mouse.y=(e.clientY-r.top)*(this.canvas.height/r.height);
      this.mouse.wx=this.mouse.x+(this.camX||0); this.mouse.wy=this.mouse.y+(this.camY||0);
    };
    this.canvas.addEventListener('mousemove',upd);
    this.canvas.addEventListener('mousedown',e=>{
      upd(e);
      if(e.button===0){this.mouse.downL=true; this.keys.mouse.MouseLeft=true;}
      if(e.button===2){this.mouse.downR=true; this.keys.mouse.MouseRight=true;}
    });
    this.canvas.addEventListener('mouseup',e=>{
      if(e.button===0){this.mouse.downL=false; this.keys.mouse.MouseLeft=false;}
      if(e.button===2){this.mouse.downR=false; this.keys.mouse.MouseRight=false;}
    });
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    window.addEventListener('blur',()=>{this.keys={key:{},code:{},mouse:{}}; this.mouse.downL=false; this.mouse.downR=false;});
  }
  setBinds(b){ this.binds=clone(b||DEFAULT_BINDS); localStorage.setItem(BIND_STORAGE_KEY,JSON.stringify(this.binds)); }
  actionPressed(name){
    const list=this.binds[name]||DEFAULT_BINDS[name]||[]; const tokens=[];
    for(const v of list){ tokens.push(v); if(v.length===1&&/[a-zA-Z]/.test(v)) tokens.push('Key'+v.toUpperCase()); }
    return anyPressed(this.keys,tokens);
  }
  start(){ requestAnimationFrame(this.loop.bind(this)); }
  loop(ts){ this.dt=Math.min(0.033,(ts-this.last)/1000||0); this.last=ts; this.update(this.dt); this.draw(); requestAnimationFrame(this.loop.bind(this)); }
  update(dt){
    const p=this.world.player;
    let dx=0,dy=0;
    if(this.actionPressed('up'))dy-=1; if(this.actionPressed('down'))dy+=1;
    if(this.actionPressed('left'))dx-=1; if(this.actionPressed('right'))dx+=1;
    const ang=Math.atan2(this.mouse.wy-p.y,this.mouse.wx-p.x); if(!Number.isNaN(ang)) p.dir=ang;

    const atk=this.actionPressed('attack'), ddg=this.actionPressed('dodge');
    const s1=this.actionPressed('skill1'), s2=this.actionPressed('skill2'), s3=this.actionPressed('skill3'), s4=this.actionPressed('skill4');
    const inter=this.actionPressed('interact');

    p.move(dx,dy,this.runToggle,dt,this.world);
    if(atk&&!this._atkHeld) p.attack(this.world);
    if(ddg&&!this._ddgHeld) p.dodge(this.world);
    if(s1&&!this._s1) p.cast(1,this.world,this.mouse);
    if(s2&&!this._s2) p.cast(2,this.world,this.mouse);
    if(s3&&!this._s3) p.cast(3,this.world,this.mouse);
    if(s4&&!this._s4) p.cast(4,this.world,this.mouse);
    if(inter&&!this._int) this.world.tryInteract();
    this._atkHeld=atk; this._ddgHeld=ddg; this._s1=s1; this._s2=s2; this._s3=s3; this._s4=s4; this._int=inter;

    this.world.update(dt);
  }
  draw(){
    const ctx=this.ctx,W=this.canvas.width,H=this.canvas.height,p=this.world.player;
    this.camX=Math.max(0,Math.min(this.world.w-W,p.x-W/2));
    this.camY=Math.max(0,Math.min(this.world.h-H,p.y-H/2));
    this.mouse.wx=this.mouse.x+this.camX; this.mouse.wy=this.mouse.y+this.camY;
    ctx.save(); ctx.clearRect(0,0,W,H); ctx.translate(-this.camX,-this.camY);
    this.world.draw(ctx,this.mouse); ctx.restore();
  }
}

/* mini helpers */
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function wrapAngle(a){ while(a>Math.PI)a-=2*Math.PI; while(a<-Math.PI)a+=2*Math.PI; return a; }
