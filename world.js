// src/world.js
import { clamp, rand, dist, wrapAngle } from './engine.js';

export class World{
  constructor(){
    this.tile = 24; this.gw=80; this.gh=56;
    this.w = this.tile*this.gw; this.h=this.tile*this.gh;
    this.enemies=[]; this.projectiles=[]; this.telegraphs=[]; this.traps=[];
    this.menu=false;
    this.groundPat=null; this.wallPat=null;
    this.player = new Player(this);
    this.map = this.genMapMeadow();
    this.makePatterns();
    this.spawnInitial();
    // simple boss placeholder
    this.boss = { x: this.w*0.7, y: this.h*0.3, hp: 600, cd: 2.0 };
  }
  toggleMenu(){ this.menu=!this.menu; }
  makePatterns(){
    const create = (c1,c2)=>{
      const c=document.createElement('canvas'); c.width=c.height=this.tile; const g=c.getContext('2d');
      g.fillStyle=c1; g.fillRect(0,0,this.tile,this.tile);
      g.fillStyle=c2; g.fillRect(0,0,this.tile,2); g.fillRect(0,this.tile-2,this.tile,2);
      return g.createPattern ? g.createPattern(c, 'repeat') : null;
    };
    // canvas 2d: createPattern on ctx, not g; fallback below
    const off=document.createElement('canvas'); const g=off.getContext('2d'); off.width=off.height=this.tile;
    g.fillStyle='#0e241b'; g.fillRect(0,0,this.tile,this.tile);
    g.fillStyle='#123f2e'; g.fillRect(0,0,this.tile,2); g.fillRect(0,this.tile-2,this.tile,2);
    this.groundPat = off;
    const off2=document.createElement('canvas'); const g2=off2.getContext('2d'); off2.width=off2.height=this.tile;
    g2.fillStyle='#1a1420'; g2.fillRect(0,0,this.tile,this.tile);
    g2.fillStyle='#2c2540'; g2.fillRect(0,0,this.tile,2); g2.fillRect(0,this.tile-2,this.tile,2);
    this.wallPat = off2;
  }
  genMapMeadow(){
    const m = new Uint8Array(this.gw*this.gh);
    // walls border
    for(let x=0;x<this.gw;x++){ m[x]=1; m[(this.gh-1)*this.gw + x]=1; }
    for(let y=0;y<this.gh;y++){ m[y*this.gw]=1; m[y*this.gw + this.gw-1]=1; }
    // some blocks
    this.rect(m,10,20,12,6); this.rect(m,28,8,8,10); this.rect(m,50,30,14,7);
    return m;
  }
  rect(m,x,y,w,h){ for(let j=y;j<y+h;j++){ for(let i=x;i<x+w;i++){ m[j*this.gw+i]=1; } } }
  tileAt(x,y){
    const i=Math.floor(x/this.tile), j=Math.floor(y/this.tile);
    if(i<0||j<0||i>=this.gw||j>=this.gh) return 1; return this.map[j*this.gw+i];
  }
  walkable(x,y){ return this.tileAt(x,y)===0; }
  moveWithCollide(obj,dx,dy){
    let nx=obj.x+dx, ny=obj.y;
    if(this.walkable(nx,ny)) obj.x=nx;
    ny = obj.y+dy;
    if(this.walkable(obj.x,ny)) obj.y=ny;
  }
  spawnInitial(){
    for(let i=0;i<10;i++){
      const x=rand(2,this.gw-3)*this.tile, y=rand(2,this.gh-3)*this.tile;
      if(this.walkable(x,y)) this.enemies.push(new Enemy('Slime', x,y));
    }
  }
  update(dt){
    // boss telegraphs
    if(this.boss){
      this.boss.cd -= dt;
      if(this.boss.cd<=0){
        // random pattern
        const kind = Math.random()<0.5 ? 'circle' : 'line';
        if(kind==='circle'){
          const t={type:'circle', x:this.player.x, y:this.player.y, r:80, ttl:1.0, dmg:30};
          this.telegraphs.push(t);
          t.fire = ()=>{ if(dist({x:t.x,y:t.y}, this.player)<t.r){ this.player.hit(30, this); } };
        } else {
          const dir = Math.atan2(this.player.y-this.boss.y, this.player.x-this.boss.x);
          const t={type:'line', x:this.boss.x, y:this.boss.y, dir, len:200, ttl:1.0, dmg:35};
          this.telegraphs.push(t);
          t.fire = ()=>{
            // distance from line segment
            const ax=t.x, ay=t.y, bx=t.x+Math.cos(dir)*t.len, by=t.y+Math.sin(dir)*t.len;
            const px=this.player.x, py=this.player.y;
            const t0 = Math.max(0, Math.min(1, ((px-ax)*(bx-ax)+(py-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2) ));
            const cx = ax + (bx-ax)*t0, cy = ay + (by-ay)*t0;
            if(Math.hypot(px-cx, py-cy) < 14) this.player.hit(35, this);
          };
        }
        this.boss.cd = 2.5; // tough but fair
      }
    }
    // telegraph timing
    for(let i=this.telegraphs.length-1;i>=0;i--){
      const t=this.telegraphs[i]; t.ttl-=dt;
      if(t.ttl<=0){ if(t.fire) t.fire(); this.telegraphs.splice(i,1); }
    }

    // enemies move towards player
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i];
      const dir = Math.atan2(this.player.y-e.y, this.player.x-e.x);
      const spd = 70*dt;
      this.moveWithCollide(e, Math.cos(dir)*spd, Math.sin(dir)*spd);
      if(Math.hypot(e.x-this.player.x, e.y-this.player.y)<14){
        this.player.hit(8, this);
      }
      if(e.hp<=0){ this.enemies.splice(i,1); this.player.xp+=20; }
    }

