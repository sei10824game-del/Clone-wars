(() => {
'use strict';
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d', {alpha:false});
/* On touch devices the arena is shaped like the screen instead of 1100x650,
   so a phone in portrait gets a tall field and no wasted letterbox space.
   Total arena area stays close to the desktop one, so balance is unchanged. */
const MOBILE_FIELD = (typeof window !== 'undefined') && window.matchMedia
  ? window.matchMedia('(pointer:coarse)').matches
  : false;
if(MOBILE_FIELD){
  const AREA = 1100 * 650 * 0.85;   // slightly tighter field = chunkier actors on a phone
  const vw = window.innerWidth || 390, vh = window.innerHeight || 844;
  const ratio = clampNum(vw / vh, 0.50, 2.2);
  canvas.width  = Math.round(Math.sqrt(AREA * ratio) / 20) * 20;
  canvas.height = Math.round(Math.sqrt(AREA / ratio) / 20) * 20;
  canvas.dataset.mobile = '1';
  document.documentElement.classList.add('touch-device');
  document.body.classList.add('has-touch');
}
function clampNum(n, a, b){ return Math.max(a, Math.min(b, n)); }
const W = canvas.width, H = canvas.height, $ = id => document.getElementById(id);
const TAU = Math.PI*2;

/* The arena used to be exactly one screen. It is now a large scrolling world
   with the camera locked on the player, so gameplay bounds are WORLD_* while
   W/H remain the viewport (and the authoring size for the baked backdrop). */
const WORLD = { w: 4600, h: 4600 };
const WORLD_W = WORLD.w, WORLD_H = WORLD.h;
/* persistent camera + world state (survives newGame so the map is stable) */
const cam = { x: 0, y: 0, shakeX: 0, shakeY: 0 };
let WORLD_SEED = 20260314;
const worldEnt = { obstacles: [], buildings: [] };
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const rand = (a,b) => a + Math.random()*(b-a);
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const keys = new Set();

/* ------------------------------------------------------------------ *
 *  WEAPONS  — each has 3 levels. Picking the same card again upgrades. *
 * ------------------------------------------------------------------ */
const WEAPONS = [
  {id:'shotgun', icon:'✳', name:'ショットガン', tag:'RANGED',
   levels:[
     '扇状に5発の散弾を撃ち出す。近距離で全弾命中させると強力。',
     '散弾が7発に増え、射程と威力が上昇。弾が1体を貫通する。',
     '覚醒：11発に増加。全弾貫通し、敵を大きく吹き飛ばす。']},
  {id:'zombie', icon:'☠', name:'ゾンビコール', tag:'SUMMON',
   levels:[
     '一定時間ごとにゾンビを1体召喚。敵に噛みついて攻撃する。',
     '召喚数が2体に増え、ゾンビのHP・攻撃力・寿命が上昇。',
     '覚醒：3体を召喚。ゾンビは消える時、周囲で自爆する。']},
  {id:'chain', icon:'ϟ', name:'チェインライトニング', tag:'RANGED',
   levels:[
     '敵に電撃を放ち、近くの敵へ連鎖する（最大2体）。',
     '連鎖数が3体に増え、威力と連鎖距離が上昇。',
     '覚醒：最大5体へ連鎖。感電した敵を麻痺させる。']},
  {id:'orbit', icon:'✜', name:'オービットブレード', tag:'RANGED',
   levels:[
     '自分の周囲を1枚の刃が旋回し、触れた敵を切り裂く。',
     '刃が2枚に増え、回転と威力が上がる。',
     '覚醒：刃が4枚になり、攻撃範囲が大きく広がる。']},
  {id:'nova', icon:'❄', name:'フロストノヴァ', tag:'RANGED',
   levels:[
     '一定時間ごとに冷気を放出し、周囲の敵を攻撃する。',
     'ノヴァの範囲と威力が上昇し、間隔が短くなる。',
     '覚醒：ヒットした敵を凍結させ、動きを大きく鈍らせる。']},
  {id:'drone', icon:'⌖', name:'サポートドローン', tag:'SUMMON',
   levels:[
     '自分に追従するドローンを1機召喚。自動で敵を撃つ。',
     'ドローンが2機に増え、連射速度と威力が上がる。',
     '覚醒：3機になり、レーザーが敵を貫通する。']},
  {id:'wisp', icon:'✧', name:'スピリットウィスプ', tag:'SUMMON',
   levels:[
     '一定時間ごとにウィスプを召喚。敵に突撃して爆発する。',
     '召喚数が2体に増え、爆発範囲と威力が上昇。',
     '覚醒：3体を召喚。爆発が大きく広がり、敵をよろけさせる。']},
  {id:'mine', icon:'◉', name:'マインフィールド', tag:'TRAP',
   levels:[
     '足元に地雷を設置。敵が近づくと爆発する。',
     '設置間隔が短くなり、爆発範囲と威力が上昇。',
     '覚醒：設置数が増え、広範囲を吹き飛ばす。']},
  {id:'spike', icon:'✶', name:'スパイクマット', tag:'TRAP',
   levels:[
     '足元に棘の罠を設置。踏んだ敵に継続ダメージ。',
     '罠の範囲とダメージが上昇し、長く残る。',
     '覚醒：棘が大型化し、敵の動きを止めることがある。']},
  {id:'poison', icon:'☣', name:'ポイズンゾーン', tag:'TRAP',
   levels:[
     '足元に毒の沼を設置。触れた敵を持続的に蝕む。',
     '沼が広がり、毒のダメージと持続時間が上昇。',
     '覚醒：強毒になり、敵を大きく弱らせる。']}
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
    {radius:168, dmg:1.40, cd:1.8}],
  drone:[
    {count:1, rate:1.30, dmg:.50, range:300, pierce:0},
    {count:2, rate:1.00, dmg:.60, range:330, pierce:0},
    {count:3, rate:.78,  dmg:.70, range:360, pierce:1}],
  wisp:[
    {count:1, cd:4.8, dmg:1.05, radius:52, life:5.5},
    {count:2, cd:4.0, dmg:1.20, radius:64, life:6.5},
    {count:3, cd:3.2, dmg:1.40, radius:78, life:7.5}],
  mine:[
    {cd:4.2, dmg:1.35, radius:70,  max:4,  arm:.60, trigger:36},
    {cd:3.4, dmg:1.55, radius:84,  max:6,  arm:.50, trigger:40},
    {cd:2.4, dmg:1.80, radius:104, max:9,  arm:.40, trigger:46}],
  spike:[
    {cd:3.4, radius:46, dmg:.40, life:6.0, max:4, tick:.55},
    {cd:2.7, radius:56, dmg:.52, life:7.0, max:6, tick:.50},
    {cd:2.0, radius:68, dmg:.64, life:8.0, max:8, tick:.45}],
  poison:[
    {cd:3.6, radius:58, dmg:.42, life:5.5, max:4, tick:.55},
    {cd:2.8, radius:70, dmg:.55, life:6.5, max:6, tick:.50},
    {cd:2.1, radius:86, dmg:.68, life:7.5, max:8, tick:.45}]
};

const STATS = [
  {id:'power', icon:'✹', name:'パワーショット', tag:'STAT',
   levels:['すべての攻撃のダメージ +20%。','さらに +20%。','覚醒：ダメージが大幅に上昇する。']},
  {id:'bullet', icon:'➶', name:'アクセル弾', tag:'STAT',
   levels:['弾速と射程がアップ。','さらに弾速と射程がアップ。','覚醒：射程が大きく伸びる。']},
  {id:'speed', icon:'➤', name:'スピードブースト', tag:'STAT',
   levels:['移動速度がアップ。','さらに移動速度がアップ。','覚醒：大きく軽快になる。']},
  {id:'vital', icon:'♥', name:'バイタリティ', tag:'STAT',
   levels:['最大HP +20。HPも回復。','最大HP +20。HPも回復。','覚醒：最大HP +40、大きく回復。']},
  {id:'regen', icon:'✚', name:'リジェネレーション', tag:'STAT',
   levels:['時間とともにHPが回復。','回復量が増える。','覚醒：回復量がさらに増加。']},
  {id:'dash', icon:'»', name:'クイックステップ', tag:'STAT',
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
    cd:{rifle:rand(.05,.4), shotgun:0, chain:0, zombie:0, nova:0, wisp:0, mine:0, spike:0, poison:0},
    orbitPhase:rand(0,TAU), blades:[],
    shoot:rand(.05,.4), dashCd:0, dashTime:0, invuln:0, hit:0, muzzle:0, cast:0,
    angle:clone?rand(0,TAU):-Math.PI/2, alive:true, decision:0, action:0, state:null, reward:0,
    seed:rand(0,100), legPhase:0, moveX:0, moveY:0, moving:false, bob:rand(0,7),
    frenzy:0
  };
}
function newGame(){
  cam.x = WORLD_W/2; cam.y = WORLD_H/2;
  game = {
    state:'ready', stage:1, time:30, elapsed:0, kills:0,
    player:fighter(WORLD_W/2, WORLD_H/2), clones:[], enemies:[], bullets:[], minions:[],
    drones:[], wisps:[], hazards:[],
    particles:[], texts:[], beams:[], rings:[], sparks:[], drops:[],
    spawn:1, pick:0, pendingLevels:0, arsenalSig:'',
    cooldown:0, cooldown0:5, roundReady:false, roundAnchor:{x:0,y:0}, pendingStage:0,
    boss:null, bossFlash:0, eliteCount:0, frenzy:0, afterglow:0, bossTimer:-1
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
    dashCooldown: Math.max(1.1, 3 - n('dash')*.45 - (n('dash')>=3?.35:0)),
    healMul: 1 + n('vital')*.25
  };
}

function weaponLevel(f,id){ return f.weapons[id]||0; }

/* ------------------------------ cards ----------------------------- */
function cardPool(f){
  const pool = [];
  for(const d of WEAPONS){
    const lv = weaponLevel(f,d.id);
    if(lv < 3) pool.push({id:d.id, icon:d.icon, name:d.name, kind:'weapon', tag:d.tag,
      level:lv, desc:d.levels[Math.min(lv,2)], burst:lv===0});
  }
  for(const d of STATS){
    const lv = f.upgrades[d.id]||0;
    if(lv < 3) pool.push({id:d.id, icon:d.icon, name:d.name, kind:'stat', tag:d.tag, level:lv,
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
    const cdKey = {zombie:'zombie', wisp:'wisp', mine:'mine', spike:'spike', poison:'poison'}[id];
    if(lv === 0 && cdKey) f.cd[cdKey] = .45;
    if(id === 'drone') syncDrones(f);
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
  if(game.state === 'cooldown'){
    $('timer').textContent = 'COOLDOWN ' + game.cooldown.toFixed(1) + 's';
    $('stageFill').style.width = (100*(1-game.cooldown/(game.cooldown0||5)))+'%';
    $('stageFill').style.background = '#9fe6ff';
  } else {
    $('timer').textContent = '00:'+String(Math.ceil(Math.max(0,game.time))).padStart(2,'0');
    $('stageFill').style.width = (100*(1-game.time/30))+'%';
    $('stageFill').style.background = '';
  }
  $('cloneCount').textContent = String(game.clones.filter(c=>c.alive).length).padStart(2,'0');
  $('killCount').textContent = String(game.kills).padStart(2,'0');
  $('healthFill').style.width = (100*Math.max(0,p.hp)/p.maxHp)+'%';
  $('healthText').innerHTML = Math.ceil(Math.max(0,p.hp))+' <small>/ '+p.maxHp+'</small>';
  $('level').textContent = String(p.level).padStart(2,'0');
  $('xpFill').style.width = (100*Math.min(1,p.xp/threshold(p)))+'%';
  $('xpText').textContent = Math.floor(p.xp)+' / '+threshold(p)+' XP';
  // show which depth band we're standing in, plus the squad's own levels
  const fd = $('fieldCoords');
  if(fd){
    const band = depthLabel(worldDepth(p.x, p.y));
    fd.innerHTML = band.label + ' <span>' + Math.round(worldDepth(p.x,p.y)*100) + '%</span> <span class="muted">✳</span>';
    fd.style.color = band.color;
  }
  const squad = game.clones.filter(c=>c.alive);
  if(squad.length){
    $('cloneCount').title = squad.map(c=>'Lv.'+c.level).join(' / ');
  }
  updateBossBar();
  updateArsenal();
}
function updateBossBar(){
  const bar = $('bossBar');
  if(!bar) return;
  const b = game.boss;
  if(!b || !b.alive){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  $('bossName').textContent = b.name;
  $('bossSub').textContent = b.title + (b.tier ? '  +'+b.tier : '');
  const pct = Math.max(0, b.hp/b.maxHp)*100;
  $('bossFill').style.width = pct+'%';
  $('bossPercent').textContent = Math.ceil(Math.max(0,b.hp)) + ' / ' + b.maxHp;
  bar.classList.toggle('low', pct < 30);
}
function updateArsenal(){
  const box = $('arsenal');
  if(!box) return;
  const owned = [];
  for(const d of WEAPONS){
    const lv = weaponLevel(game.player,d.id);
    if(lv > 0) owned.push({icon:d.icon,name:d.name,lv});
  }
  const sig = owned.map(o=>o.icon+o.lv).join('|')
    + '#' + (game.minions.length+game.wisps.length+game.drones.length) + '/' + game.hazards.length
    + '@' + (game.boss ? Math.ceil(game.boss.hp) : 0) + '/' + (game.boss ? game.boss.maxHp : 0)
    + '+' + game.eliteCount;
  if(sig === game.arsenalSig) return;
  game.arsenalSig = sig;
  if(!owned.length){
    box.innerHTML = '<span class="ars-empty">武装なし — レベルアップで攻撃を獲得</span>';
    return;
  }
  box.innerHTML = owned.map(o=>{
    const pips = '◆'.repeat(o.lv) + '◇'.repeat(3-o.lv);
    return `<span class="ars-chip${o.lv>=3?' awake':''}" title="${o.name} Lv.${o.lv}${o.lv>=3?' 覚醒':''}"><i>${o.icon}</i><em>${pips}</em></span>`;
  }).join('')
    + `<span class="ars-count" title="召喚中のユニット / 設置中のトラップ">⚔${game.minions.length+game.wisps.length+game.drones.length} ◈${game.hazards.length}</span>`
    + (game.eliteCount ? `<span class="ars-count elite" title="撃破したエリート">★${game.eliteCount}</span>` : '')
    + (game.frenzy > 0 ? `<span class="ars-count frenzy" title="一定時間ダメージ上昇">FRENZY ${game.frenzy.toFixed(1)}</span>` : '');
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
    const kindLabel = card.kind==='weapon' ? (card.tag || 'WEAPON')
      : card.kind==='stat' ? 'UPGRADE' : 'RECOVERY';
    const cls = 'upgrade-card'
      + (card.kind==='weapon' ? ' weapon' : '')
      + (card.tag==='SUMMON' ? ' summon' : card.tag==='TRAP' ? ' trap' : '')
      + (lv>=2 ? ' near-awake' : '');
    const levelText = card.kind==='heal' ? 'RECOVERY'
      : card.kind==='weapon' && lv===0 ? 'NEW WEAPON'
      : lv>=3 ? 'MAX' : lv===2 ? 'NEXT: 覚醒 ✦' : 'LV. '+lv+' → '+(lv+1);
    const button = document.createElement('button');
    button.className = cls;
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
          const tint = card.tag==='TRAP' ? '#ffb066' : card.tag==='SUMMON' ? '#c4b5ff' : '#dcff9e';
          game.rings.push({x:p.x,y:p.y,r:14,maxR:110,life:.6,max:.6,color:tint,width:3});
          particles(p.x,p.y,tint,16,1.2);
        }
      }
      game.pick++;
      updateHUD();
      if(game.pick < 3) showCards();
      else {
        game.pendingLevels--;
        game.pick = 0;
        if(game.pendingLevels > 0) showCards();
        else if(game.pendingStage){
          // end-of-stage picks: the 5 second breather runs before the next round
          beginCooldown();
        } else {
          // a mid-round level-up: just resume the round we were already in
          $('rewardOverlay').classList.add('hidden');
          game.state = 'playing';
          $('topStatus').textContent = 'SURVIVAL IN PROGRESS';
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
  game.hazards = [];
  game.wisps = [];
  game.drops = [];
  game.boss = null;
  /* XP is per-individual now: clearing a stage no longer hands a lump sum to
     the whole squad. Each fighter only grows from kills it actually makes
     and from pickups it walks over. The stage bonus is deliberately tiny and
     scaled by how far out in the world the squad has pushed. */
  const depth = worldDepth(game.player.x, game.player.y);
  const bonus = Math.round(8 + game.stage*2 + depth*26);
  grantXp(game.player, bonus);   // only the surviving player banks the clear
  const angle = rand(0,TAU);
  const clone = fighter(clamp(game.player.x+Math.cos(angle)*300,60,WORLD_W-60), clamp(game.player.y+Math.sin(angle)*300,60,WORLD_H-60), true);
  game.clones.push(clone);
  for(let i=0;i<18;i++) particles(clone.x, clone.y, '#ffca86', 2);
  game.rings.push({x:clone.x,y:clone.y,r:10,maxR:120,life:.7,max:.7,color:'#ffcf8a',width:3});
  /* The stage number advances when the next round actually starts (after the
     cooldown) so the HUD doesn't show a stage that hasn't begun. */
  game.pendingStage = game.stage + 1;
  game.roundAnchor = {x:game.player.x, y:game.player.y};
  game.bossStageProlonged = false;
  game.spawn = 1;
  game.spawnPaused = true;
  updateHUD();
  saveBrain();
  if(game.pendingLevels > 0){ game.pick = 0; showCards(); }
  else beginCooldown();
}



/* ================================================================== *
 *  WORLD  — obstacles, buildings, distance-scaled loot              *
 * ================================================================== */

/* deterministic rng so a run's map is stable across restarts */
function makeRng(seed){
  let s = seed>>>0;
  return () => ((s = (s*1664525+1013904223)>>>0) / 4294967296);
}

/* distance from the arena centre, 0 (start plaza) .. 1 (the far corner) */
function worldDepth(x,y){
  const dx = x - WORLD_W/2;
  const dy = y - WORLD_H/2;
  const maxR = Math.min(WORLD_W, WORLD_H) / 2;   // edge of the map along an axis
  return clamp(Math.hypot(dx,dy) / maxR, 0, 1);
}
const DEPTH_NAMES = [
  {t:0.16, label:'SAFE ZONE',  color:'#b8e08a'},
  {t:0.36, label:'OUTSKIRTS',  color:'#a9d8a0'},
  {t:0.58, label:'RUINS',      color:'#f0cf8a'},
  {t:0.80, label:'DEEP RUINS', color:'#f5a96c'},
  {t:1.01, label:'THE ABYSS',  color:'#ff8f8f'}
];
function depthBand(d){
  for(let i=0;i<DEPTH_NAMES.length;i++) if(d < DEPTH_NAMES[i].t) return i;
  return DEPTH_NAMES.length-1;
}
function depthLabel(d){ return DEPTH_NAMES[depthBand(d)]; }

const rectsOverlap = (a,b,pad=0) =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
  a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

function pointInBuilding(x,y,b){
  return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
}

/* ------------- obstacles: solid props that block movement ------------- */
function buildWorld(){
  const rng = makeRng(WORLD_SEED);
  worldEnt.obstacles.length = 0;
  worldEnt.buildings.length = 0;

  const reserved = [];
  const cx = WORLD_W/2, cy = WORLD_H/2;
  reserved.push({x:cx-360, y:cy-360, w:720, h:720});      // safe start plaza

  // ---- buildings, richer the further out they are ----
  const BUILDING_ROOMS = [
    {w:520, h:400, loot:3, guards:2},   // 0 outskirt shack
    {w:640, h:470, loot:4, guards:3},
    {w:760, h:540, loot:5, guards:4},
    {w:880, h:620, loot:6, guards:5}    // abyss vault
  ];
  /* Place one building per distance band so the risk/reward ramp is real:
     a shack near the start, a vault at the edge of the map. Each band gets a
     couple of candidates scattered around its ring. */
  const BANDS = [
    {rad:[480, 760],   rooms:0},
    {rad:[980, 1350],  rooms:1},
    {rad:[1550, 1900], rooms:2},
    {rad:[2050, 2350], rooms:3}
  ];
  for(let band=0; band<BANDS.length; band++){
    const def = BANDS[band];
    let made = 0, tries = 0;
    while(made < 3 && tries < 220){
      tries++;
      const room = BUILDING_ROOMS[def.rooms];
      const w = room.w + Math.floor(rng()*3)*40;
      const h = room.h + Math.floor(rng()*3)*40;
      const ang = rng()*TAU;
      const rad = def.rad[0] + rng()*(def.rad[1]-def.rad[0]);
      const bx = clamp(cx + Math.cos(ang)*rad - w/2, 140, WORLD_W - w - 140);
      const by = clamp(cy + Math.sin(ang)*rad - h/2, 140, WORLD_H - h - 140);
      const box = {x:bx, y:by, w, h};
      if(reserved.some(r => rectsOverlap(box, r, 240))) continue;
      const depth = worldDepth(bx + w/2, by + h/2);
      const tier = clamp(band, 0, 4);
      worldEnt.buildings.push({
        x:bx, y:by, w, h, depth, tier,
        loot: room.loot + tier,
        guards: room.guards + tier,
        entered:false, cleared:false, discovered:false,
        seed: Math.floor(rng()*100000),
        name: ['廃屋','保管庫','研究所','地下シェルター','深奥の間'][tier]
      });
      reserved.push(box);
      made++;
    }
  }

  // ---- solid obstacles: rocks, walls, crates (block movement) ----
  const shapes = ['rock','wall','crate'];
  let placed = 0, tries = 0;
  while(placed < 340 && tries < 14000){
    tries++;
    let x = rng()*WORLD_W, y = rng()*WORLD_H;
    x = clamp(x, 150, WORLD_W-150); y = clamp(y, 150, WORLD_H-150);
    const kind = shapes[Math.floor(rng()*shapes.length)];
    let w,h;
    if(kind === 'rock'){ w = 46+rng()*54; h = w*(.7+rng()*.5); }
    else if(kind === 'wall'){ const horiz = rng()<.5; w = horiz ? 150+rng()*170 : 34+rng()*16; h = horiz ? 34+rng()*16 : 150+rng()*170; }
    else { w = 52+rng()*26; h = w; }
    const box = {x:x-w/2, y:y-h/2, w, h};
    if(box.x < 90 || box.y < 90 || box.x+box.w > WORLD_W-90 || box.y+box.h > WORLD_H-90) continue;
    if(reserved.some(r => rectsOverlap(box, r, 150))) continue;
    if(worldEnt.obstacles.some(o => rectsOverlap(box, o, 120))) continue;
    worldEnt.obstacles.push({
      x:box.x, y:box.y, w, h, kind,
      cx:box.x+box.w/2, cy:box.y+box.h/2,
      seed: Math.floor(rng()*100000),
      solid: true, blocksShots: kind !== 'crate' || rng() < .6
    });
    placed++;
  }
}

function boxCircleOverlap(box, ent, r){
  const nx = clamp(ent.x, box.x, box.x+box.w);
  const ny = clamp(ent.y, box.y, box.y+box.h);
  const dx = ent.x-nx, dy = ent.y-ny;
  return dx*dx + dy*dy < r*r;
}
function pushCircleOutOfBox(ent, box, r){
  const nx = clamp(ent.x, box.x, box.x+box.w);
  const ny = clamp(ent.y, box.y, box.y+box.h);
  const dx = ent.x-nx, dy = ent.y-ny;
  const d2 = dx*dx + dy*dy;
  if(d2 > r*r) return;
  if(d2 > 0.0001){
    const d = Math.sqrt(d2);
    ent.x = nx + dx/d*r;
    ent.y = ny + dy/d*r;
    return;
  }
  // centre inside the slab: eject along the shallowest axis
  const left = ent.x - box.x, right = box.x+box.w - ent.x;
  const top = ent.y - box.y, bottom = box.y+box.h - ent.y;
  const m = Math.min(left, right, top, bottom);
  if(m === left) ent.x = box.x - r;
  else if(m === right) ent.x = box.x + box.w + r;
  else if(m === top) ent.y = box.y - r;
  else ent.y = box.y + box.h + r;
}

/* push a circle {x,y,r} out of every overlapping solid box */
function resolveSolid(ent, prevX, prevY){
  for(const o of worldEnt.obstacles){
    const nx = clamp(ent.x, o.x, o.x+o.w);
    const ny = clamp(ent.y, o.y, o.y+o.h);
    const dx = ent.x - nx, dy = ent.y - ny;
    const d2 = dx*dx + dy*dy;
    const r = ent.r || 16;
    if(d2 > r*r) continue;
    if(d2 > 0.0001){
      const d = Math.sqrt(d2);
      ent.x = nx + dx/d*r;
      ent.y = ny + dy/d*r;
    } else {
      // centre is inside the box: push out along the shallowest axis
      const left = ent.x - o.x, right = o.x+o.w - ent.x;
      const top = ent.y - o.y, bottom = o.y+o.h - ent.y;
      const m = Math.min(left, right, top, bottom);
      if(m === left) ent.x = o.x - r;
      else if(m === right) ent.x = o.x + o.w + r;
      else if(m === top) ent.y = o.y - r;
      else ent.y = o.y + o.h + r;
    }
  }
  // building walls: four solid slabs with one doorway gap per building
  const T = 22;
  const r = ent.r || 16;
  for(const b of worldEnt.buildings){
    const door = buildingDoor(b);
    const pads = [
      {x:b.x,         y:b.y,          w:b.w, h:T,   horiz:true,  gap:door.side==='top'    ? door : null},
      {x:b.x,         y:b.y+b.h-T,    w:b.w, h:T,   horiz:true,  gap:door.side==='bottom' ? door : null},
      {x:b.x,         y:b.y,          w:T,   h:b.h, horiz:false, gap:door.side==='left'   ? door : null},
      {x:b.x+b.w-T,   y:b.y,          w:T,   h:b.h, horiz:false, gap:door.side==='right'  ? door : null}
    ];
    for(const seg of pads){
      if(seg.gap){
        // skip the doorway span entirely
        const gc = seg.horiz ? seg.gap.x : seg.gap.y;
        const gw = seg.gap.w;
        if(seg.horiz ? Math.abs(ent.x - gc) < gw/2 : Math.abs(ent.y - gc) < gw/2) continue;
      }
      if(!boxCircleOverlap(seg, ent, r)) continue;
      pushCircleOutOfBox(ent, seg, r);
    }
  }
  ent.x = clamp(ent.x, 20, WORLD_W-20);
  ent.y = clamp(ent.y, 20, WORLD_H-20);
}

/* a single doorway per building, centred on a random wall */
function buildingDoor(b){
  const hash = (b.seed % 4);
  const gap = 110;
  if(hash === 0) return {side:'top',    x:b.x + b.w/2, y:b.y,         w:gap};
  if(hash === 1) return {side:'bottom', x:b.x + b.w/2, y:b.y + b.h,   w:gap};
  if(hash === 2) return {side:'left',   x:b.x,         y:b.y + b.h/2, w:gap};
  return              {side:'right',  x:b.x + b.w,   y:b.y + b.h/2, w:gap};
}

/* ------------- loot inside a building, scaled by depth ------------- */
function lootForDepth(d, rng){
  const r = rng();
  const band = depthBand(d);
  if(r < .30) return 'xp';                                 // xp clump
  if(r < .52) return 'weapon';                             // weapon crate
  if(r < .68) return 'heal';
  if(r < .78) return band >= 2 ? 'bomb' : 'heal';
  if(r < .88) return 'frenzy';
  if(r < .95) return 'magnet';
  return band >= 3 ? 'weapon2' : 'xp';
}

function spawnBuildingLoot(b){
  if(b.looted) return;
  b.looted = true;
  const rng = makeRng(b.seed + 77);
  for(let i=0;i<b.loot;i++){
    const x = b.x + 70 + rng()*(b.w-140);
    const y = b.y + 70 + rng()*(b.h-140);
    const kind = lootForDepth(b.depth, rng);
    game.drops.push({
      x, y, kind, inside:true, building:b,
      life: 999, maxLife: 999, seed: rand(0,100), bob: rand(0,7), alive: true,
      amount: kind === 'xp' ? Math.round(45 + b.depth*160) : 0
    });
  }
}

/* guard squad waiting inside */
function spawnBuildingGuards(b){
  if(b.guarded) return;
  b.guarded = true;
  const rng = makeRng(b.seed + 991);
  for(let i=0;i<b.guards;i++){
    const e = makeEnemyAt(
      b.x + 70 + rng()*(b.w-140),
      b.y + 70 + rng()*(b.h-140)
    );
    if(!e) continue;
    const boost = 1 + b.depth*1.9;
    e.hp = Math.round(e.hp*boost); e.maxHp = e.hp;
    e.damage = Math.round(e.damage*(1 + b.depth*.8));
    e.xp = Math.round(e.xp*(1 + b.depth*1.4));
    e.guard = true;
    e.building = b;
    e.homeX = e.x; e.homeY = e.y;
    if(b.depth > .72 && i === 0) eliteUpgrade(e);
  }
}

/* ------------------------------------------------------------------ *
 *  BOSSES / ELITES / DROPS                                          *
 * ------------------------------------------------------------------ */
const BOSS_DEFS = [
  {kind:'warden', name:'グラント・ウォーデン', title:'HEAVY WARDEN',
   hp:1500, r:38, speed:34, damage:20, xp:260,
   primary:'radial',  secondary:'charge'},
  {kind:'swarm',  name:'ハイヴ・マザー', title:'HIVE MOTHER',
   hp:1750, r:36, speed:42, damage:18, xp:280,
   primary:'minions', secondary:'radial'},
  {kind:'sentinel', name:'アイアン・センチネル', title:'IRON SENTINEL',
   hp:1500, r:34, speed:46, damage:22, xp:300,
   primary:'charge',  secondary:'laser'}
];
const BOSS_ACTIONS = {
  radial:{cd:2.6, speed:.78, dmg:.85, count:12, r:9},
  fan:   {cd:1.7, speed:1.05, dmg:.62, count:5,  r:7},
  laser: {cd:2.2, dmg:1.35, width:26},
  charge:{cd:3.2, speed:520, dmg:1.1}
};
const isElite = e => !!(e && e.elite && !e.boss);

function makeDrop(x,y,kind){
  game.drops.push({x,y,kind,life:14,maxLife:14,seed:rand(0,100),bob:rand(0,7),alive:true});
}
function rollDrop(e){
  const chance = e.boss ? 1 : e.elite ? .85 : 0;
  if(Math.random() > chance) return;
  const pool = e.boss
    ? ['heal','magnet','bomb','frenzy','heal','xp']
    : ['heal','magnet','bomb','frenzy','xp','heal'];
  const kind = pool[Math.floor(Math.random()*pool.length)];
  if(e.boss){
    // a boss guarantees a jackpot
    makeDrop(e.x-26, e.y, 'heal');
    makeDrop(e.x+26, e.y, kind);
    makeDrop(e.x, e.y-26, Math.random()<.5?'frenzy':'bomb');
  } else {
    makeDrop(e.x, e.y, kind);
  }
}
function collectDrop(d, taker){
  const p = taker || game.player;
  const isPlayer = p === game.player;
  d.alive = false;
  if(d.kind === 'heal'){
    const amount = Math.round(45*stat(p).healMul);
    p.hp = Math.min(p.maxHp, p.hp + amount);
    game.texts.push({x:d.x,y:d.y-16,vy:-30,life:.9,max:.9,text:'+'+amount+' HP',color:'#a6ff7a',size:14});
    particles(d.x,d.y,'#a6ff7a',14,1.1);
    game.rings.push({x:d.x,y:d.y,r:6,maxR:52,life:.4,max:.4,color:'#a6ff7a',width:3});
  } else if(d.kind === 'magnet'){
    let pulled = 0;
    for(const e of game.enemies){
      if(!e.alive || e.boss) continue;
      if(dist(p,e) < 380){ hurt(e, stat(p).damage*1.2, p); pulled++; }
    }
    for(const e of game.enemies){
      if(!e.alive || e.boss) continue;
      if(dist(p,e) < 240){ const d2 = dist(p,e)||1; e.x -= (e.x-p.x)/d2*46; e.y -= (e.y-p.y)/d2*46; }
    }
    game.rings.push({x:p.x,y:p.y,r:20,maxR:380,life:.7,max:.7,color:'#9fe6ff',width:5});
    game.texts.push({x:d.x,y:d.y-16,vy:-30,life:.9,max:.9,text:'MAGNET',color:'#9fe6ff',size:14});
    shake = Math.min(shake+2.5,6);
    particles(p.x,p.y,'#9fe6ff',20,1.3);
  } else if(d.kind === 'bomb'){
    for(const e of game.enemies){
      if(!e.alive) continue;
      hurt(e, 90 + game.stage*6, p);
      e.stun = Math.max(e.stun, .7);
    }
    game.rings.push({x:p.x,y:p.y,r:24,maxR:440,life:.7,max:.7,color:'#ffb066',width:8});
    game.texts.push({x:d.x,y:d.y-16,vy:-30,life:.9,max:.9,text:'BLAST',color:'#ffb066',size:14});
    shake = Math.min(shake+6,9);
    particles(p.x,p.y,'#ffd9a8',30,1.7);
  } else if(d.kind === 'frenzy'){
    p.frenzy = 6;                       // personal buff, not a team-wide one
    if(isPlayer) game.frenzy = 6;       // kept for the HUD chip
    game.texts.push({x:d.x,y:d.y-16,vy:-30,life:1.1,max:1.1,text:'FRENZY',color:'#ff9de0',size:16});
    game.rings.push({x:p.x,y:p.y,r:16,maxR:140,life:.6,max:.6,color:'#ff9de0',width:4});
    particles(p.x,p.y,'#ff9de0',22,1.4);
  } else if(d.kind === 'weapon' || d.kind === 'weapon2'){
    const amount = d.kind === 'weapon2' ? 2 : 1;
    const pool = cardPool(p).filter(c => c.kind === 'weapon');
    const pick = pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
    if(pick){
      for(let i=0;i<amount;i++) applyCard(p, pick.id);
      const lv = weaponLevel(p, pick.id);
      game.texts.push({x:d.x,y:d.y-18,vy:-30,life:1.2,max:1.2,
        text:`${pick.icon} ${pick.name} → LV.${lv}`, color:'#ffd166', size:15});
      game.rings.push({x:d.x,y:d.y,r:8,maxR:90,life:.5,max:.5,color:'#ffd166',width:4});
      particles(d.x,d.y,'#ffd166',20,1.3);
    } else {
      grantXp(p, 80);
      game.texts.push({x:d.x,y:d.y-18,vy:-30,life:1,max:1,text:'XP +80',color:'#d9ccff',size:14});
    }
  } else {
    const amount = d.amount || 45;
    grantXp(p, amount);
    game.texts.push({x:d.x,y:d.y-16,vy:-30,life:.9,max:.9,text:'XP +'+amount,color:'#d9ccff',size:14});
    particles(d.x,d.y,'#c4b5ff',14,1.1);
  }
}

function spawnBoss(){
  const idx = Math.min(BOSS_DEFS.length-1, Math.floor((game.stage-1)/5) % BOSS_DEFS.length);
  game.bossCycle = Math.floor((game.stage-1)/5/BOSS_DEFS.length);
  const def = BOSS_DEFS[idx];
  const tier = Math.max(0, Math.floor((game.stage-6)/15));
  // Same boss can return; keep the threat readout interesting by labelling the revisit.
  const cycle = game.bossCycle || 0;
  const shownName = cycle > 0 ? `${def.name} MK-${cycle+1}` : def.name;
  const a = rand(0,TAU);
  const x = clamp(game.player.x + Math.cos(a)*420, 80, WORLD_W-80);
  const y = clamp(game.player.y + Math.sin(a)*420, 80, WORLD_H-80);
  const hp = Math.round(def.hp*(1+tier*.9));
  const boss = {
    x, y, type:'boss', boss:true, kind:def.kind, name:shownName, title:def.title,
    r:def.r, hp, maxHp:hp, speed:def.speed, damage:Math.round(def.damage*(1+tier*.4)),
    xp:def.xp, hit:0, stun:0, slow:0, orbitCd:0, seed:rand(0,100), wob:rand(0,TAU),
    alive:true, tier, attackCd:2.0, phase:0, chargeCd:5, charging:0, chargeDir:{x:0,y:0},
    laser:0, laserAngle:0, roar:.8, bossIndex:idx
  };
  game.enemies.push(boss);
  game.boss = boss;
  game.bossFlash = 1;
  notice(shownName.toUpperCase(), 'ボス出現 — 撃破せよ');
  game.rings.push({x,y,r:20,maxR:260,life:1.1,max:1.1,color:'#ff8f8f',width:6});
  particles(x,y,'#ffb0a0',30,1.6);
  shake = 7;
  return boss;
}
function eliteUpgrade(e){
  e.elite = true;
  e.r *= 1.35;
  e.hp = Math.round(e.hp*2.6 + 40);
  e.maxHp = e.hp;
  e.damage = Math.round(e.damage*1.5);
  e.xp = Math.round(e.xp*3);
  e.speed *= .92;
  e.crown = true;
}

/* ------------------------------ enemies --------------------------- */
function makeEnemyAt(x, y){
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
  const e = {
    x, y, type, r:base.r, hp:base.hp, maxHp:base.hp, speed:base.speed,
    damage:base.dmg, xp:base.xp, hit:0, stun:0, slow:0, orbitCd:0,
    seed:rand(0,100), wob:rand(0,TAU), alive:true
  };
  game.enemies.push(e);
  return e;
}

function spawnEnemy(){
  let side = Math.floor(rand(0,4));
  // spawn just outside the visible viewport so enemies walk in from the dark
  const vx0 = cam.x - W/2, vx1 = cam.x + W/2, vy0 = cam.y - H/2, vy1 = cam.y + H/2;
  let x = side===0 ? vx0-40 : side===1 ? vx1+40 : rand(vx0, vx1);
  let y = side===2 ? vy0-40 : side===3 ? vy1+40 : rand(vy0, vy1);
  x = clamp(x, 20, WORLD_W-20); y = clamp(y, 20, WORLD_H-20);
  const e = makeEnemyAt(x, y);
  if(game.stage >= 3 && !game.boss && Math.random() < Math.min(.03 + game.stage*.012, .14)) eliteUpgrade(e);
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
      x:clamp(f.x+Math.cos(a)*r, 20, WORLD_W-20), y:clamp(f.y+Math.sin(a)*r, 20, WORLD_H-20),
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
/* --- summon: support drones ------------------------------------- */
function syncDrones(f){
  const lv = f.weapons.drone || 0;
  const want = lv ? WEAPON_SPEC.drone[lv-1].count : 0;
  const owned = game.drones.filter(d=>d.owner===f);
  if(owned.length > want){
    for(const d of owned.slice(want)) d.alive = false;
  }
  for(let i=owned.length;i<want;i++){
    if(game.drones.length >= 22) break;
    const a = i*TAU/Math.max(1,want) - Math.PI/2;
    game.drones.push({
      owner:f, lv, x:f.x+Math.cos(a)*46, y:f.y+Math.sin(a)*46,
      orbit:a, phase:a, fire:rand(.1,.5), hit:0, alive:true, seed:rand(0,100)
    });
    particles(f.x, f.y, '#9fe6ff', 6);
  }
}
function droneFire(d, target, s){
  const lv = d.lv, spec = WEAPON_SPEC.drone[lv-1];
  const a = Math.atan2(target.y-d.y, target.x-d.x);
  const sp = s.bulletSpeed*1.15;
  game.bullets.push({
    x:d.x, y:d.y, px:d.x, py:d.y,
    vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
    life:spec.range/sp, maxLife:spec.range/sp,
    damage:s.damage*spec.dmg, owner:d.owner, r:3, pierce:spec.pierce,
    hitList:[], color:'#9fe6ff', droneShot:true
  });
  d.fire = spec.rate;
}
/* --- summon: kamikaze wisps ------------------------------------- */
function summonWisp(f){
  const lv = weaponLevel(f,'wisp'), spec = WEAPON_SPEC.wisp[lv-1];
  f.cd.wisp = spec.cd;
  for(let i=0;i<spec.count;i++){
    if(game.wisps.length >= 14) break;
    const a = rand(0,TAU), r = rand(28,54);
    const wx = clamp(f.x+Math.cos(a)*r, 20, WORLD_W-20), wy = clamp(f.y+Math.sin(a)*r, 20, WORLD_H-20);
    game.wisps.push({
      owner:f, lv, x:wx, y:wy, dmg:spec.dmg, radius:spec.radius,
      life:spec.life, maxLife:spec.life, bob:rand(0,7), seed:rand(0,100),
      hit:0, alive:true, trail:rand(0,1)
    });
    particles(wx, wy, '#c4b5ff', 8);
    game.rings.push({x:wx,y:wy,r:5,maxR:32,life:.35,max:.35,color:'#c4b5ff',width:2});
  }
  f.cast = .26;
}
/* --- traps ------------------------------------------------------ */
function placeTrap(f, kind){
  const lv = weaponLevel(f,kind), spec = WEAPON_SPEC[kind][lv-1];
  f.cd[kind] = spec.cd;
  if(game.hazards.filter(h=>h.kind===kind && h.owner===f).length >= spec.max){
    const old = game.hazards.find(h=>h.kind===kind && h.owner===f);
    if(old) old.alive = false;
  }
  if(game.hazards.length >= 70) game.hazards.shift();
  const idx = game.hazards.length % 7;
  const spread = kind === 'mine' ? 72 : kind === 'spike' ? 30 : 36;
  const ang = f.angle + Math.PI + rand(-1.2, 1.2);
  const px = kind === 'mine'
    ? clamp(f.x + Math.cos(ang)*rand(28, spread), 30, WORLD_W-30)
    : clamp(f.x + Math.cos(ang)*rand(6, spread), 24, WORLD_W-24);
  const py = kind === 'mine'
    ? clamp(f.y + Math.sin(ang)*rand(28, spread), 30, WORLD_H-30)
    : clamp(f.y + Math.sin(ang)*rand(6, spread), 24, WORLD_H-24);
  game.hazards.push({
    kind, lv, owner:f, x:px, y:py, r:spec.radius,
    dmg:spec.dmg, tick:0, tickRate:spec.tick || .45,
    life: spec.life || 999, maxLife: spec.life || 999,
    arm: spec.arm || 0, trigger: spec.trigger || 0,
    blown:false, seed:rand(0,100), idx, alive:true
  });
  particles(f.x, f.y, kind==='poison'?'#9be36b':kind==='spike'?'#cfd8e8':'#ffb066', 6, .8);
}
function detonateMine(h){
  if(h.blown) return;
  h.blown = true;
  h.alive = false;
  const dmg = h.dmg * stat(h.owner).damage;
  for(const e of game.enemies){
    if(e.alive && dist(h,e) < h.r) hurt(e, dmg, h.owner);
  }
  game.rings.push({x:h.x,y:h.y,r:10,maxR:h.r,life:.45,max:.45,color:'#ffca8a',width:6});
  game.rings.push({x:h.x,y:h.y,r:4,maxR:h.r*.6,life:.3,max:.3,color:'#fff3d0',width:10});
  particles(h.x, h.y, '#ffb066', 22, 1.6);
  particles(h.x, h.y, '#ffe6b8', 12, 1.2);
  shake = Math.min(shake+3.2, 6);
}
function updateHazards(dt){
  for(const h of game.hazards){
    if(!h.alive) continue;
    if(h.kind === 'mine'){
      if(h.arm > 0){ h.arm -= dt; continue; }
      for(const e of game.enemies){
        if(e.alive && dist(h,e) < h.trigger){ detonateMine(h); break; }
      }
      continue;
    }
    h.life -= dt;
    if(h.life <= 0){ h.alive = false; continue; }
    h.tick -= dt;
    if(h.tick > 0) continue;
    h.tick = h.tickRate;
    const dmg = h.dmg * stat(h.owner).damage;
    for(const e of game.enemies){
      if(!e.alive) continue;
      if(dist(h,e) < h.r + e.r*.5){
        hurt(e, dmg, h.owner);
        if(h.kind === 'spike'){
          e.slow = Math.max(e.slow, .35);
          if(h.lv >= 3 && Math.random() < .25) e.stun = Math.max(e.stun, .3);
        } else if(h.kind === 'poison'){
          e.slow = Math.max(e.slow, .7);
        }
      }
    }
  }
  game.hazards = game.hazards.filter(h=>h.alive);
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
  if(w.drone) syncDrones(f);
  if(w.wisp){
    f.cd.wisp -= dt;
    if(f.cd.wisp <= 0) summonWisp(f);
  }
  for(const kind of ['mine','spike','poison']){
    if(!w[kind]) continue;
    f.cd[kind] -= dt;
    if(f.cd[kind] <= 0) placeTrap(f, kind);
  }
}


/* --------------------------- boss attacks ------------------------- */
function bossShot(e, angle, speed, dmg, r, color){
  game.bullets.push({
    x:e.x+Math.cos(angle)*e.r, y:e.y+Math.sin(angle)*e.r, px:e.x, py:e.y,
    vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed,
    life:2.2, maxLife:2.2, damage:dmg, owner:null, hostile:true, r,
    pierce:0, hitList:[], color
  });
}
function bossAttack(e){
  const def = BOSS_DEFS[e.bossIndex];
  const tierMul = 1 + e.tier*.35;
  const attack = e.phase % 3 === 2 ? def.secondary : def.primary;
  e.phase++;
  if(attack === 'radial'){
    const A = BOSS_ACTIONS.radial, n = A.count + e.tier*2;
    for(let i=0;i<n;i++){
      const a = i*TAU/n + e.wob + Math.random()*.1;
      bossShot(e, a, 150*A.speed, stat(game.player).damage*A.dmg*tierMul*.9, A.r, '#ff9d86');
    }
    e.attackCd = A.cd;
    game.rings.push({x:e.x,y:e.y,r:20,maxR:e.r+52,life:.4,max:.4,color:'#ff8f8f',width:4});
    shake = Math.min(shake+2.2,6);
  } else if(attack === 'fan'){
    const A = BOSS_ACTIONS.fan;
    const base = Math.atan2(game.player.y-e.y, game.player.x-e.x);
    for(let i=0;i<A.count;i++){
      const a = base + (i-(A.count-1)/2)*.17;
      bossShot(e, a, 190*A.speed, stat(game.player).damage*A.dmg*tierMul, A.r, '#ffcaa0');
    }
    e.attackCd = A.cd;
  } else if(attack === 'laser'){
    e.laser = .55;
    e.laserAngle = Math.atan2(game.player.y-e.y, game.player.x-e.x);
    game.rings.push({x:e.x,y:e.y,r:10,maxR:44,life:.3,max:.3,color:'#ffd0ff',width:3});
  } else if(attack === 'minions'){
    const n = 2 + e.tier;
    for(let i=0;i<n;i++){
      const a = rand(0,TAU), r = e.r + 26;
      const hx = clamp(e.x+Math.cos(a)*r, 20, WORLD_W-20), hy = clamp(e.y+Math.sin(a)*r, 20, WORLD_H-20);
      game.enemies.push({
        x:hx, y:hy, type:'runner', r:9, hp:24+e.tier*14, maxHp:24+e.tier*14,
        speed:100, damage:8, xp:8, hit:0, stun:0, slow:0, orbitCd:0,
        seed:rand(0,100), wob:rand(0,TAU), alive:true
      });
      particles(hx,hy,'#ff9d86',6,.8);
    }
    e.attackCd = 3.0;
  } else {
    e.attackCd = 1.6;
  }
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
  const attacker = source && (source.owner || source);
  if(t !== game.player && t.clone !== true && attacker && attacker.frenzy > 0) amount *= 1.6;
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
      const killer = source ? (source.owner || source) : null;
      if(t.boss){
        bossDefeated(t, killer);
      } else {
        game.kills++;
        shake = Math.min(shake+ (t.elite?3.4:t.type==='brute'?3:1.2), 6);
        if(t.elite) game.eliteCount++;
        /* XP is per individual: only the fighter that landed the kill grows.
           (Clones level through their own kills and pickups, never the
           player's bar.) */
        if(killer && killer.level !== undefined && killer.alive){
          grantXp(killer, t.xp);
        }
      }
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

function bossDefeated(t, killer){
  game.kills++;
  game.boss = null;
  game.bossFlash = 1;
  shake = 9;
  const xp = t.xp;
  if(killer && killer.level !== undefined && killer.alive) grantXp(killer, xp);
  else grantXp(game.player, Math.round(xp*.4));
  rollDrop(t);
  for(let i=0;i<4;i++){
    const a = i*TAU/4 + .4;
    game.rings.push({x:t.x,y:t.y,r:24,maxR:260+i*40,life:.9+i*.12,max:.9+i*.12,color:'#ffd39a',width:5});
  }
  particles(t.x,t.y,'#ffcf8a',40,2);
  particles(t.x,t.y,'#ff8f8f',24,1.6);
  game.texts.push({x:t.x,y:t.y-40,vy:-16,life:2.2,max:2.2,text:'BOSS DOWN',color:'#ffe0a8',size:22});
  notice('BOSS DEFEATED', t.name+' を撃破した');
  saveBrain();
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
    +(c.x<70||c.x>WORLD_W-70||c.y<70||c.y>WORLD_H-70?'edge':'open');
  c.decision -= dt;
  if(c.decision <= 0){
    if(c.state !== null){
      const old = qValues(c.state), next = qValues(state);
      // extra shaping: being pinned to the world edge is never useful
      const edge = c.x < 100 || c.x > WORLD_W-100 || c.y < 100 || c.y > WORLD_H-100;
      old[c.action] += 0.18*(c.reward + 0.85*Math.max(...next) - old[c.action]);
      if(edge) old[c.action] -= 0.02;
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

  /* --- wall-hugging fix ---------------------------------------------
     The Q-table happily picks "strafe into the wall" forever, which left
     clones grinding on the arena edge. Detect that we are not actually
     moving and steer along the wall (plus a periodic random kick). */
  const beforeX = c.x, beforeY = c.y;
  const prevVx = vx, prevVy = vy;

  c.r = 15;
  c.x = clamp(c.x+vx*speed*dt, 17, WORLD_W-17);
  c.y = clamp(c.y+vy*speed*dt, 17, WORLD_H-17);
  resolveSolid(c);

  const moved = Math.hypot(c.x-beforeX, c.y-beforeY);
  const intended = speed*dt;
  if(intended > 0.2 && moved < intended*0.35){
    c.stuck = (c.stuck || 0) + dt;
    if(c.stuck > 0.25){
      // slide: bounce the desired direction off the nearest blocking wall
      c.action = Math.floor(rand(0,5));
      c.stuck = 0;
      // push away from the world edge we are pinned against
      const margin = 120;
      let ax = 0, ay = 0;
      if(c.x < margin) ax = 1; else if(c.x > WORLD_W-margin) ax = -1;
      if(c.y < margin) ay = 1; else if(c.y > WORLD_H-margin) ay = -1;
      const away = Math.hypot(ax,ay);
      if(away > 0){
        const nx = (ax/away - prevVx)*0.5, ny = (ay/away - prevVy)*0.5;
        c.x = clamp(c.x + nx*90*dt*6, 17, WORLD_W-17);
        c.y = clamp(c.y + ny*90*dt*6, 17, WORLD_H-17);
      }
      // tell the learner this direction was a bad idea
      const vals = qValues(c.state);
      if(vals[c.action] !== undefined) vals[c.action] -= .25;
    }
  } else {
    // edge penalty so the table learns to stop choosing wall runs
    const nearEdge = c.x < 90 || c.x > WORLD_W-90 || c.y < 90 || c.y > WORLD_H-90;
    c.stuck = nearEdge ? Math.max(0, (c.stuck||0) - dt*0.5) : 0;
  }
  c.reward += dt*.04;
}

/* -------------------------------- tick ---------------------------- */
function tickCooldown(dt){
  game.cooldown = Math.max(0, game.cooldown - dt);
  shake = Math.max(0, shake - dt*14);
  game.frenzy = Math.max(0, game.frenzy - dt);
  syncCamera(dt);
  const p = game.player;

  // the player (and clones) may still move and grab loot during the breather
  p.hit = Math.max(0, p.hit-dt);
  p.invuln = Math.max(0, p.invuln-dt);
  p.dashCd = Math.max(0, p.dashCd-dt);
  p.dashTime = Math.max(0, p.dashTime-dt);
  p.muzzle = Math.max(0, p.muzzle-dt);
  p.cast = Math.max(0, p.cast-dt);
  p.hp = Math.min(p.maxHp, p.hp + stat(p).regen*dt);
  {
    let dx = (keys.has('d')||keys.has('arrowright')?1:0) - (keys.has('a')||keys.has('arrowleft')?1:0);
    let dy = (keys.has('s')||keys.has('arrowdown')?1:0) - (keys.has('w')||keys.has('arrowup')?1:0);
    let analog = 1;
    if(touch.active){ dx = touch.dx; dy = touch.dy; analog = Math.min(1, Math.hypot(dx,dy)); }
    let len = Math.hypot(dx,dy);
    if(len > 0){ dx /= len; dy /= len; p.moveX = dx; p.moveY = dy; } else analog = 0;
    if(p.dashTime > 0){ dx = p.dashX; dy = p.dashY; analog = 1; }
    const speed = stat(p).speed*(p.dashTime>0?2.7:1)*analog;
    p.moving = Math.abs(dx)+Math.abs(dy) > .05;
    p.legPhase += dt*(p.moving?10:0);
    p.x = clamp(p.x+dx*speed*dt, 17, WORLD_W-17);
    p.y = clamp(p.y+dy*speed*dt, 17, WORLD_H-17);
    p.r = 15;
    resolveSolid(p);
  }
  for(const c of game.clones){
    if(!c.alive) continue;
    c.hp = Math.min(c.maxHp, c.hp + stat(c).regen*dt);
    c.hit = Math.max(0, c.hit-dt);
    cloneMove(c, dt);
  }

  // pickups still work, guards stay put
  const reach = 26;
  for(const d of game.drops){
    if(!d.alive) continue;
    if(dist(p, d) < reach + 14) collectDrop(d);
  }
  game.drops = game.drops.filter(d=>d.alive);
  for(const r of game.rings){ r.life -= dt; r.r += (r.maxR-r.r)*dt*9; }
  game.rings = game.rings.filter(r=>r.life>0);
  for(const t2 of game.texts){ t2.y += t2.vy*dt; t2.vy *= .93; t2.life -= dt; }
  game.texts = game.texts.filter(t2=>t2.life>0);
  game.particles = game.particles.filter(pp => { pp.life -= dt; pp.x += pp.vx*dt; pp.y += pp.vy*dt; return pp.life>0; });

  $('topStatus').textContent = 'NEXT ROUND IN ' + game.cooldown.toFixed(1);
  updateHUD();
  if(game.cooldown <= 0) beginRound();
}

const COOLDOWN_TIME = 5;

function beginCooldown(){
  game.state = 'cooldown';
  game.cooldown = COOLDOWN_TIME;
  game.cooldown0 = COOLDOWN_TIME;
  game.roundReady = false;
  game.spawnPaused = true;
  $('rewardOverlay').classList.add('hidden');
  $('topStatus').textContent = 'NEXT ROUND IN ' + COOLDOWN_TIME;
  notice('ROUND ' + String(game.pendingStage || game.stage).padStart(2,'0'), '準備中… 移動して体勢を整えろ');
}

function beginRound(){
  game.state = 'playing';
  game.cooldown = 0;
  game.roundReady = true;
  if(game.pendingStage && game.pendingStage !== game.stage) game.stage = game.pendingStage;
  game.pendingStage = 0;
  game.time = 30;
  game.spawnPaused = false;
  game.bossTimer = (game.stage % 5 === 0) ? 0.8 : -1;
  $('topStatus').textContent = 'SURVIVAL IN PROGRESS';
  if(game.bossTimer > 0) notice('WARNING','ボスが接近している…');
  else notice('STAGE '+String(game.stage).padStart(2,'0'),'新たなクローンが出現');
}

/* entering a building spawns its loot + guards; clearing it marks it done */
function updateBuildings(dt){
  const p = game.player;
  for(const b of worldEnt.buildings){
    const inside = pointInBuilding(p.x, p.y, b);
    if(inside && !b.entered){
      b.entered = true;
      b.discovered = true;
      spawnBuildingLoot(b);
      spawnBuildingGuards(b);
      const band = depthLabel(b.depth);
      notice('ENTERED · ' + b.name, band.label + ' / 戦利品 ' + b.loot + ' ・ 敵 ' + b.guards);
      game.rings.push({x:b.x+b.w/2, y:b.y+b.h/2, r:30,
        maxR:Math.max(b.w,b.h)*.7, life:.8, max:.8, color:band.color, width:5});
      shake = Math.min(shake+2, 5);
    }
    if(!b.cleared && b.entered){
      const guardsAlive = game.enemies.some(e => e.alive && e.guard && e.building === b);
      const lootLeft = game.drops.some(d => d.alive && d.building === b);
      if(!guardsAlive && !lootLeft){
        b.cleared = true;
        notice('CLEARED · ' + b.name, 'この建物は制圧済み');
        game.rings.push({x:b.x+b.w/2, y:b.y+b.h/2, r:20,
          maxR:Math.max(b.w,b.h)*.5, life:.7, max:.7, color:'#bfe98a', width:3});
      }
    }
  }
}

/* keep the player centred; shake is applied on top of the camera */
function syncCamera(dt){
  const p = game.player;
  const tx = p.x, ty = p.y;
  if(cam.x === 0 && cam.y === 0){ cam.x = tx; cam.y = ty; }
  // smooth follow: fast enough to feel locked, slow enough to avoid jitter
  const k = 1 - Math.pow(0.0001, dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  // never show past the world edge
  const halfW = W/2, halfH = H/2;
  cam.x = WORLD_W <= W ? WORLD_W/2 : clamp(cam.x, halfW, WORLD_W-halfW);
  cam.y = WORLD_H <= H ? WORLD_H/2 : clamp(cam.y, halfH, WORLD_H-halfH);
  cam.shakeX = shake > .1 ? rand(-shake, shake) : 0;
  cam.shakeY = shake > .1 ? rand(-shake, shake) : 0;
}

function tick(dt){
  if(game.state === 'cooldown'){
    tickCooldown(dt);
    return;
  }
  if(game.state !== 'playing') return;
  game.elapsed += dt;
  game.time -= dt;
  shake = Math.max(0, shake - dt*14);
  syncCamera(dt);
  game.frenzy = Math.max(0, game.frenzy - dt);
  for(const f of [game.player, ...game.clones]) f.frenzy = Math.max(0, (f.frenzy||0) - dt);
  game.bossFlash = Math.max(0, game.bossFlash - dt*1.6);
  game.afterglow = Math.max(0, game.afterglow - dt);
  if(announceTimer > 0){
    announceTimer -= dt;
    if(announceTimer <= 0) $('announcement').classList.remove('show');
  }
  if(game.time <= 0){
    // On a boss stage the timer only ends the stage once the boss is down.
    if(game.boss && game.boss.alive && game.time + dt > 0){
      if(!game.bossStageProlonged){ game.bossStageProlonged = true; notice('BOSS STILL ALIVE','ボスを倒すまでステージは終わらない'); }
      game.time = 24;
      return;
    }
    stageClear(); return;
  }

  if(game.bossTimer > 0){
    game.bossTimer -= dt;
    if(game.bossTimer <= 0 && !game.boss) spawnBoss();
  }
  game.spawn -= dt;
  if(game.spawn <= 0){
    const bossStage = game.stage % 5 === 0;
    if(game.enemies.length < (bossStage ? 26 : 90)) spawnEnemy();
    game.spawn = (bossStage ? 1.6 : Math.max(.30, 1.05-game.stage*.055))*rand(.8,1.2);
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
      let analog = 1;                        // 0..1 stick tilt (keyboard = full speed)
      if(touch.active){
        dx = touch.dx; dy = touch.dy;
        analog = Math.min(1, Math.hypot(dx,dy));
      }
      let len = Math.hypot(dx,dy);
      if(len > 0){ dx /= len; dy /= len; f.moveX = dx; f.moveY = dy; }
      else analog = 0;
      if(f.dashTime > 0){ dx = f.dashX; dy = f.dashY; analog = 1; }
      let speed = stat(f).speed*(f.dashTime>0?2.7:1)*analog;
      f.moving = Math.abs(dx)+Math.abs(dy) > .05;
      f.legPhase += dt*(f.moving?10:0);
      const px0 = f.x, py0 = f.y;
      f.x = clamp(f.x+dx*speed*dt, 17, WORLD_W-17);
      f.y = clamp(f.y+dy*speed*dt, 17, WORLD_H-17);
      f.r = 15;
      resolveSolid(f, px0, py0);
    }
    const [target] = nearest(f);
    updateWeapons(f,dt,target);
    if(f.clone && target && f.cd.rifle > .05) f.angle = Math.atan2(target.y-f.y, target.x-f.x);
  }

  updateBuildings(dt);

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
      e.x = clamp(e.x + dx/l*sp*dt, 10, WORLD_W-10);
      e.y = clamp(e.y + dy/l*sp*dt, 10, WORLD_H-10);
      resolveSolid(e);
      if(d < e.r+13 && target.invuln <= 0){
        hurt(target, e.damage, null);
        target.invuln = .65;
        shake = Math.min(shake+1.6, 4);
      }
    }
  }

  // ---------------- boss behaviour ----------------
  for(const e of game.enemies){
    if(!e.alive || !e.boss) continue;
    e.hit = Math.max(0, e.hit-dt);
    e.stun = Math.max(0, e.stun-dt);
    e.roar = Math.max(0, e.roar-dt);
    e.attackCd -= dt;
    e.chargeCd -= dt;
    if(e.laser > 0){
      e.laser -= dt;
      const s2 = stat(game.player);
      for(const f of fighters){
        if(!f.alive || f.invuln > 0) continue;
        const dx = f.x-e.x, dy = f.y-e.y;
        const along = dx*Math.cos(e.laserAngle) + dy*Math.sin(e.laserAngle);
        const perp = Math.abs(-dx*Math.sin(e.laserAngle) + dy*Math.cos(e.laserAngle));
        if(along > 0 && perp < 16){ hurt(f, 16*(1+e.tier*.4), e); f.invuln = .45; }
      }
      if(e.laser <= 0) e.attackCd = BOSS_ACTIONS.laser.cd;
      continue;
    }
    // dash charge toward the player
    if(e.chargeCd <= 0 && e.charging <= 0 && game.player.alive){
      if(dist(e, game.player) < 620){
        e.charging = .42;
        const a = Math.atan2(game.player.y-e.y, game.player.x-e.x);
        e.chargeDir = {x:Math.cos(a), y:Math.sin(a)};
        e.chargeCd = BOSS_ACTIONS.charge.cd + rand(0,1.2);
        e.roar = .35;
        particles(e.x,e.y,'#ff9d86',12,1.2);
      }
    }
    if(e.charging > 0){
      e.charging -= dt;
      const sp = BOSS_ACTIONS.charge.speed;
      e.x = clamp(e.x + e.chargeDir.x*sp*dt, 40, WORLD_W-40);
      e.y = clamp(e.y + e.chargeDir.y*sp*dt, 40, WORLD_H-40);
      for(const f of fighters){
        if(f.alive && dist(e,f) < e.r+16 && f.invuln <= 0){
          hurt(f, e.damage*BOSS_ACTIONS.charge.dmg, e);
          f.invuln = .6;
        }
      }
      if(Math.random() < dt*30) particles(e.x,e.y,'#ffb0a0',2,.8);
      continue;
    }
    // normal drift toward the player
    const d = dist(e, game.player) || 1;
    const chase = e.speed*(e.slow>0?.4:1);
    if(d > 150){
      e.x = clamp(e.x + (game.player.x-e.x)/d*chase*dt, 30, WORLD_W-30);
      e.y = clamp(e.y + (game.player.y-e.y)/d*chase*dt, 30, WORLD_H-30);
    }
    if(e.attackCd <= 0) bossAttack(e);
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
        m.x = clamp(m.x + (t.x-m.x)/d*sp*dt, 14, WORLD_W-14);
        m.y = clamp(m.y + (t.y-m.y)/d*sp*dt, 14, WORLD_H-14);
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

  // --- support drones follow their owner and open fire -------------
  for(const d of game.drones){
    if(!d.alive) continue;
    const o = d.owner;
    if(!o || !o.alive){ d.alive = false; continue; }
    d.hit = Math.max(0, d.hit-dt);
    d.phase += dt*1.5;
    const radius = 44 + Math.sin(d.phase)*6;
    const a = d.orbit + Math.sin(d.phase*.6)*.25;
    const tx = o.x + Math.cos(a)*radius, ty = o.y + Math.sin(a)*radius;
    d.x += (tx-d.x)*Math.min(1, dt*7);
    d.y += (ty-d.y)*Math.min(1, dt*7);
    d.fire -= dt;
    const [t] = nearest(d);
    const spec = WEAPON_SPEC.drone[d.lv-1];
    if(d.fire <= 0 && t && dist(d,t) <= spec.range) droneFire(d, t, stat(o));
  }
  game.drones = game.drones.filter(d=>d.alive);

  // --- kamikaze wisps seek the nearest enemy and explode -----------
  for(const w of game.wisps){
    if(!w.alive) continue;
    w.life -= dt;
    w.hit = Math.max(0, w.hit-dt);
    const [t] = nearest(w);
    if(t){
      const d = dist(w,t) || 1;
      const sp = 168;
      w.x = clamp(w.x + (t.x-w.x)/d*sp*dt, 12, WORLD_W-12);
      w.y = clamp(w.y + (t.y-w.y)/d*sp*dt, 12, WORLD_H-12);
      if(d < (t.r||13) + 12){ w.alive = false; w.boomed = true; }
    } else {
      w.x = clamp(w.x + Math.cos(w.bob+w.life)*22*dt, 12, WORLD_W-12);
      w.y = clamp(w.y + Math.sin(w.bob+w.life*1.3)*22*dt, 12, WORLD_H-12);
    }
    if(w.life <= 0){ w.alive = false; w.boomed = true; }
    if(w.boomed){
      const dmg = w.dmg * stat(w.owner).damage;
      for(const e of game.enemies){
        if(e.alive && dist(w,e) < w.radius){
          hurt(e, dmg, w.owner);
          if(w.lv >= 3) e.stun = Math.max(e.stun, .35);
        }
      }
      game.rings.push({x:w.x,y:w.y,r:8,maxR:w.radius,life:.42,max:.42,color:'#c4b5ff',width:5});
      particles(w.x, w.y, '#c4b5ff', 18, 1.4);
      shake = Math.min(shake+1.6, 5);
    }
  }
  game.wisps = game.wisps.filter(w=>w.alive);

  // --- traps: mines / spikes / poison ------------------------------
  updateHazards(dt);

  for(const b of game.bullets){
    b.px = b.x; b.py = b.y;
    b.x += b.vx*dt;
    b.y += b.vy*dt;
    b.life -= dt;
    if(b.hostile){
      for(const f of fighters){
        if(!f.alive || f.invuln > 0) continue;
        if(dist(b,f) < 15+b.r){
          hurt(f, b.damage, null);
          f.invuln = .35;
          b.life = 0;
          break;
        }
      }
      continue;
    }
    for(const t of game.enemies){
      if(!t.alive || b.hitList.includes(t)) continue;
      if(dist(b,t) < (t.r||13)+b.r){
        hurt(t, b.damage, b.owner);
        b.hitList.push(t);
        if(b.knock){
          const l = Math.hypot(b.vx,b.vy)||1;
          t.x = clamp(t.x + b.vx/l*b.knock*.14, 12, WORLD_W-12);
          t.y = clamp(t.y + b.vy/l*b.knock*.14, 12, WORLD_H-12);
        }
        if(b.pierce > 0){ b.pierce--; }
        else { b.life = 0; break; }
      }
    }
  }
  game.bullets = game.bullets.filter(b => b.life>0 && b.x>-60 && b.x<WORLD_W+60 && b.y>-60 && b.y<WORLD_H+60);

  // ---- pickups ----
  /* Loot belongs to whoever reaches it first: the player pulls items in from
     further away, clones have to physically walk onto them. XP only ever goes
     to the fighter that made the pickup, which is what keeps levels private
     per individual. */
  const squad = [game.player, ...game.clones.filter(c=>c.alive)];
  for(const d of game.drops){
    if(!d.alive) continue;
    d.life -= dt;
    if(d.life <= 0){ d.alive = false; continue; }
    let taker = null;
    for(const f of squad){
      if(!f.alive) continue;
      const dd = dist(d, f);
      const magnetic = f === game.player;
      const reach = magnetic ? 118 : 46;
      if(dd < reach && dd > 0){
        const k = Math.min(1, dt*(magnetic ? 2.4 + (118-dd)/28 : 3.4));
        d.x += (f.x-d.x)*k;
        d.y += (f.y-d.y)*k;
      }
      if(dd < (magnetic ? 26 : 22)){ taker = f; break; }
    }
    if(taker) collectDrop(d, taker);
  }
  game.drops = game.drops.filter(d=>d.alive);
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

/* ================================================================== *
 *  WORLD RENDERING — camera-space floor, obstacles, buildings      *
 * ================================================================== */
function visible(x, y, pad=0){
  return x > cam.x - W/2 - pad && x < cam.x + W/2 + pad &&
         y > cam.y - H/2 - pad && y < cam.y + H/2 + pad;
}

/* deterministic value noise for tile variation */
function hash2(x, y){
  let h = (x*374761393 + y*668265263 + WORLD_SEED) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const TILE = 150;

function drawWorldFloor(t){
  const left = cam.x - W/2, top = cam.y - H/2;
  const x0 = Math.floor(left / TILE) - 1, x1 = Math.ceil((left + W) / TILE) + 1;
  const y0 = Math.floor(top / TILE) - 1, y1 = Math.ceil((top + H) / TILE) + 1;

  // base ground: outside the arena it turns into cold void, not a black hole
  ctx.fillStyle = '#0d1512';
  ctx.fillRect(left - 40, top - 40, W + 80, H + 80);
  // clamp the tiled ground to the actual world rect
  const gx0 = Math.max(x0*TILE, 0), gy0 = Math.max(y0*TILE, 0);
  const gx1 = Math.min((x1+1)*TILE, WORLD_W), gy1 = Math.min((y1+1)*TILE, WORLD_H);
  if(gx1 > gx0 && gy1 > gy0){
    ctx.fillStyle = '#1b2a22';
    ctx.fillRect(gx0, gy0, gx1-gx0, gy1-gy0);
  }

  for(let ty=y0; ty<=y1; ty++){
    for(let tx=x0; tx<=x1; tx++){
      const x = tx*TILE, y = ty*TILE;
      if(x + TILE <= 0 || y + TILE <= 0 || x >= WORLD_W || y >= WORLD_H) continue;
      const d = worldDepth(x + TILE/2, y + TILE/2);
      const n  = hash2(tx, ty);
      const n2 = hash2(tx*7+3, ty*13+5);

      // biome tint: lush near the plaza, cold stone out in the deep field
      const lush = 1 - d;
      const r = Math.round(24 + lush*14 + d*24);
      const g = Math.round(44 + lush*22 + d*6);
      const b = Math.round(34 + lush*10 + d*22);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, TILE+1, TILE+1);

      // patchy mottling so large areas never look flat
      ctx.fillStyle = `rgba(${r+26},${g+30},${b+24},${0.10 + n*0.16})`;
      ctx.beginPath();
      ctx.ellipse(x + n*TILE, y + n2*TILE, TILE*(.16 + n*.26), TILE*(.12 + n2*.22), n*3, 0, TAU);
      ctx.fill();

      // grass tufts / rubble depending on the biome
      if(n > .55){
        const count = 1 + Math.floor(n2*3);
        for(let k=0;k<count;k++){
          const gx = x + hash2(tx+k, ty)*TILE, gy = y + hash2(tx, ty+k)*TILE;
          if(d < .55){
            ctx.strokeStyle = `rgba(168,214,146,${.20 + n*.18})`;
            ctx.lineWidth = 1.4;
            for(let bl=-1;bl<=1;bl++){
              ctx.beginPath();
              ctx.moveTo(gx+bl*3, gy);
              ctx.quadraticCurveTo(gx+bl*4+3, gy-7, gx+bl*7+5, gy-13);
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = `rgba(${60+d*20},${58+d*14},${62+d*18},${.35 + n*.25})`;
            ctx.beginPath();
            ctx.ellipse(gx, gy, 2+n*4, 1.6+n*3, n*3, 0, TAU);
            ctx.fill();
          }
        }
      }

      // cracked slabs in the deep field
      if(d > .45 && n2 > .78){
        ctx.strokeStyle = `rgba(12,16,20,${.28 + d*.2})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + n*TILE, y + 10);
        ctx.lineTo(x + TILE*(.4+n*.3), y + TILE*.5);
        ctx.lineTo(x + TILE*(.2+n2*.5), y + TILE - 10);
        ctx.stroke();
      }
    }
  }

  // region grid lines + boundary walls of the world
  ctx.strokeStyle = 'rgba(150,196,150,.06)';
  ctx.lineWidth = 1;
  const GRID = TILE*2;
  for(let gx=Math.floor(left/GRID)*GRID; gx<left+W+GRID; gx+=GRID){
    ctx.beginPath(); ctx.moveTo(gx, top-20); ctx.lineTo(gx, top+H+20); ctx.stroke();
  }
  for(let gy=Math.floor(top/GRID)*GRID; gy<top+H+GRID; gy+=GRID){
    ctx.beginPath(); ctx.moveTo(left-20, gy); ctx.lineTo(left+W+20, gy); ctx.stroke();
  }

  // start plaza marker (safe zone)
  const px = WORLD_W/2, py = WORLD_H/2;
  if(visible(px, py, 460)){
    const g = ctx.createRadialGradient(px, py, 20, px, py, 420);
    g.addColorStop(0, 'rgba(170,230,140,.10)');
    g.addColorStop(1, 'rgba(170,230,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, 420, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(190,235,160,.20)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.arc(px, py, 340, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(200,235,175,.30)';
    ctx.font = 'bold 15px "Space Grotesk", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SAFE ZONE', px, py - 360);
    ctx.textAlign = 'left';
  }

  // world edge
  if(cam.x - W/2 < 60 || cam.y - H/2 < 60 || cam.x + W/2 > WORLD_W-60 || cam.y + H/2 > WORLD_H-60){
    ctx.strokeStyle = 'rgba(255,120,110,.35)';
    ctx.lineWidth = 6;
    ctx.setLineDash([26, 20]);
    ctx.strokeRect(6, 6, WORLD_W-12, WORLD_H-12);
    ctx.setLineDash([]);
  }
}

/* drifting spores that follow the camera so the field feels alive */
function drawAmbient(t){
  for(const d of dust){
    const y = d.y + Math.sin(t*.5+d.ph)*12;
    const x = d.x + Math.cos(t*.3+d.ph)*16;
    if(!visible(x, y, 40)) continue;
    glow(GLOW.lime, x, y, d.r*12, d.a);
  }
  // slow light sweep across the visible area
  const sweep = (Math.sin(t*.16)*.5+.5);
  ctx.globalAlpha = .05;
  const grd = ctx.createLinearGradient(
    cam.x - W/2 + W*(sweep-.25), cam.y - H/2,
    cam.x - W/2 + W*(sweep+.15), cam.y + H/2
  );
  grd.addColorStop(0,'rgba(190,255,170,0)');
  grd.addColorStop(.5,'rgba(190,255,170,1)');
  grd.addColorStop(1,'rgba(190,255,170,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(cam.x - W/2, cam.y - H/2, W, H);
  ctx.globalAlpha = 1;
}

function drawObstacles(t){
  for(const o of worldEnt.obstacles){
    if(!visible(o.cx, o.cy, 220)) continue;
    ctx.save();
    ctx.translate(o.x, o.y);
    // ground shadow
    ctx.fillStyle = 'rgba(6,12,9,.42)';
    rrect(ctx, 6, 10, o.w, o.h, 10);
    ctx.fill();
    if(o.kind === 'rock'){
      const g = ctx.createLinearGradient(0, 0, 0, o.h);
      g.addColorStop(0, '#3d4c44');
      g.addColorStop(.55, '#2b3831');
      g.addColorStop(1, '#1b2620');
      ctx.fillStyle = g;
      rrect(ctx, 0, 0, o.w, o.h, Math.min(o.w,o.h)*.36);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,180,158,.22)';
      ctx.lineWidth = 2;
      rrect(ctx, 1, 1, o.w-2, o.h-2, Math.min(o.w,o.h)*.34);
      ctx.stroke();
      // facet highlights
      ctx.fillStyle = 'rgba(176,206,180,.10)';
      ctx.beginPath();
      ctx.ellipse(o.w*.36, o.h*.32, o.w*.22, o.h*.16, -.4, 0, TAU);
      ctx.fill();
    } else if(o.kind === 'wall'){
      const g = ctx.createLinearGradient(0, 0, 0, o.h);
      g.addColorStop(0, '#4a4a40');
      g.addColorStop(.5, '#35382f');
      g.addColorStop(1, '#22261f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, o.w, o.h);
      ctx.strokeStyle = 'rgba(190,205,170,.20)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, o.w-2, o.h-2);
      // masonry seams
      ctx.strokeStyle = 'rgba(12,18,14,.45)';
      ctx.lineWidth = 1;
      const horiz = o.w > o.h;
      const n = Math.floor((horiz ? o.w : o.h) / 46);
      for(let i=1;i<n;i++){
        ctx.beginPath();
        if(horiz){ ctx.moveTo(i*46, 0); ctx.lineTo(i*46, o.h); }
        else { ctx.moveTo(0, i*46); ctx.lineTo(o.w, i*46); }
        ctx.stroke();
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, o.w, o.h);
      g.addColorStop(0, '#6a5330');
      g.addColorStop(1, '#3f3220');
      ctx.fillStyle = g;
      rrect(ctx, 0, 0, o.w, o.h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,150,.30)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 4); ctx.lineTo(o.w-4, o.h-4);
      ctx.moveTo(o.w-4, 4); ctx.lineTo(4, o.h-4);
      ctx.stroke();
      rrect(ctx, 1, 1, o.w-2, o.h-2, 5);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBuildings(t){
  const p = game.player;
  for(const b of worldEnt.buildings){
    const cx = b.x + b.w/2, cy = b.y + b.h/2;
    if(!visible(cx, cy, Math.max(b.w,b.h))) continue;
    const door = buildingDoor(b);
    const near = Math.hypot(p.x - cx, p.y - cy) < Math.max(b.w, b.h)*.6 + 120;
    b.discovered = b.discovered || near;

    // floor plate
    ctx.fillStyle = b.cleared ? 'rgba(38,54,44,.92)' : 'rgba(30,40,34,.94)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // interior grid
    ctx.strokeStyle = 'rgba(150,190,150,.07)';
    ctx.lineWidth = 1;
    for(let gx=b.x+60; gx<b.x+b.w; gx+=60){
      ctx.beginPath(); ctx.moveTo(gx, b.y); ctx.lineTo(gx, b.y+b.h); ctx.stroke();
    }
    for(let gy=b.y+60; gy<b.y+b.h; gy+=60){
      ctx.beginPath(); ctx.moveTo(b.x, gy); ctx.lineTo(b.x+b.w, gy); ctx.stroke();
    }
    // warm interior light (better loot glows brighter)
    const glowA = .06 + b.tier*.045;
    const lg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(b.w,b.h)*.62);
    const tint = ['160,210,150','190,220,140','240,210,130','255,180,110','255,140,120'][b.tier] || '190,220,150';
    lg.addColorStop(0, `rgba(${tint},${glowA})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    // walls with a doorway gap
    const T = 22;
    ctx.fillStyle = '#39443a';
    const walls = [
      [b.x, b.y, b.w, T],
      [b.x, b.y+b.h-T, b.w, T],
      [b.x, b.y, T, b.h],
      [b.x+b.w-T, b.y, T, b.h]
    ];
    for(const [wx, wy, ww, wh] of walls){
      // subtract door
      if(door.side === 'top' && wy === b.y) drawWallWithGap(wx, wy, ww, wh, door.x, door.w, true);
      else if(door.side === 'bottom' && wy === b.y+b.h-T) drawWallWithGap(wx, wy, ww, wh, door.x, door.w, true);
      else if(door.side === 'left' && wx === b.x) drawWallWithGap(wx, wy, ww, wh, door.y, door.w, false);
      else if(door.side === 'right' && wx === b.x+b.w-T) drawWallWithGap(wx, wy, ww, wh, door.y, door.w, false);
      else ctx.fillRect(wx, wy, ww, wh);
    }
    // wall top highlight
    ctx.strokeStyle = 'rgba(190,215,175,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x+1, b.y+1, b.w-2, b.h-2);

    // door frame marker
    ctx.fillStyle = 'rgba(240,215,150,.55)';
    if(door.side === 'top') ctx.fillRect(door.x - door.w/2, b.y - 3, door.w, 6);
    if(door.side === 'bottom') ctx.fillRect(door.x - door.w/2, b.y+b.h-3, door.w, 6);
    if(door.side === 'left') ctx.fillRect(b.x - 3, door.y - door.w/2, 6, door.w);
    if(door.side === 'right') ctx.fillRect(b.x+b.w-3, door.y - door.w/2, 6, door.w);

    // label plate above the roof
    if(b.discovered){
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px "Space Grotesk", monospace';
      ctx.fillStyle = b.cleared ? 'rgba(160,190,160,.55)' : 'rgba(255,225,170,.85)';
      ctx.fillText((b.cleared ? 'CLEARED' : 'CONTAINER TIER ' + (b.tier+1)), cx, b.y - 16);
      ctx.font = 'bold 9px "Space Grotesk", monospace';
      ctx.fillStyle = 'rgba(200,225,180,.5)';
      ctx.fillText('LOOT x' + b.loot + '  ·  GUARDS x' + b.guards, cx, b.y - 3);
      ctx.textAlign = 'left';
    }
  }
}

function drawWallWithGap(x, y, w, h, gapCentre, gapWidth, horizontal){
  if(horizontal){
    const g0 = gapCentre - gapWidth/2 - x, g1 = gapCentre + gapWidth/2 - x;
    ctx.fillRect(x, y, clamp(g0, 0, w), h);
    ctx.fillRect(x + clamp(g1, 0, w), y, w - clamp(g1, 0, w), h);
  } else {
    const g0 = gapCentre - gapWidth/2 - y, g1 = gapCentre + gapWidth/2 - y;
    ctx.fillRect(x, y, w, clamp(g0, 0, h));
    ctx.fillRect(x, y + clamp(g1, 0, h), w, h - clamp(g1, 0, h));
  }
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

  if(e.elite){
    // elite aura + crown
    glow(GLOW.amber, e.x, e.y, e.r*4.6, .3 + Math.sin(t*5+e.seed)*.08);
    ctx.save();
    ctx.translate(e.x, e.y - e.r - 9 + Math.sin(t*4+e.seed)*2);
    ctx.fillStyle = '#ffd39a';
    ctx.beginPath();
    ctx.moveTo(-7, 4); ctx.lineTo(-7, -2); ctx.lineTo(-3.5, 1); ctx.lineTo(0, -4);
    ctx.lineTo(3.5, 1); ctx.lineTo(7, -2); ctx.lineTo(7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,20,.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  if((e.hp < e.maxHp && e.type === 'brute') || e.elite){
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

/* ---------------------------- boss / elite ------------------------ */
function drawBoss(e,t){
  const bob = Math.sin(t*2.2+e.seed)*2.2;
  const pulse = .85 + Math.sin(t*3.4)*.15;
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.fillStyle = 'rgba(6,10,8,.45)';
  ctx.beginPath(); ctx.ellipse(0, e.r*.95, e.r*1.15, e.r*.36, 0, 0, TAU); ctx.fill();

  // menacing aura
  glow(GLOW.red, 0, 0, e.r*5.2, e.charging>0 ? .5 : .3);

  // orbiting shards
  for(let i=0;i<5;i++){
    const a = t*.8 + i*TAU/5;
    const rx = Math.cos(a)*e.r*1.5, ry = Math.sin(a)*e.r*1.5*.8;
    ctx.save();
    ctx.translate(rx, ry); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,180,150,.75)';
    ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(4,0); ctx.lineTo(0,5); ctx.lineTo(-4,0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // spikes
  const spikes = 9;
  for(let i=0;i<spikes;i++){
    const a = i*TAU/spikes + t*.15;
    const inner = e.r*.92, outer = e.r*(1.35 + Math.sin(t*4+i)*.06);
    ctx.fillStyle = 'rgba(70,22,20,.85)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a-.14)*inner, Math.sin(a-.14)*inner);
    ctx.lineTo(Math.cos(a)*outer, Math.sin(a)*outer);
    ctx.lineTo(Math.cos(a+.14)*inner, Math.sin(a+.14)*inner);
    ctx.closePath(); ctx.fill();
  }

  // core body
  const bg = ctx.createRadialGradient(-e.r*.3, -e.r*.4+bob, e.r*.2, 0, bob, e.r*1.25);
  bg.addColorStop(0,'#e88c6e');
  bg.addColorStop(.45,'#b9472f');
  bg.addColorStop(1,'#4d1a15');
  ctx.fillStyle = e.hit > 0 ? '#ffffff' : bg;
  ctx.beginPath();
  ctx.ellipse(0, bob, e.r, e.r*.92, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,10,8,.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // armour plating
  ctx.strokeStyle = 'rgba(60,18,14,.55)';
  ctx.lineWidth = 2.4;
  for(let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(0, bob, e.r*(.4+i*.22), Math.PI*.15, Math.PI*.85);
    ctx.stroke();
  }

  // glowing eye cluster
  glow(GLOW.white, 0, -e.r*.25+bob, e.r*1.3*pulse, .95);
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.ellipse(0, -e.r*.22+bob, e.r*.34, e.r*.13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e0341c';
  ctx.beginPath();
  ctx.arc(0, -e.r*.22+bob, e.r*.09*pulse, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(-e.r*.05, -e.r*.28+bob, e.r*.05, 0, TAU);
  ctx.fill();

  // mouth
  ctx.strokeStyle = 'rgba(50,12,10,.75)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, e.r*.28+bob, e.r*.36, .15*Math.PI, .85*Math.PI);
  ctx.stroke();

  // charge telegraph
  if(e.charging > 0){
    ctx.strokeStyle = 'rgba(255,120,90,.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(e.chargeDir.x*e.r*2.6, e.chargeDir.y*e.r*2.6);
    ctx.stroke();
  }
  // laser telegraph
  if(e.laser > 0){
    ctx.strokeStyle = 'rgba(255,180,255,.85)';
    ctx.lineWidth = 26*pulse;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(e.laserAngle)*1200, Math.sin(e.laserAngle)*1200);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();

  // target reticle so the boss never gets lost in the horde
  const rp = 1 + Math.sin(t*3)*.05;
  ctx.strokeStyle = 'rgba(255,140,110,.35)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6,8]);
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r*1.75*rp, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  for(let i=0;i<4;i++){
    const a = t*.9 + i*TAU/4;
    const rr = e.r*1.85;
    const ax = e.x + Math.cos(a)*rr, ay = e.y + Math.sin(a)*rr;
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(a + Math.PI/2);
    ctx.fillStyle = 'rgba(255,150,120,.8)';
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(5,4); ctx.lineTo(-5,4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // name plate
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px "Space Grotesk", monospace';
  ctx.fillStyle = 'rgba(255,214,196,.95)';
  ctx.fillText(e.title, e.x, e.y - e.r - 16);
  if(e.tier > 0){
    ctx.font = 'bold 9px "Space Grotesk", monospace';
    ctx.fillStyle = '#ffb066';
    ctx.fillText('PHASE +'+e.tier, e.x, e.y - e.r - 4);
  }
}

function drawDrop(d,t){
  const kinds = {
    heal:  {color:'#a6ff7a', glow:GLOW.green, icon:'✚'},
    magnet:{color:'#9fe6ff', glow:GLOW.blue,  icon:'◎'},
    bomb:  {color:'#ffb066', glow:GLOW.amber, icon:'✹'},
    frenzy:{color:'#ff9de0', glow:GLOW.purple,icon:'✦'},
    xp:    {color:'#c4b5ff', glow:GLOW.purple,icon:'✧'},
    weapon:{color:'#ffd166', glow:GLOW.amber, icon:'✦'},
    weapon2:{color:'#ff7a5c', glow:GLOW.red,  icon:'★'}
  };
  const k = kinds[d.kind] || kinds.heal;
  const blink = d.life < 3.5 ? (Math.floor(t*8)%2 ? .35 : 1) : 1;
  const bob = Math.sin(t*4+d.bob)*3;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.translate(d.x, d.y+bob);
  ctx.fillStyle = 'rgba(5,10,8,.35)';
  ctx.beginPath(); ctx.ellipse(0, 12, 9, 3, 0, 0, TAU); ctx.fill();
  glow(k.glow, 0, 0, 46, .7);
  ctx.rotate(Math.sin(t*2+d.bob)*.12);
  // capsule
  ctx.fillStyle = 'rgba(14,24,20,.85)';
  rrect(ctx, -10, -10, 20, 20, 6); ctx.fill();
  ctx.strokeStyle = k.color;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = k.color;
  ctx.font = 'bold 13px "Space Grotesk", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(k.icon, 0, 4.5);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------------------------- summons ----------------------------- */
function drawDrone(d,t){
  const bob = Math.sin(t*6+d.seed)*1.6;
  ctx.save();
  ctx.translate(d.x, d.y+bob);
  ctx.fillStyle = 'rgba(6,12,10,.30)';
  ctx.beginPath(); ctx.ellipse(0, 19, 9, 3.4, 0, 0, TAU); ctx.fill();
  glow(GLOW.blue, 0, 0, 56, .55);

  // arms + spinning rotors
  const spin = t*30;
  for(const sx of [-1,1]){
    ctx.strokeStyle = 'rgba(120,160,172,.75)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx*5, -2); ctx.lineTo(sx*11, -6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(196,240,252,.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(sx*11, -6, 7, 2.2 + Math.sin(spin)*.6, 0, 0, TAU);
    ctx.stroke();
  }

  // chassis
  const dg = ctx.createLinearGradient(0,-9,0,10);
  dg.addColorStop(0,'#eaf9ff');
  dg.addColorStop(.42,'#9ed3e4');
  dg.addColorStop(.72,'#4b7d90');
  dg.addColorStop(1,'#264450');
  ctx.fillStyle = d.hit>0 ? '#ffffff' : dg;
  ctx.beginPath();
  ctx.moveTo(-9,-4);
  ctx.quadraticCurveTo(-9,-10, 0,-10);
  ctx.quadraticCurveTo(9,-10, 9,-4);
  ctx.quadraticCurveTo(9.5,7, 0,9);
  ctx.quadraticCurveTo(-9.5,7, -9,-4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,18,22,.65)';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // cyan eye lens
  glow(GLOW.blue, 0, -1, 22, .9);
  ctx.fillStyle = '#7ff0ff';
  ctx.beginPath(); ctx.ellipse(0, -1, 4.4, 3.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.arc(-1.2, -2, 1.2, 0, TAU); ctx.fill();

  // underside gun pods
  ctx.fillStyle = '#2b3f47';
  rrect(ctx, -6, 6, 3.4, 7, 1.4); ctx.fill();
  rrect(ctx, 2.6, 6, 3.4, 7, 1.4); ctx.fill();
  ctx.fillStyle = '#ff9d5c';
  ctx.beginPath(); ctx.arc(-4.3, 13, 1.1, 0, TAU); ctx.arc(4.3, 13, 1.1, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawWisp(w,t){
  const pulse = .85 + Math.sin(t*7+w.bob)*.15;
  const flick = Math.sin(t*13+w.seed)*1.6;
  ctx.save();
  ctx.translate(w.x, w.y + Math.sin(t*4+w.bob)*2.6);
  glow(GLOW.purple, 0, 0, 64*pulse, .7);
  glow(GLOW.white, 0, 0, 24*pulse, .8);
  // flame body
  ctx.fillStyle = 'rgba(232,224,255,.95)';
  ctx.beginPath();
  ctx.moveTo(0, -13*pulse + flick*.4);
  ctx.quadraticCurveTo(9*pulse, -2, 5*pulse, 7*pulse);
  ctx.quadraticCurveTo(0, 12*pulse, -5*pulse, 7*pulse);
  ctx.quadraticCurveTo(-9*pulse, -2, 0, -13*pulse + flick*.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(198,182,255,.85)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 4.2*pulse, 5.4*pulse, 0, 0, TAU);
  ctx.fill();
  // sparks
  for(let i=0;i<3;i++){
    const a = t*3 + i*2.1;
    ctx.fillStyle = 'rgba(220,210,255,.6)';
    ctx.beginPath();
    ctx.arc(Math.cos(a)*9, Math.sin(a*1.4)*7, 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // fuse
  const p = clamp(w.life/w.maxLife,0,1);
  ctx.fillStyle = 'rgba(8,14,10,.6)';
  rrect(ctx, w.x-9, w.y+16, 18, 2.6, 1.3); ctx.fill();
  ctx.fillStyle = '#c4b5ff';
  rrect(ctx, w.x-9, w.y+16, 18*p, 2.6, 1.3); ctx.fill();
}

/* ------------------------------- traps ---------------------------- */
function drawHazard(h,t){
  const k = h.kind === 'mine' ? 1 : clamp(h.life/Math.min(h.maxLife, 3), 0, 1);
  ctx.save();
  ctx.translate(h.x, h.y);
  if(h.kind === 'mine'){
    const arm = h.arm > 0 ? .5+.5*Math.sin(t*24) : 1;
    glow(GLOW.red, 0, 0, h.trigger*3.6, .38*arm);
    // blast radius hint
    ctx.strokeStyle = `rgba(255,140,90,${.16*arm})`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5,7]);
    ctx.beginPath(); ctx.arc(0, 0, h.r*.92, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    // trap plate
    ctx.fillStyle = 'rgba(20,28,24,.9)';
    ctx.beginPath(); ctx.arc(0, 0, h.trigger*.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,176,102,.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(0, 0, h.trigger*.6, 0, TAU); ctx.stroke();
    ctx.rotate(t*1.6);
    for(let i=0;i<8;i++){
      const a = i*TAU/8;
      ctx.strokeStyle = 'rgba(255,140,90,.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*h.trigger*.3, Math.sin(a)*h.trigger*.3);
      ctx.lineTo(Math.cos(a)*h.trigger*.58, Math.sin(a)*h.trigger*.58);
      ctx.stroke();
    }
    ctx.rotate(-t*1.6);
    glow(GLOW.amber, 0, 0, 20, .5*arm);
    ctx.fillStyle = h.arm > 0 ? '#ffd7a0' : '#ff9d5c';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  } else if(h.kind === 'spike'){
    ctx.fillStyle = 'rgba(24,34,30,.55)';
    ctx.beginPath(); ctx.arc(0, 0, h.r*.96, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,140,150,.35)';
    ctx.lineWidth = 1.2;
    for(let i=0;i<3;i++){
      ctx.beginPath(); ctx.arc(0, 0, h.r*(.35+i*.22), 0, TAU); ctx.stroke();
    }
    const rg = ctx.createRadialGradient(0,0,4,0,0,h.r);
    rg.addColorStop(0, `rgba(206,216,232,${.20*k})`);
    rg.addColorStop(.7, `rgba(150,168,190,${.13*k})`);
    rg.addColorStop(1, 'rgba(120,140,160,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
    const spikes = h.lv >= 3 ? 9 : 7;
    for(let i=0;i<spikes;i++){
      const a = i*TAU/spikes + h.seed;
      const rr = h.r*(.55 + (i%2)*.3);
      const x = Math.cos(a)*rr, y = Math.sin(a)*rr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + Math.PI/2);
      ctx.fillStyle = `rgba(232,242,255,${.92*k})`;
      ctx.beginPath();
      ctx.moveTo(0, -10.5);
      ctx.lineTo(5, 5.5);
      ctx.lineTo(-5, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(30,44,56,${.7*k})`;
      ctx.lineWidth = 1.2;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = `rgba(210,225,240,${.28*k})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, h.r*.92, 0, TAU); ctx.stroke();
  } else {
    ctx.fillStyle = `rgba(20,38,22,${.55*k})`;
    ctx.beginPath(); ctx.arc(0, 0, h.r*.95, 0, TAU); ctx.fill();
    const rg = ctx.createRadialGradient(0,0,6,0,0,h.r);
    rg.addColorStop(0, `rgba(150,230,110,${.34*k})`);
    rg.addColorStop(.6, `rgba(110,190,80,${.22*k})`);
    rg.addColorStop(1, 'rgba(80,150,60,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(170,240,130,${.30*k})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, h.r*.86, 0, TAU); ctx.stroke();
    // bubbles
    for(let i=0;i<6;i++){
      const a = h.seed + i*1.7 + t*.6;
      const rr = h.r*(.25 + ((i*37)%10)/14);
      const bx = Math.cos(a)*rr, by = Math.sin(a*1.3)*rr*.8;
      const br = 2 + Math.sin(t*3 + i)*1.2;
      ctx.fillStyle = `rgba(190,255,150,${.35*k})`;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(.6,br), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  // lifetime ring for timed traps
  if(h.kind !== 'mine' && h.life < h.maxLife - .4 && h.maxLife < 50){
    const p = clamp(h.life/h.maxLife, 0, 1);
    ctx.strokeStyle = h.kind === 'poison' ? 'rgba(150,230,110,.45)' : 'rgba(210,225,240,.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r*.98, -Math.PI/2, -Math.PI/2 + TAU*p);
    ctx.stroke();
  }
}

/* ------------------------------ render ---------------------------- */
function render(t){
  ctx.setTransform(1,0,0,1,0,0);
  // camera: everything below draws in world coordinates
  syncCamera(0);
  ctx.translate(
    Math.round(-cam.x + W/2 + cam.shakeX),
    Math.round(-cam.y + H/2 + cam.shakeY)
  );
  drawWorldFloor(t);
  drawObstacles(t);
  drawBuildings(t);
  drawAmbient(t);

  // rings / shockwaves
  for(const r of game.rings){
    if(!visible(r.x, r.y, r.maxR + 120)) continue;
    const k = r.life/r.max;
    ctx.globalAlpha = k*.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width*k;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // traps sit flat on the floor, under everything else
  for(const h of game.hazards) if(visible(h.x,h.y,80)) drawHazard(h,t);
  for(const m of game.minions) if(visible(m.x,m.y,80)) drawMinion(m,t);
  for(const d of game.drones) if(visible(d.x,d.y,80)) drawDrone(d,t);
  for(const w of game.wisps) if(visible(w.x,w.y,80)) drawWisp(w,t);
  for(const e of game.enemies){
    if(!visible(e.x, e.y, e.boss ? 200 : 90)) continue;
    e.boss ? drawBoss(e,t) : drawEnemy(e,t);
  }
  for(const d of game.drops) if(visible(d.x,d.y,70)) drawDrop(d,t);
  for(const c of game.clones) if(visible(c.x,c.y,90)) drawFighter(c,t);
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
    if(!visible(b.x, b.y, 60)) continue;
    const lifeK = clamp(b.life/b.maxLife,0,1);
    const bulb = b.hostile ? GLOW.red
      : b.color==='#b8ff83'||b.color==='#d9ffa1' ? GLOW.green
      : b.color==='#9fe6ff' ? GLOW.blue : GLOW.amber;
    glow(bulb, b.x, b.y, b.r*9, .85);
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
    if(!visible(p.x, p.y, 40)) continue;
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

  // boss warning / defeat flash
  if(game.bossFlash > 0){
    ctx.fillStyle = `rgba(255,90,70,${.16*game.bossFlash})`;
    ctx.fillRect(0,0,W,H);
  }
  if(game.frenzy > 0){
    ctx.fillStyle = `rgba(255,120,220,${.05 + Math.sin(t*8)*.015})`;
    ctx.fillRect(0,0,W,H);
  }

  // level-up / awaken flash
  if(game.state === 'reward'){
    ctx.fillStyle = 'rgba(140,200,120,.05)';
    ctx.fillRect(0,0,W,H);
  }

  // screen-space UI (minimap, off-screen markers, cooldown ring)
  ctx.setTransform(1,0,0,1,0,0);
  drawMinimap(t);
  drawOffscreenMarkers(t);
  if(game.state === 'cooldown') drawCooldownRing(t);
}

/* ---------------------------- screen UI --------------------------- */
/* the minimap has to stay readable but never eat a phone screen */
function minimapSize(){
  const base = Math.min(W, H);
  return Math.round(clamp(base * 0.16, 82, 132));
}
const MINIMAP = { get size(){ return minimapSize(); }, pad: 12 };

function drawMinimap(t){
  const m = MINIMAP.size;
  const x = W - m - MINIMAP.pad, y = H - m - MINIMAP.pad;
  const k = m / WORLD_W;
  ctx.save();
  ctx.globalAlpha = .9;
  // frame
  ctx.fillStyle = 'rgba(10,18,14,.72)';
  ctx.fillRect(x, y, m, m);
  ctx.strokeStyle = 'rgba(170,210,165,.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, m, m);

  // buildings
  for(const b of worldEnt.buildings){
    const band = DEPTH_NAMES[b.tier] || DEPTH_NAMES[0];
    ctx.fillStyle = b.cleared ? 'rgba(140,190,150,.55)'
      : b.entered ? 'rgba(255,235,170,.9)' : band.color;
    ctx.globalAlpha = b.discovered ? .95 : .45;
    const bw = Math.max(3, b.w*k), bh = Math.max(3, b.h*k);
    ctx.fillRect(x + b.x*k, y + b.y*k, bw, bh);
  }
  ctx.globalAlpha = 1;

  // viewport rectangle
  ctx.strokeStyle = 'rgba(210,240,190,.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + (cam.x - W/2)*k, y + (cam.y - H/2)*k, W*k, H*k);

  // enemies as faint dots (only nearby ones, to stay cheap)
  ctx.fillStyle = 'rgba(255,130,110,.55)';
  for(const e of game.enemies){
    if(!e.alive || !visible(e.x, e.y, 900)) continue;
    ctx.fillRect(x + e.x*k - 1, y + e.y*k - 1, 2, 2);
  }
  // clones
  ctx.fillStyle = 'rgba(255,205,130,.9)';
  for(const c of game.clones){
    if(!c.alive) continue;
    ctx.fillRect(x + c.x*k - 1.5, y + c.y*k - 1.5, 3, 3);
  }
  // player
  const px = x + game.player.x*k, py = y + game.player.y*k;
  ctx.fillStyle = '#d8ff9e';
  ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(216,255,158,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, 6 + Math.sin(t*4)*1.4, 0, TAU); ctx.stroke();
  ctx.restore();
}

/* arrows pointing at loot/buildings that are off screen */
function drawOffscreenMarkers(t){
  const interest = [];
  for(const b of worldEnt.buildings){
    if(b.cleared) continue;
    interest.push({x:b.x + b.w/2, y:b.y + b.h/2, color: DEPTH_NAMES[b.tier].color, kind:'building', size: b.tier+1});
  }
  for(const d of game.drops){
    if(d.alive) interest.push({x:d.x, y:d.y, color:'#ffd166', kind:'drop', size:1});
  }
  const cx = W/2, cy = H/2;
  const margin = 26;
  ctx.save();
  for(const it of interest){
    const sx = it.x - cam.x + cx, sy = it.y - cam.y + cy;
    if(sx > margin && sx < W-margin && sy > margin && sy < H-margin) continue;
    const dx = sx - cx, dy = sy - cy;
    const ang = Math.atan2(dy, dx);
    const rx = (W/2 - margin), ry = (H/2 - margin);
    const scale = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
    const mx = cx + Math.cos(ang)*scale, my = cy + Math.sin(ang)*scale;
    ctx.translate(mx, my);
    ctx.rotate(ang);
    ctx.globalAlpha = it.kind === 'building' ? .85 : .55;
    ctx.fillStyle = it.color;
    ctx.beginPath();
    const s = 5 + it.size*1.2;
    ctx.moveTo(s, 0); ctx.lineTo(-s*.7, s*.65); ctx.lineTo(-s*.7, -s*.65);
    ctx.closePath(); ctx.fill();
    ctx.setTransform(1,0,0,1,0,0);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* the 5 second breather gets its own big countdown */
function drawCooldownRing(t){
  // parked low so it never covers the player
  const cx = W/2, cy = H*0.66, R = 54;
  const k = 1 - game.cooldown / (game.cooldown0 || COOLDOWN_TIME);
  ctx.save();
  // dim the field a touch to read as "between rounds"
  ctx.fillStyle = 'rgba(8,20,26,.18)';
  ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(160,225,255,.22)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#9fe6ff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI/2, -Math.PI/2 + TAU*k); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#eaf8ff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px "Space Grotesk", monospace';
  ctx.fillText(game.cooldown.toFixed(1), cx, cy + 12);
  ctx.font = 'bold 11px "Space Grotesk", monospace';
  ctx.fillStyle = 'rgba(200,235,220,.85)';
  ctx.fillText('NEXT ROUND', cx, cy + 32);
  // top banner
  ctx.fillStyle = 'rgba(12,26,32,.72)';
  rrect(ctx, cx-150, 20, 300, 34, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(159,230,255,.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#cdeeff';
  ctx.font = 'bold 12px "Space Grotesk", monospace';
  ctx.fillText('ROUND ' + String(game.stage).padStart(2,'0') + '  //  PREPARE', cx, 42);
  ctx.textAlign = 'left';
  ctx.restore();
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
  if(typeof syncFsPause === 'function') syncFsPause();
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
/* -------- touch: floating virtual joystick --------
   The stick appears wherever the thumb lands and the knob follows it.
   A quick flick without holding still counts as a dash. */
const stickEl = $('touchStick'), knobEl = $('stickKnob'), wrapEl = $('canvasWrap');
const STICK_R = 46;
function placeStick(cx, cy){
  const box = wrapEl.getBoundingClientRect();
  const pad = 70;                                    // keep the ring on screen
  const x = clamp(cx - box.left, pad, Math.max(pad, box.width - pad));
  const y = clamp(cy - box.top,  pad, Math.max(pad, box.height - pad));
  stickEl.style.left = x + 'px';
  stickEl.style.top = y + 'px';
  stickEl.style.transform = 'translate(-50%,-50%)';
}
canvas.addEventListener('pointerdown', e=>{
  if(e.pointerType === 'mouse') return;
  touch.active = true;
  touch.x = e.clientX; touch.y = e.clientY;
  touch.dx = touch.dy = 0;
  touch.id = e.pointerId;
  placeStick(e.clientX, e.clientY);
  knobEl.style.transform = 'translate(0,0)';
  stickEl.classList.add('on');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e=>{
  if(!touch.active || e.pointerId !== touch.id) return;
  let dx = e.clientX-touch.x, dy = e.clientY-touch.y;
  const d = Math.hypot(dx,dy);
  if(d > STICK_R){ dx *= STICK_R/d; dy *= STICK_R/d; }
  knobEl.style.transform = `translate(${dx}px,${dy}px)`;
  touch.dx = d>7 ? dx/Math.max(d,STICK_R) : 0;
  touch.dy = d>7 ? dy/Math.max(d,STICK_R) : 0;
  const len = Math.hypot(touch.dx,touch.dy);
  if(len > 1){ touch.dx /= len; touch.dy /= len; }
});
function releaseTouch(e){
  if(e && touch.id !== undefined && e.pointerId !== undefined && e.pointerId !== touch.id) return;
  touch.active = false; touch.dx = touch.dy = 0; touch.id = undefined;
  stickEl.classList.remove('on');
  knobEl.style.transform = 'translate(0,0)';
}
canvas.addEventListener('pointerup', releaseTouch);
canvas.addEventListener('pointercancel', releaseTouch);
canvas.addEventListener('contextmenu', e=>{ if(e.pointerType !== 'mouse') e.preventDefault(); });
document.addEventListener('gesturestart', e=>e.preventDefault());

/* -------- fullscreen / immersive mode -------- */
const fsBtn = $('fsBtn'), exitFsBtn = $('exitFs');
function immersive(){ return document.body.classList.contains('immersive'); }
function tryFullscreen(on){
  try{
    const el = document.documentElement;
    if(on && el.requestFullscreen && !document.fullscreenElement){
      const p = el.requestFullscreen(); if(p && p.catch) p.catch(()=>{});
    }
    if(!on && document.fullscreenElement && document.exitFullscreen){
      const p = document.exitFullscreen(); if(p && p.catch) p.catch(()=>{});
    }
  }catch(_){}
  // Orientation lock is unsupported on iOS Safari — never let it break play.
  try{
    if(!screen || !screen.orientation) return;
    if(on && screen.orientation.lock){
      const p = screen.orientation.lock('landscape'); if(p && p.catch) p.catch(()=>{});
    }
    if(!on && screen.orientation.unlock) screen.orientation.unlock();
  }catch(_){}
}
function enterImmersive(){
  document.body.classList.add('immersive');
  tryFullscreen(true);
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);      // after the layout settles
  setTimeout(resizeCanvas, 240);
}
function exitImmersive(){
  document.body.classList.remove('immersive');
  tryFullscreen(false);
  if(game.state === 'paused') togglePause();
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);
}
if(fsBtn) fsBtn.onclick = ()=>{ immersive() ? exitImmersive() : enterImmersive(); };
if(exitFsBtn) exitFsBtn.onclick = exitImmersive;
const fsPauseBtn = $('fsPause');
if(fsPauseBtn) fsPauseBtn.onclick = togglePause;
function syncFsPause(){
  if(fsPauseBtn) fsPauseBtn.textContent = game.state === 'paused' ? '▶ 再開' : 'Ⅱ 停止';
}
document.addEventListener('fullscreenchange', ()=>{
  if(!document.fullscreenElement && immersive()) document.body.classList.remove('immersive'), resizeCanvas();
});

/* -------- layout: keep the whole field visible at any screen shape -------- */
function resizeCanvas(){
  const wrap = $('canvasWrap');
  if(!wrap) return;
  wrap.classList.toggle('tall', H > W);
  if(immersive()){
    // Fill the screen, letterboxing the field so nothing is cropped or stretched.
    wrap.style.aspectRatio = '';
    const bw = wrap.clientWidth || window.innerWidth;
    const bh = wrap.clientHeight || window.innerHeight;
    if(!bw || !bh) return;
    const k = Math.min(bw/W, bh/H);
    canvas.style.width = Math.round(W*k)+'px';
    canvas.style.height = Math.round(H*k)+'px';
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%,-50%)';
  } else {
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.position = '';
    canvas.style.left = '';
    canvas.style.top = '';
    canvas.style.transform = '';
    if(canvas.dataset.mobile){
      wrap.style.aspectRatio = (W/H).toFixed(4);
      // Keep the whole field on screen without scrolling: cap by the room we
      // have under the header, but never let the board get too small to read.
      const room = Math.max(300, (window.innerHeight || 700) - (immersive() ? 0 : 190));
      const maxW = Math.max(300, Math.round(room * W / H));
      wrap.style.maxWidth = maxW + 'px';
      wrap.style.margin = '0 auto';
    } else {
      wrap.style.maxWidth = '';
      wrap.style.margin = '';
    }
  }
  // HUD lives in CSS pixels but the field may be shrunk on a phone:
  // expose the ratio so the overlay can compensate and stay readable.
  const shown = canvas.getBoundingClientRect().width || W;
  const k = Math.max(.45, Math.min(1.6, shown / W));
  document.documentElement.style.setProperty('--field-scale', k.toFixed(3));
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', ()=>setTimeout(()=>{ resizeCanvas(); releaseTouch(); },180));
resizeCanvas();

/* pause automatically when the page is hidden (phone lock / app switch) */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden && game.state === 'playing'){
    releaseTouch();
    togglePause();
  }
});

buildWorld();          // generate the map before any run starts
newGame();
for(let i=0;i<12;i++) spawnEnemy();
game.enemies.forEach(e=>{
  e.x = rand(70,WORLD_W-70); e.y = rand(70,WORLD_H-70);
  if(Math.hypot(e.x-game.player.x, e.y-game.player.y) < 260) e.y = clamp(e.y+300, 60, WORLD_H-60);
});
requestAnimationFrame(frame);
// Optional test hook (only active when a harness sets window.__CLONE_DEBUG__).
if(typeof window !== 'undefined' && window.__CLONE_DEBUG__){
  window.__cloneGame = {
    get g(){ return game; }, stat, applyCard, availableCards, spawnEnemy, start, render, tick,
    weaponLevel, WEAPONS, WEAPON_SPEC, hurt, step:(n,dt=.0167)=>{ for(let i=0;i<n;i++) tick(dt); },
    WORLD, cam, worldEnt, worldDepth, depthLabel, buildWorld, resolveSolid, makeEnemyAt,
    collectDrop, spawnBuildingLoot, spawnBuildingGuards, beginCooldown, beginRound, W, H
  };
}
})();
