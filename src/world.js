// src/world.js
import { clamp, rand, dist, wrapAngle, ASSETS } from './engine.js';

/* ===== Class tuning (attack speed/dmg + dodge frames) ===== */
const CLASS_CFG = {
  warrior: { hp:190, mp:30,  speed:115, rollCD:1.0, iframe:0.45, atkDelay:0.55, baseDmg:22, scale:'STR' },
  ranger:  { hp:135, mp:40,  speed:132, rollCD:0.8, iframe:0.40, atkDelay:0.38, baseDmg:16, scale:'AGI' },
  mage:    { hp:115, mp:80,  speed:118, rollCD:0.9, iframe:0.40, atkDelay:0.60, baseDmg:10, scale:'INT' },
  rogue:   { hp:125, mp:35,  speed:146, rollCD:0.6, iframe:0.35, atkDelay:0.30, baseDmg:14, scale:'AGI' },
  cleric:  { hp:155, mp:95,  speed:118, rollCD:0.9, iframe:0.40, atkDelay:0.50, baseDmg:12, scale:'WIS' }
};

/* ===== Basic consumables ===== */
const ITEMS = {
  Potion: { type:'consumable', hp:60 },
  Ether:  { type:'consumable', mp:40 }
};

function log(m){ const el=document.getElementById('log'); if(el){ el.textContent=(m+"\n"+el.textContent).slice(0,9000); } }

/* ======================================================================= */
/*                                   World                                  */
/* ======================================================================= */
export class World {
  constructor(game){
    this.game = game;

    // Big world, 3 biomes
    this.tile = 24;
    this.gw = 120; this.gh = 70;
    this.w = this.tile * this.gw;
    this.h = this.tile * this.gh;

    this.enemies = [];
    this.telegraphs = [];  // {type:'circle'|'line'|'aim', ttl, fire?, ...}
    this.floaters = [];
    this.projectiles = [];
    this.chests = [];

    this.map = this.genMap();
    this.player = new Player(this);
    this.spawnInitial();

    // Boss as an enemy
    const boss = new Enemy('Boss', this.w*0.83, this.h*0.28);
    boss.isBoss = true; boss.hp = 1400; boss.speed = 48; boss.teleCd = 2.4;
    this.enemies.push(boss);

    this.hoverTarget = null;
  }

  /* -------------------- Map generation (biomes + tunnels) -------------------- */
  genMap(){
    const m = new Uint8Array(this.gw * this.gh); // 0 open, 1 wall

    // borders
    for(let x=0; x<this.gw; x++){ m[x]=1; m[(this.gh-1)*this.gw + x]=1; }
    for(let y=0; y<this.gh; y++){ m[y*this.gw]=1; m[y*this.gw + this.gw-1]=1; }

    const rect=(x,y,w,h)=>{ for(let j=y;j<y+h;j++){ for(let i=x;i<x+w;i++){ m[j*this.gw+i]=1; } } };

    // scatter walls to form runways
    for(let k=0;k<90;k++){ rect(rand(3,this.gw-12), rand(3,this.gh-10), rand(3,10), rand(2,8)); }

    // carve corridors
    for(let y=8; y<this.gh-8; y+=10){ for(let x=4; x<this.gw-4; x++){ m[y*this.gw+x]=0; } }
    for(let x=10; x<this.gw-10; x+=14){ for(let y=5; y<this.gh-5; y++){ m[y*this.gw+x]=0; } }

    // chests
    const chest=(tx,ty)=> this.chests.push({ x:tx*this.tile+12, y:ty*this.tile+12, opened:false });
    chest(this.gw-18,12); chest(this.gw-28,this.gh-16); chest(18,this.gh-20);

    return m;
  }

