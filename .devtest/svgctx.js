// Minimal Canvas2D -> SVG shim, enough to render game.js headlessly.
'use strict';

function attr(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function mul(a, b){
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]
  ];
}
function apply(m, x, y){ return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]; }

class SvgCtx {
  constructor(w, h){
    this.W = w; this.H = h;
    this.parts = [];
    this.m = [1,0,0,1,0,0];
    this.stack = [];
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this._path = [];
    this._allGrads = [];
    this.canvas = {width:w, height:h};
  }
  save(){ this.stack.push({m:this.m.slice(), globalAlpha:this.globalAlpha, fillStyle:this.fillStyle,
    strokeStyle:this.strokeStyle, lineWidth:this.lineWidth, font:this.font, textAlign:this.textAlign,
    textBaseline:this.textBaseline, gco:this.globalCompositeOperation, lc:this.lineCap, lj:this.lineJoin}); }
  restore(){ const s = this.stack.pop(); if(!s) return;
    this.m = s.m; this.globalAlpha = s.globalAlpha; this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle; this.lineWidth = s.lineWidth; this.font = s.font;
    this.textAlign = s.textAlign; this.textBaseline = s.textBaseline;
    this.globalCompositeOperation = s.gco; this.lineCap = s.lc; this.lineJoin = s.lj; }
  translate(x, y){ this.m = mul(this.m, [1,0,0,1,x,y]); }
  scale(x, y){ this.m = mul(this.m, [x,0,0,y,0,0]); }
  rotate(a){ const c = Math.cos(a), s = Math.sin(a); this.m = mul(this.m, [c,s,-s,c,0,0]); }
  setTransform(a,b,c,d,e,f){ this.m = [a,b,c,d,e,f]; }
  resetTransform(){ this.m = [1,0,0,1,0,0]; }
  transform(a,b,c,d,e,f){ this.m = mul(this.m, [a,b,c,d,e,f]); }

  _col(c, fallback){
    if(typeof c === 'string') return attr(c);
    if(c && c.__grad) return `url(#${c.__grad.id})`;
    return fallback;
  }
  createLinearGradient(x0,y0,x1,y1){
    const id = 'lg'+(SvgCtx._gid++);
    const [ax,ay] = apply(this.m, x0,y0), [bx,by] = apply(this.m, x1,y1);
    const grad = {id, kind:'linear', a:[ax,ay], b:[bx,by], stops:[]};
    this._allGrads.push(grad);
    return {__grad: grad, addColorStop(o,c){ grad.stops.push([o,c]); }};
  }
  createRadialGradient(x0,y0,r0,x1,y1,r1){
    const id = 'rg'+(SvgCtx._gid++);
    const [ax,ay] = apply(this.m, x0,y0), [bx,by] = apply(this.m, x1,y1);
    const sc = Math.hypot(this.m[0], this.m[1]) || 1;
    const grad = {id, kind:'radial', a:[ax,ay], r0:r0*sc, b:[bx,by], r1:r1*sc, stops:[]};
    this._allGrads.push(grad);
    return {__grad: grad, addColorStop(o,c){ grad.stops.push([o,c]); }};
  }
  createPattern(){ return null; }

