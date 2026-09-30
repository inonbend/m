/* Geometry, features, exercises, landmarks → joints — extracted verbatim from index.html; keep behavior identical. */
// points may carry z (3D world landmarks); without z these are the original 2D formulas
export const angle=(a,b,c)=>{const ab=[a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0)],cb=[c.x-b.x,c.y-b.y,(c.z??0)-(b.z??0)];
  const d=(ab[0]*cb[0]+ab[1]*cb[1]+ab[2]*cb[2])/((Math.hypot(...ab)*Math.hypot(...cb))||1);
  return Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI};
export const fromVertical=(top,bot)=>Math.abs(Math.atan2(Math.hypot(top.x-bot.x,(top.z??0)-(bot.z??0)),bot.y-top.y)*180/Math.PI);
export const clamp=v=>Math.max(0,Math.min(100,v));
export const N=60;

export const FEATS={
  knee:{label:"Knee angle",f:j=>angle(j.hip,j.knee,j.ankle),hint:{"+":"Bend your knees more.","-":"Don't bend your knees as much."}},
  hip:{label:"Hip angle",f:j=>angle(j.sh,j.hip,j.knee),hint:{"+":"Hinge more at the hips.","-":"Don't fold so much at the hips — drive them forward."}},
  elbow:{label:"Elbow angle",f:j=>angle(j.sh,j.el,j.wr),hint:{"+":"Bend your elbows further.","-":"Don't bend your elbows as far."}},
  torso:{label:"Torso lean",f:j=>fromVertical(j.sh,j.hip),hint:{"+":"Keep your chest more upright.","-":"Lean your torso slightly more forward."}},
  line:{label:"Body line",f:j=>angle(j.sh,j.hip,j.ankle),hint:{"+":"Match the reference hip height.","-":"Brace your core — keep a straight line from shoulders to ankles."}},
  arm:{label:"Upper-arm swing",f:j=>fromVertical(j.sh,j.el),hint:{"+":"Pin your elbow to your side.","-":"Let your elbow travel a little, like the reference."}}
};
export const EX={
  squat:{name:"Squat",primary:"knee",feats:["knee","hip","torso"],need:["sh","hip","knee","ankle"],mid:"At the bottom"},
  lunge:{name:"Lunge",primary:"knee",feats:["knee","hip","torso"],need:["sh","hip","knee","ankle"],mid:"At the bottom"},
  rdl:{name:"Romanian deadlift",primary:"hip",feats:["hip","knee","torso"],need:["sh","hip","knee","ankle"],mid:"At the bottom"},
  pushup:{name:"Push-up",primary:"elbow",feats:["elbow","line"],need:["sh","el","wr","hip","ankle"],mid:"At the bottom"},
  curl:{name:"Bicep curl",primary:"elbow",feats:["elbow","arm","torso"],need:["sh","el","wr","hip"],mid:"At the top"}
};
export const PTS=["nose","sh","el","wr","hip","knee","ankle"];
export const IDX={L:[0,11,13,15,23,25,27,29,31],R:[0,12,14,16,24,26,28,30,32]};
export const BONES=[[0,1],[1,2],[2,3],[1,4],[4,5],[5,6]];

export function toJoints(lm,aspect){
  const vis=k=>IDX[k].slice(1,7).reduce((s,i)=>s+(lm[i].visibility??0),0);
  const ids=IDX[vis("L")>=vis("R")?"L":"R"],j={};
  PTS.concat(["heel","toe"]).forEach((n,k)=>{const p=lm[ids[k]];j[n]={x:p.x*aspect,y:p.y,v:p.visibility??1}});
  j.ids=ids;return j;
}
export function normPose(j){
  const o=j.hip,s=Math.hypot(j.sh.x-o.x,j.sh.y-o.y)||1,dir=(j.toe.x-j.heel.x)>=0?1:-1;
  return PTS.map(n=>[+((j[n].x-o.x)/s*dir).toFixed(3),+((j[n].y-o.y)/s).toFixed(3)]);
}
export function record(lm,aspect,exKey,t){
  const E=EX[exKey],j=toJoints(lm,aspect);
  if(!E.need.every(k=>j[k].v>.5))return null;
  const f={};E.feats.forEach(k=>f[k]=FEATS[k].f(j));
  return{t,f,pose:normPose(j),j};
}

/* 3D features from MediaPipe world landmarks (meters, hip-centered, y down), using the same body side
   as the 2D joints. Used for videos filmed front-on or at an angle, where 2D angles are foreshortened. */
export function features3(wl,ids,exKey){
  const j={};PTS.forEach((n,k)=>{const p=wl[ids[k]];j[n]={x:p.x,y:p.y,z:p.z}});
  const f={};EX[exKey].feats.forEach(k=>f[k]=FEATS[k].f(j));return f;
}

/* The pose seen from the side, from 3D world landmarks: project onto the body's sagittal plane
   (forward = horizontal, perpendicular to the hip line, the way the toes point). Same format as normPose. */
export function sidePose3(wl,ids){
  const L=wl[23],R=wl[24],n=Math.hypot(R.x-L.x,R.z-L.z)||1;
  let fx=-(R.z-L.z)/n,fz=(R.x-L.x)/n;const heel=wl[ids[7]],toe=wl[ids[8]];
  if((toe.x-heel.x)*fx+(toe.z-heel.z)*fz<0){fx=-fx;fz=-fz}
  const o=wl[ids[4]],P=p=>[(p.x-o.x)*fx+(p.z-o.z)*fz,p.y-o.y],pts=PTS.map((_,k)=>P(wl[ids[k]]));
  const s=Math.hypot(...pts[1])||1;
  return pts.map(([x,y])=>[+(x/s).toFixed(3),+(y/s).toFixed(3)]);
}