  // --- Map helpers (BUG-FREE) ---
  tileAt(x,y){
    const ti = Math.floor(x/this.tile);
    const tj = Math.floor(y/this.tile);
    if (ti<0 || tj<0 || ti>=this.gw || tj>=this.gh) return 1;
    return this.map[tj*this.gw + ti];
  }
  walkable(x,y){ return this.tileAt(x,y)===0; }
  moveWithCollide(o,dx,dy){
    let nx = o.x + dx, ny = o.y;
    if (this.walkable(nx, ny)) o.x = nx;
    ny = o.y + dy;
    if (this.walkable(o.x, ny)) o.y = ny;
  }

  biomeAt(x){ const t=this.w/3; return x<t ? 'meadow' : (x<2*t ? 'forest' : 'ruins'); }

  spawnInitial(){
    for(let i=0;i<26;i++){
      const x=rand(2,this.gw-3)*this.tile, y=rand(2,this.gh-3)*this.tile;
      if(!this.walkable(x,y)) continue;
      const b=this.biomeAt(x);
      const type = b==='meadow' ? 'Slime' : (b==='forest' ? (Math.random()<0.5?'Wolf':'Sprite') : (Math.random()<0.5?'Skeleton':'Sprite'));
      this.enemies.push(new Enemy(type,x,y));
    }
  }

  addFloater(x,y,text,color='#e5e7eb'){ this.floaters.push({x,y,text,color,ttl:1}); }

  dropLoot(e){
    this.addFloater(e.x,e.y,`${rand(3,10)}g`,'#facc15'); // gold (visual)
    if(Math.random()<0.30){ this.player.obtain('Potion'); this.addFloater(e.x,e.y,'Potion','#93c5fd'); }
    if(Math.random()<0.18){ this.player.obtain('Ether');  this.addFloater(e.x,e.y,'Ether','#93c5fd'); }
  }

  tryInteract(){
    const p=this.player;
    const c=this.chests.find(C=>!C.opened && Math.hypot(C.x-p.x,C.y-p.y)<=22);
    if(!c) return;
    c.opened=true;
    const drops=['Potion','Ether']; this.player.obtain(drops[rand(0,drops.length-1)]);
    this.addFloater(c.x,c.y,'Chest!','#a7f3d0'); log('You opened a chest.');
  }

  /* --------------------------------- Update -------------------------------- */
  update(dt){
    // expire telegraphs & trigger their fire()
    for(let i=this.telegraphs.length-1;i>=0;i--){
      const t=this.telegraphs[i]; t.ttl-=dt;
      if(t.ttl<=0){ if(typeof t.fire==='function') t.fire(); this.telegraphs.splice(i,1); }
    }

    // enemies (aggro & boss)
    const p=this.player;
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i];
      const dToP = Math.hypot(p.x-e.x, p.y-e.y);

      // stealth & detection
      const detectRadius = p.stealth>0 ? 0 : (e.isBoss ? 9999 : 240);
      if(!e.aggro && dToP < detectRadius) e.aggro = true;
      if(e.aggro && dToP > 380 && !e.isBoss) e.aggro = false;

      // move toward player if aggro
      if(e.aggro){
        const dir = Math.atan2(p.y-e.y, p.x-e.x);
        const sp = (e.isBoss? e.speed : 60) * dt;
        this.moveWithCollide(e, Math.cos(dir)*sp, Math.sin(dir)*sp);
      }

      // boss telegraphs
      if(e.isBoss){
        e.teleCd -= dt;
        if(e.teleCd <= 0){
          if(Math.random() < 0.5){
            const tel = {type:'circle', x:p.x, y:p.y, r:95, ttl:1.2, dmg:16};
            tel.fire = () => { if(Math.hypot(p.x-tel.x,p.y-tel.y) < tel.r) p.hit(tel.dmg,this); };
            this.telegraphs.push(tel);
          }else{
            const d = Math.atan2(p.y-e.y, p.x-e.x);
            const tel = {type:'line', x:e.x, y:e.y, dir:d, len:300, ttl:1.1, dmg:20};
            tel.fire = () => {
              const ax=tel.x, ay=tel.y, bx=ax+Math.cos(d)*tel.len, by=ay+Math.sin(d)*tel.len;
              const px=p.x, py=p.y;
              const u = Math.max(0, Math.min(1, ((px-ax)*(bx-ax) + (py-ay)*(by-ay)) / ((bx-ax)**2 + (by-ay)**2) ));
              const cx=ax+(bx-ax)*u, cy=ay+(by-ay)*u;
              if(Math.hypot(px-cx,py-cy) < 14) p.hit(tel.dmg,this);
            };
            this.telegraphs.push(tel);
          }
          e.teleCd = 2.8;
        }
      }

