import fs from "fs";
const css = fs.readFileSync("app/globals.css", "utf8");
const block = (sel) => { const i = css.indexOf(sel + " {"); const j = css.indexOf("\n}", i); return css.slice(i, j); };
const parse = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
const light = parse(block(".light")); const dark = { ...light, ...parse(block(".dark")) };
const lum = (h) => { const c = [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255).map(v => v<=0.03928? v/12.92 : ((v+0.055)/1.055)**2.4); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const pairs = [["foreground","background",4.5],["fg-secondary","background",4.5],["muted-foreground","background",4.5],["muted-foreground","surface-subtle",4.5],["muted-foreground","surface-sunken",4.5],["muted-foreground","card",4.5],["primary-foreground","primary",4.5],["primary-text","background",4.5],["selected-foreground","selected",4.5],["rail-foreground","rail",4.5],["rail-muted","rail",4.5],["destructive-foreground","destructive",4.5],["success-subtle-foreground","success-subtle",4.5],["warning-subtle-foreground","warning-subtle",4.5],["destructive-subtle-foreground","destructive-subtle",4.5],["info-subtle-foreground","info-subtle",4.5],["secondary-foreground","secondary",4.5],
...["afaire","encours","revue","bloque","termine","test"].map(s=>[`status-${s}-fg`,`status-${s}-bg`,4.5]),
...["ouverte","brouillon","revue","fusionnee","fermee"].map(s=>[`pr-${s}-fg`,`pr-${s}-bg`,4.5]),
...["jaune","orange","cyan","violet","vert","rose","bleu","gris"].map(s=>[`label-${s}-fg`,`label-${s}-bg`,4.5]),
...["critique","haute","moyenne","basse","minimale"].map(s=>[`prio-${s}`,"card",3]),
...["story","tache","bug","epic","soustache"].map(s=>[`type-${s}`,"card",3]),
["success","card",3],["warning","card",3],["destructive","card",3],["border-strong","card",1.4]];
let fails = 0;
for (const [name, t] of [["clair", light], ["sombre", dark]]) for (const [fg,bg,min] of pairs) { const r = ratio(t[fg], t[bg]); if (r < min) { fails++; console.log(`ÉCHEC ${name}: ${fg} / ${bg} = ${r.toFixed(2)} (min ${min})`); } }
console.log(fails ? `${fails} échec(s)` : `OK — ${pairs.length*2} paires conformes`);
