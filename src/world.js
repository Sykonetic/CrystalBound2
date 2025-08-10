// src/world.js
import { clamp, rand, dist, wrapAngle, ASSETS } from './engine.js';

/* ===== Class tuning (attack speed/dmg + dodge frames) ===== */
const CLASS_CFG = {
  warrior: { hp:190, mp:30,  speed:115, rollCD:1.0, iframe:0.45, atkDelay:0.55, baseDmg:22 },
  ranger:  { hp:135, mp:40,  speed:132, rollCD:0.8, iframe:0.40, atkDelay:0.38, baseDmg:16 },
  mage:    { hp:115, mp:80,  speed:118, rollCD:0.9, iframe:0.40, atkDelay:0.52, baseDmg:10 },
  rogue:   { hp:125, mp:35,  speed:146, rollCD:0.6, iframe:0.35, atkDelay:0.30, baseDmg:14 },
  cleric:  { hp:155, mp:95,  speed:118, rollCD:0.9, iframe:0.40, atkDelay:0.50, baseDmg:12 }
};

/* ===== Simple item table for drops/consumables ===== */
const ITEMS = {
  Potion: { type:'consumable', hp:60 },
  Ether:  { type:'consumable', mp:40 },
  WBlade: { type:'gear', cls:'warrior', atk:6 },
  Bow:    { type:'gear', cls:'ranger',  atk:5 },
  Staff:  { type:'gear', cls:'mage',    matk:7 },
  Dagger: { type:'gear', cls:'rogue',   atk:4, cr:5 },
  Mace:   { type:'gear', cls:'cleric',  atk:4, heal:5 }
};

function log(m){
  const el = document.getElementById('log');
  if (el) el.textContent = (m + "\n" + el.textContent).slice(0, 9000);
}

/* ======================================================================= */
/*                                   World                                  */
/* ======================================================================= */
export class World {
  constructor(game){
    this.game = game;

    // Bigger world
    this.tile = 24;
    this.gw = 120;
    this.gh = 70;
    this.w = this.tile * this.gw;
    this.h = this.tile * this.gh;

    this.enemies = [];
    this.telegraphs = [];     // also used for spell cast indicators
    this.floaters = [];
    this.projectiles = [];
    this.chests = [];

    this.map = this.genMap();
    this.player = new Player(this);

    this.spawnInitial();
    this.boss = { x: this.w * 0.83, y: this.h * 0.28, hp: 1600, cd: 2.6 };

    this.hoverTarget = null;  // enemy under cursor
  }

  /* -------------------- Map generation (biomes + tunnels) -------------------- */
  genMap(){
    const m = new Uint8Array(this.gw * this.gh); // 0 open, 1 wall

    // borders
    for (let x = 0; x < this.gw; x++) { m[x] = 1; m[(this.gh - 1) * this.gw + x] = 1; }
    for (let y = 0; y < this.gh; y++) { m[y * this.gw] = 1; m[y * this.gw + this.gw - 1] = 1; }

    const rect = (x,y,w,h)=>{ for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) m[j*this.gw+i]=1; };

    // scatter walls to form runways
    for (let k = 0; k < 90; k++) {
      rect(rand(3, this.gw - 12), rand(3, this.gh - 10), rand(3, 10), rand(2, 8));
    }

    // carve long corridors (horizontal / vertical)
    for (let y = 8; y < this.gh - 8; y += 10) {
      for (let x = 4; x < this.gw - 4; x++) m[y * this.gw + x] = 0;
    }
    for (let x = 10; x < this.gw - 10; x += 14) {
      for (let y = 5; y < this.gh - 5; y++) m[y * this.gw + x] = 0;
    }

    // chests tucked away in runways
    const chest = (tx,ty)=> this.chests.push({ x: tx * this.tile + 12, y: ty * this.tile + 12, opened:false });
    chest(this.gw - 18, 12);
    chest(this.gw - 28, this.gh - 16);
    chest(18, this.gh - 20);