      // contact damage (soft)
      if(dToP < 14){ if(!e._cd){ e._cd=0.7; p.hit(e.isBoss?8:3,this); } }
      if(e._cd) e._cd -= dt;

      if(e.hp <= 0){
        this.dropLoot(e);
        this.enemies.splice(i,1);
        p.xp += e.isBoss ? 400 : 24;
        this.addFloater(e.x,e.y, e.isBoss?'+BOSS!':'+24 XP', '#93c5fd');
      }
    }

    // hover target under mouse
    const m=this.game.mouse; let closest=null, best=28;
    for(const e of this.enemies){
      const d = Math.hypot(e.x-m.wx, e.y-m.wy);
      if(d < best){ best=d; closest=e; }
    }
    this.hoverTarget = closest;

    // projectiles (respect range via life)
    for(let i=this.projectiles.length-1;i>=0;i--){
      const pr=this.projectiles[i];
      pr.life -= dt; if(pr.life <= 0){ this.projectiles.splice(i,1); continue; }
      pr.x += pr.vx*dt; pr.y += pr.vy*dt;

      // hit enemies
      for(const e of this.enemies){
        if(Math.hypot(e.x-pr.x, e.y-pr.y) < (pr.radius||12)){
          e.hp -= pr.dmg;
          this.addFloater(e.x,e.y,String(pr.dmg), pr.color||'#fca5a5');
          if(!pr.pierce){ this.projectiles.splice(i,1); }
          break;
        }
      }
      // walls block non‑piercing
      if(i < this.projectiles.length && !this.walkable(pr.x,pr.y) && !pr.pierce){
        this.projectiles.splice(i,1);
      }
    }

    // floaters
    for(let i=this.floaters.length-1;i>=0;i--){
      const f=this.floaters[i]; f.ttl -= dt; f.y -= 12*dt;
      if(f.ttl <= 0) this.floaters.splice(i,1);
    }

    // player tick
    this.player.update(dt,this);
  }

  /* ---------------------------------- Draw --------------------------------- */
  draw(ctx, mouse){
    // biomes tint
    const third=this.w/3;
    const tint=(x0,x1,c1,c2)=>{
      ctx.fillStyle=c1; ctx.fillRect(x0,0,x1-x0,this.h);
      ctx.fillStyle=c2;
      for(let j=0;j<this.gh;j+=2){
        for(let i=Math.floor(x0/this.tile); i<Math.floor(x1/this.tile); i+=2){
          ctx.fillRect(i*this.tile, j*this.tile, this.tile, this.tile);
        }
      }
    };
    tint(0,third,'#0c1522','#0b1b29');
    tint(third,2*third,'#0d1a18','#0b211a');
    tint(2*third,this.w,'#0b1220','#0a1526');

    // walls
    for(let j=0;j<this.gh;j++){
      for(let i=0;i<this.gw;i++){
        if(this.map[j*this.gw+i]){
          ctx.fillStyle='#1b2135';
          ctx.fillRect(i*this.tile,j*this.tile,this.tile,this.tile);
        }
      }
    }

    // telegraphs
    ctx.lineWidth=3; ctx.strokeStyle='rgba(234,88,12,.85)';
    for(const t of this.telegraphs){
      if(t.type==='circle'){ ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2); ctx.stroke(); }
      else if(t.type==='line'){ ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(t.x+Math.cos(t.dir)*t.len, t.y+Math.sin(t.dir)*t.len); ctx.stroke(); }
      else if(t.type==='aim'){ ctx.beginPath(); ctx.arc(mouse.wx,mouse.wy,10,0,Math.PI*2); ctx.stroke(); }
    }

    // chests
    for(const c of this.chests){
      ctx.fillStyle = c.opened ? '#8b5cf6' : '#eab308';
      ctx.fillRect(c.x-8, c.y-6, 16, 12);
    }

    // enemies
    for(const e of this.enemies){
      if(this.hoverTarget===e){
        ctx.strokeStyle='#fde68a'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(e.x,e.y,14,0,Math.PI*2); ctx.stroke();
      }
      ctx.drawImage(e.isBoss?ASSETS.boss:ASSETS.slime, e.x-16, e.y-16, 32, 32);
      if(e.isBoss){
        ctx.fillStyle='#1f2937'; ctx.fillRect(e.x-26,e.y-24,52,4);
        ctx.fillStyle='#ef4444'; ctx.fillRect(e.x-26,e.y-24, clamp(e.hp/1400,0,1)*52,4);
      }
    }

    // projectiles
    for(const pr of this.projectiles){
      ctx.fillStyle=pr.color||'#fca5a5';
      ctx.beginPath(); ctx.arc(pr.x,pr.y, pr.dot||3, 0, Math.PI*2); ctx.fill();
    }

    // player
    const bob=Math.sin(performance.now()/120)*1.5;
    ctx.drawImage(ASSETS[this.player.className]||ASSETS.warrior, this.player.x-16, this.player.y-16+bob, 32, 32);

    // reticle
    ctx.strokeStyle='rgba(125,211,252,.9)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(mouse.wx,mouse.wy,8,0,Math.PI*2); ctx.stroke();

    // floaters
    ctx.font='12px monospace'; ctx.textAlign='center';
    for(const f of this.floaters){ ctx.fillStyle=f.color; ctx.fillText(f.text,f.x,f.y); }
  }
}

