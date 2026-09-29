/* Signal processing and rep segmentation — extracted verbatim from index.html; keep behavior identical. */
import {N} from "../pose/features.js";

export function smooth(a,w=2){return a.map((_,i)=>{let s=0,n=0;for(let k=i-w;k<=i+w;k++)if(k>=0&&k<a.length){s+=a[k];n++}return s/n})}
export function resample(a,n=N){const out=[];for(let i=0;i<n;i++){const x=i*(a.length-1)/(n-1),lo=Math.floor(x),hi=Math.min(a.length-1,lo+1);out.push(a[lo]+(a[hi]-a[lo])*(x-lo))}return out}
export function thresholds(series){const mx=Math.max(...series),mn=Math.min(...series),r=mx-mn;return{hi:mx-.25*r,lo:mn+.4*r,range:r}}
export function segment(series,hi,lo){
  const reps=[];let cand=null,down=false;
  series.forEach((v,i)=>{
    if(!down){if(v>hi)cand=i;else if(v<lo&&cand!==null)down=true}
    else if(v>hi){if(i-cand>=6)reps.push([cand,i]);down=false;cand=i}
  });return reps;
}
export function repFrom(recs,feats){
  const f={};feats.forEach(k=>f[k]=resample(smooth(recs.map(r=>r.f[k]))).map(v=>+v.toFixed(1)));
  const pose=[];for(let i=0;i<N;i++)pose.push(recs[Math.round(i*(recs.length-1)/(N-1))].pose);
  return{f,pose,dur:recs[recs.length-1].t-recs[0].t};
}
