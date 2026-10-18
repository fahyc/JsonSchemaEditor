/* View-only positions and previews. They never become schema/data fields. */
const GraphUI=(()=>{
  let offsets={},visible=[],gesture=null,tooltip,showTimer,hideTimer,owner=null;
  const key=n=>JSON.stringify(state.mode==='schema'?['schema',n.doc,n.path]:['data',activeData()?.id,n.path]);
  const storageKey=()=>STORE+'.node-offsets.v1';
  function hide(){clearTimeout(showTimer);clearTimeout(hideTimer);if(tooltip)tooltip.hidden=true;if(owner)owner.removeAttribute('aria-describedby');owner=null;}
  function extent(layout){
    const ps=[...layout.positions.values()];if(!ps.length){layout.bounds={x:0,y:0,width:1,height:1};return;}
    const x=Math.min(...ps.map(p=>p.x))-40,y=Math.min(...ps.map(p=>p.y))-40,right=Math.max(...ps.map(p=>p.x+p.width))+40,bottom=Math.max(...ps.map(p=>p.y+p.height))+40;
    layout.bounds={x,y,width:right-x,height:bottom-y};layout.width=Math.max(1,right);layout.height=Math.max(1,bottom);
  }
  function apply(layout,nodes){
    for(const n of nodes){const p=layout.positions.get(n.key),o=offsets[key(n)];if(p&&Number.isFinite(o?.x)&&Number.isFinite(o?.y)){p.x+=o.x;p.y+=o.y;}}
    extent(layout);
  }
  function remember(){try{localStorage.setItem(storageKey(),JSON.stringify(offsets));}catch{notify('Node positions could not be remembered.');}}
  function summary(value,depth=0){
    if(typeof value==='string')return value.length>1200?value.slice(0,1200)+'…':value;
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    const entries=Object.entries(value),array=Array.isArray(value);
    if(depth>=2)return array?'['+entries.length+' items]':'{'+entries.length+' fields}';
    const rows=entries.slice(0,6).map(([k,v])=>(array?'':JSON.stringify(k)+': ')+summary(v,depth+1));if(entries.length>6)rows.push('… '+(entries.length-6)+' more');
    const text=(array?'[':'{')+'\n'+rows.join(',\n')+'\n'+(array?']':'}');return text.length>1600?text.slice(0,1600)+'…':text;
  }
  function show(node,element){
    if(gesture||$('#editor').open||$('#small-dialog').open||$('#ai-dialog')?.open||!element.isConnected)return;
    const data=state.mode==='data',s=node.schema||{},fields=data?(node.value!==null&&typeof node.value==='object'?Object.entries(node.value):[['Value',node.value]]):Object.entries(s.properties||{}),variants=s.oneOf||s.anyOf;
    hide();owner=element;element.setAttribute('aria-describedby','node-tooltip');
    tooltip.innerHTML=`<div class="tooltip-heading">${h(node.name)}</div><div class="tooltip-path">${h(data?activeData()?.name:node.doc)} #${h(node.path||'/')}</div>${!data&&s.description?`<p>${h(s.description)}</p>`:''}<dl>${fields.slice(0,50).map(([name,value])=>data?`<dt>${h(name)} <small>${h(C.typeOf(value))}</small></dt><dd><pre>${h(summary(value))}</pre></dd>`:`<dt>${h(name)} ${s.required?.includes(name)?'<small>required</small>':''}</dt><dd><b>${h(typeLabel(value))}</b>${value?.description?`<p>${h(value.description)}</p>`:''}${value?.enum?`<pre>${h(summary(value.enum))}</pre>`:''}</dd>`).join('')}</dl>${fields.length>50?`<p>${fields.length-50} more fields. Open the node to see everything.</p>`:''}${!fields.length?`<p>${h(typeLabel(s))}</p>`:''}${!data&&variants?`<p>${variants.length} selectable variants</p><ul>${variants.slice(0,30).map((v,i)=>`<li>${h(variantName(node.doc,v,i))}</li>`).join('')}</ul>`:''}`;
    tooltip.hidden=false;const r=element.getBoundingClientRect(),w=tooltip.offsetWidth,height=tooltip.offsetHeight;
    let x=r.right+14;if(x+w>innerWidth-12)x=r.left-w-14;if(x<12)x=Math.max(12,Math.min(innerWidth-w-12,r.left));
    let y=Math.max(12,Math.min(innerHeight-height-12,r.top));if(x<r.right&&x+w>r.left){if(r.bottom+height+14<innerHeight)y=r.bottom+14;else if(r.top>height+14)y=r.top-height-14;}
    tooltip.style.left=x+'px';tooltip.style.top=y+'px';
  }
  function attach(nodes){
    visible=nodes;
    $$('#nodes .node').forEach(element=>{
      const n=nodes[+element.dataset.node];
      element.addEventListener('pointerenter',event=>{if(event.pointerType==='touch'||gesture)return;clearTimeout(hideTimer);clearTimeout(showTimer);showTimer=setTimeout(()=>show(n,element),350);});
      element.addEventListener('pointerleave',()=>{clearTimeout(showTimer);hideTimer=setTimeout(hide,180);});
      element.addEventListener('focus',()=>{clearTimeout(showTimer);showTimer=setTimeout(()=>show(n,element),350);});
      element.addEventListener('blur',hide);
    });
  }
  function finish(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const g=gesture;gesture=null;suppressGraphClick=g.moved;
    if(g.moved&&g.node){
      if(event.type==='pointercancel'){if(g.hadOffset)offsets[g.key]=g.offset;else delete offsets[g.key];const p=graphLayout.positions.get(g.node.key);Object.assign(p,g.position);g.element.style.left=p.x+'px';g.element.style.top=p.y+'px';extent(graphLayout);drawGraphEdges();}
      else remember();
    }
    canvas.classList.remove('is-panning','is-moving-node');g.element?.classList.remove('is-dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function init(){
    try{const v=JSON.parse(localStorage.getItem(storageKey())||'{}');if(v&&typeof v==='object'&&!Array.isArray(v))offsets=v;}catch{}
    tooltip=document.createElement('div');tooltip.id='node-tooltip';tooltip.role='tooltip';tooltip.hidden=true;document.body.append(tooltip);
    tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tooltip.addEventListener('pointerleave',hide);
    window.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});window.addEventListener('resize',hide);
    canvas.addEventListener('wheel',hide,{passive:true});canvas.addEventListener('click',hide);
    canvas.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||![0,1].includes(event.button))return;
      hide();if(event.target.closest('.node-delete'))return;const element=event.target.closest('.node'),n=element?visible[+element.dataset.node]:null;
      if(n&&event.button!==0){event.preventDefault();return;}
      suppressGraphClick=false;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,camera:{...camera},moved:false,node:n,element};
      if(n){const k=key(n);Object.assign(gesture,{key:k,hadOffset:C.own(offsets,k),offset:{x:offsets[k]?.x||0,y:offsets[k]?.y||0},position:{...graphLayout.positions.get(n.key)}});}
      if(event.button===1)event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
      const g=gesture;if(!g||g.id!==event.pointerId)return;
      const dx=event.clientX-g.x,dy=event.clientY-g.y;if(!g.moved&&Math.hypot(dx,dy)<5)return;
      if(!g.moved){g.moved=true;hide();canvas.setPointerCapture(event.pointerId);canvas.classList.add(g.node?'is-moving-node':'is-panning');g.element?.classList.add('is-dragging');}
      event.preventDefault();
      if(g.node){const p=graphLayout.positions.get(g.node.key);p.x=g.position.x+dx/zoom;p.y=g.position.y+dy/zoom;offsets[g.key]={x:g.offset.x+dx/zoom,y:g.offset.y+dy/zoom};g.element.style.left=p.x+'px';g.element.style.top=p.y+'px';extent(graphLayout);drawGraphEdges();}
      else{camera={x:g.camera.x+dx,y:g.camera.y+dy};applyCamera();}
    });
    window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
    const reset=document.createElement('button');reset.id='layout-reset';reset.textContent='Auto layout';reset.title='Reset manual positions for the visible nodes';$('#zoom-fit').before(reset);
    reset.onclick=()=>{hide();for(const n of visible)delete offsets[key(n)];remember();drawGraph();fitGraph();};
  }
  function beforeDraw(){hide();if(gesture)finish({pointerId:gesture.id,type:'pointercancel'});}
  return {init,apply,attach,hide,beforeDraw,isDragging:()=>!!gesture};
})();