  beginPath(){ this._path = []; }
  closePath(){ this._path.push('Z'); }
  moveTo(x,y){ const [a,b]=apply(this.m,x,y); this._path.push(`M${a} ${b}`); }
  lineTo(x,y){ const [a,b]=apply(this.m,x,y); this._path.push(`L${a} ${b}`); }
  quadraticCurveTo(cx,cy,x,y){ const [a,b]=apply(this.m,cx,cy), [c,d]=apply(this.m,x,y); this._path.push(`Q${a} ${b} ${c} ${d}`); }
  bezierCurveTo(c1x,c1y,c2x,c2y,x,y){ const p=[apply(this.m,c1x,c1y),apply(this.m,c2x,c2y),apply(this.m,x,y)];
    this._path.push(`C${p[0][0]} ${p[0][1]} ${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]}`); }
  arc(x,y,r,a0,a1,ccw){
    const sc = Math.hypot(this.m[0], this.m[1]) || 1;
    const [cx,cy] = apply(this.m,x,y);
    const RR = r*sc;
    const large = Math.abs(a1-a0) > Math.PI ? 1 : 0;
    const sx = cx + Math.cos(a0)*RR, sy = cy + Math.sin(a0)*RR;
    const ex = cx + Math.cos(a1)*RR, ey = cy + Math.sin(a1)*RR;
    this._path.push(`M${sx} ${sy}A${RR} ${RR} 0 ${large} ${ccw?0:1} ${ex} ${ey}`);
  }
  arcTo(x1,y1,x2,y2,r){
    const [a,b] = apply(this.m, x1,y1);
    this._path.push(`L${a} ${b}`);
  }
  ellipse(x,y,rx,ry,rot,a0,a1,ccw){
    const sc = Math.hypot(this.m[0], this.m[1]) || 1;
    const [cx,cy] = apply(this.m,x,y);
    const RX = rx*sc, RY = ry*sc;
    const large = Math.abs(a1-a0) > Math.PI ? 1 : 0;
    this._path.push(`M${cx-RX} ${cy}A${RX} ${RY} 0 ${large} ${ccw?0:1} ${cx+RX} ${cy}`);
  }
  rect(x,y,w,h){ const p=[apply(this.m,x,y),apply(this.m,x+w,y),apply(this.m,x+w,y+h),apply(this.m,x,y+h)];
    this._path.push(`M${p[0][0]} ${p[0][1]}L${p[1][0]} ${p[1][1]}L${p[2][0]} ${p[2][1]}L${p[3][0]} ${p[3][1]}Z`); }
  fillRect(x,y,w,h){
    const p=[apply(this.m,x,y),apply(this.m,x+w,y),apply(this.m,x+w,y+h),apply(this.m,x,y+h)];
    const d = `M${p[0][0]} ${p[0][1]}L${p[1][0]} ${p[1][1]}L${p[2][0]} ${p[2][1]}L${p[3][0]} ${p[3][1]}Z`;
    this.parts.push(`<path d="${d}" fill="${this._col(this.fillStyle,'#000')}" opacity="${this.globalAlpha}"/>`);
  }
  strokeRect(x,y,w,h){ this.beginPath(); this.rect(x,y,w,h); this.stroke(); }
  clearRect(){}
  fill(){
    if(!this._path.length) return;
    this.parts.push(`<path d="${this._path.join('')}" fill="${this._col(this.fillStyle,'#000')}" opacity="${this.globalAlpha}"/>`);
  }
  stroke(){
    if(!this._path.length) return;
    const sc = Math.hypot(this.m[0], this.m[1]) || 1;
    this.parts.push(`<path d="${this._path.join('')}" fill="none" stroke="${this._col(this.strokeStyle,'#000')}" stroke-width="${this.lineWidth*sc}" opacity="${this.globalAlpha}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"/>`);
  }
  clip(){}
  fillText(t,x,y){
    if(t === undefined || t === null) return;
    const [a,b] = apply(this.m,x,y);
    const m = this.m;
    const size = parseFloat((this.font.match(/([\d.]+)px/)||[0,12])[1]) * (Math.hypot(m[0],m[1])||1);
    const weight = (this.font.match(/(\d00|bold)/)||['400'])[0];
    const fam = (this.font.split('px')[1]||'sans-serif').trim() || 'sans-serif';
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    this.parts.push(`<text x="${a}" y="${b}" fill="${this._col(this.fillStyle,'#fff')}" opacity="${this.globalAlpha}" font-size="${size}" font-weight="${weight}" font-family="${attr(fam)}" text-anchor="${anchor}">${esc(t)}</text>`);
  }
  strokeText(t,x,y){ this.fillText(t,x,y); }
  measureText(t){ return {width: String(t).length * 6}; }
  drawImage(img, ...a){
    if(!img) return;
    let x=0,y=0,w=this.W,h=this.H;
    if(a.length === 2){ [x,y] = a; }
    else if(a.length === 4){ [x,y,w,h] = a; }
    else if(a.length === 8){ x=a[0]; y=a[1]; w=a[2]; h=a[3]; }
    const [ax,ay] = apply(this.m,x,y);
    const sc = Math.hypot(this.m[0], this.m[1]) || 1;
    const parts = (img.__ctx && img.__ctx.parts) || [];
    this.parts.push(`<g transform="translate(${ax} ${ay}) scale(${sc})" opacity="${this.globalAlpha}">${parts.join('')}</g>`);
  }
  createImageData(w,h){ return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}; }
  getImageData(x,y,w,h){ return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)}; }
  putImageData(){}
  setLineDash(){}
  getLineDash(){ return []; }
  toSVG(){
    const defs = this._allGrads.map(g=>{
      const stops = g.stops.map(([o,c])=>`<stop offset="${(o*100).toFixed(1)}%" stop-color="${attr(c).trim()}"/>`).join('');
      if(g.kind === 'linear'){
        return `<linearGradient id="${g.id}" gradientUnits="userSpaceOnUse" x1="${g.a[0]}" y1="${g.a[1]}" x2="${g.b[0]}" y2="${g.b[1]}">${stops}</linearGradient>`;
      }
      return `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${g.b[0]}" cy="${g.b[1]}" r="${g.r1||1}" fx="${g.a[0]}" fy="${g.a[1]}">${stops}</radialGradient>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}"><defs>${defs}</defs><rect width="${this.W}" height="${this.H}" fill="#101a15"/>${this.parts.join('')}</svg>`;
  }
}
SvgCtx._gid = 1;

module.exports = { SvgCtx };
