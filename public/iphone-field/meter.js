const tdrService = 'a27c7127-8b04-4e00-a7b0-26b5e8c69c34';
const fieldIds = {
  vwc:'808d569d-0d0c-4859-939d-19c25365beb1',
  fix:'11f5c1a2-4a3f-45c5-96b1-9c1644e5d664',
  lat:'eaff3c4a-8a7a-4114-8092-93218c5cf182',
  lng:'946eff6b-7948-46e1-9dd4-b1fffc05b787',
};
function fieldText(data) {
  return new TextDecoder().decode(data).replaceAll('\0','').trim();
}
function meterCoordinate(value, latitude) {
  const match=/^(\d+\.\d+),([NSEW])$/i.exec(value);
  if (!match || !(latitude ? /^[NS]$/i : /^[EW]$/i).test(match[2])) return null;
  const width=match[1].split('.')[0].length;
  if(width!==(latitude?4:5))return null;
  const raw=Number(match[1]),deg=Math.floor(raw/100),min=raw-deg*100;
  const coord=deg+min/60;
  if(min>=60||coord>(latitude?90:180))return null;
  return /[SW]/i.test(match[2])?-coord:coord;
}
globalThis.closestGreen=function closestGreen(greens,lat,lng) {
  const scale=111320*Math.cos(lat*Math.PI/180);
  const distances=greens.map(g=>{
    const ring=g.geometry.coordinates[0];let inside=false,nearest=Infinity;
    for(let i=1;i<ring.length;i++){
      const ax=(ring[i-1][0]-lng)*scale,ay=(ring[i-1][1]-lat)*111320;
      const bx=(ring[i][0]-lng)*scale,by=(ring[i][1]-lat)*111320;
      if((ay>0)!==(by>0)&&ax+(bx-ax)*(-ay)/(by-ay)>0)inside=!inside;
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
      const t=len?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)):0;
      nearest=Math.min(nearest,Math.hypot(ax+t*dx,ay+t*dy));
    }
    return {feature:g,distance:inside?0:nearest};
  }).sort((a,b)=>a.distance-b.distance);
  const [first,second]=distances;
  return first&&first.distance<=12&&(!second||second.distance-first.distance>=4)?first.feature:null;
}
globalThis.createMeter=function createMeter(onReading,onStatus,getPhonePosition){
  let device=null,connecting=false,attempt=0,sampleSequence=0;
  const stop=()=>{attempt++;const old=device;device=null;old?.gatt?.disconnect();onStatus(false,'Meter disconnected. Tap to reconnect.');};
  async function connect(){
    if(device?.gatt?.connected){stop();return;}
    if(connecting)return;
    connecting=true;const session=++attempt;
    let selected=false;
    try{
      const picked=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[tdrService]});
      selected=true;device=picked;
      picked.addEventListener('gattserverdisconnected',()=>{if(session===attempt)stop();},{once:true});
      const service=await (await picked.gatt.connect()).getPrimaryService(tdrService);
      const vwcField=await service.getCharacteristic(fieldIds.vwc);
      let gpsBusy=false;
      async function backupPosition(sequence){
        if(gpsBusy)return null;
        gpsBusy=true;
        const started=Date.now();
        const current=()=>session===attempt&&sequence===sampleSequence&&Date.now()-started<=4000;
        const work=(async()=>{
          const values={};
          for(const key of ['fix','lat','lng','fix']){
            if(!current())return null;
            const field=await service.getCharacteristic(fieldIds[key]);
            if(!current())return null;
            const value=fieldText(await field.readValue());
            if(key==='fix'&&!/^[12]$/.test(value))return null;
            values[key]=value;
          }
          const lat=meterCoordinate(values.lat,true),lng=meterCoordinate(values.lng,false);
          return current()&&lat!==null&&lng!==null&&(lat!==0||lng!==0)?{lat,lng,gpsAccuracy:null,gpsSource:'tdr'}:null;
        })().catch(()=>null).finally(()=>{gpsBusy=false;});
        let timer;
        try{return await Promise.race([work,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),4000);})]);}
        finally{clearTimeout(timer);}
      }
      vwcField.addEventListener('characteristicvaluechanged',e=>{
        if(session!==attempt)return;
        const text=fieldText(e.target.value);
        if(!/^\d+(\.\d+)?$/.test(text)||Number(text)>100)return;
        const sequence=++sampleSequence;
        const base={clientId:crypto.randomUUID(),observedAt:new Date().toISOString(),moisturePct:Number(text),platform:'ios',meterId:picked.name||'TDR 350'};
        const position=getPhonePosition?.();
        const save=location=>onReading({...base,lat:location?.lat??null,lng:location?.lng??null,
          gpsAccuracy:location?.gpsAccuracy??null,gpsSource:location?.gpsSource||'phone'});
        if(position){save({...position,gpsSource:'phone'});return;}
        backupPosition(sequence).then(location=>save(location));
      });
      await vwcField.startNotifications();
      if(session===attempt)onStatus(true,'Press READ on the meter. Keep Bluefy open while sampling.');
    }catch(e){
      if(session===attempt){stop();onStatus(false,e.name==='NotFoundError'?(selected?'This device did not expose the TDR service. Select the TDR 350 and retry.':'No meter selected. Check meter power and Bluefy Bluetooth permission, then retry.'):'Connection failed. '+e.message);}
    }finally{connecting=false;}
  }
  return {connect,stop};
}
