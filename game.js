(() => {
'use strict';
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d', {alpha:false});
const W = canvas.width, H = canvas.height, $ = id => document.getElementById(id);
const TAU = Math.PI*2;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const rand = (a,b) => a + Math.random()*(b-a);
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const keys = new Set();

/* ------------------------------------------------------------------ *
 *  WEAPONS  — each has 3 levels. Picking the same card again upgrades. *
 * ------------------------------------------------------------------ */
const WEAPONS = [
  {id:'shotgun', icon:'✳', name:'ショットガン',
   levels:[
     '扇状に5発の散弾を撃ち出す。近距離で全弾命中させると強力。',
     '散弾が7発に増え、射程と威力が上昇。弾が1体を貫通する。',
     '覚醒：11発に増加。全弾貫通し、敵を大きく吹き飛ばす。']},
  {id:'zombie', icon:'☠', name:'ゾンビコール',
   levels:[
     '一定時間ごとにゾンビを1体召喚。敵に噛みついて攻撃する。',
     '召喚数が2体に増え、ゾンビのHP・攻撃力・寿命が上昇。',
     '覚醒：3体を召喚。ゾンビは消える時、周囲で自爆する。']},
  {id:'chain', icon:'ϟ', name:'チェインライトニング',
   levels:[
     '敵に電撃を放ち、近くの敵へ連鎖する（最大2体）。',
     '連鎖数が3体に増え、威力と連鎖距離が上昇。',
     '覚醒：最大5体へ連鎖。感電した敵を麻痺させる。']},
  {id:'orbit', icon:'✜', name:'オービットブレード',
   levels:[
     '自分の周囲を1枚の刃が旋回し、触れた敵を切り裂く。',
     '刃が2枚に増え、回転と威力が上がる。',
     '覚醒：刃が4枚になり、攻撃範囲が大きく広がる。']},
  {id:'nova', icon:'❄', name:'フロストノヴァ',
   levels:[
     '一定時間ごとに冷気を放出し、周囲の敵を攻撃する。',
     'ノヴァの範囲と威力が上昇し、間隔が短くなる。',
     '覚醒：ヒットした敵を凍結させ、動きを大きく鈍らせる。']}
];

const WEAPON_SPEC = {
  shotgun:[
    {pellets:5,  spread:.34, dmg:.55, range:190, knock:0,  pierce:0,  rate:1.15},
    {pellets:7,  spread:.42, dmg:.72, range:240, knock:26, pierce:1,  rate:1.00},
    {pellets:11, spread:.55, dmg:.86, range:280, knock:70, pierce:99, rate:.85}],
  zombie:[
    {count:1, cd:8.0, hp:45, dmg:10, life:8},
    {count:2, cd:6.6, hp:62, dmg:13, life:10},
    {count:3, cd:5.0, hp:84, dmg:16, life:12}],
  chain:[
    {hits:2, dmg:.60, range:250, cd:1.50},
    {hits:3, dmg:.72, range:280, cd:1.20},
    {hits:5, dmg:.86, range:330, cd:.90}],
  orbit:[
    {count:1, radius:62, spin:2.4, dmg:.55},
    {count:2, radius:72, spin:2.9, dmg:.66},
    {count:4, radius:84, spin:3.5, dmg:.80}],
  nova:[
    {radius:105, dmg:.90, cd:2.8},
    {radius:132, dmg:1.10, cd:2.3},
    {radius:168, dmg:1.40, cd:1.8}]
};

const STATS = [
  {id:'power', icon:'✹', name:'パワーショット',
   levels:['すべての攻撃のダメージ +20%。','さらに +20%。','覚醒：ダメージが大幅に上昇する。']},
  {id:'bullet', icon:'➶', name:'アクセル弾',
   levels:['弾速と射程がアップ。','さらに弾速と射程がアップ。','覚醒：射程が大きく伸びる。']},
  {id:'speed', icon:'➤', name:'スピードブースト',
   levels:['移動速度がアップ。','さらに移動速度がアップ。','覚醒：大きく軽快になる。']},
  {id:'vital', icon:'♥', name:'バイタリティ',
   levels:['最大HP +20。HPも回復。','最大HP +20。HPも回復。','覚醒：最大HP +40、大きく回復。']},
  {id:'regen', icon:'✚', name:'リジェネレーション',
   levels:['時間とともにHPが回復。','回復量が増える。','覚醒：回復量がさらに増加。']},
  {id:'dash', icon:'»', name:'クイックステップ',
   levels:['ダッシュの再使用時間が短縮。','さらに短縮。','覚醒：ほぼ連続で使える。']}
];

const HEALS = [
  {id:'heal', icon:'✚', name:'応急処置', levels:['HPを30回復する。']},
  {id:'heal2', icon:'♥', name:'救急キット', levels:['HPを40回復する。']},
  {id:'heal3', icon:'✳', name:'回復パルス', levels:['HPを50回復する。']}
];

/* ------------------------------- state ---------------------------- */
let game, last = 0, touch = {active:false,x:0,y:0,dx:0,dy:0}, announceTimer = 0, shake = 0;
let qTable = {};
try { qTable = JSON.parse(localStorage.getItem('clone-survivors-allied-q-v2')||'{}'); if(!qTable || typeof qTable!=='object' || Array.isArray(qTable)) qTable = {}; } catch(e) { qTable = {}; }
function saveBrain(){ try{ localStorage.setItem('clone-survivors-allied-q-v2', JSON.stringify(qTable)); }catch(e){} }

function fighter(x,y,clone=false){
  return {
    x, y, clone, hp:100, maxHp:100, level:1, xp:0,
    upgrades:{}, weapons:{rifle:1},
    cd:{rifle:rand(.05,.4), shotgun:0, chain:0, zombie:0, nova:0},
    orbitPhase:rand(0,TAU), blades:[],
    shoot:rand(.05,.4), dashCd:0, dashTime:0, invuln:0, hit:0, muzzle:0, cast:0,
    angle:clone?rand(0,TAU):-Math.PI/2, alive:true, decision:0, action:0, state:null, reward:0,
    seed:rand(0,100), legPhase:0, moveX:0, moveY:0, moving:false, bob:rand(0,7)
  };
}
function newGame(){
  game = {
    state:'ready', stage:1, time:30, elapsed:0, kills:0,
    player:fighter(W/2,H/2), clones:[], enemies:[], bullets:[], minions:[],
    particles:[], texts:[], beams:[], rings:[], sparks:[],
    spawn:1, pick:0, pendingLevels:0, arsenalSig:''
  };
  updateHUD();
}
const threshold = f => 100 + (f.level-1)*60;

function stat(f){
  const n = id => f.upgrades[id]||0;
  const pw = n('power');
  const dmgMul = 1 + pw*.20 + (pw>=3?.45:0);
  return {
    damage: 18*dmgMul,
    dmgMul,
    rate: .62,
    speed: 132 + n('speed')*19 + (n('speed')>=3?22:0),
    regen: n('regen')*.6 + (n('regen')>=3?1.1:0),
    bulletSpeed: 340 + n('bullet')*62,
    range: 400*(1 + n('bullet')*.14 + (n('bullet')>=3?.18:0)),
    dashCooldown: Math.max(1.1, 3 - n('dash')*.45 - (n('dash')>=3?.35:0))
  };
}

function weaponLevel(f,id){ return f.weapons[id]||0; }

/* ------------------------------ cards ----------------------------- */
function cardPool(f){
  const pool = [];
  for(const d of WEAPONS){
    const lv = weaponLevel(f,d.id);
    if(lv < 3) pool.push({id:d.id, icon:d.icon, name:d.name, kind:'weapon', level:lv,
      desc:d.levels[Math.min(lv,2)], burst:lv===0});
  }
  for(const d of STATS){
    const lv = f.upgrades[d.id]||0;
    if(lv < 3) pool.push({id:d.id, icon:d.icon, name:d.name, kind:'stat', level:lv,
      desc:d.levels[Math.min(lv,2)]});
  }
  return pool;
}
function availableCards(f){
  const pool = cardPool(f);
  const out = [];
  const weapons = pool.filter(c=>c.kind==='weapon');
  const others = pool.filter(c=>c.kind!=='weapon');
  const shuffle = a => a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]);
  // Guarantee at least one weapon card while weapons are still upgradeable.
  if(weapons.length) out.push(shuffle(weapons).pop());
  const rest = shuffle([...others, ...weapons.filter(w=>!out.includes(w))]);
  while(out.length < 3 && rest.length) out.push(rest.pop());
  if(out.length < 3) out.push(...shuffle(HEALS.slice()).slice(0, 3-out.length));
  return shuffle(out).slice(0,3);
}