    return m;
  }

  // --- map helpers (FIXED) ---
  tileAt(x, y) {
    const ti = Math.floor(x / this.tile);
    const tj = Math.floor(y / this.tile);
    if (ti < 0 || tj < 0 || ti >= this.gw || tj >= this.gh) return 1; // outside = wall
    return this.map[tj * this.gw + ti];
  }

  walkable(x, y) { return this.tileAt(x, y) === 0; }

  moveWithCollide(obj, dx, dy) {
    let nx = obj.x + dx, ny = obj.y;
    if (this.walkable(nx, ny)) obj.x = nx;
    ny = obj.y + dy;
    if (this.walkable(obj.x, ny)) obj.y = ny;
  }

  /* -------------------------- Spawning & biomes -------------------------- */
  biomeAt(x) {
    const t = this.w / 3;
    if (x < t) return 'meadow';
    if (x < 2 * t) return 'forest';
    return 'ruins';
  }

  spawnInitial(){
    for (let i = 0; i < 26; i++) {
      const x = rand(2, this.gw - 3) * this.tile;
      const y = rand(2, this.gh - 3) * this.tile;
      if (!this.walkable(x, y)) continue;

      const b = this.biomeAt(x);
      const type =
        b === 'meadow' ? 'Slime' :
        b === 'forest' ? (Math.random() < 0.5 ? 'Wolf' : 'Sprite') :
                         (Math.random() < 0.5 ? 'Skeleton' : 'Sprite');

      this.enemies.push(new Enemy(type, x, y));
    }
  }

  /* --------------------------- Interactions/loot -------------------------- */
  addFloater(x, y, text, color = '#e5e7eb') {
    this.floaters.push({ x, y, text, color, ttl: 1 });
  }

  dropLoot(e){
    // gold (visual only)
    const gold = rand(3, 10);
    this.addFloater(e.x, e.y, `${gold}g`, '#facc15');

    // potions
    if (Math.random() < 0.25) { this.player.obtain('Potion'); this.addFloater(e.x,e.y,'Potion','#93c5fd'); }
    if (Math.random() < 0.15) { this.player.obtain('Ether');  this.addFloater(e.x,e.y,'Ether','#93c5fd'); }

    // rare class gear
    if (Math.random() < 0.07) {
      const pool = ['WBlade','Bow','Staff','Dagger','Mace'];
      const it = pool[rand(0, pool.length - 1)];
      this.player.obtain(it);
      this.addFloater(e.x, e.y, it, '#93c5fd');
    }
  }

  tryInteract(){
    // open chest near player
    const p = this.player;
    const c = this.chests.find(c => !c.opened && Math.hypot(c.x - p.x, c.y - p.y) <= 22);
    if (!c) return;
    c.opened = true;
    const drops = ['Potion', 'Ether'];
    this.player.obtain(drops[rand(0, drops.length - 1)]);
    this.addFloater(c.x, c.y, 'Chest!', '#a7f3d0');
    log('You opened a chest.');
  }

  /* --------------------------------- Tick -------------------------------- */
  update(dt){
    // Boss telegraphs
    if (this.boss) {
      this.boss.cd -= dt;
      if (this.boss.cd <= 0) {
        if (Math.random() < 0.5) {
          const t = { type:'circle', x:this.player.x, y:this.player.y, r:95, ttl:1.2, dmg:14 };
          t.fire = () => { if (dist({x:t.x,y:t.y}, this.player) < t.r) this.player.hit(t.dmg, this); };
          this.telegraphs.push(t);
        } else {
          const d = Math.atan2(this.player.y - this.boss.y, this.player.x - this.boss.x);
          const t = { type:'line', x:this.boss.x, y:this.boss.y, dir:d, len:280, ttl:1.1, dmg:18 };
          t.fire = () => {
            const ax=t.x, ay=t.y, bx=t.x+Math.cos(d)*t.len, by=t.y+Math.sin(d)*t.len;
            const px=this.player.x, py=this.player.y;
            const u = Math.max(0, Math.min(1, ((px-ax)*(bx-ax) + (py-ay)*(by-ay)) / ((bx-ax)**2 + (by-ay)**2) ));
            const cx = ax + (bx-ax)*u, cy = ay + (by-ay)*u;
            if (Math.hypot(px - cx, py - cy) < 14) this.player.hit(t.dmg, this);
          };
          this.telegraphs.push(t);
        }
        this.boss.cd = 2.8;
      }
    }

    // expire telegraphs (boss + spell indicators)
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.ttl -= dt;
      if (t.ttl <= 0) { if (t.fire) t.fire(); this.telegraphs.splice(i, 1); }
    }

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const sp = 60 * dt;
      this.moveWithCollide(e, Math.cos(d) * sp, Math.sin(d) * sp);

      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 14) {
        if (!e._cd) { e._cd = 0.7; this.player.hit(3, this); } // softer dmg
      }
      if (e._cd) e._cd -= dt;

      if (e.hp <= 0) {
        this.dropLoot(e);
        this.enemies.splice(i, 1);
        this.player.xp += 24;
        this.addFloater(e.x, e.y, '+24 XP', '#93c5fd');
      }
    }

    // hover target
    const m = this.game.mouse;
    let best = null, bd = 28;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - m.wx, e.y - m.wy);
      if (d < bd) { bd = d; best = e; }
    }
    this.hoverTarget = best;

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { this.projectiles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;

      // hit enemies
      for (const e of this.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < 12) {
          e.hp -= p.dmg;
          this.addFloater(e.x, e.y, String(p.dmg), p.color || '#fca5a5');
          this.projectiles.splice(i, 1);
          break;
        }
      }
      // walls stop shots
      if (i < this.projectiles.length && !this.walkable(p.x, p.y)) this.projectiles.splice(i, 1);
    }

    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.ttl -= dt; f.y -= 12 * dt;
      if (f.ttl <= 0) this.floaters.splice(i, 1);
    }

    this.player.update(dt, this);
  }

  /* --------------------------------- Draw -------------------------------- */
  draw(ctx, mouse){
    // three biome background tints
    const third = this.w / 3;
    const drawBG = (x0, x1, c1, c2) => {
      ctx.fillStyle = c1; ctx.fillRect(x0, 0, x1 - x0, this.h);
      ctx.fillStyle = c2;
      for (let j = 0; j < this.gh; j += 2) {
        for (let i = Math.floor(x0 / this.tile); i < Math.floor(x1 / this.tile); i += 2) {
          ctx.fillRect(i * this.tile, j * this.tile, this.tile, this.tile);
        }
      }
    };
    drawBG(0, third,        '#0c1522', '#0b1b29'); // meadow
    drawBG(third, 2*third,  '#0d1a18', '#0b211a'); // forest
    drawBG(2*third, this.w, '#0b1220', '#0a1526'); // ruins

    // walls
    for (let j = 0; j < this.gh; j++)
      for (let i = 0; i < this.gw; i++)
        if (this.map[j * this.gw + i]) {
          ctx.fillStyle = '#1b2135';
          ctx.fillRect(i * this.tile, j * this.tile, this.tile, this.tile);
        }

    // telegraphs
    ctx.lineWidth = 3;
    for (const t of this.telegraphs) {
      ctx.strokeStyle = 'rgba(234,88,12,.85)';
      if (t.type === 'circle') { ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke(); }
      else if (t.type === 'line') { ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(t.dir) * t.len, t.y + Math.sin(t.dir) * t.len); ctx.stroke(); }
      else if (t.type === 'aim') { ctx.beginPath(); ctx.arc(mouse.wx, mouse.wy, 10, 0, Math.PI * 2); ctx.stroke(); }
    }

    // chests
    for (const c of this.chests) {
      ctx.fillStyle = c.opened ? '#8b5cf6' : '#eab308';
      ctx.fillRect(c.x - 8, c.y - 6, 16, 12);
    }

    // enemies
    for (const e of this.enemies) {
      if (this.hoverTarget === e) {
        ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, 14, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.drawImage(ASSETS.slime, e.x - 16, e.y - 16, 32, 32);
    }

    // boss
    if (this.boss) ctx.drawImage(ASSETS.boss, this.boss.x - 16, this.boss.y - 16, 32, 32);

    // projectiles
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color || '#fca5a5';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // player
    const bob = Math.sin(performance.now() / 120) * 1.5;
    ctx.drawImage(ASSETS[this.player.className] || ASSETS.warrior, this.player.x - 16, this.player.y - 16 + bob, 32, 32);

    // reticle
    ctx.strokeStyle = 'rgba(125,211,252,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouse.wx, mouse.wy, 8, 0, Math.PI * 2); ctx.stroke();

    // floaters
    ctx.font = '12px monospace'; ctx.textAlign = 'center';
    for (const f of this.floaters) { ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
  }
}