/* ======================================================================= */
/*                                  Player                                  */
/* ======================================================================= */
export class Player {
  constructor(world){
    // random spawn per class/biome (start near thirds)
    this.className = 'warrior';
    const spawnThird = ['warrior','cleric'].includes(this.className)?0 : (['ranger','rogue'].includes(this.className)?1:2);
    const thirdX = world.w/3 * (spawnThird + 0.5);
    this.x = clamp(thirdX + rand(-80,80), 40, world.w-40);
    this.y = clamp(world.h*0.6 + rand(-80,80), 40, world.h-40);

    // attributes & points
    this.base = { STR:6, AGI:6, INT:6, VIT:6, WIS:6 };
    this.points = 5;

    this.dir=0; this.iframe=0; this.rollCD=0; this.atkTimer=0;
    this.xp=0; this.lv=1; this.cooldowns={}; this.inv={}; this.stealth=0;

    this.applyClass();
    this.updateStatsUI(); this.updateSkillsUI();
  }

  setClass(n){ this.className=n; this.applyClass(); this.updateStatsUI(); this.updateSkillsUI(); }

  computeDerived(){
    const C = CLASS_CFG[this.className]||CLASS_CFG.warrior;
    return {
      hp:    C.hp + this.base.VIT*8,
      mp:    C.mp + this.base.WIS*6,
      speed: C.speed + Math.floor(this.base.AGI*1.5),
      atkDelay: Math.max(0.18, C.atkDelay - this.base.AGI*0.01)
    };
  }

  applyClass(){
    const C = CLASS_CFG[this.className]||CLASS_CFG.warrior;
    const D = this.computeDerived();
    this.maxhp=D.hp; this.maxmp=D.mp; this.speed=D.speed;
    this.rollCooldown=C.rollCD; this.iframeDur=C.iframe;
    this.atkDelay=D.atkDelay; this.baseDmg=C.baseDmg; this.scale=C.scale;
    if(this.hp==null){ this.hp=this.maxhp; this.mp=this.maxmp; } else { this.hp=Math.min(this.hp,this.maxhp); this.mp=Math.min(this.mp,this.maxmp); }
    this.updateHUD();
  }

