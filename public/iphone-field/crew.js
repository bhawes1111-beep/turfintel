(() => {
  const host = '/api/field-device/';
  const board=new URLSearchParams(location.search).get('board')==='1';
  const storage=board?'turfintel-board-map-v1':'turfintel-crew-map-v1';
  let connected=false,detail='',uploadStatus='',flushing=false,autoGreen=0;
  let queue=JSON.parse(localStorage.getItem(storage+'-queue')||'[]');
  const saveQueue=()=>localStorage.setItem(storage+'-queue',JSON.stringify(queue));
  const gps=globalThis.createPhoneGps(message=>{document.getElementById('phone-gps-status').textContent=message;});
  document.getElementById('phone-gps-enable').onclick=()=>gps.start();
  const meter=globalThis.createMeter(capture,(online,note)=>{connected=online;detail=note;renderMap();},()=>gps.snapshot());
  function capture(r){
    if(mapping.capture(r))return;
    const feature=r.lat===null?null:globalThis.closestGreen(visibleAreas(),r.lat,r.lng);
    const id=feature?.properties.green||0;
    r.location=feature?.properties.name||'Unassigned TDR reading';
    r.hole=id&&id<=18?id:null;
    if(id)r.areaId=id;
    selected=0;autoGreen=id;
    detail=r.moisturePct+'% VWC · '+r.location+(r.lat===null?' · No GPS location':r.gpsSource==='tdr'?' · TDR GPS backup':' · Phone GPS ±'+Math.round(r.gpsAccuracy)+' m');
    queue.push(r);saveQueue();renderMap();flush();
  }
  async function flush(){
    if(flushing||!linked||board||!queue.length)return;
    flushing=true;
    try{
      while(queue.length){
        const r=queue[0];
        const response=await fetch(host+'reading',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(r)});
        if(!response.ok){if([401,403].includes(response.status)){linked=false;meter.stop();}throw Error('Upload pending ('+response.status+')');}
        queue.shift();saveQueue();uploadStatus='Uploaded '+r.moisturePct+'% · '+r.location;
      }
      await refresh();
    }catch(e){uploadStatus=e.message;}finally{flushing=false;renderMap();}
  }
  let packet = {}, palette = {}, greens = [], selected = 0, currentArea = 0, busy = false, linked = false, error = '';
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  let token = localStorage.getItem(storage+'-device');
  if (!board && !token) {token=hex(crypto.getRandomValues(new Uint8Array(32)));localStorage.setItem(storage+'-device',token);}
  try{({packet={},palette={}}=JSON.parse(localStorage.getItem(storage)||'{}'));}catch{/* Ignore an invalid local cache and refresh below. */}
  let fingerprint='';
  const selector=document.getElementById('area-type');
  let category=localStorage.getItem(storage+'-category')||'greens';
  selector.value=category;
  const visibleAreas=()=>greens.filter(f=>category==='all'||(f.properties.category||'greens')===category);
  selector.onchange=()=>{category=selector.value;localStorage.setItem(storage+'-category',category);selected=autoGreen=0;renderMap();};
  const mapping=globalThis.createMappingPanel({board,getAreas:()=>greens,isLinked:()=>linked,token:()=>token,onSaved:refresh,getPhonePoint:()=>gps.point(),onMode:active=>{if(active)gps.start();}});

  function renderMap(){
    const points=(packet.day===day.format(new Date())?packet.points:[])||[];
    const areas=visibleAreas(),allowed=new Set(areas.map(f=>f.properties.green));
    const id=[selected,autoGreen,...points.map(p=>p.green),areas[0]?.properties.green].find(id=>allowed.has(id))||0;
    currentArea=id;
    const feature=greens.find(g=>g.properties.green===id), samples=points.filter(p=>p.green===id);
    for(const r of queue){
      if(id && r.location===feature?.properties.name && day.format(new Date(r.observedAt))===day.format(new Date()) && !samples.some(p=>p.clientId===r.clientId))
        samples.push({time:Date.parse(r.observedAt),lat:r.lat,lng:r.lng,vwc:r.moisturePct});
    }
    samples.sort((a,b)=>b.time-a.time);
    window.updateField({green:id,topBearingDeg:feature?.properties.topBearingDeg,greenName:feature?.properties.name,outline:feature?.geometry.coordinates[0]||[],
      points:samples.map(p=>[p.lng,p.lat,p.vwc]),newestSample:samples[0]?.time||0,latest:samples[0]?.vwc,
      account:true,connected,detail,linked,meterLabel:connected?'Disconnect TDR 350':'Connect TDR 350',shared:!selected&&!autoGreen,manual:!!selected,moistureScale:palette,mapLoading:busy,mapError:error||(!areas.length?'No approved '+category+' maps yet.':'')||(packet.futureCount?packet.futureCount+' readings have meter times ahead of the course clock.':''),
      mapAsOf:Date.parse(packet.asOf)||0,sync:board?'Workboard · viewing today’s readings':queue.length?queue.length+' waiting to upload · '+uploadStatus:uploadStatus||(linked?'Linked to TurfIntel':'Link this phone to load crew readings')});
  }
  async function load(path){
    const response=await fetch(host+path,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if([401,403].includes(response.status)){linked=false;packet={};palette={};localStorage.removeItem(storage);throw Error('Phone link required');}
    if(!response.ok)throw Error('Refresh unavailable');return response.json();
  }
  async function refresh(){
    if(busy)return;busy=true;renderMap();
    try{if(board){
      const res=await fetch('/api/display-board/moisture?courseId=crossroads-gc&areas=all',{cache:'no-store'});
      if(!res.ok)throw Error('Workboard map unavailable');
      packet=await res.json();palette=packet.moistureScale||{};
    }else{
      const status=await load('status');linked=true;const data=await load('map?greens=all&areas=all');packet=data;palette=status.moistureScale||{};flush();
    }if(packet.features){greens=packet.features;mapping.update();}localStorage.setItem(storage,JSON.stringify({packet,palette}));error='';}
    catch(e){error=e.message;}finally{busy=false;renderMap();}
  }
  function link(){if(!fingerprint||!confirm('Confirm phone code '+fingerprint.slice(0,8).toUpperCase()+' on the TurfIntel link page.'))return;window.open('/link-field.html#'+fingerprint,'_blank','noopener');}
  const picker=document.createElement('dialog');picker.style.cssText='border-radius:12px;max-width:90vw;';document.body.append(picker);
  window.crewCommand=name=>{
    if(name==='refresh')return refresh();
    if(name==='settings'||name==='connect'){
      if(board){location.href='/iphone-field/?collector=1';return;}
      if(name==='settings'){link();return;}
      if(!navigator.bluetooth?.requestDevice){
        detail='Open this page inside the Bluefy app on iPhone to connect the TDR. Safari can view the watering map.';
        renderMap();return;
      }
      if(!linked){
        detail='Link this phone to TurfIntel first, then tap Connect TDR 350 again.';
        renderMap();link();return;
      }
      gps.start();meter.connect();
      return;
    }
    if(name.startsWith('theme-')){localStorage.setItem('ti-field-theme',name.slice(6));return;}
    if(name==='change'){picker.replaceChildren();const list=document.createElement('select');list.setAttribute('aria-label','Watering green');list.add(new Option('Latest sampled green','0'));for(const f of [...visibleAreas()].sort((a,b)=>a.properties.green-b.properties.green))list.add(new Option(f.properties.name,f.properties.green));list.value=String(selected);const done=document.createElement('button');done.textContent='View green';done.onclick=()=>{selected=Number(list.value);picker.close();renderMap();};picker.append(list,done);picker.showModal();return;}
    const direction=name==='next-green'?1:name==='previous-green'?-1:0;
    if(direction && visibleAreas().length){const areas=visibleAreas();const index=areas.findIndex(f=>f.properties.green===currentArea);selected=areas[(index+direction+areas.length)%areas.length].properties.green;renderMap();}
  };
  async function start(){
    if(board){
      document.getElementById('settings').hidden=true;
      detail='Tap Connect TDR 350 to switch to collecting readings in Bluefy.';
      const back=document.createElement('a');back.href='/display-board/board';back.textContent='← Workboard';back.style.color='inherit';
      document.querySelector('main').prepend(back);
    }
    if(!board)fingerprint=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
    greens=packet.features||(await (await fetch('./greens.json')).json()).features;
    try{const response=await fetch('/api/field-areas',{cache:'no-store'});if(response.ok)greens=(await response.json()).features;}catch{/* Keep the bundled course boundaries when the live catalog is unavailable. */}
    mapping.update();renderMap();await refresh();
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('online',refresh);
  setInterval(()=>{if(!document.hidden)refresh();},30000);start().catch(e=>{error=e.message;renderMap();});
})();
