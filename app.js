import * as THREE from 'three';

/* ---------- renderer / scene ---------- */
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f2ed);

const camera = new THREE.PerspectiveCamera(33, innerWidth/innerHeight, 0.1, 100);

/* ---------- lights ---------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0xdcc9bd, 0.85));
const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
key.position.set(2.5, 3.5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left=-4; key.shadow.camera.right=4;
key.shadow.camera.top=4; key.shadow.camera.bottom=-4;
key.shadow.camera.far=20; key.shadow.radius=6;
scene.add(key);
const rim = new THREE.DirectionalLight(0xd8e4f5, 0.55);
rim.position.set(-3, 2, -3.5);
scene.add(rim);

/* ---------- ground shadow ---------- */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.ShadowMaterial({ opacity: 0.16 })
);
ground.rotation.x = -Math.PI/2;
ground.position.y = -3.62;
ground.receiveShadow = true;
scene.add(ground);

/* ---------- helpers ---------- */
const V3 = (x,y,z)=>new THREE.Vector3(x,y,z);
function lathe(prof, seg=110, phiStart=0, phiLength=Math.PI*2){
  return new THREE.LatheGeometry(prof.map(p=>new THREE.Vector2(p[0],p[1])), seg, phiStart, phiLength);
}
function weldLatheSeam(geo, profLen, seg){
  const n=geo.attributes.normal; const pts=profLen;
  for(let i=0;i<pts;i++){
    const a=i, b=seg*pts+i;
    const nx=(n.getX(a)+n.getX(b))/2, ny=(n.getY(a)+n.getY(b))/2, nz=(n.getZ(a)+n.getZ(b))/2;
    n.setXYZ(a,nx,ny,nz); n.setXYZ(b,nx,ny,nz);
  }
  n.needsUpdate=true;
}
// tapered tube along curve: build unit-radius TubeGeometry then rescale rings
function taperTube(curve, radiusAt, segs=28, radial=10, flat=1){
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position;
  const ring = radial+1;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for(let i=0;i<=segs;i++){
    const t=i/segs; curve.getPoint(t, c);
    const s=radiusAt(t);
    for(let j=0;j<ring;j++){
      const idx=i*ring+j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(s);
      v.z*=flat;
      v.add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  pos.needsUpdate=true;
  geo.computeVertexNormals();
  return geo;
}
function smoothstep(a,b,x){ const t=Math.min(1,Math.max(0,(x-a)/(b-a))); return t*t*(3-2*t); }

/* ---------- head ---------- */
const HEAD_PROF=[
  [0.001,-1.0],[0.20,-0.985],[0.45,-0.90],[0.68,-0.72],[0.83,-0.42],
  [0.90,-0.08],[0.915,0.22],[0.89,0.52],[0.78,0.78],[0.55,0.93],[0.25,0.995],[0.001,1.0]
];
function headRadiusAt(y){ // approx from profile
  const p=HEAD_PROF;
  for(let i=0;i<p.length-1;i++){
    if(y>=p[i][1] && y<=p[i+1][1]){
      const t=(y-p[i][1])/(p[i+1][1]-p[i][1]);
      return p[i][0]+(p[i+1][0]-p[i][0])*t;
    }
  }
  return y<p[0][1]?p[0][0]:p[p.length-1][0];
}
function frontZ(x,y){ const r=headRadiusAt(y); return Math.sqrt(Math.max(0.0001, r*r - x*x))*0.94; }

function buildHead(skinMat){
  const g = lathe(HEAD_PROF);
  const pos=g.attributes.position; const v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i);
    v.z*=0.94;
    pos.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals();
  weldLatheSeam(g, HEAD_PROF.length, 110);
  const m=new THREE.Mesh(g, skinMat);
  m.castShadow=true; m.receiveShadow=true;
  return m;
}

/* ---------- eye texture ---------- */
function makeEyeTexture(irisColor){
  const S=1024, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  const c=S/2;
  // sclera
  ctx.fillStyle='#ffffff';
  ctx.beginPath(); ctx.arc(c,c,c*0.98,0,Math.PI*2); ctx.fill();
  // upper lid shadow on sclera
  let sh=ctx.createLinearGradient(0,0,0,S*0.55);
  sh.addColorStop(0,'rgba(190,140,140,0.45)'); sh.addColorStop(0.35,'rgba(190,140,140,0.12)'); sh.addColorStop(1,'rgba(190,140,140,0)');
  ctx.fillStyle=sh; ctx.beginPath(); ctx.arc(c,c,c*0.98,0,Math.PI*2); ctx.fill();

  const col=new THREE.Color(irisColor);
  const rgb=(m)=>`rgb(${Math.round(col.r*255*m)},${Math.round(col.g*255*m)},${Math.round(col.b*255*m)})`;
  const ix=c, iy=c+S*0.05, ir=S*0.32;
  // iris base radial
  let g=ctx.createRadialGradient(ix,iy,ir*0.05, ix,iy,ir);
  g.addColorStop(0, `rgb(${Math.min(255,Math.round(col.r*255+110))},${Math.min(255,Math.round(col.g*255+110))},${Math.min(255,Math.round(col.b*255+110))})`);
  g.addColorStop(0.45, rgb(1.0));
  g.addColorStop(0.85, rgb(0.55));
  g.addColorStop(1, rgb(0.28));
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(ix,iy,ir,0,Math.PI*2); ctx.fill();
  // iris top shadow (from lash)
  let ts=ctx.createLinearGradient(0,iy-ir,0,iy+ir*0.2);
  ts.addColorStop(0,'rgba(20,20,30,0.55)'); ts.addColorStop(1,'rgba(20,20,30,0)');
  ctx.save(); ctx.beginPath(); ctx.arc(ix,iy,ir,0,Math.PI*2); ctx.clip();
  ctx.fillStyle=ts; ctx.fillRect(ix-ir,iy-ir,ir*2,ir*1.4);
  // bottom light bounce
  let bb=ctx.createRadialGradient(ix,iy+ir*0.75,0, ix,iy+ir*0.75,ir*0.8);
  bb.addColorStop(0,'rgba(255,255,255,0.35)'); bb.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=bb; ctx.beginPath(); ctx.arc(ix,iy+ir*0.6,ir*0.75,0,Math.PI*2); ctx.fill();
  // radial spokes
  ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.lineWidth=S*0.004;
  for(let a=0;a<40;a++){ const t=a/40*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(ix+Math.cos(t)*ir*0.28, iy+Math.sin(t)*ir*0.28);
    ctx.lineTo(ix+Math.cos(t)*ir*0.92, iy+Math.sin(t)*ir*0.92); ctx.stroke(); }
  ctx.restore();
  // pupil
  ctx.fillStyle='#171219';
  ctx.beginPath(); ctx.ellipse(ix,iy,ir*0.30,ir*0.38,0,0,Math.PI*2); ctx.fill();
  // highlights
  ctx.fillStyle='rgba(255,255,255,0.96)';
  ctx.beginPath(); ctx.arc(ix-ir*0.42, iy-ir*0.45, ir*0.26, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(ix+ir*0.42, iy+ir*0.42, ir*0.12, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(ix-ir*0.05, iy-ir*0.72, ir*0.07, 0, Math.PI*2); ctx.fill();
  // upper lash band (drawn; geometry lash adds pop)
  ctx.strokeStyle='#241a1c'; ctx.lineCap='round';
  ctx.lineWidth=S*0.085;
  ctx.beginPath(); ctx.arc(c,c,c*0.86, Math.PI*1.12, Math.PI*1.88); ctx.stroke();
  // outer flick
  ctx.lineWidth=S*0.06;
  ctx.beginPath();
  ctx.moveTo(c+Math.cos(Math.PI*1.88)*c*0.86, c+Math.sin(Math.PI*1.88)*c*0.86);
  ctx.quadraticCurveTo(c+c*0.78, c-c*0.55, c+c*0.92, c-c*0.72);
  ctx.stroke();
  // lower subtle lash ticks
  ctx.lineWidth=S*0.02; ctx.strokeStyle='rgba(36,26,28,0.85)';
  for(const [ang,len] of [[0.35,0.10],[0.55,0.08]]){
    const a=Math.PI*ang;
    ctx.beginPath();
    ctx.moveTo(c+Math.cos(a)*c*0.93, c+Math.sin(a)*c*0.93);
    ctx.lineTo(c+Math.cos(a)*c*(0.93+len), c+Math.sin(a)*c*(0.93+len));
    ctx.stroke();
  }
  // inner corner accent
  ctx.fillStyle='rgba(220,90,90,0.8)';
  ctx.beginPath(); ctx.arc(c-c*0.86, c+c*0.12, S*0.018, 0, Math.PI*2); ctx.fill();

  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=8;
  return tex;
}

function buildEye(irisColor, side){ // side: +1 right (viewer left?) -> x sign
  const group=new THREE.Group();
  const R=0.20, SY=1.24, BULGE=0.07;
  const geo=new THREE.CircleGeometry(1, 72);
  const pos=geo.attributes.position; const v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i);
    const r2=v.x*v.x+v.y*v.y;
    const z=r2<=1 ? BULGE*Math.sqrt(1-r2) : 0;
    pos.setXYZ(i, v.x*R, v.y*R*SY, z);
  }
  geo.computeVertexNormals();
  const mat=new THREE.MeshPhysicalMaterial({
    map: makeEyeTexture(irisColor), transparent:true, roughness:0.28,
    clearcoat:0.9, clearcoatRoughness:0.15, alphaTest:0.02
  });
  const disc=new THREE.Mesh(geo, mat);
  group.add(disc);
  // geometry lash along upper rim
  const pts=[];
  for(let a=140; a>=40; a-=8){
    const t=a*Math.PI/180;
    const x=Math.cos(t)*R, y=Math.sin(t)*R*SY;
    const z=BULGE*Math.sqrt(Math.max(0,1-(x/R)**2-(y/(R*SY))**2))+0.012;
    pts.push(V3(x,y,z));
  }
  // outer flick extension (a=40 end is outer if mirrored appropriately)
  const curve=new THREE.CatmullRomCurve3(pts);
  const lash=new THREE.Mesh(
    taperTube(curve, t=>0.034*(1-Math.abs(t-0.5)*1.1)+0.005, 24, 8),
    new THREE.MeshStandardMaterial({color:0x241a1c, roughness:0.5})
  );
  group.add(lash);
  return group;
}

/* ---------- blush ---------- */
function makeBlushTexture(){
  const S=256, cv=document.createElement('canvas'); cv.width=cv.height=S;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
  g.addColorStop(0,'rgba(255,130,140,0.5)');
  g.addColorStop(0.6,'rgba(255,130,140,0.18)');
  g.addColorStop(1,'rgba(255,130,140,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}

/* ---------- hair ---------- */
function buildHairBase(hairMat, opts){
  // shell from head profile, scaled up, front edge high / back edge low
  const prof=HEAD_PROF.filter(p=>p[1]>=-0.30).map(p=>[p[0]*1.10+0.02, p[1]*1.05+0.035]);
  prof.push([0.001, 1.0*1.05+0.035]);
  const g=lathe(prof, 110);
  const pos=g.attributes.position; const v=new THREE.Vector3();
  const backLen = opts.backLen ?? 0.95;
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i);
    const theta=Math.atan2(v.x, v.z);           // 0 at +z (front)
    const f=(1-Math.cos(theta))/2;              // 0 front, 1 back
    // front edge rides up to ~0.30, back edge drops by backLen
    const edge = (1-f)*0.80 - f*backLen;        // vertical shift multiplier on depth
    const depthF = smoothstep(0.45,-0.30,v.y);  // only affects lower shell
    v.y += edge*depthF;
    const puff=1+0.06*f;
    v.x*=puff; v.z*=puff;
    if(opts.flare){ // long hair flare outward at bottom
      const fl=smoothstep(0.0,-1.4,v.y)*opts.flare;
      v.x*=1+fl; v.z*=1+fl*0.6;
    }
    pos.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals();
  weldLatheSeam(g, prof.length, 110);
  const m=new THREE.Mesh(g, hairMat);
  m.castShadow=true;
  return m;
}
function lock(root, mid, tip, R, hairMat, segs=22, flat=0.6, ramp=false){
  const pts = Array.isArray(root) ? root : [root,mid,tip];
  const curve=new THREE.CatmullRomCurve3(pts);
  const rfn = ramp ? t=>Math.max(0.002, R*Math.pow(1-t,0.6)*Math.min(1,t*7))
                   : t=>Math.max(0.004, R*Math.pow(1-t,0.75));
  const m=new THREE.Mesh(
    taperTube(curve, rfn, segs, 9, flat),
    hairMat);
  m.castShadow=true;
  return m;
}
function scalpPoint(theta, y){
  const r=headRadiusAt(y)*1.06;
  return V3(Math.sin(theta)*r, y*1.05+0.04, Math.cos(theta)*r*0.94);
}
function buildBangs(hairMat, style){
  const grp=new THREE.Group();
  const defs=[
    [-1.32, 0.02, 0.11],[-1.10,-0.10, 0.115],[-0.88, 0.00, 0.12],
    [-0.66,-0.12, 0.12],[-0.44,-0.02, 0.125],[-0.22,-0.10, 0.12],
    [ 0.00,-0.01, 0.125],[ 0.22,-0.10, 0.12],[ 0.44,-0.02, 0.125],
    [ 0.66,-0.12, 0.12],[ 0.88, 0.00, 0.12],[ 1.10,-0.10, 0.115],
    [ 1.32, 0.02, 0.11],
  ];
  for(const [th,tipY,R] of defs){
    const root=scalpPoint(th*0.75, 0.86);
    const midA=scalpPoint(th*0.68, 0.48);
    midA.x*=1.085; midA.z*=1.085;   // proud of shell
    const tipX=Math.sin(th)*headRadiusAt(tipY)*0.86;
    const tip=V3(tipX, tipY, frontZ(tipX, tipY)+0.025);
    const midB=midA.clone().lerp(tip,0.45);
    midB.z+=0.05;
    grp.add(lock([root,midA,midB,tip],null,null,R,hairMat,26,0.62,true));
  }
  return grp;
}
function buildSideLocks(hairMat){
  const grp=new THREE.Group();
  for(const s of [-1,1]){
    const root=scalpPoint(s*1.30, 0.28);
    const tip=V3(s*0.56, -0.48, 0.34);
    const mid=root.clone().lerp(tip,0.45); mid.x*=1.06; mid.z+=0.06;
    grp.add(lock(root,mid,tip,0.075,hairMat));
    const root2=scalpPoint(s*1.52, 0.20);
    const tip2=V3(s*0.66, -0.38, 0.14);
    const mid2=root2.clone().lerp(tip2,0.5); mid2.x*=1.06;
    grp.add(lock(root2,mid2,tip2,0.06,hairMat));
  }
  return grp;
}
function buildBuns(hairMat, bunColor){
  const grp=new THREE.Group();
  const mat = bunColor ? new THREE.MeshStandardMaterial({color:bunColor, roughness:0.55}) : hairMat;
  for(const s of [-1,1]){
    const bun=new THREE.Mesh(new THREE.SphereGeometry(0.33, 40, 32), mat);
    bun.position.set(s*0.60, 0.92, 0.02);
    bun.scale.set(1,0.92,1);
    bun.castShadow=true;
    grp.add(bun);
    const band=new THREE.Mesh(new THREE.TorusGeometry(0.17,0.05,12,32), hairMat);
    band.position.set(s*0.52,0.72,0.06);
    band.rotation.set(0.3, s*0.5, 0.2*s);
    grp.add(band);
  }
  return grp;
}
function buildTwintails(hairMat){
  const grp=new THREE.Group();
  for(const s of [-1,1]){
    const root=V3(s*0.72, 0.55, -0.15);
    const p1=V3(s*1.30, -0.15, -0.25);
    const p2=V3(s*1.05, -1.15, -0.05);
    const tip=V3(s*0.80, -2.0, 0.10);
    const curve=new THREE.CatmullRomCurve3([root,p1,p2,tip]);
    const m=new THREE.Mesh(taperTube(curve, t=>Math.max(0.01, 0.20*Math.pow(1-t,0.65)), 34, 12), hairMat);
    m.castShadow=true;
    grp.add(m);
    const tie=new THREE.Mesh(new THREE.TorusGeometry(0.14,0.045,10,28), new THREE.MeshStandardMaterial({color:0xd9c26a, roughness:0.4, metalness:0.3}));
    tie.position.copy(root); tie.rotation.y=s*0.9;
    grp.add(tie);
  }
  return grp;
}
function buildAhoge(hairMat){
  const root=V3(0,1.06,0.1);
  const curve=new THREE.CatmullRomCurve3([root, V3(0.06,1.22,0.12), V3(0.20,1.26,0.10), V3(0.26,1.18,0.06)]);
  return new THREE.Mesh(taperTube(curve, t=>Math.max(0.003,0.018*(1-t)), 16, 7), hairMat);
}

/* ---------- body ---------- */
function buildBody(pal, skinMat){
  const grp=new THREE.Group();
  const cloth=new THREE.MeshStandardMaterial({color:pal.main, roughness:0.75});
  const accent=new THREE.MeshStandardMaterial({color:pal.accent, roughness:0.6});
  const apronM=new THREE.MeshStandardMaterial({color:pal.apron, roughness:0.7, side:THREE.DoubleSide});

  // neck
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.17,0.2,24), skinMat);
  neck.position.y=-1.10; grp.add(neck);
  // torso (cloth)
  const torsoProf=[[0.001,-2.42],[0.30,-2.40],[0.42,-2.28],[0.44,-2.05],[0.40,-1.80],[0.43,-1.60],[0.42,-1.45],[0.30,-1.32],[0.14,-1.28],[0.001,-1.27]];
  const torso=new THREE.Mesh(lathe(torsoProf,64), cloth);
  torso.castShadow=true; grp.add(torso);
  // skirt with pleats
  const skirtProf=[[0.36,-2.02],[0.52,-2.20],[0.72,-2.45],[0.86,-2.66],[0.88,-2.72]];
  const sg=lathe(skirtProf,140);
  { const pos=sg.attributes.position; const v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i);
      const th=Math.atan2(v.x,v.z);
      const depth=smoothstep(-2.02,-2.72,v.y);
      const r=Math.hypot(v.x,v.z)*(1+0.015*Math.sin(th*12)*depth);
      const a=Math.atan2(v.x,v.z);
      pos.setXYZ(i, Math.sin(a)*r, v.y, Math.cos(a)*r);
    } sg.computeVertexNormals(); }
  const skirt=new THREE.Mesh(sg, new THREE.MeshStandardMaterial({color:pal.main, roughness:0.75, side:THREE.DoubleSide}));
  skirt.castShadow=true; grp.add(skirt);
  // apron front panel
  const ap=lathe([[0.38,-2.06],[0.55,-2.24],[0.74,-2.48],[0.84,-2.64]], 48, -0.85, 1.7);
  const apron=new THREE.Mesh(ap, apronM); grp.add(apron);
  // collar
  const collar=new THREE.Mesh(new THREE.TorusGeometry(0.20,0.055,12,36), apronM);
  collar.position.y=-1.31; collar.rotation.x=Math.PI/2; collar.scale.set(1,1,0.45); grp.add(collar);
  // chest bow
  const knot=new THREE.Mesh(new THREE.SphereGeometry(0.075,20,16), accent);
  knot.position.set(0,-1.60,0.46); grp.add(knot);
  for(const s of [-1,1]){
    const wing=new THREE.Mesh(new THREE.SphereGeometry(0.14,20,16), accent);
    wing.scale.set(1.3,0.62,0.5); wing.position.set(s*0.17,-1.60,0.44);
    wing.rotation.z=s*0.45; grp.add(wing);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.22,4), accent);
    tail.position.set(s*0.09,-1.78,0.42); tail.rotation.z=Math.PI+s*0.25;
    tail.scale.set(1,1,0.5); grp.add(tail);
  }
  // sleeves + arms
  for(const s of [-1,1]){
    const puff=new THREE.Mesh(new THREE.SphereGeometry(0.235,24,20), cloth);
    puff.position.set(s*0.50,-1.52,0); puff.scale.set(1,0.88,1); puff.castShadow=true; grp.add(puff);
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(0.095,0.62,8,16), skinMat);
    arm.position.set(s*0.56,-2.05,0.02); arm.rotation.z=s*0.18; arm.castShadow=true; grp.add(arm);
    const cuff=new THREE.Mesh(new THREE.TorusGeometry(0.105,0.04,10,24), apronM);
    cuff.position.set(s*0.635,-2.34,0.03); cuff.rotation.x=Math.PI/2; cuff.rotation.z=s*0.18; grp.add(cuff);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(0.12,20,16), skinMat);
    hand.position.set(s*0.655,-2.46,0.04); hand.scale.set(0.9,1.05,0.95); grp.add(hand);
  }
  // legs + socks + shoes
  for(const s of [-1,1]){
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(0.105,0.55,8,16), skinMat);
    leg.position.set(s*0.17,-3.02,0); leg.castShadow=true; grp.add(leg);
    const sock=new THREE.Mesh(new THREE.CylinderGeometry(0.115,0.12,0.22,20), apronM);
    sock.position.set(s*0.17,-3.32,0); grp.add(sock);
    const shoe=new THREE.Mesh(new THREE.CapsuleGeometry(0.13,0.16,8,16), accent);
    shoe.rotation.x=Math.PI/2;
    shoe.position.set(s*0.17,-3.52,0.06); shoe.scale.set(1,0.72,1); shoe.castShadow=true; grp.add(shoe);
  }
  return grp;
}

