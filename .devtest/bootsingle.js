// Extract the inlined <script> from the bundle and run it against the same DOM stub.
const fs = require('fs');
const path = require('path');
const { buildDom } = require('./harness-dom.js');

const html = fs.readFileSync(path.join(__dirname,'..','clone-survivors.html'),'utf8');
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if(!m){ console.log('FAIL: could not extract inline script'); process.exit(1); }
const src = m[1];
console.log('extracted script:', (src.length/1024).toFixed(0), 'KB');

const dom = buildDom({coarse:true, w:390, h:844, fw:560, fh:1100});
dom.win.__CLONE_DEBUG__ = true;
const patched = src.replace('requestAnimationFrame(frame);','if(!globalThis.__NO_RAF) requestAnimationFrame(frame);');
const fn = new Function('window','document','requestAnimationFrame','setTimeout','clearTimeout','localStorage','screen','navigator',
  'globalThis.__NO_RAF = true;\n' + patched);
fn(dom.win, dom.doc, ()=>0, setTimeout, clearTimeout, dom.win.localStorage, dom.win.screen, {userAgent:'node'});

const api = dom.win.__cloneGame;
console.log('game booted from bundle:', !!api);
api.start();
const g = api.g;
// run with touch input + card picks
let errs = 0;
try{
  for(let i=0;i<12000;i++){
    g.player.hp = g.player.maxHp;
    if(i%29===0){
      const a=Math.random()*Math.PI*2;
      dom.els.game.dispatch('pointerdown',{clientX:200,clientY:600,pointerId:5,pointerType:'touch'});
      dom.els.game.dispatch('pointermove',{clientX:200+Math.cos(a)*60,clientY:600+Math.sin(a)*60,pointerId:5,pointerType:'touch'});
    }
    if(i%29===14) dom.els.game.dispatch('pointerup',{pointerId:5,pointerType:'touch'});
    let guard=0;
    while(g.state==='reward'){
      const cards=dom.els.cardChoices.children;
      if(!cards.length){ g.state='playing'; break; }
      cards[0].dispatch('click',{});
      if(++guard>20){ g.state='playing'; g.pendingLevels=0; g.pick=0; break; }
    }
    api.tick(1/60);
    if(i%1200===0) api.render(i/60);
  }
}catch(e){ errs++; console.log('ERROR:', e.message); }
console.log('bundle soak: stage', g.stage, '| kills', g.kills, '| errors', errs, '| field', dom.els.game.width+'x'+dom.els.game.height);
