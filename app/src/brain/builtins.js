/* Built-in correct-form animations (forward kinematics) — extracted verbatim from index.html; keep behavior identical. */
import {N,EX,FEATS,PTS} from "../pose/features.js";
import {thresholds} from "./segment.js";

export const R=Math.PI/180,SEG={shin:1.05,thigh:1.05,ua:.7,fa:.65};
export const upV=(p,l,d)=>({x:p.x+l*Math.sin(d*R),y:p.y-l*Math.cos(d*R)});
export const dnV=(p,l,d)=>({x:p.x+l*Math.sin(d*R),y:p.y+l*Math.cos(d*R)});
export function fk(q){
  const ankle={x:0,y:0},knee=upV(ankle,SEG.shin,q.shin),hip=upV(knee,SEG.thigh,q.thigh),sh=upV(hip,1,q.torso),nose=upV(sh,.35,q.torso);
  let el,wr;
  if(q.wrist){wr=q.wrist;const dx=sh.x-wr.x,dy=sh.y-wr.y,d=Math.min(Math.hypot(dx,dy),SEG.ua+SEG.fa-1e-3),th=Math.atan2(dy,dx),
    A=Math.acos(Math.max(-1,Math.min(1,(SEG.fa**2+d*d-SEG.ua**2)/(2*SEG.fa*d))));
    const c=[th+A,th-A].map(a=>({x:wr.x+SEG.fa*Math.cos(a),y:wr.y+SEG.fa*Math.sin(a)}));el=c[0].x<c[1].x?c[0]:c[1]}
  else{el=dnV(sh,SEG.ua,q.ua);wr=dnV(el,SEG.fa,q.fa)}
  return{nose,sh,el,wr,hip,knee,ankle};
}
export const MOTION={
  squat:{dur:2.6,top:{shin:0,thigh:0,torso:5,ua:85,fa:85},bot:{shin:30,thigh:-75,torso:40,ua:85,fa:85},tip:"Sit back and down with your chest up, then stand tall."},
  lunge:{dur:2.4,top:{shin:0,thigh:0,torso:3,ua:0,fa:0},bot:{shin:8,thigh:-85,torso:5,ua:0,fa:0},tip:"Drop straight down until your front thigh is level, torso upright."},
  rdl:{dur:3,top:{shin:0,thigh:0,torso:0,ua:0,fa:0},bot:{shin:12,thigh:-15,torso:78,ua:0,fa:0},tip:"Soft knees, push your hips back, keep your back flat."},
  pushup:{dur:2.2,top:{shin:64,thigh:64,torso:64},bot:{shin:73,thigh:73,torso:73},wrist:{x:2.84,y:0},tip:"Straight line from head to heels, lower until elbows reach 90°."},
  curl:{dur:2.6,top:{shin:0,thigh:0,torso:0,ua:3,fa:8},bot:{shin:0,thigh:0,torso:0,ua:3,fa:135},tip:"Elbows pinned at your sides, curl all the way up, lower all the way down."}
};
export function builtin(exKey){
  const M=MOTION[exKey],E=EX[exKey],frames=[];
  for(let i=0;i<N;i++){const p=(1-Math.cos(2*Math.PI*i/(N-1)))/2,q={};
    Object.keys(M.top).forEach(k=>q[k]=M.top[k]+(M.bot[k]-M.top[k])*p);if(M.wrist)q.wrist=M.wrist;frames.push(fk(q))}
  const mean={},std={};E.feats.forEach(k=>{mean[k]=frames.map(j=>+FEATS[k].f(j).toFixed(1));std[k]=Array(N).fill(8)});
  const pose=frames.map(j=>PTS.map(n=>[+(j[n].x-j.hip.x).toFixed(3),+(j[n].y-j.hip.y).toFixed(3)]));
  const th=thresholds(mean[E.primary]);
  return{name:E.name+" (built-in)",exercise:exKey,mean,std,pose,dur:M.dur,hi:th.hi,lo:th.lo+.1*th.range,reps:[],sources:0,builtin:true,tip:M.tip};
}
