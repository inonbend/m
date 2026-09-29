/* Rep scoring with DTW — extracted verbatim from index.html; keep behavior identical. */
import {N,EX,FEATS,clamp} from "../pose/features.js";

export function compare(rep,tpl){
  const E=EX[tpl.exercise],F=E.feats,W=12,INF=1e9;
  const cost=(i,j)=>Math.sqrt(F.reduce((s,k)=>s+((rep.f[k][i]-tpl.mean[k][j])/tpl.std[k][j])**2,0));
  const D=Array.from({length:N+1},()=>new Float64Array(N+1).fill(INF));D[0][0]=0;
  for(let i=1;i<=N;i++)for(let j=Math.max(1,i-W);j<=Math.min(N,i+W);j++)D[i][j]=cost(i-1,j-1)+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1]);
  const match=Array.from({length:N},()=>[]);let i=N,j=N;
  while(i>0&&j>0){match[j-1].push(i-1);const a=D[i-1][j-1],b=D[i-1][j],c=D[i][j-1];if(a<=b&&a<=c){i--;j--}else if(b<c)i--;else j--}
  const dev={},parts={},phases=[[0,24,"On the way down"],[24,36,E.mid],[36,60,"On the way up"]],cands=[];
  F.forEach(k=>{dev[k]=match.map((is,jj)=>is.reduce((s,ii)=>s+rep.f[k][ii],0)/is.length-tpl.mean[k][jj]);
    const z=dev[k].reduce((s,d,jj)=>s+Math.abs(d)/tpl.std[k][jj],0)/N;
    parts[FEATS[k].label]=clamp(100-25*Math.max(0,z-.6));
    phases.forEach(([a,b,name])=>{const seg=dev[k].slice(a,b),m=seg.reduce((x,y)=>x+y,0)/seg.length,
      sd=tpl.std[k].slice(a,b).reduce((x,y)=>x+y,0)/(b-a);
      if(Math.abs(m)>6&&Math.abs(m)/sd>1)cands.push({k,m,sev:Math.abs(m)/sd,phase:name})});
  });
  const ratio=rep.dur/tpl.dur;parts["Tempo"]=clamp(100*(1-Math.abs(Math.log(ratio))/Math.log(2.2)));
  const featAvg=F.reduce((s,k)=>s+parts[FEATS[k].label],0)/F.length;
  const score=Math.round(featAvg*.85+parts.Tempo*.15);
  cands.sort((a,b)=>b.sev-a.sev);
  const tips=cands.slice(0,2).map(c=>({key:c.k+c.phase,short:FEATS[c.k].hint[c.m>0?"+":"-"],
    text:`${c.phase}, your ${FEATS[c.k].label.toLowerCase()} is ${Math.round(Math.abs(c.m))}° ${c.m>0?"larger":"smaller"} than the reference. ${FEATS[c.k].hint[c.m>0?"+":"-"]}`}));
  if(ratio<.7)tips.push({key:"fast",short:"Slow down.",text:`You're moving ${Math.round((1/ratio-1)*100)}% faster than the reference. Slow down and control each rep.`});
  if(ratio>1.5)tips.push({key:"slow",short:"Pick up the pace.",text:`You're ${Math.round((ratio-1)*100)}% slower than the reference.`});
  const aligned=match.map(is=>rep.pose[is[0]]);
  return{score,parts,tips,aligned};
}
