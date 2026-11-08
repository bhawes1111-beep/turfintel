globalThis.createPhoneGps=function createPhoneGps(onStatus){
  let watch=null,latest=null,requested=false;
  const waiting=new Set();
  function fail(message){for(const item of [...waiting])item.reject(Error(message));}
  function start(){
    requested=true;
    if(watch!==null)return;
    if(!navigator.geolocation){onStatus('Phone location is unavailable in this browser.');fail('Phone location is unavailable in this browser.');return;}
    onStatus('Waiting for phone GPS. Allow precise location.');
    watch=navigator.geolocation.watchPosition(p=>{
      if(latest&&p.timestamp<latest.timestamp)return;
      latest=p;
      onStatus('Phone GPS · ±'+Math.round(p.coords.accuracy)+' m');
      const result=snapshot(2000);
      if(result)for(const item of [...waiting])item.resolve(result);
    },e=>{
      latest=null;
      const message=e.code===1?'Allow precise location for this browser in phone settings.':'Phone GPS unavailable. Move outside and retry.';
      onStatus(message);fail(message);
      if(e.code===1)stop();
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }
  function stop(){if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;latest=null;fail('Location paused. Return to the app and try again.');}
  function snapshot(maxAge=10000){
    if(!latest||Date.now()-latest.timestamp>maxAge||Date.now()<latest.timestamp-1000||
      !Number.isFinite(latest.coords.latitude)||!Number.isFinite(latest.coords.longitude))return null;
    return {lat:latest.coords.latitude,lng:latest.coords.longitude,gpsAccuracy:latest.coords.accuracy,gpsSource:'phone',observedAt:new Date(latest.timestamp).toISOString()};
  }
  function point(){
    start();
    const result=snapshot(2000);
    if(result)return Promise.resolve(result);
    return new Promise((resolve,reject)=>{
      const item={resolve:value=>{clearTimeout(timer);waiting.delete(item);resolve(value);},reject:error=>{clearTimeout(timer);waiting.delete(item);reject(error);}};
      const timer=setTimeout(()=>item.reject(Error('Waiting for a current phone GPS location. Try again.')),15000);
      waiting.add(item);
    });
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(requested)start();});
  return {start,snapshot,point};
}
