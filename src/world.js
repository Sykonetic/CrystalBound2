// src/world.js
import { clamp, rand, dist, wrapAngle, ASSETS } from './engine.js';

const CLASS_CFG = {
  warrior:{ hp:170, mp:30, speed:115, rollCD:1.0, iframe:0.45 },
  ranger: { hp:130, mp:40, speed:130, rollCD:0.8, iframe:0.40 },
  mage:   { hp:110, mp:70, speed:115, rollCD:0.9, iframe:0.40 },
  rogue:  { hp:120, mp:35, speed:145, rollCD:0.6, iframe:0.35 },
  cleric: { hp:150, mp:90, speed:115, rollCD:0.9, iframe:0.40 } // healer
};

export class World{
  constructor(game){
    this.game=game;
    this.tile = 24; this.gw=80; this.gh=56;
    this.w = this.tile*this.gw; this.h=this.tile*this.gh;
    this.enemies=[]; this.telegraphs=[]; this.floaters=[];
    this.player = new Player(this);
    this.map = this.genMap();
    this.spawnInitial();
    this.boss = { x: this.w*0.7, y: this.h*0.3, hp: 1200, cd: 2.4 };
  }

  // colored terrain + more obstacles
  genMap(){
    const m = new Uint8Array(this.gw*this.gh);
    for(let x=0;x<this.gw;x++){ m[x]=1; m[(this.gh-1)*this.gw+x]=1; }
    for(let y=0;y<this.gh;y++){ m[y*this.gw]=1; m[y*this.gw+this.gw-1]=1; }
    // hand-placed
    this.rect(m,10,20,12,6); this.rect(m,28,8,8,10); this.rect(m,50,30,14,7);
    // random groves
    for(let k=0;k<30;k++){ this.rect(m, rand(4,this.gw-10), rand(4,this.gh-10), rand(3,7), rand(2,6)); }
    return m;
  }
  rect(m,x,y,w,h){ for(let j=y;j<y+h;j++){ for(let i=x;i<x+w;i++){ m[j*this.gw+i]=1; } } }
  tileAt(x,y){ const i=Math.floor(x/this.tile), j=Math.floor(y/this.tile); if(i<0||j<0||i>=this.gw||j>=this.gh) return 1; return this.map[j*this.gw+i]; }
  walkable(x,y){ return this.tileAt(x,y)===0; }
  moveWithCollide(obj,dx,dy){ let nx=obj.x+dx, ny=obj.y; if(this.walkable(nx,ny)) obj.x=nx; ny=obj.y+dy; if(this.walkable(obj.x,ny)) obj.y=ny; }

  spawnInitial(){
    for(let i=0;i<16;i++){
      const x=rand(2,this.gw-3)*this.tile, y=rand(2,this.gh-3)*this.tile;
      if(this.walkable(x,y)) this.enemies.push(new Enemy('Slime', x,y));
    }
  }

  addFloater(x,y,text,color='#e5e7eb'){ this.floaters.push({x,y,text,color,ttl:0.9}); }

  update(dt){
    // boss telegraphs ( toned damage so no 1-shots )
    if(this.boss){
      this.boss.cd -= dt;
      if(this.boss.cd<=0){
        if(Math.random()<0.5){
          const t={type:'circle', x:this.player.x, y:this.player.y, r:90, ttl:1.0, dmg:14};
          this.telegraphs.push(t);
          t.fire = ()=>{ if(dist({x:t.x,y:t.y}, this.player)<t.r){ this.player.hit(t.dmg, this); } };
        } else {
          const dir = Math.atan2(this.player.y-this.boss.y, this.player.x-this.boss.x);
          const t={type:'line', x:this.boss.x, y:this.boss.y, dir, len:260, ttl:1.0, dmg:18};
          this.telegraphs.push(t);
          t.fire = ()=>{
            const ax=t.x, ay=t.y, bx=t.x+Math.cos(dir)*t.len, by=t.y+Math.sin(dir)*t.len;
            const px=this.player.x, py=this.player.y;
            const t0 = Math.max(0, Math.min(1, ((px-ax)*(bx-ax)+(py-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2) ));
            const cx = ax + (bx-ax)*t0, cy = ay + (by-ay)*t0;
            if(Math.hypot(px-cx, py-cy) < 14) this.player.hit(t.dmg, this);
          };
        }
        this.boss.cd = 2.8;
      }
    }
    for(let i=this.telegraphs.length-1;i>=0;i--){
      const t=this.telegraphs[i]; t.ttl-=dt;
      if(t.ttl<=0){ if(t.fire) t.fire(); this.telegraphs.splice(i,1); }
    }

    // enemies AI + individual cooldown + low damage
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i];
      const dir = Math.atan2(this.player.y-e.y, this.player.x-e.x);
      const spd = 60*dt;
      this.moveWithCollide(e, Math.cos(dir)*spd, Math.sin(dir)*spd);
      if(Math.hypot(e.x-this.player.x, e.y-this.player.y)<14){
        if(!e._cd){ e._cd=0.7; this.player.hit(3, this); } // 3 dmg per hit
      }
      if(e._cd) e._cd-=dt;
      if(e.hp<=0){ this.enemies.splice(i,1); this.player.xp+=20; this.addFloater(e.x,e.y,'+20 XP','#93c5fd'); }
    }

    // floaters
    for(let i=this.floaters.length-1;i>=0;i--){
      const f=this.floaters[i]; f.ttl-=dt; f.y-=12*dt; if(f.ttl<=0) this.floaters.splice(i,1);
    }