/* ---------- face extras ---------- */
function buildFaceExtras(skinTone){
  const grp=new THREE.Group();
  // brows
  const browMat=new THREE.MeshStandardMaterial({color:0x4a3a35, roughness:0.6});
  for(const s of [-1,1]){
    const pts=[V3(s*0.10,0.30,0), V3(s*0.28,0.335,0), V3(s*0.44,0.30,0)];
    for(const p of pts) p.z=frontZ(p.x,p.y)+0.015;
    const curve=new THREE.CatmullRomCurve3(pts);
    grp.add(new THREE.Mesh(taperTube(curve,t=>0.018*(1-Math.abs(t-0.45)*1.4)+0.003,16,7), browMat));
  }
  // lid crease
  const creaseMat=new THREE.MeshStandardMaterial({color:0xc79a8a, roughness:0.7});
  for(const s of [-1,1]){
    const pts=[V3(s*0.16,0.245,0), V3(s*0.30,0.27,0), V3(s*0.44,0.235,0)];
    for(const p of pts) p.z=frontZ(p.x,p.y)+0.012;
    grp.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts),()=>0.007,12,6), creaseMat));
  }
  // mouth: tiny smile
  const mouthMat=new THREE.MeshStandardMaterial({color:0xa86a60, roughness:0.6});
  {
    const y=-0.46, pts=[V3(-0.06,y+0.018,0),V3(0,y-0.018,0),V3(0.06,y+0.018,0)];
    for(const p of pts) p.z=frontZ(p.x,p.y)+0.012;
    grp.add(new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts),()=>0.009,12,6), mouthMat));
  }
  // blush
  const bt=makeBlushTexture();
  for(const s of [-1,1]){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(0.30,0.17),
      new THREE.MeshBasicMaterial({map:bt, transparent:true, depthWrite:false}));
    p.position.set(s*0.47,-0.26,frontZ(0.47,-0.26)+0.02);
    p.rotation.y=s*0.45;
    grp.add(p);
  }
  // ears
  for(const s of [-1,1]){
    const ear=new THREE.Mesh(new THREE.SphereGeometry(0.12,20,16), skinTone);
    ear.position.set(s*0.865,-0.10,-0.06);
    ear.scale.set(0.45,0.75,0.6);
    grp.add(ear);
  }
  return grp;
}