  obtain(name){ this.inv[name]=(this.inv[name]||0)+1; log(`Got ${name}`); }

  // --- Stats UI ---
  addStat(k){ if(this.points<=0) return; this.base[k]++; this.points--; this.applyClass(); this.updateStatsUI(); }
  resetStats(){ this.base={STR:6,AGI:6,INT:6,VIT:6,WIS:6}; this.points=5; this.applyClass(); this.updateStatsUI(); }
  updateStatsUI(){
    const box=document.getElementById('statsBox'); if(!box) return;
    box.innerHTML = `
      <div>Class: <b>${this.className.toUpperCase()}</b> • Points: <b>${this.points}</b></div>
      <div class="muted" style="margin:6px 0 8px">VIT→HP (+8) • WIS→MP (+6) • AGI→Speed/Atk • STR/INT scale dmg (by class)</div>
      <div>STR: ${this.base.STR} • AGI: ${this.base.AGI} • INT: ${this.base.INT} • VIT: ${this.base.VIT} • WIS: ${this.base.WIS}</div>
      <div>HP: ${this.hp|0}/${this.maxhp} • MP: ${this.mp|0}/${this.maxmp} • Move: ${this.speed|0}</div>
    `;
    document.getElementById('btnAddSTR')?.onclick=()=>this.addStat('STR');
    document.getElementById('btnAddAGI')?.onclick=()=>this.addStat('AGI');
    document.getElementById('btnAddINT')?.onclick=()=>this.addStat('INT');
    document.getElementById('btnAddVIT')?.onclick=()=>this.addStat('VIT');
    document.getElementById('btnAddWIS')?.onclick=()=>this.addStat('WIS');
    document.getElementById('btnResetStats')?.onclick=()=>this.resetStats();
  }

  // --- Skills ---
  skills(){
    const far=520, long=420, mid=280;
    return {
      warrior:[
        {slot:1,name:'Cleave',      cost:0,  cd:4.0, type:'melee', range:40},
        {slot:2,name:'Guard Dash',  cost:0,  cd:6.0, type:'dash',  range:80},
      ],
      ranger:[
        {slot:1,name:'Aimed Shot',  cost:6,  cd:0.9, type:'shot', speed:360, range:far,  dmg:18, color:'#a7f3d0'},
        {slot:2,name:'Snare Trap',  cost:8,  cd:4.0, type:'trap', range:70,  dmg:14},
      ],
      mage:[
        {slot:1,name:'Fireball',    cost:14, cd:1.5, type:'shot', speed:320, range:long, dmg:28, color:'#fb7185', cast:0.45},
        {slot:2,name:'Ice Nova',    cost:18, cd:8.0, type:'nova', range:70,  dmg:18, cast:0.55, cc:'slow'},
        {slot:3,name:'Chain Bolt',  cost:20, cd:6.0, type:'line', range:mid, dmg:24, cast:0.50},
      ],
      rogue:[
        {slot:1,name:'Dagger Toss', cost:4,  cd:0.7, type:'shot', speed:380, range:mid,  dmg:16, color:'#f59e0b', crit:true},
        {slot:2,name:'Vanish',      cost:6,  cd:10.0,type:'stealth', duration:1.8},
      ],
      cleric:[
        {slot:1,name:'Heal',        cost:10, cd:2.8, type:'heal', amount:36},
        {slot:2,name:'Ward',        cost:8,  cd:8.0, type:'ward', duration:0.8},
        {slot:3,name:'Smite',       cost:10, cd:4.5, type:'nova', range:60, dmg:16},
      ]
    }[this.className];
  }