/* ======================================================================= */
/*                                  Player                                  */
/* ======================================================================= */
export class Player {
  constructor(world){
    this.className = 'warrior';
    this.applyClass();
    this.x = world.tile * 12;
    this.y = world.tile * 20;
    this.dir = 0;

    this.iframe = 0;
    this.rollCD = 0;
    this.atkTimer = 0;
    this.xp = 0;
    this.lv = 1;

    this.inv = {}; // simple counts per item key
  }

  setClass(n){ this.className = n; this.applyClass(); }

  applyClass(){
    const c = CLASS_CFG[this.className] || CLASS_CFG.warrior;
    this.maxhp = c.hp; this.maxmp = c.mp; this.speed = c.speed;
    this.rollCooldown = c.rollCD; this.iframeDur = c.iframe;
    this.atkDelay = c.atkDelay; this.baseDmg = c.baseDmg;

    if (this.hp == null) { this.hp = this.maxhp; this.mp = this.maxmp; }
    else { this.hp = Math.min(this.hp, this.maxhp); this.mp = Math.min(this.mp, this.maxmp); }

    this.updateHUD();
  }

  obtain(name){ this.inv[name] = (this.inv[name] || 0) + 1; log(`Got ${name}`); }

  use(name){
    if (!this.inv[name]) return log(`No ${name}.`);
    const it = ITEMS[name]; if (!it) return;
    if (it.hp) this.hp = Math.min(this.maxhp, this.hp + it.hp);
    if (it.mp) this.mp = Math.min(this.maxmp, this.mp + it.mp);
    this.inv[name]--; log(`Used ${name}`);
    this.updateHUD();
  }