/* ---------- roster ---------- */
const ROSTER=[
  {name:'PAN',   hair:'buns', hairColor:0xf3f1ee, bunColor:0x2e2a2c, eye:'#3fae8c',
   pal:{main:0x2f3a34, accent:0x3f7d5c, apron:0xf5f2ec}},
  {name:'SAKURA',hair:'bob',  hairColor:0xf5c3d2, eye:'#e0608a',
   pal:{main:0xe88ba4, accent:0xc94f74, apron:0xfdf6f3}},
  {name:'RIN',   hair:'twin', hairColor:0x2b2b33, eye:'#c23b3b',
   pal:{main:0x23252e, accent:0x8c2f35, apron:0xece7e2}},
  {name:'SORA',  hair:'long', hairColor:0xaecbe8, eye:'#4a90d9',
   pal:{main:0x7fa8cf, accent:0x3e6c9e, apron:0xf4f7fa}},
  {name:'HONEY', hair:'buns', hairColor:0xf0d18c, eye:'#d99a3a',
   pal:{main:0xd9b96a, accent:0x9e7c34, apron:0xfaf3e4}},
];

function buildCharacter(def){
  const grp=new THREE.Group();
  const skinMat=new THREE.MeshStandardMaterial({color:0xffe9db, roughness:0.55});
  const hairMat=new THREE.MeshStandardMaterial({color:def.hairColor, roughness:0.5});
  grp.add(buildHead(skinMat));
  // eyes
  for(const s of [-1,1]){
    const eye=buildEye(def.eye, s);
    const ex=s*0.325, ey=-0.07;
    const ez=frontZ(ex,ey)-0.035;
    eye.position.set(ex,ey,ez);
    eye.rotation.y=Math.atan2(ex, ez)*0.9;
    if(s>0) eye.scale.x=-1; // mirror so outer flick faces outward
    grp.add(eye);
  }
  grp.add(buildFaceExtras(skinMat));
  // hair
  const backLen = def.hair==='long' ? 2.1 : def.hair==='bob' ? 1.15 : 0.95;
  const flare = def.hair==='long' ? 0.07 : 0;
  grp.add(buildHairBase(hairMat,{backLen, flare}));
  grp.add(buildBangs(hairMat, def.hair));
  grp.add(buildSideLocks(hairMat));
  if(def.hair==='buns') grp.add(buildBuns(hairMat, def.bunColor));
  if(def.hair==='twin') grp.add(buildTwintails(hairMat));
  grp.add(buildAhoge(hairMat));
  grp.add(buildBody(def.pal, skinMat));
  return grp;
}