function applyCard(f,id){
  if(id.startsWith('heal')){
    f.hp = Math.min(f.maxHp, f.hp + (id==='heal3'?50:id==='heal2'?40:30));
    return;
  }
  if(WEAPON_SPEC[id]){
    const lv = weaponLevel(f,id);
    if(lv >= 3) return;
    f.weapons[id] = lv + 1;
    if(id === 'zombie' && lv === 0) f.cd.zombie = .5;
    return;
  }
  const lv = f.upgrades[id]||0;
  if(lv >= 3) return;
  f.upgrades[id] = lv + 1;
  if(id === 'vital'){
    const amount = 20 + (lv===2?20:0);
    f.maxHp += amount;
    f.hp = Math.min(f.maxHp, f.hp + amount);
  }
}
function cloneLevelUp(f){
  for(let i=0;i<3;i++){
    const cards = availableCards(f);
    if(!cards.length) return;
    applyCard(f, cards[Math.floor(Math.random()*cards.length)].id);
  }
}

/* ------------------------------ DOM UI ---------------------------- */
function updateHUD(){
  const p = game.player;
  $('stageNumber').textContent = String(game.stage).padStart(2,'0');
  $('fieldStage').textContent = 'STAGE '+String(game.stage).padStart(2,'0');
  $('timer').textContent = '00:'+String(Math.ceil(Math.max(0,game.time))).padStart(2,'0');
  $('stageFill').style.width = (100*(1-game.time/30))+'%';
  $('cloneCount').textContent = String(game.clones.filter(c=>c.alive).length).padStart(2,'0');
  $('killCount').textContent = String(game.kills).padStart(2,'0');
  $('healthFill').style.width = (100*Math.max(0,p.hp)/p.maxHp)+'%';
  $('healthText').innerHTML = Math.ceil(Math.max(0,p.hp))+' <small>/ '+p.maxHp+'</small>';
  $('level').textContent = String(p.level).padStart(2,'0');
  $('xpFill').style.width = (100*Math.min(1,p.xp/threshold(p)))+'%';
  $('xpText').textContent = Math.floor(p.xp)+' / '+threshold(p)+' XP';
  updateArsenal();
}
function updateArsenal(){
  const box = $('arsenal');
  if(!box) return;
  const owned = [];
  for(const d of WEAPONS){
    const lv = weaponLevel(game.player,d.id);
    if(lv > 0) owned.push({icon:d.icon,name:d.name,lv});
  }
  const sig = owned.map(o=>o.icon+o.lv).join('|');
  if(sig === game.arsenalSig) return;
  game.arsenalSig = sig;
  if(!owned.length){
    box.innerHTML = '<span class="ars-empty">武装なし — レベルアップで攻撃を獲得</span>';
    return;
  }
  box.innerHTML = owned.map(o=>{
    const pips = '◆'.repeat(o.lv) + '◇'.repeat(3-o.lv);
    return `<span class="ars-chip${o.lv>=3?' awake':''}" title="${o.name} Lv.${o.lv}${o.lv>=3?' 覚醒':''}"><i>${o.icon}</i><em>${pips}</em></span>`;
  }).join('');
}
function notice(title,sub){
  const el = $('announcement');
  el.innerHTML = title+'<small>'+sub+'</small>';
  el.classList.add('show');
  announceTimer = 2.8;
}
function start(){
  newGame();
  game.state = 'playing';
  for(const id of ['startOverlay','endOverlay','pauseOverlay','rewardOverlay']) $(id).classList.add('hidden');
  $('topStatus').textContent = 'SURVIVAL IN PROGRESS';
  notice('STAGE 01','生き残れ。');
}
function showCards(){
  game.state = 'reward';
  $('rewardOverlay').classList.remove('hidden');
  $('pickCount').innerHTML = String(game.pick+1).padStart(2,'0')+' <small>/ 03</small>';
  const box = $('cardChoices');
  box.replaceChildren();
  availableCards(game.player).forEach((card,i)=>{
    const lv = card.kind==='heal' ? 0 : card.level;
    const kindLabel = card.kind==='weapon' ? 'WEAPON' : card.kind==='stat' ? 'UPGRADE' : 'RECOVERY';
    const levelText = card.kind==='heal' ? 'RECOVERY'
      : card.kind==='weapon' && lv===0 ? 'NEW WEAPON'
      : lv>=3 ? 'MAX' : lv===2 ? 'NEXT: 覚醒 ✦' : 'LV. '+lv+' → '+(lv+1);
    const button = document.createElement('button');
    button.className = 'upgrade-card'+(card.kind==='weapon'?' weapon':'')+(lv>=2?' near-awake':'');
    button.innerHTML = `<span class="card-index">${kindLabel}</span>
      <span class="card-level">${levelText}</span>
      <span class="card-icon">${card.icon}</span>
      <h3>${card.name}</h3>
      <p>${card.desc}</p>
      ${card.kind==='heal'?'':`<span class="card-pips">${'◆'.repeat(lv)}${'◇'.repeat(3-lv)}</span>`}`;
    button.addEventListener('click',()=>{
      applyCard(game.player, card.id);
      if(card.kind === 'weapon'){
        const lv = weaponLevel(game.player, card.id);
        const p = game.player;
        game.texts.push({
          x:p.x, y:p.y-46, vy:-26, life:1.15, max:1.15,
          text:`${card.icon} ${card.name}`, color:'#dcff9e', size: lv>=3?16:13
        });
        if(lv >= 3){
          game.texts.push({x:p.x, y:p.y-66, vy:-16, life:1.4, max:1.4, text:'AWAKEN ✦', color:'#d9ccff', size:14});
          game.rings.push({x:p.x,y:p.y,r:20,maxR:170,life:.8,max:.8,color:'#cfc2ff',width:4});
          particles(p.x,p.y,'#d9ccff',26,1.5);
          shake = Math.min(shake+3, 5);
        } else {
          game.rings.push({x:p.x,y:p.y,r:14,maxR:110,life:.6,max:.6,color:'#dcff9e',width:3});
          particles(p.x,p.y,'#dcff9e',16,1.2);
        }
      }
      game.pick++;
      updateHUD();
      if(game.pick < 3) showCards();
      else {
        game.pendingLevels--;
        game.pick = 0;
        if(game.pendingLevels > 0) showCards();
        else {
          $('rewardOverlay').classList.add('hidden');
          game.state = 'playing';
          notice('STAGE '+String(game.stage).padStart(2,'0'),'新たなクローンが出現');
        }
      }
    });
    box.appendChild(button);
  });
}

/* ---------------------------- progression ------------------------- */
function grantXp(f, amount){
  if(!f || !f.alive) return;
  f.xp += amount;
  let leveled = false;
  while(f.xp >= threshold(f)){
    f.xp -= threshold(f);
    f.level++;
    leveled = true;
    if(f.clone) cloneLevelUp(f);
    else game.pendingLevels++;
  }
  if(leveled && f === game.player){
    game.rings.push({x:f.x,y:f.y,r:12,maxR:90,life:.55,max:.55,color:'#d8ff9e',width:3});
  }
  if(leveled && f.clone) game.rings.push({x:f.x,y:f.y,r:10,maxR:70,life:.5,max:.5,color:'#ffcf8a',width:2});
}

