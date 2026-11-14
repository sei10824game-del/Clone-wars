'use strict';
const { SvgCtx } = require('./svgctx.js');
const IDS = ['game','hud','stageNumber','stageFill','timer','cloneCount','killCount','healthFill','healthText',
  'level','xpFill','xpText','startOverlay','rewardOverlay','endOverlay','pauseOverlay','startBtn','restartBtn',
  'pauseBtn','resumeBtn','topStatus','bossBar','bossName','bossSub','bossPercent','bossFill','arsenal',
  'cardChoices','pickCount','announcement','endStage','endKills','endTime','canvasWrap','touchDash','touchStick',
  'stickKnob','fsBtn','exitFs','fsPause','buildTag','fieldStage'];
function makeEl(id){
  const el={id,_h:{},classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x))},remove(...c){c.forEach(x=>this._s.delete(x))},contains(c){return this._s.has(c)},toggle(c,on){if(on===undefined)on=!this._s.has(c);on?this._s.add(c):this._s.delete(c);return on}},
    style:{setProperty(){},removeProperty(){}},dataset:{},children:[],textContent:'',innerHTML:'',
    addEventListener(t,f){(this._h[t]=this._h[t]||[]).push(f)},removeEventListener(){},
    dispatch(t,ev){ev=Object.assign({type:t,preventDefault(){},stopPropagation(){},pointerId:1,pointerType:'touch',clientX:0,clientY:0},ev||{});(this._h[t]||[]).forEach(f=>f(ev))},
    getBoundingClientRect(){return{left:0,top:0,width:560,height:1100,right:560,bottom:1100}},
    appendChild(c){this.children.push(c)},replaceChildren(...c){this.children.length=0;this.children.push(...c)},
    setPointerCapture(){},releasePointerCapture(){},getContext(){return this._ctx||(this._ctx=new SvgCtx(560,1100))},focus(){},blur(){}};
  return el;
}
function buildDom(opts){
  opts=opts||{};
  const els={}; IDS.forEach(id=>els[id]=makeEl(id));
  const FW=opts.fw||1100, FH=opts.fh||650;
  const sc=new SvgCtx(FW,FH);
  els.game.width=FW; els.game.height=FH; els.game.getContext=()=>sc; els.game._ctx=sc; els.game.__ctx=sc;
  const doc={getElementById(id){return els[id]||(els[id]=makeEl(id))},
    createElement(tag){ if(tag==='canvas'){const c=makeEl('cv');c.width=300;c.height=150;const cc=new SvgCtx(300,150);c._ctx=cc;c.__ctx=cc;c.getContext=()=>cc;return c;} const e=makeEl(tag);e.tagName=tag.toUpperCase();return e;},
    addEventListener(){}, body:{classList:makeEl('body').classList,appendChild(){}},
    documentElement:{requestFullscreen(){return Promise.resolve()},classList:makeEl('html').classList,style:{setProperty(){},removeProperty(){}}},
    fullscreenElement:null,hidden:false,querySelector(){return null}};
  const win={matchMedia(q){return{matches:opts.coarse?q.includes('coarse'):false,addEventListener(){},addListener(){}}},
    addEventListener(){},devicePixelRatio:2,innerWidth:opts.w||390,innerHeight:opts.h||844,
    requestAnimationFrame(){return 0},setTimeout,clearTimeout,console,
    screen:{orientation:{lock(){return Promise.resolve()},unlock(){}}},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}}};
  win.window=win;
  return {els,doc,win,ctx:sc};
}
module.exports={buildDom};