/* ---------- stage ---------- */
const charIndex=Math.min(ROSTER.length-1, Math.max(0, parseInt(params.get('char')||'0')));
const def=ROSTER[charIndex];
const charGroup=new THREE.Group();
charGroup.add(buildCharacter(def));
scene.add(charGroup);

const view=params.get('view')||'threeq';
const shot=params.get('shot')||'full';
if(view==='threeq') charGroup.rotation.y=0.55;
if(view==='side') charGroup.rotation.y=Math.PI/2-0.15;
if(view==='back') charGroup.rotation.y=Math.PI;

function placeCamera(){
  if(shot==='head'){
    camera.position.set(0,0.10,4.35); camera.lookAt(0,0.02,0);
  } else {
    camera.position.set(0,-0.6,9.0); camera.lookAt(0,-1.05,0);
  }
}
placeCamera();

/* ---------- minimal UI ---------- */
if(!params.get('clean')){
  const bar=document.createElement('div');
  bar.style.cssText='position:fixed;left:24px;bottom:20px;display:flex;gap:8px;font:12px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:0.12em;';
  ROSTER.forEach((r,i)=>{
    const b=document.createElement('button');
    b.textContent=r.name;
    b.style.cssText=`padding:8px 14px;border:1px solid ${i===charIndex?'#333':'#ccc'};background:${i===charIndex?'#333':'transparent'};color:${i===charIndex?'#fff':'#555'};cursor:pointer;border-radius:2px;font:inherit;letter-spacing:inherit;`;
    b.onclick=()=>{ const u=new URL(location); u.searchParams.set('char',i); location=u; };
    bar.appendChild(b);
  });
  document.body.appendChild(bar);
  const title=document.createElement('div');
  title.textContent='CHIBI STUDIO';
  title.style.cssText='position:fixed;left:24px;top:20px;font:11px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:0.3em;color:#888;';
  document.body.appendChild(title);
}

/* ---------- loop ---------- */
const spin = params.get('spin')==='1';
let t0=performance.now();
function loop(){
  requestAnimationFrame(loop);
  if(spin) charGroup.rotation.y += 0.004;
  renderer.render(scene,camera);
}
loop();
addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