    this.player.update(dt, this);
  }

  draw(ctx){
    // ground with color variation
    const g1='#0c1522', g2='#0b1b29';
    ctx.fillStyle=g1; ctx.fillRect(0,0,this.w,this.h);
    ctx.fillStyle=g2;
    for(let j=0;j<this.gh;j+=2){ for(let i=0;i<this.gw;i+=2){ ctx.fillRect(i*this.tile,j*this.tile,this.tile,this.tile); } }
    // obstacles
    for(let j=0;j<this.gh;j++){
      for(let i=0;i<this.gw;i++){
        if(this.map[j*this.gw+i]){
          ctx.fillStyle='#1b2135'; ctx.fillRect(i*this.tile,j*this.tile,this.tile,this.tile);
        }
      }
    }
    // telegraphs
    for(const t of this.telegraphs){
      ctx.strokeStyle='rgba(234,88,12,.85)'; ctx.lineWidth=3;
      if(t.type==='circle'){ ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(t.x+Math.cos(t.dir)*t.len, t.y+Math.sin(t.dir)*t.len); ctx.stroke(); }
    }
    // enemies & boss
    for(const e of this.enemies){ ctx.drawImage(ASSETS.slime, e.x-16, e.y-16, 32, 32); }
    if(this.boss){ ctx.drawImage(ASSETS.boss, this.boss.x-16, this.boss.y-16, 32, 32); }
    // player
    const bob=Math.sin(performance.now()/120)*1.5;
    ctx.drawImage(ASSETS[this.player.className]||ASSETS.warrior, this.player.x-16, this.player.y-16+bob, 32, 32);
    // floaters
    ctx.font='12px monospace'; ctx.textAlign='center';
    for(const f of this.floaters){ ctx.fillStyle=f.color; ctx.fillText(f.text, f.x, f.y); }
  }
}

export class Player{
  constructor(world){
    this.className='warrior';
    this.applyClass();
    this.dir=0; this.iframe=0; this.rollCD=0;
    this.x=world.tile*20; this.y=world.tile*20;
    this.xp=0; this.lv=1;
  }
  setClass(name){ this.className=name; this.applyClass(); }
  applyClass(){
    const c = CLASS_CFG[this.className]||CLASS_CFG.warrior;
    this.maxhp=c.hp; this.maxmp=c.mp; this.speed=c.speed;
    this.rollCooldown=c.rollCD; this.iframeDur=c.iframe;
    if(this.hp==null){ this.hp=this.maxhp; this.mp=this.maxmp; }
    else{ this.hp=Math.min(this.hp,this.maxhp); this.mp=Math.min(this.mp,this.maxmp); }
    this.updateHUD();
  }
  move(dx,dy,run,dt,world){
    if(dx||dy){ const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L; this.dir=Math.atan2(dy,dx); }
    const spd = this.speed * (run?1.5:1);
    world.moveWithCollide(this, dx*spd*dt, dy*spd*dt);
  }
  attack(world){
    const arc=Math.PI/2, reach=36, dmg=14;
    let hits=0;
    for(const e of world.enemies){
      const ang=Math.atan2(e.y-this.y,e.x-this.x);
      if(Math.abs(wrapAngle(ang - this.dir)) < arc/2 && dist(e,this)<=reach){
        e.hp-=dmg; hits++; world.addFloater(e.x,e.y,String(dmg),'#fca5a5');
      }
    }
    if(hits) log(`Slash hits ${hits}`);
  }
  dodge(world){
    if(this.rollCD>0) return;
    const dash=110;
    world.moveWithCollide(this, Math.cos(this.dir)*dash, Math.sin(this.dir)*dash);
    this.iframe = this.iframeDur; this.rollCD = this.rollCooldown;
    log(`Dodge (${this.className})`);
  }
  hit(d, world){
    if(this.iframe>0) return;
    this.hp = Math.max(0, this.hp - d);
    world.addFloater(this.x, this.y-18, '-'+d, '#f87171');
    if(this.hp===0){ this.hp = Math.floor(this.maxhp*0.7); this.x = 12*24; this.y = 12*24; log('You were defeated. Respawned.'); }
    this.updateHUD();
  }
  update(dt, world){
    if(this.iframe>0) this.iframe-=dt;
    if(this.rollCD>0) this.rollCD-=dt;
    while(this.xp>=100*this.lv){ this.xp-=100*this.lv; this.lv++; this.maxhp+=10; this.hp=this.maxhp; world.addFloater(this.x,this.y-18,'LEVEL UP','#86efac'); this.updateHUD(); }
    this.mp = Math.min(this.maxmp, (this.mp||0) + 4*dt);
    this.updateHUD();
  }
  updateHUD(){
    const hpnum=document.getElementById('hpNum'), mpnum=document.getElementById('mpNum');
    const hpbar=document.getElementById('hpbar'), mpbar=document.getElementById('mpbar'), xpbar=document.getElementById('xpbar');
    if(!hpbar) return;
    hpbar.style.width=(this.hp/this.maxhp*100).toFixed(1)+'%';
    mpbar.style.width=(this.mp/this.maxmp*100).toFixed(1)+'%';
    xpbar.style.width=(this.xp%100)+'%';
    if(hpnum) hpnum.textContent = `${Math.floor(this.hp)}/${this.maxhp}`;
    if(mpnum) mpnum.textContent = `${Math.floor(this.mp)}/${this.maxmp}`;
  }
}

export class Enemy{
  constructor(type,x,y){ this.type=type; this.x=x; this.y=y; this.hp=50; }
}

function log(m){ const el=document.getElementById('log'); if(el) el.textContent=(m+"\n"+el.textContent).slice(0,9000); }
