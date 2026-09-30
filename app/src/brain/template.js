/* Reference templates — extracted verbatim from index.html; keep behavior identical. */
import {N,EX,PTS} from "../pose/features.js";
import {thresholds} from "./segment.js";

export function buildTemplate(name,exKey,reps,sources){
  const E=EX[exKey],mean={},std={};
  E.feats.forEach(k=>{mean[k]=[];std[k]=[];for(let i=0;i<N;i++){const vs=reps.map(r=>r.f[k][i]),m=vs.reduce((a,b)=>a+b,0)/vs.length;
    const sd=Math.sqrt(vs.reduce((a,b)=>a+(b-m)**2,0)/vs.length);mean[k].push(+m.toFixed(1));std[k].push(+Math.max(sd,6).toFixed(1))}});
  const pose=[];for(let i=0;i<N;i++)pose.push(PTS.map((_,p)=>[0,1].map(c=>+(reps.reduce((a,r)=>a+r.pose[i][p][c],0)/reps.length).toFixed(3))));
  const th=thresholds(mean[E.primary]);
  return{name,exercise:exKey,mean,std,pose,dur:reps.reduce((a,r)=>a+r.dur,0)/reps.length,hi:th.hi,lo:th.lo+.1*th.range,reps,sources};
}