function stageClear(){
  if(game.state !== 'playing') return;
  game.enemies = [];
  game.bullets = [];
  game.beams = [];
  const xp = 100 + (game.stage-1)*25;
  const fighters = [game.player, ...game.clones.filter(c=>c.alive)];
  for(const f of fighters) grantXp(f, xp);
  const angle = rand(0,TAU);
  const clone = fighter(clamp(W/2+Math.cos(angle)*320,60,W-60), clamp(H/2+Math.sin(angle)*240,60,H-60), true);
  game.clones.push(clone);
  for(let i=0;i<18;i++) particles(clone.x, clone.y, '#ffca86', 2);
  game.rings.push({x:clone.x,y:clone.y,r:10,maxR:120,life:.7,max:.7,color:'#ffcf8a',width:3});
  game.stage++;
  game.time = 30;
  game.spawn = 1;
  updateHUD();
  if(game.pendingLevels > 0){ game.pick = 0; showCards(); }
  else notice('STAGE '+String(game.stage).padStart(2,'0'),'新たなクローンが出現');
  saveBrain();
}

/* ------------------------------ enemies --------------------------- */
function spawnEnemy(){
  let side = Math.floor(rand(0,4));
  let x = side===0?-24:side===1?W+24:rand(30,W-30);
  let y = side===2?-24:side===3?H+24:rand(30,H-30);
  const st = game.stage;
  const bruteChance = Math.min(.10 + st*.022, .30);
  const runnerChance = Math.min(.16 + st*.03, .38);
  const roll = Math.random();
  let type = 'grunt';
  if(roll < bruteChance) type = 'brute';
  else if(roll < bruteChance + runnerChance) type = 'runner';
  const base = {
    grunt:  {hp:30+st*4,  r:13, speed:55+Math.min(st*2,30),   dmg:9,  xp:12},
    runner: {hp:20+st*2.6,r:10, speed:94+Math.min(st*2.4,34), dmg:7,  xp:11},
    brute:  {hp:72+st*8,  r:20, speed:38+Math.min(st*1.6,25), dmg:15, xp:30}
  }[type];
  game.enemies.push({
    x, y, type, r:base.r, hp:base.hp, maxHp:base.hp, speed:base.speed,
    damage:base.dmg, xp:base.xp, hit:0, stun:0, slow:0, orbitCd:0,
    seed:rand(0,100), wob:rand(0,TAU), alive:true
  });
}
function allTargets(){ return game.enemies.filter(t=>t.alive); }
function nearest(f){
  let best = null, d = Infinity;
  for(const t of game.enemies){
    if(!t.alive) continue;
    const dd = dist(f,t);
    if(dd < d){ best = t; d = dd; }
  }
  return [best,d];
}

/* ------------------------------ weapons --------------------------- */
function rifleFire(f,target,s){
  const a = Math.atan2(target.y-f.y, target.x-f.x);
  f.angle = a;
  game.bullets.push({
    x:f.x+Math.cos(a)*20, y:f.y+Math.sin(a)*20, px:f.x, py:f.y,
    vx:Math.cos(a)*s.bulletSpeed, vy:Math.sin(a)*s.bulletSpeed,
    life:s.range/s.bulletSpeed, maxLife:s.range/s.bulletSpeed,
    damage:s.damage, owner:f, r:4, pierce:0, hitList:[],
    color:f.clone?'#ffb469':'#b8ff83'
  });
  f.muzzle = .1;
  f.cd.rifle = s.rate;
}
function shotgunFire(f,target,s){
  const lv = weaponLevel(f,'shotgun'), spec = WEAPON_SPEC.shotgun[lv-1];
  const a = Math.atan2(target.y-f.y, target.x-f.x);
  f.angle = a;
  for(let i=0;i<spec.pellets;i++){
    const spread = spec.spread/2;
    const ang = a + rand(-spread,spread) + (i-(spec.pellets-1)/2)*.012;
    const sp = s.bulletSpeed*.78;
    game.bullets.push({
      x:f.x+Math.cos(a)*20, y:f.y+Math.sin(a)*20, px:f.x, py:f.y,
      vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp,
      life:spec.range/sp, maxLife:spec.range/sp,
      damage:s.damage*spec.dmg, owner:f, r:3.4,
      pierce:spec.pierce, hitList:[], knock:spec.knock, short:true,
      color:f.clone?'#ffd08a':'#d9ffa1'
    });
  }
  f.muzzle = .16;
  f.cd.shotgun = spec.rate;
  shake = Math.min(shake+1.6, 4);
}
function chainFire(f,target,s){
  const lv = weaponLevel(f,'chain'), spec = WEAPON_SPEC.chain[lv-1];
  f.cd.chain = spec.cd;
  const pts = [{x:f.x, y:f.y-8}];
  const hitList = [];
  let cur = target, dmg = s.damage*spec.dmg;
  for(let i=0;i<spec.hits && cur;i++){
    pts.push({x:cur.x, y:cur.y});
    hurt(cur, dmg, f);
    if(lv>=3) cur.stun = Math.max(cur.stun, .4);
    hitList.push(cur);
    dmg *= .82;
    let best = null, bd = spec.range;
    for(const e of game.enemies){
      if(!e.alive || hitList.includes(e)) continue;
      const d = dist(cur,e);
      if(d < bd){ bd = d; best = e; }
    }
    cur = best;
  }
  game.beams.push({pts, life:.18, max:.18, color:'#9fe9ff'});
  f.cast = .18;
}
function novaFire(f,s){
  const lv = weaponLevel(f,'nova'), spec = WEAPON_SPEC.nova[lv-1];
  f.cd.nova = spec.cd;
  game.rings.push({x:f.x,y:f.y,r:14,maxR:spec.radius,life:.5,max:.5,color:'#a9e6ff',width:5});
  for(const e of game.enemies){
    if(!e.alive) continue;
    if(dist(f,e) < spec.radius){
      hurt(e, s.damage*spec.dmg, f);
      if(lv>=3) e.slow = 1.8;
    }
  }
  f.cast = .22;
  shake = Math.min(shake+2.4, 5);
}
function summonZombie(f){
  const lv = weaponLevel(f,'zombie'), spec = WEAPON_SPEC.zombie[lv-1];
  f.cd.zombie = spec.cd;
  for(let i=0;i<spec.count;i++){
    if(game.minions.length >= 12) break;
    const a = rand(0,TAU), r = rand(24,48);
    const z = {
      x:clamp(f.x+Math.cos(a)*r, 20, W-20), y:clamp(f.y+Math.sin(a)*r, 20, H-20),
      owner:f, lv, hp:spec.hp, maxHp:spec.hp, dmg:spec.dmg,
      life:spec.life, maxLife:spec.life, attackCd:0, seed:rand(0,100),
      bob:rand(0,7), hit:0, alive:true
    };
    game.minions.push(z);
    particles(z.x, z.y, '#8fe06a', 10);
    game.rings.push({x:z.x,y:z.y,r:6,maxR:44,life:.4,max:.4,color:'#8fe06a',width:2});
  }
  f.cast = .3;
}
function orbitTick(f,dt,s){
  const lv = weaponLevel(f,'orbit'), spec = WEAPON_SPEC.orbit[lv-1];
  f.orbitPhase = (f.orbitPhase||0) + dt*spec.spin;
  f.blades = [];
  for(let i=0;i<spec.count;i++){
    const a = f.orbitPhase + i*TAU/spec.count;
    const bx = f.x + Math.cos(a)*spec.radius, by = f.y + Math.sin(a)*spec.radius;
    f.blades.push({x:bx,y:by,a});
    for(const e of game.enemies){
      if(!e.alive || e.orbitCd > 0) continue;
      if(Math.hypot(e.x-bx, e.y-by) < (e.r||13)+14){
        hurt(e, s.damage*spec.dmg, f);
        e.orbitCd = .38;
        particles((e.x+bx)/2, (e.y+by)/2, '#c9f2ff', 5);
      }
    }
  }
}
function updateWeapons(f,dt,target){
  const s = stat(f), w = f.weapons;
  f.cd.rifle -= dt;
  if(f.cd.rifle <= 0 && target && dist(f,target) <= s.range){
    rifleFire(f,target,s);
    if(!f.clone) f.angle = f.angle;
  }
  if(w.shotgun){
    f.cd.shotgun -= dt;
    const spec = WEAPON_SPEC.shotgun[w.shotgun-1];
    if(f.cd.shotgun <= 0 && target && dist(f,target) <= spec.range*1.25) shotgunFire(f,target,s);
  }
  if(w.chain){
    f.cd.chain -= dt;
    if(f.cd.chain <= 0 && target && dist(f,target) <= 330) chainFire(f,target,s);
  }
  if(w.nova){
    f.cd.nova -= dt;
    if(f.cd.nova <= 0) novaFire(f,s);
  }
  if(w.zombie){
    f.cd.zombie -= dt;
    if(f.cd.zombie <= 0) summonZombie(f);
  }
  if(w.orbit) orbitTick(f,dt,s);
}

