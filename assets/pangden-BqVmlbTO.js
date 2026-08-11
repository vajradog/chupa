import{e as J,R as L,F as W,b as Q,a as ee,c as te}from"./fabric-DBm3_4uc.js";import{c as ne,s as re,r as oe,a as ae,e as ie,m as se}from"./solver-Dw5mHJET.js";const S=L.cols,m=L.rows,w=L.spacing,C=J({cols:S,rows:m,spacing:w}),o=ne({cloth:C,fabric:W.silk,breeze:.45}),f=o.particles,u=f.count,ce=(t,n)=>n*S+t,fe={R:[179,40,45],O:[217,108,43],Y:[224,165,38],G:[62,122,69],T:[46,127,135],B:[44,78,138],M:[166,58,110],W:[232,226,212],K:[38,36,40]},F="R3 K1 Y2 G3 K1 W1 B3 M2 K1 O2 T3 K1 R2 Y1 G2 B2 K1 M3 W1 O3".split(" ").map(t=>({c:t[0],w:+t.slice(1)})),c=document.getElementById("c"),e=c.getContext("webgl",{antialias:!0});if(!e)throw new Error("WebGL unavailable");let v=0,p=0,x=1,E=0,T=0,g=0;const R=60,le=`
attribute vec3 aPos;
attribute vec3 aNor;
attribute float aV;
uniform float uF, uCamZ, uCX, uCY, uW, uH;
varying vec3 vN;
varying float vV;
void main() {
  float zc = uCamZ + aPos.z;
  float xs = uCX + aPos.x * uF / zc;
  float ys = uCY - aPos.y * uF / zc;
  float xn = xs / uW * 2.0 - 1.0;
  float yn = 1.0 - ys / uH * 2.0;
  float zn = (zc - 20.0) / 100.0;
  gl_Position = vec4(xn, yn, zn, 1.0);
  vN = aNor;
  vV = aV;
}`,ue=`
precision mediump float;
uniform sampler2D uStripe;
uniform float uSheen, uSat;
varying vec3 vN;
varying float vV;
void main() {
  vec3 L = normalize(vec3(-0.35, 0.42, 0.84));
  vec3 n = normalize(vN);
  if (n.z < 0.0) n = -n;
  float diff = max(0.12, dot(n, L));
  float spec = pow(diff, 24.0) * uSheen;
  vec3 col = texture2D(uStripe, vec2(0.5, vV)).rgb;
  float grey = (col.r + col.g + col.b) / 3.0;
  col = mix(vec3(grey), col, uSat);
  vec3 outc = col * (0.30 + diff * 0.80) + vec3(spec);
  gl_FragColor = vec4(outc, 1.0);
}`;function z(t,n){const r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw new Error(`shader: ${e.getShaderInfoLog(r)}`);return r}const d=e.createProgram();e.attachShader(d,z(e.VERTEX_SHADER,le));e.attachShader(d,z(e.FRAGMENT_SHADER,ue));e.linkProgram(d);e.useProgram(d);const l={};for(const t of["uF","uCamZ","uCX","uCY","uW","uH","uStripe","uSheen","uSat"])l[t]=e.getUniformLocation(d,t);const A={pos:e.getAttribLocation(d,"aPos"),nor:e.getAttribLocation(d,"aNor"),v:e.getAttribLocation(d,"aV")};(function(){const n=new Uint8Array(m*4);let r=0,i=F[0].w;for(let s=0;s<m;s++){const b=fe[F[r].c];n[s*4]=b[0],n[s*4+1]=b[1],n[s*4+2]=b[2],n[s*4+3]=255,--i===0&&(r=(r+1)%F.length,i=F[r].w)}const a=e.createTexture();e.bindTexture(e.TEXTURE_2D,a),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,m,0,e.RGBA,e.UNSIGNED_BYTE,n),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.activeTexture(e.TEXTURE0),e.uniform1i(l.uStripe,0)})();const G=new Float32Array(u);for(let t=0;t<m;t++)for(let n=0;n<S;n++)G[ce(n,t)]=(t+.5)/m;const O=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,O);e.bufferData(e.ARRAY_BUFFER,G,e.STATIC_DRAW);const H=Q(C),$=e.createBuffer();e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,$);e.bufferData(e.ELEMENT_ARRAY_BUFFER,H,e.STATIC_DRAW);const B=new Float32Array(u*3),I=new Float32Array(u*3),de=e.createBuffer(),me=e.createBuffer();function V(){const t=document.getElementById("stage");x=Math.min(window.devicePixelRatio||1,2),v=t.clientWidth,p=t.clientHeight,c.width=v*x,c.height=p*x,e.viewport(0,0,c.width,c.height);const n=m*w;E=p*.82*R/n,T=v/2,g=p*.1,e.uniform1f(l.uF,E),e.uniform1f(l.uCamZ,R),e.uniform1f(l.uCX,T),e.uniform1f(l.uCY,g),e.uniform1f(l.uW,v),e.uniform1f(l.uH,p);const r=((S-1)/2*w+1.2)*E/R,i=document.getElementById("rod");i.style.left=`${T-r}px`,i.style.width=`${r*2}px`,i.style.top=`${g-6}px`}window.addEventListener("resize",V);V();e.enable(e.DEPTH_TEST);e.clearColor(.086,.082,.102,1);function Ee(){for(let t=0;t<u;t++)B[t*3]=f.px[t],B[t*3+1]=f.py[t],B[t*3+2]=f.pz[t];te(C,I),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.uniform1f(l.uSheen,o.fabric.sheen),e.uniform1f(l.uSat,o.fabric.sat),e.bindBuffer(e.ARRAY_BUFFER,de),e.bufferData(e.ARRAY_BUFFER,B,e.DYNAMIC_DRAW),e.enableVertexAttribArray(A.pos),e.vertexAttribPointer(A.pos,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,me),e.bufferData(e.ARRAY_BUFFER,I,e.DYNAMIC_DRAW),e.enableVertexAttribArray(A.nor),e.vertexAttribPointer(A.nor,3,e.FLOAT,!1,0,0),e.bindBuffer(e.ARRAY_BUFFER,O),e.enableVertexAttribArray(A.v),e.vertexAttribPointer(A.v,1,e.FLOAT,!1,0,0),e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,$),e.drawElements(e.TRIANGLES,H.length,e.UNSIGNED_SHORT,0)}const D=new Float32Array(u),U=new Float32Array(u);function be(t,n){for(let a=0;a<u;a++){const s=R+f.pz[a];D[a]=T+f.px[a]*E/s,U[a]=g-f.py[a]*E/s}let r=-1,i=30*30;for(let a=0;a<u;a++){const s=D[a]-t,b=U[a]-n,P=s*s+b*b;P<i&&(i=P,r=a)}return r}function k(t,n,r){return[(t-T)*r/E,-(n-g)*r/E]}let N=!1;c.addEventListener("pointerdown",t=>{c.setPointerCapture(t.pointerId);const n=be(t.offsetX,t.offsetY);if(n>=0&&!f.pinned[n]){o.grabbed=n;const[r,i]=k(t.offsetX,t.offsetY,R+f.pz[n]);o.grabX=r,o.grabY=i,c.classList.add("grabbing"),N||(document.getElementById("hint").style.opacity="0",N=!0)}});c.addEventListener("pointermove",t=>{if(o.grabbed<0)return;const[n,r]=k(t.offsetX,t.offsetY,R+f.pz[o.grabbed]);o.grabX=n,o.grabY=r});function K(){o.grabbed=-1,c.classList.remove("grabbing")}c.addEventListener("pointerup",K);c.addEventListener("pointercancel",K);const Y=document.getElementById("fabrics");for(const t of ee){const n=W[t],r=document.createElement("button");r.className=`chip${n===o.fabric?" on":""}`,r.innerHTML=`${n.label}<small>${n.note}</small>`,r.onclick=()=>{re(o,n);for(const i of Array.from(Y.children))i.classList.remove("on");r.classList.add("on"),Z()},Y.appendChild(r)}function Z(){const t=o.fabric;document.getElementById("params").innerHTML=`bend <b>${t.bend.toFixed(2)}</b>&nbsp;&nbsp;density <b>${t.density.toFixed(2)}</b><br>damping <b>${t.damping.toFixed(3)}</b>&nbsp;&nbsp;sheen <b>${t.sheen.toFixed(2)}</b>`}Z();const y=document.getElementById("wind"),Ae=document.getElementById("windOut");window.matchMedia("(prefers-reduced-motion: reduce)").matches&&(y.value="0");function q(){o.breeze=Number(y.value)/100,Ae.textContent=y.value}y.addEventListener("input",q);q();const X=document.getElementById("strainBtn");X.onclick=()=>{o.strainLimit=o.strainLimit===null?.01:null,o.strainLimitPasses=32,X.classList.toggle("on",o.strainLimit!==null)};document.getElementById("resetBtn").onclick=()=>oe(o);const Re=document.getElementById("readout");let _=0,M=performance.now(),h=0;function j(){const t=performance.now();if(ae(o),h+=performance.now()-t,Ee(),++_>=30){const n=performance.now(),r=_*1e3/(n-M);Re.innerHTML=`<b>${r.toFixed(0)}</b> fps · sim <b>${(h/_).toFixed(2)}</b> ms/frame<br>${u} particles · energy <b>${ie(o).toFixed(3)}</b><br>max stretch <b>${(se(f,o.constraints.structural)*100).toFixed(1)}%</b>`+(o.strainLimit!==null?` · limited (${o.lastStrainPasses}p)`:""),_=0,h=0,M=n}requestAnimationFrame(j)}requestAnimationFrame(j);