  updateSkillsUI(){
    const box=document.getElementById('skillsList'); if(!box) return;
    const list=this.skills();
    box.innerHTML = list.map(s=>{
      const cd=this.cooldowns[s.slot]||0;
      const right = `${s.cost?`${s.cost} MP`:'—'}${cd>0?` • ${cd.toFixed(1)}s`:''}`;
      return `<div style="display:flex;justify-content:space-between"><span>[${s.slot}] ${s.name}</span><span class="muted">${right}</span></div>`;
    }).join('');
  }

  // movement
  move(dx,dy,run,dt,world){
    if(dx||dy){ const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L; this.dir=Math.atan2(dy,dx); }
    const sp=this.speed*(run?1.5:1); world.moveWithCollide(this, dx*sp*dt, dy*sp*dt);
  }

  // basic melee
  attack(world){
    if(this.atkTimer>0) return; this.atkTimer=this.atkDelay;
    const arc=Math.PI/2, reach=36, dmg=this.scaledDamage(1.0);
    let hits=0;
    const t=world.hoverTarget;
    if(t && Math.hypot(t.x-this.x,t.y-this.y)<=reach){ t.hp-=dmg; hits++; world.addFloater(t.x,t.y,String(dmg),'#fca5a5'); }
    else{
      for(const e of world.enemies){
        const a=Math.atan2(e.y-this.y,e.x-this.x);
        if(Math.abs(wrapAngle(a-this.dir))<arc/2 && dist(e,this)<=reach){ e.hp-=dmg; hits++; world.addFloater(e.x,e.y,String(dmg),'#fca5a5'); }
      }
    }
    if(hits) log(`Hit x${hits}`);
  }