/* ------------------------------ effects --------------------------- */
function particles(x,y,color,n=6,power=1){
  for(let i=0;i<n;i++){
    if(game.particles.length > 420) break;
    game.particles.push({
      x, y, vx:rand(-120,120)*power, vy:rand(-120,120)*power,
      life:rand(.22,.6), max:.6, color, r:rand(1.6,4.2), glow:true
    });
  }
}
function damageText(x,y,amount,color){
  if(game.texts.length > 40) return;
  game.texts.push({x:x+rand(-6,6), y:y-14, vy:-46, life:.62, max:.62,
    text:String(Math.round(amount)), color, size:amount>=45?15:12});
}

/* ------------------------------- combat --------------------------- */
function hurt(t, amount, source){
  if(!t || !t.alive) return;
  if(t.invuln > 0) return;
  t.hp -= amount;
  t.hit = .12;
  const isEnemy = !t.clone;
  damageText(t.x, t.y-(t.r||16), amount, isEnemy?'#ffe8a8':t===game.player?'#ff8f8f':'#ffc79a');
  if(t.clone) t.reward -= amount*.035;
  if(source && source.clone) source.reward += amount*.04;
  particles(t.x, t.y, t.clone?'#ffc27c':t===game.player?'#c8f681':'#ffb0a0', 3, .7);
  if(t.hp <= 0){
    t.alive = false;
    particles(t.x, t.y, t.clone?'#ffc27c':'#ff9d86', isEnemy?14:16, 1.3);
    game.rings.push({x:t.x,y:t.y,r:4,maxR:isEnemy?(t.r>16?58:38):60,life:.36,max:.36,
      color:isEnemy?'#ff9d86':'#ffd39a',width:2});
    if(isEnemy){
      game.kills++;
      shake = Math.min(shake+ (t.type==='brute'?3:1.2), 5);
      const killer = source ? (source.owner || source) : null;
      if(killer && killer.level !== undefined) grantXp(killer, t.xp);
    }
    if(t.clone){
      if(t.state !== null){
        const q = qValues(t.state);
        q[t.action] += .18*(-5+t.reward-q[t.action]);
      }
      saveBrain();
    }
    if(t === game.player) endGame();
  }
}
function endGame(){
  game.state = 'dead';
  $('endStage').textContent = String(game.stage).padStart(2,'0');
  $('endKills').textContent = String(game.kills).padStart(2,'0');
  $('endTime').textContent = String(Math.floor(game.elapsed/60)).padStart(2,'0')+':'+String(Math.floor(game.elapsed%60)).padStart(2,'0');
  $('topStatus').textContent = 'SIGNAL LOST';
  $('endOverlay').classList.remove('hidden');
  saveBrain();
}

/* -------------------------------- AI ------------------------------ */
function qValues(state){
  if(!Array.isArray(qTable[state]) || qTable[state].length !== 5) qTable[state] = [0,0,0,0,0];
  return qTable[state];
}
function cloneMove(c,dt){
  const [target,d] = nearest(c);
  const state = (c.hp/c.maxHp<.4?'low':'ok')+'|'+(d<100?'near':d<250?'mid':'far')+'|'
    +(!target?'none':target.type==='brute'?'big':'normal')+'|'
    +(c.x<70||c.x>W-70||c.y<70||c.y>H-70?'edge':'open');
  c.decision -= dt;
  if(c.decision <= 0){
    if(c.state !== null){
      const old = qValues(c.state), next = qValues(state);
      old[c.action] += 0.18*(c.reward + 0.85*Math.max(...next) - old[c.action]);
    }
    const values = qValues(state);
    c.action = Math.random() < .22 ? Math.floor(rand(0,5)) : values.indexOf(Math.max(...values));
    c.state = state;
    c.reward = 0;
    c.decision = .4;
  }
  if(!target) return;
  const dx = (target.x-c.x)/(d||1), dy = (target.y-c.y)/(d||1);
  let vx = 0, vy = 0;
  switch(c.action){
    case 0: vx = dx; vy = dy; break;
    case 1: vx = -dx; vy = -dy; break;
    case 2: vx = -dy; vy = dx; break;
    case 3: vx = dy; vy = -dx; break;
    case 4: vx = -dx*.55-dy*.8; vy = -dy*.55+dx*.8; break;
  }
  // Keep a little breathing room from the player so bullets stay clear.
  const pd = dist(c, game.player);
  if(pd < 46 && pd > 0){ vx += (c.x-game.player.x)/pd*.6; vy += (c.y-game.player.y)/pd*.6; }
  if(d < 85 && c.dashCd <= 0 && Math.random() < dt*1.5){
    c.dashTime = .18;
    c.dashCd = stat(c).dashCooldown;
    c.invuln = .25;
  }
  const speed = stat(c).speed*(c.dashTime>0?2.7:1);
  c.moving = Math.hypot(vx,vy) > .05;
  c.legPhase += dt*(c.moving?9:0);
  c.x = clamp(c.x+vx*speed*dt, 17, W-17);
  c.y = clamp(c.y+vy*speed*dt, 17, H-17);
  c.reward += dt*.04;
}