    this.player.update(dt, this);
  }
  draw(ctx){
    // ground pattern fill
    if(this.groundPat){ ctx.fillStyle = ctx.createPattern(this.groundPat, 'repeat'); ctx.fillRect(0,0,this.w,this.h); }
    // tiles
    for(let j=0;j<this.gh;j++){ for(let i=0;i<this.gw;i++){ if(this.map[j*this.gw+i]){ ctx.fillStyle='#1b2135'; ctx.fillRect(i*this.tile,j*this.tile,this.tile,this.tile); } } }
    // boss marker
    if(this.boss){ ctx.fillStyle='#b45309'; ctx.beginPath(); ctx.arc(this.boss.x,this.boss.y,14,0,Math.PI*2); ctx.fill(); }

    // telegraphs
    ctx.strokeStyle='rgba(239,68,68,0.7)'; ctx.lineWidth=2;
    for(const t of this.telegraphs){
      if(t.type==='circle'){ ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(t.x+Math.cos(t.dir)*t.len, t.y+Math.sin(t.dir)*t.len); ctx.stroke(); }
    }

    // enemies
    for(const e of this.enemies){
      ctx.fillStyle='#93c5fd'; ctx.beginPath(); ctx.arc(e.x,e.y,10,0,Math.PI*2); ctx.fill();
    }

    // player
    const bob=Math.sin(performance.now()/120)*1.5;
    ctx.fillStyle = this.player.iframe>0 ? '#fef08a' : '#eab308';
    ctx.beginPath(); ctx.arc(this.player.x,this.player.y+bob,10,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fde68a'; ctx.lineWidth=2; ctx.stroke();
  }
}

export class Player{
  constructor(world){
    this.x = world.tile*20; this.y=world.tile*20;
    this.dir = 0;
    this.hp=120; this.mp=40; this.maxhp=120; this.maxmp=40;
    this.xp=0; this.lv=1; this.speed=120;
    this.iframe = 0; // seconds of invulnerability
    this.rollCD = 0;
  }
  useSkill(i, world){
    // stub: demo MP spend
    if(this.mp>=5){ this.mp-=5; }
  }
  move(dx,dy,run,dt,world){
    if(dx||dy){
      const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
      this.dir = Math.atan2(dy,dx);
    }
    const spd = this.speed * (run?1.5:1);
    world.moveWithCollide(this, dx*spd*dt, dy*spd*dt);
  }
  attack(world){
    // simple melee cone hit
    const arc=Math.PI/2, reach=36, dmg=18;
    let hits=0;
    for(const e of world.enemies){
      const ang=Math.atan2(e.y-this.y,e.x-this.x);
      const within = Math.abs(wrapAngle(ang - this.dir)) < arc/2 && dist(e,this)<=reach;
      if(within){ e.hp-=dmg; hits++; }
    }
    log(`Slash hits ${hits}`);
  }
  dodge(world){
    if(this.rollCD>0) return;
    // dash forward with i-frames
    const dash=120;
    world.moveWithCollide(this, Math.cos(this.dir)*dash, Math.sin(this.dir)*dash);
    this.iframe = 0.5; this.rollCD = 0.8;
    log('Dodge roll! (i-frames)');
  }
  hit(d, world){
    if(this.iframe>0) return;
    this.hp = Math.max(0, this.hp - d);
    if(this.hp===0){ this.respawn(world); }
  }
  respawn(world){
    this.x = world.tile*10; this.y=world.tile*10; this.hp = Math.floor(this.maxhp*0.7);
    log('You were defeated. Respawned.');
  }
  update(dt, world){
    if(this.iframe>0) this.iframe -= dt;
    if(this.rollCD>0) this.rollCD -= dt;
    // level up
    while(this.xp>=100*this.lv){ this.xp-=100*this.lv; this.lv++; this.maxhp+=10; this.hp=this.maxhp; log('Level up!'); }
    // basic regen
    this.mp = Math.min(this.maxmp, this.mp + 4*dt);
    // update HUD
    const hpbar = document.getElementById('hpbar');
    const mpbar = document.getElementById('mpbar');
    const xpbar = document.getElementById('xpbar');
    hpbar.style.width = (this.hp/this.maxhp*100).toFixed(1)+'%';
    mpbar.style.width = (this.mp/this.maxmp*100).toFixed(1)+'%';
    xpbar.style.width = (this.xp%100)+'%';
  }
}

export class Enemy{
  constructor(type,x,y){ this.type=type; this.x=x; this.y=y; this.hp=40; }
}

// tiny logger
export function log(msg){
  const el=document.getElementById('log');
  el.textContent = (msg + "\n" + el.textContent).slice(0,9000);
}
