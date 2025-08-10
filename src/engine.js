// minimal engine: draws a player you can move with WASD/Arrows
export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keys = {};
    this.player = { x: 200, y: 200, r: 12, hp: 100, mp: 50, xp: 0 };
    // key handling
    window.addEventListener('keydown', e => this.keys[e.key] = true);
    window.addEventListener('keyup',   e => this.keys[e.key] = false);
    // expose for quick tests
    window.__game = this;
  }
  start(){ requestAnimationFrame(this.loop.bind(this)); }
  loop(ts){
    this.update(1/60);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
  update(dt){
    const p = this.player; const spd = 140 * dt;
    if(this.keys['w']||this.keys['ArrowUp'])    p.y -= spd;
    if(this.keys['s']||this.keys['ArrowDown'])  p.y += spd;
    if(this.keys['a']||this.keys['ArrowLeft'])  p.x -= spd;
    if(this.keys['d']||this.keys['ArrowRight']) p.x += spd;
    // clamp to canvas
    p.x = Math.max(p.r, Math.min(this.canvas.width - p.r, p.x));
    p.y = Math.max(p.r, Math.min(this.canvas.height - p.r, p.y));
    // crude HUD updates so the bars move eventually
    document.getElementById('hpbar').style.width = p.hp + '%';
    document.getElementById('mpbar').style.width = p.mp + '%';
    document.getElementById('xpbar').style.width = (p.xp%100) + '%';
  }
  draw(){
    const ctx = this.ctx;
    ctx.fillStyle = '#0b1220'; // ground
    ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    // simple grid walls just to see something
    ctx.fillStyle = '#1b2135';
    for(let i=0;i<40;i++){ ctx.fillRect(i*24, 0, 24, 24); ctx.fillRect(i*24, this.canvas.height-24, 24, 24); }
    for(let j=0;j<22;j++){ ctx.fillRect(0, j*24, 24, 24); ctx.fillRect(this.canvas.width-24, j*24, 24, 24); }
    // player
    ctx.fillStyle = '#eab308';
    ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.player.r, 0, Math.PI*2); ctx.fill();
  }
}