  move(dx,dy,run,dt,world){
    if (dx || dy) { const L = Math.hypot(dx,dy) || 1; dx/=L; dy/=L; this.dir = Math.atan2(dy,dx); }
    const sp = this.speed * (run ? 1.5 : 1);
    world.moveWithCollide(this, dx * sp * dt, dy * sp * dt);
  }

  attack(world){
    if (this.atkTimer > 0) return; this.atkTimer = this.atkDelay;
    const arc = Math.PI/2, reach = 36, dmg = this.baseDmg;
    let hits = 0;

    const t = world.hoverTarget;
    if (t && Math.hypot(t.x - this.x, t.y - this.y) <= reach) {
      t.hp -= dmg; hits++; world.addFloater(t.x, t.y, String(dmg), '#fca5a5');
    } else {
      for (const e of world.enemies) {
        const a = Math.atan2(e.y - this.y, e.x - this.x);
        if (Math.abs(wrapAngle(a - this.dir)) < arc/2 && dist(e,this) <= reach) {
          e.hp -= dmg; hits++; world.addFloater(e.x, e.y, String(dmg), '#fca5a5');
        }
      }
    }
    if (hits) log(`Hit x${hits}`);
  }

  cast(slot, world, mouse){
    // show a brief telegraph; when it expires we "fire" the skill
    const aimDir = Math.atan2(mouse.wy - this.y, mouse.wx - this.x);

    const fire = (info) => {
      if (this.className === 'mage') {
        if (slot === 1) { // Fireball
          const speed = 320, dmg = 28;
          world.projectiles.push({
            x: this.x + Math.cos(aimDir) * 14,
            y: this.y + Math.sin(aimDir) * 14,
            vx: Math.cos(aimDir) * speed, vy: Math.sin(aimDir) * speed,
            dmg, life: 2, color: '#fb7185'
          });
        } else if (slot === 2) { // Ice nova
          const r = 70, dmg = 18;
          for (const e of world.enemies) {
            if (Math.hypot(e.x - info.x, e.y - info.y) <= r) {
              e.hp -= dmg; world.addFloater(e.x, e.y, String(dmg), '#93c5fd');
            }
          }
        } else if (slot === 3) { // Lightning line
          const len = 220, dmg = 24, ax = this.x, ay = this.y;
          const bx = ax + Math.cos(aimDir) * len, by = ay + Math.sin(aimDir) * len;
          for (const e of world.enemies) {
            const u = Math.max(0, Math.min(1, ((e.x-ax)*(bx-ax) + (e.y-ay)*(by-ay)) / ((bx-ax)**2 + (by-ay)**2) ));
            const cx = ax + (bx-ax) * u, cy = ay + (by-ay) * u;
            if (Math.hypot(e.x - cx, e.y - cy) < 12) { e.hp -= dmg; world.addFloater(e.x, e.y, String(dmg), '#fde68a'); }
          }
        } else if (slot === 4) {
          this.use('Ether');
        }
      } else if (this.className === 'cleric') {
        if (slot === 1) { const heal = 36; this.hp = Math.min(this.maxhp, this.hp + heal); world.addFloater(this.x, this.y - 18, '+' + heal, '#86efac'); this.updateHUD(); }
        else if (slot === 2) { this.iframe = Math.max(this.iframe, 0.8); log('Ward up'); }
        else if (slot === 3) { const r=60, dmg=16; for(const e of world.enemies){ if(Math.hypot(e.x-this.x, e.y-this.y)<=r){ e.hp-=dmg; world.addFloater(e.x,e.y,String(dmg),'#fde68a'); } } }
      } else if (this.className === 'ranger') {
        if (slot === 1) { const speed=360, dmg=18; world.projectiles.push({ x:this.x+Math.cos(aimDir)*14, y:this.y+Math.sin(aimDir)*14, vx:Math.cos(aimDir)*speed, vy:Math.sin(aimDir)*speed, dmg, life:1.6, color:'#a7f3d0' }); }
        else if (slot === 2) { const tx=mouse.wx, ty=mouse.wy; for(const e of world.enemies){ if(Math.hypot(e.x-tx, e.y-ty)<26){ e.hp-=14; world.addFloater(e.x,e.y,'14','#a7f3d0'); } } }
      } else if (this.className === 'rogue') {
        if (slot === 1) { const speed=380, dmg=16; world.projectiles.push({ x:this.x+Math.cos(aimDir)*14, y:this.y+Math.sin(aimDir)*14, vx:Math.cos(aimDir)*speed, vy:Math.sin(aimDir)*speed, dmg, life:1.1, color:'#f59e0b' }); }
        else if (slot === 2) { this.iframe = Math.max(this.iframe, 0.5); log('Vanish!'); }
      } else if (this.className === 'warrior') {
        if (slot === 1) { // Cleave
          const arc = Math.PI * 0.9, reach = 40, dmg = this.baseDmg + 8; let n = 0;
          for (const e of world.enemies) {
            const a = Math.atan2(e.y - this.y, e.x - this.x);
            if (Math.abs(wrapAngle(a - this.dir)) < arc/2 && dist(e, this) <= reach) {
              e.hp -= dmg; n++; world.addFloater(e.x, e.y, String(dmg), '#fca5a5');
            }
          }
          if (n) log(`Cleave x${n}`);
        }
      }
    };

    const castTime = (this.className === 'mage') ? 0.45 : (this.className === 'cleric' ? 0.35 : 0.28);
    const tel = {
      ttl: castTime,
      type: (this.className === 'mage' && slot === 2) ? 'circle' :
            (this.className === 'mage' && slot === 3) ? 'line'   : 'aim',
      x: this.x, y: this.y, dir: aimDir, r: (slot === 2 ? 70 : 0), len: 220,
      fire: () => fire(tel)
    };
    world.telegraphs.push(tel);
  }

