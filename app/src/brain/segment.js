/* Signal processing and rep segmentation — extracted verbatim from index.html; keep behavior identical. */
import {N} from "../pose/features.js";

export function smooth(a,w=2){return a.map((_,i)=>{let s=0,n=0;for(let k=i-w;k<=i+w;k++)if(k>=0&&k<a.length){s+=a[k];n++}return s/n})}
export function resample(a,n=N){const out=[];for(let i=0;i<n;i++){const x=i*(a.length-1)/(n-1),lo=Math.floor(x),hi=Math.min(a.length-1,lo+1);out.push(a[lo]+(a[hi]-a[lo])*(x-lo))}return out}
export function thresholds(series){const mx=Math.max(...series),mn=Math.min(...series),r=mx-mn;return{hi:mx-.25*r,lo:mn+.4*r,range:r}}
// A rep runs from the top of the movement (the highest point before dropping below lo) down past lo
// and back up to the next top (the highest point after rising above hi). Tops are the local peaks,
// not the threshold crossings, so a rep covers the full range of motion like the reference does.
export function segment(series,hi,lo){
  const reps=[];let cand=null,down=false,end=null,prevAbove=false;
  for(let i=0;i<series.length;i++){const v=series[i];
    if(end!==null){if(v>=series[end]){end=i;continue}reps.push([cand,end]);cand=end;end=null;down=false;prevAbove=true}
    const above=v>hi;
    if(!down){if(above){if(!prevAbove||cand===null||v>=series[cand])cand=i}else if(v<lo&&cand!==null)down=true}
    else if(above){if(i-cand>=6)end=i;else{down=false;cand=i}}
    prevAbove=above;
  }
  if(end!==null)reps.push([cand,end]);
  return reps.map(([a,b])=>{const [ms,me]=motionSpan(series.slice(a,b+1),hi);return[a,b,a+ms,a+me]});
}
// The moving part of a rep (indices into `series`, one rep top to top): pauses at the top are left out,
// so tempo measures the movement. Starts at the last frame still above halfway between the top and hi.
export function motionSpan(series,hi){
  let bot=0;series.forEach((v,i)=>{if(v<series[bot])bot=i});
  const n=series.length-1,a=(series[0]+hi)/2,b=(series[n]+hi)/2;
  let ms=0;for(let i=0;i<=bot;i++)if(series[i]>=a)ms=i;
  let me=n;for(let i=n;i>=bot;i--)if(series[i]>=b)me=i;
  return[ms,me];
}
// ms/me: optional motion span inside recs (see motionSpan) used for the duration
export function repFrom(recs,feats,ms=0,me=recs.length-1){
  const f={};feats.forEach(k=>f[k]=resample(smooth(recs.map(r=>r.f[k]))).map(v=>+v.toFixed(1)));
  const pose=[];for(let i=0;i<N;i++)pose.push(recs[Math.round(i*(recs.length-1)/(N-1))].pose);
  return{f,pose,dur:recs[me].t-recs[ms].t};
}