/* -------------------------------- tick ---------------------------- */
function tick(dt){
  if(game.state !== 'playing') return;
  game.elapsed += dt;
  game.time -= dt;
  shake = Math.max(0, shake - dt*14);
  if(announceTimer > 0){
    announceTimer -= dt;
    if(announceTimer <= 0) $('announcement').classList.remove('show');
  }
  if(game.time <= 0){ stageClear(); return; }

  game.spawn -= dt;
  if(game.spawn <= 0){
    if(game.enemies.length < 90) spawnEnemy();
    game.spawn = Math.max(.30, 1.05-game.stage*.055)*rand(.8,1.2);
  }

  const fighters = [game.player, ...game.clones.filter(c=>c.alive)];

  for(const f of fighters){
    f.hit = Math.max(0, f.hit-dt);
    f.invuln = Math.max(0, f.invuln-dt);
    f.dashCd = Math.max(0, f.dashCd-dt);
    f.dashTime = Math.max(0, f.dashTime-dt);
    f.muzzle = Math.max(0, f.muzzle-dt);
    f.cast = Math.max(0, f.cast-dt);
    f.hp = Math.min(f.maxHp, f.hp + stat(f).regen*dt);

    if(f.clone) cloneMove(f,dt);
    else {
      let dx = (keys.has('d')||keys.has('arrowright')?1:0) - (keys.has('a')||keys.has('arrowleft')?1:0);
      let dy = (keys.has('s')||keys.has('arrowdown')?1:0) - (keys.has('w')||keys.has('arrowup')?1:0);
      if(touch.active){ dx = touch.dx; dy = touch.dy; }
      let len = Math.hypot(dx,dy);
      if(len > 0){ dx /= len; dy /= len; f.moveX = dx; f.moveY = dy; }
      if(f.dashTime > 0){ dx = f.dashX; dy = f.dashY; }
      let speed = stat(f).speed*(f.dashTime>0?2.7:1);
      f.moving = Math.abs(dx)+Math.abs(dy) > .05;
      f.legPhase += dt*(f.moving?10:0);
      f.x = clamp(f.x+dx*speed*dt, 17, W-17);
      f.y = clamp(f.y+dy*speed*dt, 17, H-17);
    }
    const [target] = nearest(f);
    updateWeapons(f,dt,target);
    if(f.clone && target && f.cd.rifle > .05) f.angle = Math.atan2(target.y-f.y, target.x-f.x);
  }

  for(const e of game.enemies){
    if(!e.alive) continue;
    e.hit = Math.max(0, e.hit-dt);
    e.orbitCd = Math.max(0, e.orbitCd-dt);
    e.stun = Math.max(0, e.stun-dt);
    e.slow = Math.max(0, e.slow-dt);
    if(e.stun > 0) continue;
    let target = null, d = Infinity;
    for(const f of fighters){
      if(!f.alive) continue;
      const nd = dist(e,f);
      if(nd < d){ d = nd; target = f; }
    }
    if(target){
      const sp = e.speed*(e.slow>0?.38:1);
      let dx = (target.x-e.x)/(d||1), dy = (target.y-e.y)/(d||1);
      // light separation so the horde spreads out instead of stacking
      for(const o of game.enemies){
        if(o === e || !o.alive) continue;
        const od = dist(e,o);
        const min = e.r + o.r;
        if(od > 0 && od < min){
          dx += (e.x-o.x)/od*.9;
          dy += (e.y-o.y)/od*.9;
        }
      }
      const l = Math.hypot(dx,dy) || 1;
      e.x = clamp(e.x + dx/l*sp*dt, 10, W-10);
      e.y = clamp(e.y + dy/l*sp*dt, 10, H-10);
      if(d < e.r+13 && target.invuln <= 0){
        hurt(target, e.damage, null);
        target.invuln = .65;
        shake = Math.min(shake+1.6, 4);
      }
    }
  }

  for(const m of game.minions){
    if(!m.alive) continue;
    m.life -= dt;
    m.hit = Math.max(0, m.hit-dt);
    m.attackCd = Math.max(0, m.attackCd-dt);
    const [t] = nearest(m);
    if(t){
      const d = dist(m,t);
      if(d > 18){
        const sp = 96 + m.lv*10;
        m.x = clamp(m.x + (t.x-m.x)/d*sp*dt, 14, W-14);
        m.y = clamp(m.y + (t.y-m.y)/d*sp*dt, 14, H-14);
      } else if(m.attackCd <= 0){
        hurt(t, m.dmg, m);
        m.attackCd = .55;
      }
    }
    if(m.life <= 0){ m.alive = false; m.hp = 0; }
  }
  for(const m of game.minions){
    if(m.alive) continue;
    if(m.lv >= 3){
      game.rings.push({x:m.x,y:m.y,r:8,maxR:96,life:.45,max:.45,color:'#a6ff7a',width:5});
      for(const e of game.enemies){
        if(e.alive && dist(m,e) < 96) hurt(e, 44, m.owner);
      }
      particles(m.x,m.y,'#9bff74',18,1.4);
    } else {
      particles(m.x,m.y,'#7fbd5f',10);
    }
  }
  game.minions = game.minions.filter(m=>m.alive);

  for(const b of game.bullets){
    b.px = b.x; b.py = b.y;
    b.x += b.vx*dt;
    b.y += b.vy*dt;
    b.life -= dt;
    for(const t of game.enemies){
      if(!t.alive || b.hitList.includes(t)) continue;
      if(dist(b,t) < (t.r||13)+b.r){
        hurt(t, b.damage, b.owner);
        b.hitList.push(t);
        if(b.knock){
          const l = Math.hypot(b.vx,b.vy)||1;
          t.x = clamp(t.x + b.vx/l*b.knock*.14, 12, W-12);
          t.y = clamp(t.y + b.vy/l*b.knock*.14, 12, H-12);
        }
        if(b.pierce > 0){ b.pierce--; }
        else { b.life = 0; break; }
      }
    }
  }
  game.bullets = game.bullets.filter(b => b.life>0 && b.x>-30 && b.x<W+30 && b.y>-30 && b.y<H+30);
  game.enemies = game.enemies.filter(e=>e.alive);
  game.clones = game.clones.filter(c=>c.alive);

  for(const p of game.particles){
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.vx *= .94; p.vy *= .94;
    p.life -= dt;
  }
  game.particles = game.particles.filter(p=>p.life>0);
  for(const t of game.texts){ t.y += t.vy*dt; t.vy *= .93; t.life -= dt; }
  game.texts = game.texts.filter(t=>t.life>0);
  for(const b of game.beams) b.life -= dt;
  game.beams = game.beams.filter(b=>b.life>0);
  for(const r of game.rings){ r.life -= dt; r.r += (r.maxR-r.r)*dt*9; }
  game.rings = game.rings.filter(r=>r.life>0);

  updateHUD();
  if(game.pendingLevels > 0 && game.state === 'playing'){
    game.pick = 0;
    showCards();
  }
}

function dash(){
  const p = game.player;
  if(game.state === 'playing' && p.dashCd <= 0){
    p.dashTime = .18;
    p.invuln = .25;
    p.dashCd = stat(p).dashCooldown;
    p.dashX = p.moveX||0;
    p.dashY = p.moveY||0;
    if(!p.dashX && !p.dashY){ p.dashX = Math.cos(p.angle); p.dashY = Math.sin(p.angle); }
    particles(p.x,p.y,'#c9f58c',10);
    game.rings.push({x:p.x,y:p.y,r:6,maxR:48,life:.32,max:.32,color:'#c9f58c',width:2});
  }
}

/* ================================================================== *
 *                              RENDERING                             *
 * ================================================================== */
const bgCanvas = document.createElement('canvas');
bgCanvas.width = W; bgCanvas.height = H;
const dust = [];

function glowSprite(color, size=128){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  gr.addColorStop(0,color);
  gr.addColorStop(.45,color.replace(/[\d.]+\)$/,'0.35)'));
  gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0,0,size,size);
  return c;
}
const GLOW = {
  green: glowSprite('rgba(157,255,120,.9)'),
  lime:  glowSprite('rgba(214,255,150,.9)'),
  amber: glowSprite('rgba(255,180,105,.9)'),
  red:   glowSprite('rgba(255,120,100,.9)'),
  blue:  glowSprite('rgba(150,225,255,.9)'),
  white: glowSprite('rgba(255,255,235,.9)'),
  purple:glowSprite('rgba(190,170,255,.9)')
};
function glow(img,x,y,size,alpha){
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x-size/2, y-size/2, size, size);
  ctx.globalAlpha = 1;
}
function rrect(g,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r,y);
  g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r);
  g.arcTo(x,y,x+w,y,r);
  g.closePath();
}

