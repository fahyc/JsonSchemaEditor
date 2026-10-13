/* Layered family layout. A spanning forest positions canonical nodes once;
   all original edges, including shared references and cycles, remain visible. */
(function(root){
  'use strict';
  function layoutFamilies(nodes,edges,{heights=new Map(),nodeWidth=265,columnGap=100,siblingGap=38,familyGap=80,margin=60}={}){
    const byKey=new Map(nodes.map(n=>[n.key,n]));
    const outgoing=new Map(nodes.map(n=>[n.key,[]]));
    const incoming=new Map(nodes.map(n=>[n.key,[]]));
    for(const e of edges){if(e.from===e.to||!byKey.has(e.from)||!byKey.has(e.to))continue;
      if(!outgoing.get(e.from).includes(e.to)){outgoing.get(e.from).push(e.to);incoming.get(e.to).push(e.from);}}
    const levels=new Map(),parents=new Map(),children=new Map(nodes.map(n=>[n.key,[]])),roots=[],queue=[];
    const start=key=>{if(levels.has(key))return;levels.set(key,0);parents.set(key,null);roots.push(key);queue.push(key);};
    // Explicit document roots first, then detached definitions. BFS gives the
    // shortest layer and a deterministic primary parent for shared types.
    nodes.filter(n=>n.path==='').forEach(n=>start(n.key));
    nodes.filter(n=>!incoming.get(n.key).length).forEach(n=>start(n.key));
    let cursor=0;
    const visit=()=>{while(cursor<queue.length){const key=queue[cursor++];for(const child of outgoing.get(key))if(!levels.has(child)){
      levels.set(child,levels.get(key)+1);parents.set(child,key);children.get(key).push(child);queue.push(child);
    }}};
    visit();
    // A disconnected cycle has no indegree-zero root. Break only its layout
    // ownership cycle; never remove or rewrite the schema's reference edges.
    for(const n of nodes)if(!levels.has(n.key)){start(n.key);visit();}
    const height=key=>Math.max(80,heights.get(key)||240),spans=new Map();
    // Reverse BFS is a postorder for the ownership forest; no recursion limit.
    for(let i=queue.length-1;i>=0;i--){const key=queue[i],kids=children.get(key);
      const childSpan=kids.reduce((sum,k)=>sum+spans.get(k),0)+Math.max(0,kids.length-1)*siblingGap;
      spans.set(key,Math.max(height(key),childSpan));
    }
    const positions=new Map(),pending=[];
    let top=margin;
    for(const key of roots){pending.push({key,top});top+=spans.get(key)+familyGap;}
    for(let i=0;i<pending.length;i++){
      const {key,top}=pending[i],span=spans.get(key),kids=children.get(key);
      positions.set(key,{x:margin+levels.get(key)*(nodeWidth+columnGap),y:top+(span-height(key))/2,height:height(key),width:nodeWidth});
      const childSpan=kids.reduce((sum,k)=>sum+spans.get(k),0)+Math.max(0,kids.length-1)*siblingGap;
      let childTop=top+(span-childSpan)/2;
      for(const child of kids){pending.push({key:child,top:childTop});childTop+=spans.get(child)+siblingGap;}
    }
    let width=2*margin,heightTotal=2*margin;
    for(const p of positions.values()){width=Math.max(width,p.x+p.width+margin);heightTotal=Math.max(heightTotal,p.y+p.height+margin);}
    return {positions,levels,parents,children,roots,width,height:heightTotal};
  }
  const api={layoutFamilies};if(typeof module!=='undefined')module.exports=api;root.GraphLayout=api;
})(typeof window!=='undefined'?window:globalThis);
