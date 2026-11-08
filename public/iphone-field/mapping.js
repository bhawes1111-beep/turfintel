function firstPointBearing(points){
  if(points.length<3)return 0;
  const origin=points[0],cos=Math.cos(origin[1]*Math.PI/180);
  const xy=points.map(p=>[(p[0]-origin[0])*cos,(p[1]-origin[1])]);
  let area=0,x=0,y=0;
  for(let i=0;i<xy.length;i++){
    const a=xy[i],b=xy[(i+1)%xy.length],cross=a[0]*b[1]-b[0]*a[1];
    area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
  }
  if(Math.abs(area)<1e-16)return 0;
  const bearing=(Math.atan2(-x/(3*area),-y/(3*area))*180/Math.PI+360)%360;
  return Number(bearing.toFixed(6));
}
function drawBoundaryPreview(svg,points,original=[]){
  svg.replaceChildren();
  const all=points.concat(original);if(!all.length)return;
  const cos=Math.cos(all[0][1]*Math.PI/180);
  const bearing=firstPointBearing(points)*Math.PI/180,right=Math.cos(bearing),up=Math.sin(bearing),origin=all[0];
  const rotate=p=>{const x=(p[0]-origin[0])*cos,y=p[1]-origin[1];return [x*right-y*up,x*up+y*right];};
  const projected=all.map(rotate);
  const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
  const left=Math.min(...xs),bottom=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-bottom;
  const scale=Math.min(280/Math.max(width,.00001),210/Math.max(height,.00001));
  const coords=list=>list.map(rotate).map(p=>[20+(p[0]-left)*scale,235-(p[1]-bottom)*scale]);
  function shape(list,color,fill){
    if(!list.length)return;
    const p=document.createElementNS('http://www.w3.org/2000/svg','polyline');
    p.setAttribute('points',coords(list).map(p=>p.join(',')).join(' '));
    p.setAttribute('stroke',color);p.setAttribute('stroke-width','2');p.setAttribute('fill',fill);svg.append(p);
  }
  shape(original,'#aaa','none');
  shape(points.length>=3?[...points,points[0]]:points,'#80cc78','rgba(80,160,80,.15)');
  coords(points).forEach(([x,y],i)=>{
    const p=document.createElementNS('http://www.w3.org/2000/svg','circle');
    p.setAttribute('cx',x);p.setAttribute('cy',y);p.setAttribute('r','3');p.setAttribute('fill',i===0?'#ffcc55':'#fff');svg.append(p);
  });
}
globalThis.createMappingPanel=function createMappingPanel({board,getAreas,isLinked,token,onSaved,sendDraft,onMode,getPhonePoint}){
  const panel=document.getElementById('mapping-panel'),toggle=document.getElementById('mapping-toggle');
  const sampling=document.getElementById('sampling-mode'),sampleView=document.getElementById('sampling-view');
  if(board){toggle.onclick=()=>{location.href='/iphone-field/?collector=1&mode=mapping';};return {capture:()=>false,update:()=>{}};}
  const key='turfintel-boundary-draft-v1';
  let draft=null,saving=false;
  try{draft=JSON.parse(localStorage.getItem(key)||'null')}catch{/* Ignore an invalid saved draft. */}
  const el=id=>document.getElementById(id);
  const status=el('mapping-status');
  function persist(){onMode?.(!!draft);if(draft)localStorage.setItem(key,JSON.stringify(draft));else localStorage.removeItem(key);}
  function update(){
    const target=el('mapping-target'),previous=target.value;target.replaceChildren(new Option('New area',''));
    for(const f of getAreas())target.add(new Option(f.properties.name,String(f.properties.green)));
    target.value=previous;
  }
  function render(){
    el('mapping-setup').hidden=!!draft;el('mapping-active').hidden=!draft;
    toggle.textContent='Mapping';
    if(!draft)return;
    el('mapping-title').textContent=draft.name+' · '+draft.points.length+' perimeter points';
    el('mapping-save').disabled=saving||draft.points.length<3;
    el('mapping-add').disabled=saving||draft.paused||draft.gpsSource!=='phone';
    el('mapping-undo').disabled=saving||!draft.points.length;
    el('mapping-pause').disabled=saving;
    el('mapping-pause').textContent=draft.paused?'Resume tracing':'Pause tracing';
    el('mapping-cancel').disabled=saving;
    const old=getAreas().find(f=>f.properties.green===draft.targetId);
    drawBoundaryPreview(el('mapping-preview'),draft.points,old?.geometry.coordinates[0]||[]);
  }
  function showMode(mappingMode){
    panel.hidden=!mappingMode;
    if(sampleView)sampleView.hidden=mappingMode;
    toggle.setAttribute('aria-pressed',String(mappingMode));
    sampling?.setAttribute('aria-pressed',String(!mappingMode));
    if(!mappingMode&&draft)draft.paused=true;
    persist();onMode?.(mappingMode&&!!draft);update();render();
    window.dispatchEvent(new Event('resize'));
  }
  toggle.onclick=()=>showMode(true);
  if(sampling)sampling.onclick=()=>showMode(false);
  el('mapping-target').onchange=()=>{
    const f=getAreas().find(f=>String(f.properties.green)===el('mapping-target').value);
    el('mapping-name').disabled=el('mapping-category').disabled=!!f;
    el('mapping-name').value=f?.properties.name||'';
    el('mapping-category').value=f?.properties.category||'greens';
  };
  el('mapping-start').onclick=()=>{
    if(!isLinked()){status.textContent='Link this phone before starting a map.';return}
    const f=getAreas().find(f=>String(f.properties.green)===el('mapping-target').value);
    const name=(f?.properties.name||el('mapping-name').value).trim();
    if(!name){status.textContent='Enter an area name.';return}
    draft={id:crypto.randomUUID(),targetId:f?.properties.green??null,baseRevision:f?.properties.revision||0,name,category:f?.properties.category||el('mapping-category').value,topBearingDeg:f?.properties.topBearingDeg||0,points:[],paused:false,gpsSource:'phone',accuracies:[]};
    persist();status.textContent='Walk the perimeter in order. Tap Add phone GPS point at each corner or curve.';
    render();
  };
  el('mapping-undo').onclick=()=>{draft.points.pop();draft.accuracies?.pop();persist();render();};
  el('mapping-pause').onclick=()=>{draft.paused=!draft.paused;persist();render();};
  el('mapping-cancel').onclick=()=>{
    if(!confirm('Discard this unsent boundary draft?'))return;
    draft=null;persist();status.textContent='Draft discarded. Moisture collection resumed.';render();
  };
  el('mapping-save').onclick=async()=>{
    if(saving)return;
    saving=true;draft.paused=true;draft.topBearingDeg=firstPointBearing(draft.points);persist();render();status.textContent='Sending draft for review…';
    try{
      const response=sendDraft?await sendDraft(draft):await fetch('/api/field-device/area-draft',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify(draft)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Draft upload failed.');
      draft=null;persist();status.textContent='Saved for superintendent review. Moisture collection resumed.';onSaved();
    }catch(e){status.textContent=e.message+' Your draft is saved on this phone. Retry when ready.';}finally{saving=false;render();}
  };
  el('mapping-add').onclick=async()=>{
    if(!draft||draft.paused||saving)return;
    const id=draft.id;el('mapping-add').disabled=true;
    status.textContent='Getting a fresh phone location…';
    try{const point=await getPhonePoint();if(draft?.id===id&&!draft.paused&&!saving)capture(point);}
    catch(e){status.textContent=e.message||'Phone GPS unavailable. Allow precise location and try again.';}
    finally{render();}
  };
  function capture(r){
    if(!draft)return false;
    if(draft.paused||saving){status.textContent='Tracing paused. Resume to add perimeter points.';return true;}
    if(r.gpsSource!=='phone'||!Number.isFinite(r.lat)||!Number.isFinite(r.lng)){status.textContent='Use Add phone GPS point with a current phone location.';return true;}
    const last=draft.points.at(-1),point=[r.lng,r.lat];
    if(last&&Math.hypot((last[0]-point[0])*94180,(last[1]-point[1])*111320)<.5){status.textContent='Point is too close to the last one. Move along the edge.';return true;}
    if(draft.points.length>=600){status.textContent='600-point limit reached. Save this perimeter.';return true;}
    draft.points.push(point);(draft.accuracies??=[]).push(r.gpsAccuracy);persist();status.textContent='Phone GPS ±'+Math.round(r.gpsAccuracy)+' m · '+new Date(r.observedAt).toLocaleTimeString();render();return true;
  }
  if(draft&&draft.gpsSource!=='phone'){status.textContent='This older draft can be sent for review.';}
  if(draft){draft.paused=true;persist();panel.hidden=false;status.textContent=draft.gpsSource==='phone'?'Saved draft restored and paused. Resume when back on the perimeter.':'This older draft can be sent for review. Its GPS details will be flagged in Turf Health.';}
  showMode(!!draft||new URLSearchParams(location.search).get('mode')==='mapping');return {capture:()=>!panel.hidden,update};
}