function buildBackground(){
  const g = bgCanvas.getContext('2d');
  let seed = 20260113;
  const rnd = () => (seed = (seed*1664525+1013904223)>>>0) / 4294967296;

  const base = g.createLinearGradient(0,0,W*.4,H);
  base.addColorStop(0,'#16231d');
  base.addColorStop(.45,'#1d2f26');
  base.addColorStop(1,'#101a15');
  g.fillStyle = base;
  g.fillRect(0,0,W,H);

  // soft warm pool of light in the middle of the arena
  const light = g.createRadialGradient(W*.5,H*.45,60,W*.5,H*.45,W*.58);
  light.addColorStop(0,'rgba(150,200,132,.16)');
  light.addColorStop(.55,'rgba(78,120,92,.07)');
  light.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = light;
  g.fillRect(0,0,W,H);

  // faint hexagonal tiling
  g.strokeStyle = 'rgba(158,200,158,.075)';
  g.lineWidth = 1.2;
  const R = 46;
  for(let cy=-1; cy<H/(R*1.5)+1; cy++){
    for(let cx=-1; cx<W/(R*1.732)+1; cx++){
      const x = cx*R*1.732 + (cy%2?R*.866:0);
      const y = cy*R*1.5;
      g.beginPath();
      for(let i=0;i<6;i++){
        const a = Math.PI/3*i + Math.PI/6;
        const px = x + Math.cos(a)*R, py = y + Math.sin(a)*R;
        i ? g.lineTo(px,py) : g.moveTo(px,py);
      }
      g.closePath();
      g.stroke();
    }
  }

  // mossy patches
  for(let i=0;i<60;i++){
    const x = rnd()*W, y = rnd()*H, r = 26+rnd()*90;
    const gr = g.createRadialGradient(x,y,0,x,y,r);
    const tone = rnd();
    gr.addColorStop(0, tone>.5 ? 'rgba(122,166,101,.10)' : 'rgba(86,128,116,.10)');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x,y,r,0,TAU); g.fill();
  }

  // grass tufts
  for(let i=0;i<190;i++){
    const x = rnd()*W, y = rnd()*H;
    if(x<56||x>W-56||y<56||y>H-56) continue;
    g.strokeStyle = `rgba(172,214,150,${.07+rnd()*.10})`;
    g.lineWidth = 1;
    const h = 3+rnd()*6, lean = rnd()*1.4-.7;
    for(let b=-1;b<=1;b++){
      g.beginPath();
      g.moveTo(x+b*2.2, y);
      g.quadraticCurveTo(x+b*3+lean*2, y-h*.6, x+b*4.4+lean*4, y-h);
      g.stroke();
    }
  }

  // rocks
  for(let i=0;i<24;i++){
    const x = 70+rnd()*(W-140), y = 70+rnd()*(H-140);
    const s = 6+rnd()*11;
    g.fillStyle = 'rgba(12,22,17,.45)';
    g.beginPath(); g.ellipse(x+s*.3, y+s*.72, s*1.25, s*.5, 0, 0, TAU); g.fill();
    const rg = g.createLinearGradient(x, y-s, x, y+s*.7);
    rg.addColorStop(0, 'rgba(116,136,120,.55)');
    rg.addColorStop(.6,'rgba(78,96,84,.52)');
    rg.addColorStop(1, 'rgba(44,60,50,.5)');
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(x, y, s, s*.72, rnd()*.6-.3, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(206,232,190,.16)';
    g.beginPath(); g.ellipse(x-s*.22, y-s*.24, s*.5, s*.24, -.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(126,170,110,.20)';
    g.beginPath(); g.ellipse(x+s*.3, y+s*.18, s*.42, s*.22, .2, 0, TAU); g.fill();
  }

  // arena boundary
  g.strokeStyle = 'rgba(190,225,170,.16)';
  g.lineWidth = 2;
  rrect(g, 44, 44, W-88, H-88, 18);
  g.stroke();
  g.strokeStyle = 'rgba(190,225,170,.07)';
  g.lineWidth = 1;
  g.setLineDash([8,12]);
  rrect(g, 54, 54, W-108, H-108, 14);
  g.stroke();
  g.setLineDash([]);
  // corner brackets
  g.strokeStyle = 'rgba(200,240,160,.45)';
  g.lineWidth = 3;
  const corners = [[44,44,1,1],[W-44,44,-1,1],[44,H-44,1,-1],[W-44,H-44,-1,-1]];
  for(const [x,y,sx,sy] of corners){
    g.beginPath();
    g.moveTo(x, y+sy*34);
    g.lineTo(x, y);
    g.lineTo(x+sx*34, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(200,232,180,.18)';
  g.font = 'bold 10px monospace';
  g.fillText('SECTOR 01 / SURVIVAL ZONE', 58, H-54);
  g.fillText('N 35°  /  E 139°', W-172, 66);

  // vignette baked into the floor
  const vig = g.createRadialGradient(W/2,H/2,Math.min(W,H)*.46,W/2,H/2,Math.max(W,H)*.74);
  vig.addColorStop(0,'rgba(0,0,0,0)');
  vig.addColorStop(1,'rgba(5,10,8,.5)');
  g.fillStyle = vig;
  g.fillRect(0,0,W,H);
}
buildBackground();
for(let i=0;i<44;i++) dust.push({x:rand(0,W), y:rand(0,H), r:rand(1,3), sp:rand(4,16), a:rand(.05,.2), ph:rand(0,TAU)});

function drawBackground(t){
  ctx.drawImage(bgCanvas,0,0);
  // drifting spores
  for(const d of dust){
    const y = (d.y + Math.sin(t*.5+d.ph)*12) % H;
    const x = (d.x + Math.cos(t*.3+d.ph)*16 + W) % W;
    glow(GLOW.lime, x, y, d.r*12, d.a);
  }
  // slow light sweep
  const sweep = (Math.sin(t*.16)*.5+.5);
  ctx.globalAlpha = .055;
  const grd = ctx.createLinearGradient(W*(sweep-.25), 0, W*(sweep+.15), H);
  grd.addColorStop(0,'rgba(190,255,170,0)');
  grd.addColorStop(.5,'rgba(190,255,170,1)');
  grd.addColorStop(1,'rgba(190,255,170,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,W,H);
  ctx.globalAlpha = 1;
}

/* ----------------------------- fighters --------------------------- */
function drawFighter(f,t){
  if(!f.alive) return;
  const isPlayer = !f.clone;
  const main = isPlayer ? '#c6f283' : '#ffbe7a';
  const mid  = isPlayer ? '#8fc95f' : '#d98f52';
  const dark = isPlayer ? '#4a6338' : '#7d4f31';
  const rim  = isPlayer ? '#eaffc4' : '#ffe2bd';
  const glowName = isPlayer ? 'lime' : 'amber';
  const bob = Math.sin(t*3.4 + f.bob)*1.1;
  const step = f.moving ? Math.sin(f.legPhase) : 0;
  const awake = Object.values(f.weapons).some(v=>v>=3) || Object.values(f.upgrades).some(v=>v>=3);
  const outline = 'rgba(9,18,13,.72)';

  ctx.save();
  ctx.translate(f.x, f.y);

  ctx.fillStyle = 'rgba(5,12,8,.45)';
  ctx.beginPath();
  ctx.ellipse(0, 17, 16, 6, 0, 0, TAU);
  ctx.fill();

  if(awake) glow(GLOW[glowName], 0, 0, 96, .16 + Math.sin(t*4)*.05);
  glow(GLOW[glowName], 0, 0, 52, .11);

  for(const b of (f.blades||[])){
    const x = b.x-f.x, y = b.y-f.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.a + t*9);
    glow(GLOW.blue, 0, 0, 44, .6);
    ctx.fillStyle = '#f2feff';
    ctx.strokeStyle = 'rgba(140,220,245,.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2,-12); ctx.lineTo(14,0); ctx.lineTo(-2,12); ctx.lineTo(3,0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if(f.invuln > 0 && Math.floor(t*20)%2 === 0) ctx.globalAlpha = .55;

  // legs
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4.5, 7); ctx.lineTo(-4.5 + step*4.5, 15.5);
  ctx.moveTo(4.5, 7);  ctx.lineTo(4.5 - step*4.5, 15.5);
  ctx.stroke();

  // backpack fin
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-7, -2+bob); ctx.lineTo(-13, 4+bob); ctx.lineTo(-6, 6+bob);
  ctx.closePath();
  ctx.fill();

  // torso
  const g1 = ctx.createLinearGradient(0,-12,0,10);
  g1.addColorStop(0, mid);
  g1.addColorStop(.55, main);
  g1.addColorStop(1, dark);
  ctx.fillStyle = f.hit > .02 ? '#ffffff' : g1;
  ctx.beginPath();
  ctx.moveTo(-9.5,-9+bob);
  ctx.quadraticCurveTo(0,-13+bob, 9.5,-9+bob);
  ctx.quadraticCurveTo(12,0+bob, 8.5,9+bob);
  ctx.quadraticCurveTo(0,12.5+bob, -8.5,9+bob);
  ctx.quadraticCurveTo(-12,0+bob, -9.5,-9+bob);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // chest core
  glow(GLOW[glowName], 0, -1+bob, 22, .55);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.arc(0, -1+bob, 2.1, 0, TAU);
  ctx.fill();

  // shoulders
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(-9, -7+bob, 3.6, 0, TAU);
  ctx.arc(9, -7+bob, 3.6, 0, TAU);
  ctx.fill();

  // neck
  ctx.fillStyle = 'rgba(9,18,13,.55)';
  ctx.fillRect(-4, -14+bob, 8, 5);

  // head
  ctx.fillStyle = f.hit > .02 ? '#ffffff' : main;
  ctx.beginPath();
  ctx.ellipse(0, -18+bob, 8.6, 8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(10,22,15,.22)';
  ctx.beginPath();
  ctx.ellipse(0, -21.5+bob, 8.2, 4.2, 0, Math.PI, TAU);
  ctx.fill();

  // visor
  const vx = Math.cos(f.angle)*1.8, vy = Math.sin(f.angle)*1.2;
  ctx.fillStyle = isPlayer ? '#e8ffc4' : '#ffe9cc';
  ctx.shadowColor = isPlayer ? '#c9ff9a' : '#ffca86';
  ctx.shadowBlur = 10;
  rrect(ctx, -6.5+vx, -19.5+bob+vy, 13, 3.8, 1.9);
  ctx.fill();
  ctx.shadowBlur = 0;

  // antenna
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(6, -24+bob); ctx.lineTo(8.5, -31+bob);
  ctx.stroke();
  glow(GLOW.white, 8.5, -31.5+bob, 11, .85);

  // weapon arm
  ctx.save();
  ctx.rotate(f.angle);
  const shotgun = (f.weapons.shotgun||0) > 0;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(13, 3.5); ctx.stroke();
  const gl = ctx.createLinearGradient(0,-4,0,5);
  gl.addColorStop(0,'#a7c0b0');
  gl.addColorStop(.45,'#6d8878');
  gl.addColorStop(1,'#2b3a32');
  ctx.fillStyle = gl;
  ctx.beginPath();
  if(shotgun) rrect(ctx, 11, -4.2, 19, 8.4, 2.4);
  else rrect(ctx, 11, -2.8, 22, 5.6, 2.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(9,18,13,.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#c3d6c6';
  rrect(ctx, 11, shotgun?-4.2:-2.8, 6, shotgun?8.4:5.6, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  rrect(ctx, 12.5, shotgun?-3.4:-2, 14, 1.4, .7);
  ctx.fill();
  if(f.muzzle > 0){
    const k = clamp(f.muzzle/.16,0,1);
    glow(GLOW.white, 34, 0, 44*k, .95);
    glow(GLOW[glowName], 32, 0, 62*k, .5);
  }
  ctx.restore();

  if(f.cast > 0){
    ctx.strokeStyle = isPlayer ? 'rgba(190,255,150,.75)' : 'rgba(255,205,150,.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + (1-clamp(f.cast/.3,0,1))*20, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = 'bold 9px "Space Grotesk", monospace';
  ctx.fillStyle = isPlayer ? 'rgba(222,255,192,.9)' : 'rgba(255,216,178,.9)';
  ctx.fillText(isPlayer ? 'YOU' : 'CLONE', f.x, f.y-40);
  if(f.clone){
    const w = 32;
    ctx.fillStyle = 'rgba(8,14,10,.75)';
    rrect(ctx, f.x-w/2, f.y+21, w, 3.6, 1.8); ctx.fill();
    ctx.fillStyle = '#ffbe7a';
    rrect(ctx, f.x-w/2, f.y+21, w*Math.max(0,f.hp)/f.maxHp, 3.6, 1.8); ctx.fill();
  }
}

/* ------------------------------ enemies --------------------------- */
function drawEnemy(e,t){
  const bob = Math.sin(t*5+e.seed)*1.6;
  const wob = Math.sin(t*4.4+e.wob);
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = 'rgba(6,12,10,.4)';
  ctx.beginPath();
  ctx.ellipse(0, e.r*.95, e.r*1.1, e.r*.34, 0, 0, TAU);
  ctx.fill();

  glow(GLOW.red, 0, 0, e.r*4.2, e.slow>0?.28:.16);

  const body = e.hit > 0 ? '#ffffff' : e.type==='brute' ? '#e07d63' : e.type==='runner' ? '#f09a7f' : '#ef9f86';
  const shade = e.type==='brute' ? '#96442f' : '#b8624a';
  const shine = e.type==='brute' ? '#ffc0a4' : '#ffd0ba';

  // gelatinous body
  const eg = ctx.createRadialGradient(-e.r*.3, -e.r*.45+bob, e.r*.15, 0, bob, e.r*1.15);
  eg.addColorStop(0, body);
  eg.addColorStop(.62, body);
  eg.addColorStop(1, shade);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(wob*.9, bob, e.r*(1+wob*.06), e.r*.9, 0, 0, TAU);
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(74,28,22,.45)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.ellipse(-e.r*.34, -e.r*.45+bob, e.r*.32, e.r*.18, -.5, 0, TAU);
  ctx.fill();
  // underbelly
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(wob*.9, bob+e.r*.46, e.r*.78, e.r*.24, 0, 0, TAU);
  ctx.fill();

  if(e.type === 'brute'){
    ctx.fillStyle = 'rgba(90,40,34,.55)';
    for(let i=0;i<7;i++){
      const a = Math.PI + i*(Math.PI/6) + Math.sin(t*3+i)*.06;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*e.r*.8, Math.sin(a)*e.r*.7+bob);
      ctx.lineTo(Math.cos(a)*e.r*1.5, Math.sin(a)*e.r*1.35+bob);
      ctx.lineTo(Math.cos(a+.24)*e.r*.85, Math.sin(a+.24)*e.r*.75+bob);
      ctx.closePath();
      ctx.fill();
    }
    // armour plates
    ctx.strokeStyle = 'rgba(60,28,24,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, bob, e.r*.72, .2, Math.PI-.2);
    ctx.stroke();
  }
  if(e.type === 'runner'){
    ctx.strokeStyle = 'rgba(255,190,160,.28)';
    ctx.lineWidth = 2;
    for(let i=1;i<=3;i++){
      ctx.beginPath();
      ctx.arc(0, bob, e.r + i*4, Math.PI*.15, Math.PI*.85);
      ctx.stroke();
    }
  }

  // eyes: glow + white sclera + small dark pupil
  const eye = e.slow>0 ? GLOW.blue : GLOW.white;
  glow(eye, -e.r*.33, -4+bob, e.r*1.6, .6);
  glow(eye,  e.r*.33, -4+bob, e.r*1.6, .6);
  ctx.fillStyle = e.slow>0 ? '#dff4ff' : '#fff3ea';
  ctx.beginPath();
  ctx.ellipse(-e.r*.33, -4+bob, e.r*.24, e.r*.26, 0, 0, TAU);
  ctx.ellipse( e.r*.33, -4+bob, e.r*.24, e.r*.26, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = e.slow>0 ? '#3b6e8c' : '#4a1f18';
  ctx.beginPath();
  ctx.arc(-e.r*.31, -3.4+bob, e.r*.11, 0, TAU);
  ctx.arc( e.r*.33, -3.4+bob, e.r*.11, 0, TAU);
  ctx.fill();
  // brow
  ctx.strokeStyle = 'rgba(80,30,24,.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-e.r*.55, -e.r*.45+bob); ctx.lineTo(-e.r*.16, -e.r*.3+bob);
  ctx.moveTo(e.r*.55, -e.r*.45+bob);  ctx.lineTo(e.r*.16, -e.r*.3+bob);
  ctx.stroke();
  // mouth
  ctx.strokeStyle = 'rgba(74,20,16,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, e.r*.2+bob, e.r*.28, .25*Math.PI, .75*Math.PI);
  ctx.stroke();

  // frozen shell
  if(e.slow > 0){
    ctx.strokeStyle = 'rgba(170,230,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, bob, e.r*1.1, 0, TAU); ctx.stroke();
  }
  ctx.restore();

  if(e.hp < e.maxHp && e.type === 'brute'){
    const w = e.r*2.2;
    ctx.fillStyle = 'rgba(8,14,10,.7)';
    rrect(ctx, e.x-w/2, e.y-e.r-13, w, 4, 2); ctx.fill();
    ctx.fillStyle = '#ff9f86';
    rrect(ctx, e.x-w/2, e.y-e.r-13, w*Math.max(0,e.hp)/e.maxHp, 4, 2); ctx.fill();
  }
}

/* ------------------------------ minions --------------------------- */
function drawMinion(m,t){
  const bob = Math.sin(t*7+m.bob)*1.6;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.fillStyle = 'rgba(6,12,8,.4)';
  ctx.beginPath(); ctx.ellipse(0,13,11,4,0,0,TAU); ctx.fill();
  glow(GLOW.green, 0, 0, 52, m.lv>=3?.4:.24);
  ctx.fillStyle = m.hit>0?'#ffffff': m.lv>=3?'#a8f27e':'#8fd06a';
  rrect(ctx, -8, -12+bob, 16, 22, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(50,85,40,.5)';
  rrect(ctx, -8, 2+bob, 16, 8, 4);
  ctx.fill();
  // arms reaching out
  ctx.strokeStyle = '#7ac25c';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7,-4+bob); ctx.lineTo(-13,-8+bob+Math.sin(t*9+m.bob)*2);
  ctx.moveTo(7,-4+bob);  ctx.lineTo(13,-8+bob+Math.cos(t*9+m.bob)*2);
  ctx.stroke();
  // head + eyes
  ctx.fillStyle = m.hit>0?'#ffffff':'#9bdc72';
  ctx.beginPath(); ctx.arc(0,-15+bob,6.5,0,TAU); ctx.fill();
  ctx.fillStyle = '#1d2a16';
  ctx.beginPath();
  ctx.arc(-2.4,-16+bob,1.3,0,TAU);
  ctx.arc(2.4,-16+bob,1.3,0,TAU);
  ctx.fill();
  ctx.restore();

  // life bar
  const w = 20, p = clamp(m.life/m.maxLife,0,1);
  ctx.fillStyle = 'rgba(8,14,10,.65)';
  rrect(ctx, m.x-w/2, m.y+16, w, 3, 1.5); ctx.fill();
  ctx.fillStyle = p>.3?'#9fe070':'#e0c56a';
  rrect(ctx, m.x-w/2, m.y+16, w*p, 3, 1.5); ctx.fill();
}

/* ------------------------------ render ---------------------------- */
function render(t){
  ctx.setTransform(1,0,0,1,0,0);
  if(shake > .1){
    ctx.translate(rand(-shake,shake), rand(-shake,shake));
  }
  drawBackground(t);

  // rings / shockwaves
  for(const r of game.rings){
    const k = r.life/r.max;
    ctx.globalAlpha = k*.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width*k;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for(const m of game.minions) drawMinion(m,t);
  for(const e of game.enemies) drawEnemy(e,t);
  for(const c of game.clones) drawFighter(c,t);
  drawFighter(game.player,t);

  // beams (chain lightning)
  ctx.globalCompositeOperation = 'lighter';
  for(const b of game.beams){
    const k = b.life/b.max;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = k;
    ctx.lineWidth = 2.6*k+1.4;
    ctx.beginPath();
    for(let i=0;i<b.pts.length-1;i++){
      const a = b.pts[i], c2 = b.pts[i+1];
      ctx.moveTo(a.x,a.y);
      const steps = 4;
      for(let s=1;s<=steps;s++){
        const p = s/steps;
        const jx = s===steps?0:rand(-9,9);
        const jy = s===steps?0:rand(-9,9);
        ctx.lineTo(a.x+(c2.x-a.x)*p+jx, a.y+(c2.y-a.y)*p+jy);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = k*.42;
    ctx.lineWidth = 10*k;
    ctx.strokeStyle = 'rgba(140,220,255,.5)';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // bullets
  for(const b of game.bullets){
    const lifeK = clamp(b.life/b.maxLife,0,1);
    glow(b.color==='#b8ff83'||b.color==='#d9ffa1'?GLOW.green:GLOW.amber, b.x, b.y, b.r*9, .85);
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = .45*lifeK;
    ctx.lineWidth = b.r*.8;
    ctx.beginPath();
    ctx.moveTo(b.px, b.py);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r*.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r*.35, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // particles
  for(const p of game.particles){
    const k = clamp(p.life*3,0,1);
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x-p.r/2, p.y-p.r/2, p.r, p.r);
  }
  ctx.globalAlpha = 1;

  // damage numbers
  ctx.textAlign = 'center';
  for(const tx of game.texts){
    const k = clamp(tx.life/tx.max,0,1);
    ctx.globalAlpha = k;
    ctx.font = `700 ${tx.size}px "Space Grotesk", monospace`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,14,10,.65)';
    ctx.strokeText(tx.text, tx.x, tx.y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;

  // level-up / awaken flash
  if(game.state === 'reward'){
    ctx.fillStyle = 'rgba(140,200,120,.05)';
    ctx.fillRect(0,0,W,H);
  }
}

/* ------------------------------- loop ----------------------------- */
function frame(ms){
  const dt = Math.min((ms-last)/1000||0, .05);
  last = ms;
  tick(dt);
  render(ms/1000);
  requestAnimationFrame(frame);
}
function togglePause(){
  if(game.state === 'playing'){
    game.state = 'paused';
    $('pauseOverlay').classList.remove('hidden');
    $('topStatus').textContent = 'PAUSED';
  } else if(game.state === 'paused'){
    game.state = 'playing';
    $('pauseOverlay').classList.add('hidden');
    $('topStatus').textContent = 'SURVIVAL IN PROGRESS';
  }
}

$('touchDash').addEventListener('pointerdown', e=>{ e.preventDefault(); dash(); });
$('startBtn').onclick = start;
$('restartBtn').onclick = start;
$('pauseBtn').onclick = togglePause;
$('resumeBtn').onclick = togglePause;
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if(!e.repeat && k === 'p') togglePause();
  if(!e.repeat && k === ' ') dash();
  keys.add(k);
});
window.addEventListener('keyup', e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', ()=>{ keys.clear(); if(game.state === 'playing') togglePause(); });
canvas.addEventListener('pointerdown', e=>{
  if(e.pointerType === 'mouse') return;
  touch.active = true;
  touch.x = e.clientX; touch.y = e.clientY;
  touch.dx = touch.dy = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e=>{
  if(!touch.active) return;
  const dx = e.clientX-touch.x, dy = e.clientY-touch.y;
  const d = Math.hypot(dx,dy);
  touch.dx = d>8 ? dx/d : 0;
  touch.dy = d>8 ? dy/d : 0;
});
function releaseTouch(){ touch.active = false; touch.dx = touch.dy = 0; }
canvas.addEventListener('pointerup', releaseTouch);
canvas.addEventListener('pointercancel', releaseTouch);

newGame();
for(let i=0;i<12;i++) spawnEnemy();
game.enemies.forEach(e=>{
  e.x = rand(70,W-70); e.y = rand(70,H-70);
  if(Math.hypot(e.x-W/2, e.y-H/2) < 170) e.y = clamp(e.y+230, 60, H-60);
});
requestAnimationFrame(frame);
// Optional test hook (only active when a harness sets window.__CLONE_DEBUG__).
if(typeof window !== 'undefined' && window.__CLONE_DEBUG__){
  window.__cloneGame = {
    get g(){ return game; }, stat, applyCard, availableCards, spawnEnemy, start, render, tick,
    weaponLevel, WEAPONS, WEAPON_SPEC, hurt, step:(n,dt=.0167)=>{ for(let i=0;i<n;i++) tick(dt); }
  };
}
})();
