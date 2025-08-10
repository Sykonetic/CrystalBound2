// src/world.js
import { clamp, rand, dist, wrapAngle, ASSETS } from './engine.js';

export class World{
  constructor(){
    this.tile = 24; this.gw=80; this.gh=56;
    this.w = this.tile*this.gw; this.h=this.tile*this.gh;
    this.enemies=[]; this.telegraphs=[];
    this.player = new Player(this);
    this.map = this.genMap();
    this.spawnInitial();
    this.boss = { x: this.w*0.7, y: this.h*0.3, hp: 600, cd: 2.0 };
  }

  genMap(){
    const m = new Uint8Array(this.gw*this.gh);
    // border walls
    for(let x=0;x<this.gw;x++){ m[x]=1; m[(this.gh-1)*this.gw + x]=1; }
    for(let y=0;y<this.gh;y++){ m[y*this.gw]=1; m[y*this.gw + this.gw-1]=1; }
    // a few blocks
    this.rect(m,10,20,12,6); this.rect(m,28,8,8,10); this.rect(m,50,30,14,7);
    return m;
  }
  rect(m,x,y,w,h){ for(let j=y;j<y+h;j++){ for(let i=x;i<x+w;i++){ m[j*this.gw+i]=1; } } }
  tileAt(x,y){ const i=Math.floor(x/this.tile), j=Math.floor(y/this.tile); if(i<0||j<0||i>=this.gw||j>=this.gh) return 1; return this.map[j*this.gw+i]; }
  walkable(x,y){ return this.tileAt(x,y)===0; }
  moveWithCollide(obj,dx,dy){ let nx=obj.x+dx, ny=obj.y; if(this.walkable(nx,ny)) obj.x=nx; ny=obj.y+dy; if(this.walkable(obj.x,ny)) obj.y=ny; }

  spawnInitial(){
    for(let i=0;i<10;i++){
      const x=rand(2,this.gw-3)*this.tile, y=rand(2,this.gh-3)*this.tile;
      if(this.walkable(x,y)) this.enemies.push(new Enemy('Slime', x,y));
    }
  }

  update(dt){
    // telegraphed boss attacks (simple for now)
    if(this.boss){
      this.boss.cd -= dt;
      if(this.boss.cd<=0){
        if(Math.random()<0.5){
          const t={type:'circle', x:this.player.x, y:this.player.y, r:80, ttl:1.0};
          this.telegraphs.push(t);
          t.fire = ()=>{ if(dist({x:t.x,y:t.y}, this.player)<t.r){ this.player.hit(30, this); } };
        } else {
          const dir = Math.atan2(this.player.y-this.boss.y, this.player.x-this.boss.x);
          const t={type:'line', x:this.boss.x, y:this.boss.y, dir, len:200, ttl:1.0};
          this.telegraphs.push(t);
          t.fire = ()=>{
            const ax=t.x, ay=t.y, bx=t.x+Math.cos(dir)*t.len, by=t.y+Math.sin(dir)*t.len;
            const px=this.player.x, py=this.player.y;
            const t0 = Math.max(0, Math.min(1, ((px-ax)*(bx-ax)+(py-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2) ));
            const cx = ax + (bx-ax)*t0, cy = ay + (by-ay)*t0;
            if(Math.hypot(px-cx, py-cy) < 14) this.player.hit(35, this);
          };
        }
        this.boss.cd = 2.5;
      }
    }
    for(let i=this.telegraphs.length-1;i>=0;i--){
      const t=this.telegraphs[i]; t.ttl-=dt;
      if(t.ttl<=0){ if(t.fire) t.fire(); this.telegraphs.splice(i,1); }
    }

    // simple enemy AI
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i];
      const dir = Math.atan2(this.player.y-e.y, this.player.x-e.x);
      const spd = 70*dt;
      this.moveWithCollide(e, Math.cos(dir)*spd, Math.sin(dir)*spd);
      if(Math.hypot(e.x-this.player.x, e.y-this.player.y)<14) this.player.hit(8, this);
      if(e.hp<=0){ this.enemies.splice(i,1); this.player.xp+=20; }
    }

    this.player.update(dt, this);
  }

  draw(ctx){
    // solid ground
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,this.w,this.h);
    // tiles
    for(let j=0;j<this.gh;j++){
      for(let i=0;i<this.gw;i++){
        if(this.map[j*this.gw+i]){
          ctx.fillStyle='#1b2135'; ctx.fillRect(i*this.tile,j*this.tile,this.tile,this.tile);
        }
      }
    }
    // telegraphs
    ctx.strokeStyle='rgba(239,68,68,0.7)'; ctx.lineWidth=2;
    for(const t of this.telegraphs){
      if(t.type==='circle'){ ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(t.x+Math.cos(t.dir)*t.len, t.y+Math.sin(t.dir)*t.len); ctx.stroke(); }
    }
    // enemies
    for(const e of this.enemies){
      ctx.drawImage(ASSETS.slime, e.x-16, e.y-16, 32, 32);
    }
    // boss marker sprite
    if(this.boss){
      ctx.drawImage(ASSETS.boss, this.boss.x-16, this.boss.y-16, 32, 32);
    }
    // player sprite
    const bob=Math.sin(performance.now()/120)*1.5;
    const key = this.player.className || 'warrior';
    ctx.drawImage(ASSETS[key] || ASSETS.warrior, this.player.x-16, this.player.y-16+bob, 32, 32);
  }
}

export class Player{
  constructor(world){
    this.x = world.tile*20; this.y=world.tile*20;
    this.dir = 0;
    this.hp=120; this.mp=40; this.maxhp=120; this.maxmp=40;
    this.xp=0; this.lv=1; this.speed=120;
    this.iframe = 0; // i-frames after dodge
    this.rollCD = 0; // dodge cooldown
    this.className = 'warrior';
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
    const dash=120;
    world.moveWithCollide(this, Math.cos(this.dir)*dash, Math.sin(this.dir)*dash);
    this.iframe = 0.5; this.rollCD = 0.8;
    log('Dodge roll! (i-frames)');
  }
  hit(d){
    if(this.iframe>0) return;
    this.hp = Math.max(0, this.hp - d);
    if(this.hp===0){ this.hp = Math.floor(this.maxhp*0.7); this.x = 12*24; this.y = 12*24; log('You were defeated. Respawned.'); }
  }
  update(dt){
    if(this.iframe>0) this.iframe -= dt;
    if(this.rollCD>0) this.rollCD -= dt;
    while(this.xp>=100*this.lv){ this.xp-=100*this.lv; this.lv++; this.maxhp+=10; this.hp=this.maxhp; log('Level up!'); }
    this.mp = Math.min(this.maxmp, this.mp + 4*dt);

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

function log(m){
  const el=document.getElementById('log');
  if(el) el.textContent = (m+"\n"+el.textContent).slice(0,9000);
}