  dodge(world){
    if (this.rollCD > 0) return;
    const dash = 110;
    world.moveWithCollide(this, Math.cos(this.dir) * dash, Math.sin(this.dir) * dash);
    this.iframe = this.iframeDur; this.rollCD = this.rollCooldown;
    log(`Dodge (${this.className})`);
  }

  hit(d, world){
    if (this.iframe > 0) return;
    this.hp = Math.max(0, this.hp - d);
    world.addFloater(this.x, this.y - 18, '-' + d, '#f87171');
    if (this.hp === 0) { this.hp = Math.floor(this.maxhp * 0.7); this.x = 12 * 24; this.y = 12 * 24; log('You were defeated. Respawned.'); }
    this.updateHUD();
  }

  update(dt, world){
    if (this.iframe > 0) this.iframe -= dt;
    if (this.rollCD > 0) this.rollCD -= dt;
    if (this.atkTimer > 0) this.atkTimer -= dt;

    while (this.xp >= 100 * this.lv) {
      this.xp -= 100 * this.lv; this.lv++;
      this.maxhp += 10; this.hp = this.maxhp;
      world.addFloater(this.x, this.y - 18, 'LEVEL UP', '#86efac');
      this.updateHUD();
    }

    this.mp = Math.min(this.maxmp, (this.mp || 0) + 4 * dt);
    this.updateHUD();
  }

  updateHUD(){
    const hpnum = document.getElementById('hpNum'),
          mpnum = document.getElementById('mpNum'),
          hpbar = document.getElementById('hpbar'),
          mpbar = document.getElementById('mpbar'),
          xpbar = document.getElementById('xpbar');
    if (!hpbar) return;
    hpbar.style.width = (this.hp / this.maxhp * 100).toFixed(1) + '%';
    mpbar.style.width = (this.mp / this.maxmp * 100).toFixed(1) + '%';
    xpbar.style.width = (this.xp % 100) + '%';
    if (hpnum) hpnum.textContent = `${Math.floor(this.hp)}/${this.maxhp}`;
    if (mpnum) mpnum.textContent = `${Math.floor(this.mp)}/${this.maxmp}`;
  }
}

/* ======================================================================= */
/*                                  Enemy                                   */
/* ======================================================================= */
export class Enemy {
  constructor(type, x, y){
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = 54;
  }
}