  cast(slot, world, mouse){
    const skill=this.skills().find(s=>s.slot===slot); if(!skill) return;
    if((this.cooldowns[slot]||0) > 0) { log(`${skill.name} cooling down`); return; }
    if((skill.cost||0) > this.mp){ log('Not enough MP'); return; }

    const aimDir=Math.atan2(mouse.wy-this.y, mouse.wx-this.x);

    const fire=()=>{
      // pay cost, start cooldown
      this.mp -= (skill.cost||0);
      this.cooldowns[slot] = skill.cd || 0;
      this.updateHUD(); this.updateSkillsUI();

      if(skill.type==='shot'){
        const speed=skill.speed||320, range=skill.range||300;
        const life = range / speed;
        const dmg = this.scaledDamage((skill.dmg||16)/16);
        world.projectiles.push({
          x:this.x+Math.cos(aimDir)*14, y:this.y+Math.sin(aimDir)*14,
          vx:Math.cos(aimDir)*speed, vy:Math.sin(aimDir)*speed,
          dmg, life, color:skill.color, dot:3, radius:12
        });
      }else if(skill.type==='line'){
        const len=skill.range||260, dmg=this.scaledDamage((skill.dmg||24)/16);
        const ax=this.x, ay=this.y, bx=ax+Math.cos(aimDir)*len, by=ay+Math.sin(aimDir)*len;
        for(const e of world.enemies){
          const u=Math.max(0,Math.min(1,((e.x-ax)*(bx-ax)+(e.y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
          const cx=ax+(bx-ax)*u, cy=ay+(by-ay)*u;
          if(Math.hypot(e.x-cx,e.y-cy) < 12){ e.hp-=dmg; world.addFloater(e.x,e.y,String(dmg),'#fde68a'); }
        }
      }else if(skill.type==='nova'){
        const r=skill.range||60, dmg=this.scaledDamage((skill.dmg||16)/16); let n=0;
        for(const e of world.enemies){
          if(Math.hypot(e.x-this.x,e.y-this.y) <= r){ e.hp-=dmg; n++; world.addFloater(e.x,e.y,String(dmg),'#a7f3d0'); }
        }
        if(skill.cc==='slow'){ /* hook for slow */ }
      }else if(skill.type==='trap'){
        const tx=mouse.wx, ty=mouse.wy;
        if(Math.hypot(tx-this.x, ty-this.y) <= (skill.range||70)){
          const dmg=this.scaledDamage((skill.dmg||14)/16);
          for(const e of world.enemies){ if(Math.hypot(e.x-tx,e.y-ty)<26){ e.hp-=dmg; world.addFloater(e.x,e.y,String(dmg),'#a7f3d0'); } }
        }
      }else if(skill.type==='heal'){
        const amt=skill.amount||30; this.hp=Math.min(this.maxhp,this.hp+amt); world.addFloater(this.x,this.y-18,'+'+amt,'#86efac');
      }else if(skill.type==='ward'){
        this.iframe=Math.max(this.iframe, skill.duration||0.8); log('Ward up');
      }else if(skill.type==='stealth'){
        this.stealth=Math.max(this.stealth, skill.duration||1.8); log('Vanish!');
      }else if(skill.type==='dash'){
        const dash=90; world.moveWithCollide(this, Math.cos(this.dir)*dash, Math.sin(this.dir)*dash);
      }
    };

    const castTime = skill.cast || (this.className==='mage' ? 0.35 : this.className==='cleric' ? 0.25 : 0.10);
    if(skill.type==='shot' || skill.type==='line'){ world.telegraphs.push({type:'aim', ttl:castTime, fire}); }
    else if(skill.type==='nova'){ world.telegraphs.push({type:'circle', x:this.x,y:this.y, r:skill.range||60, ttl:castTime, fire}); }
    else { world.telegraphs.push({type:'aim', ttl:castTime, fire}); }
  }

  scaledDamage(mult){
    const base=this.baseDmg;
    const stat = this.scale==='STR'? this.base.STR :
                 this.scale==='AGI'? this.base.AGI :
                 this.scale==='INT'? this.base.INT : this.base.WIS;
    return Math.floor(base * mult * (1 + stat*0.05));
  }

  dodge(world){
    if(this.rollCD>0) return;
    const dash=110; world.moveWithCollide(this, Math.cos(this.dir)*dash, Math.sin(this.dir)*dash);
    this.iframe=this.iframeDur; this.rollCD=this.rollCooldown;
    log(`Dodge (${this.className})`);
  }

  hit(d, world){
    if(this.iframe>0) return;
    this.hp = Math.max(0, this.hp - d);
    world.addFloater(this.x, this.y-18, '-'+d, '#f87171');
    if(this.hp===0){ this.hp = Math.floor(this.maxhp*0.7); this.x=12*24; this.y=12*24; log('You were defeated. Respawned.'); }
    this.updateHUD();
  }

  update(dt, world){
    if(this.iframe>0) this.iframe-=dt;
    if(this.rollCD>0) this.rollCD-=dt;
    if(this.atkTimer>0) this.atkTimer-=dt;
    if(this.stealth>0) this.stealth-=dt;

    // cooldowns tick
    let changed=false;
    for(const k of Object.keys(this.cooldowns)){
      if(this.cooldowns[k]>0){ this.cooldowns[k]-=dt; if(this.cooldowns[k]<0) this.cooldowns[k]=0; changed=true; }
    }
    if(changed) this.updateSkillsUI();

    while(this.xp >= 100*this.lv){
      this.xp -= 100*this.lv; this.lv++; this.points += 2;
      this.applyClass(); world.addFloater(this.x,this.y-18,'LEVEL UP','#86efac');
    }

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
    if(hpnum) hpnum.textContent=`${Math.floor(this.hp)}/${this.maxhp}`;
    if(mpnum) mpnum.textContent=`${Math.floor(this.mp)}/${this.maxmp}`;
  }
}

/* ======================================================================= */
/*                                  Enemy                                   */
/* ======================================================================= */
export class Enemy{
  constructor(type,x,y){
    this.type=type; this.x=x; this.y=y;
    this.hp = (type==='Boss') ? 1400 : 60;
    this.speed = 60;
    this.aggro = false;
  }
}
