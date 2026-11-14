const fs=require('fs'), path=require('path');
const { Resvg } = require('@resvg/resvg-js');
const { buildDom } = require('./harness-dom.js');
const html = fs.readFileSync(path.join(__dirname,'..','clone-survivors.html'),'utf8');
const src = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
const dom = buildDom({coarse:true,w:390,h:844,fw:560,fh:1100});
dom.win.__CLONE_DEBUG__ = true;
new Function('window','document','requestAnimationFrame','setTimeout','clearTimeout','localStorage','screen','navigator',
 'globalThis.__NO_RAF=true;\n'+src.replace('requestAnimationFrame(frame);','if(!globalThis.__NO_RAF) requestAnimationFrame(frame);'))
 (dom.win,dom.doc,()=>0,setTimeout,clearTimeout,dom.win.localStorage,dom.win.screen,{userAgent:'node'});
const api=dom.win.__cloneGame; api.start();
const g=api.g;
for(const id of ['shotgun','zombie','orbit','drone']) { api.applyCard(g.player,id); api.applyCard(g.player,id); }
for(let i=0;i<900;i++){
  g.player.hp=g.player.maxHp;
  if(g.state==='reward'){g.state='playing';g.pendingLevels=0;g.pick=0;}
  api.tick(1/60);
}
g.player.hit=0; g.player.invuln=0;
api.render(9.9);
const svg=dom.ctx.toSVG();
fs.mkdirSync('out',{recursive:true});
fs.writeFileSync('out/bundle.png', new Resvg(svg,{fitTo:{mode:'width',value:700}}).render().asPng());
console.log('rendered out/bundle.png | stage',g.stage,'enemies',g.enemies.length);
