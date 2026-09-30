/* Library name helpers — extracted verbatim from index.html; keep behavior identical. */
export const slug=t=>String(t??"").toLowerCase().replace(/[^a-z0-9]+/g,"");
export const guessType=n=>/leg curl|hamstring curl|wrist curl/i.test(n)?"":/lunge|split ?squat/i.test(n)?"lunge":/squat/i.test(n)?"squat":/deadlift|rdl|hip hinge|good ?morning/i.test(n)?"rdl":/push.?up/i.test(n)?"pushup":/curl/i.test(n)?"curl":"";
