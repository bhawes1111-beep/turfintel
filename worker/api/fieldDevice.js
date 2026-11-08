import { readCourseScale } from './courseMoistureScale.js'
import { json } from '../lib/json.js'
import { resolveActor, actorCanAccessCourse, actorHasPermission } from '../lib/actor.js'
import { fieldAreaFeatures, saveAreaDraft } from './fieldAreas.js'
import { createMoisture } from './moisture.js'

const course = 'crossroads-gc'
const permitted = user => user && user.status === 'active' &&
  actorCanAccessCourse(user,course) && actorHasPermission(user,'canEditMoisture')
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')

const managesCrew = user => user?.role==='owner_admin' || user?.role==='superintendent'

export async function fieldDeviceApi(env, req, path) {
  if(path==='/api/field-device/phones' && req.method==='GET'){
    const actor=await resolveActor(req,env)
    if(!actor)return json({error:'Unauthorized'},401)
    if(!permitted(actor)&&!actor.synthetic)return json({error:'Moisture access required'},403)
    const query='SELECT d.fingerprint,d.linked_at AS linkedAt,COALESCE(u.display_name,u.email) AS ownerName FROM field_upload_devices d JOIN users u ON u.id=d.user_id WHERE d.revoked=0'
    const stmt=managesCrew(actor)?env.DB.prepare(query+' ORDER BY d.linked_at DESC'):env.DB.prepare(query+' AND d.user_id=? ORDER BY d.linked_at DESC').bind(actor.id)
    const {results}=await stmt.all()
    return json({phones:results})
  }
  if (path === '/api/field-device/link') {
    if (req.method !== 'POST' || req.headers.get('Origin') !== new URL(req.url).origin ||
        !req.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Invalid request'},403)
    const user = await resolveActor(req,env)
    if (!permitted(user) || !user.id) return json({error:'A TurfIntel user with moisture access is required'},403)
    const body = await req.json().catch(()=>null)
    if (!/^[a-f0-9]{64}$/.test(body?.fingerprint??'') || !['link','revoke'].includes(body.action)) return json({error:'Invalid device'},400)
    const existing = await env.DB.prepare('SELECT user_id FROM field_upload_devices WHERE fingerprint=?').bind(body.fingerprint).first()
    if (existing && existing.user_id !== user.id && !(body.action==='revoke' && managesCrew(user))) return json({error:'Phone belongs to another account'},403)
    if(body.action==='revoke'){
      await env.DB.prepare('UPDATE field_upload_devices SET revoked=1 WHERE fingerprint=? AND user_id=?').bind(body.fingerprint,existing?.user_id??user.id).run()
    }else{
      const result=await env.DB.prepare('INSERT INTO field_upload_devices(fingerprint,user_id,linked_at) VALUES(?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET revoked=0,linked_at=CASE WHEN revoked=1 THEN excluded.linked_at ELSE linked_at END WHERE user_id=excluded.user_id').bind(body.fingerprint,user.id,new Date().toISOString()).run()
      if(!result.meta.changes)return json({error:'Link conflict'},409)
    }
    return json({ok:true})
  }
  const status=path==='/api/field-device/status' && req.method==='GET'
  const map=path==='/api/field-device/map' && req.method==='GET'
  const draft=path==='/api/field-device/area-draft' && req.method==='POST'
  if(!draft && !status && !map && !(path==='/api/field-device/reading' && req.method==='POST'))return json({error:'Unknown field action'},404)
  const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if(!token)return json({error:'Device link required'},401)
  const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))))
  const user=await env.DB.prepare('SELECT u.id,u.display_name,u.role,u.status,u.course_access FROM field_upload_devices d JOIN users u ON u.id=d.user_id WHERE d.fingerprint=? AND d.revoked=0').bind(digest).first()
  if(!permitted(user))return json({error:'Device link required'},401)
  if(draft)return saveAreaDraft(env,req,user)
  if(map)return todayFieldMap(env,new URL(req.url).searchParams.get("greens")==="all",false,new URL(req.url).searchParams.get("areas")==="all")
  if(status)return json({owner:user.id,moistureScale:await readCourseScale(env,course)})
  const body=await req.json().catch(()=>null)
  if(!body || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.clientId) ||
    !Number.isFinite(body.moisturePct)||body.moisturePct<0||body.moisturePct>100 ||
    typeof body.observedAt!=='string'||!Number.isFinite(Date.parse(body.observedAt)) ||
    (body.hole!=null && (!Number.isInteger(body.hole)||body.hole<1||body.hole>18)) ||
    ((body.lat==null)!==(body.lng==null)) || (body.lat!=null&&(!Number.isFinite(body.lat)||Math.abs(body.lat)>90||!Number.isFinite(body.lng)||Math.abs(body.lng)>180)))return json({error:'Invalid meter reading'},400)
  const area=body.areaId==null?null:await env.DB.prepare('SELECT id,name FROM field_areas WHERE id=? AND course_id=?').bind(body.areaId,course).first()
  if(body.areaId!=null&&!area)return json({error:'Unknown mapped area'},400)
  const extra=/^Par 3 Green [1-9]$/.test(body.location)||['Practice Green','Small Practice Green'].includes(body.location)
  if(extra && body.hole!=null)return json({error:'Conflicting green assignment'},400)
  const reading={courseId:course,clientId:body.clientId,observedAt:body.observedAt,clientObservedAt:body.observedAt,
    observedBy:user.display_name||'Field crew',location:area?area.name:extra?body.location:body.hole?'Green '+body.hole:'Unassigned TDR reading',hole:area?(area.id<=18?area.id:null):body.hole,
    gpsAccuracy:body.gpsSource==="phone"&&Number.isFinite(body.gpsAccuracy)?body.gpsAccuracy:null,moisturePct:body.moisturePct,lat:body.lat,lng:body.lng,meterId:String(body.meterId??'TDR 350').slice(0,80),notes:(body.platform==='ios'?'iPhone':'Android')+' companion · '+(body.gpsSource==='phone'?(body.lat==null?'Phone GPS unavailable':'Phone GPS'):(body.lat==null?'Meter GPS unavailable':'Meter GPS'))}
  const response=await createMoisture(env,new Request(req.url,{method:'POST',body:JSON.stringify(reading)}))
  if(!response.ok)return json({error:'Could not save reading'},response.status)
  const saved=await response.json()
  if(saved.courseId!==course||saved.observedAt!==reading.observedAt||saved.moisturePct!==reading.moisturePct)return json({error:'Reading ID conflict'},409)
  return json({id:saved.id,courseId:course,clientId:saved.clientId})
}

export async function todayFieldMap(env,allGreens,board=false,allAreas=false){
  const now=new Date()
  const courseDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'})
  const day=courseDay.format(now)
  const {results}=await env.DB.prepare(`SELECT id,client_id AS clientId,location,hole,observed_at AS observedAt,
    moisture_pct AS vwc,lat,lng FROM moisture_observations WHERE course_id=? AND moisture_pct BETWEEN 0 AND 100
    AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 AND NOT(lat=0 AND lng=0)
    AND julianday(observed_at) BETWEEN julianday(?) AND julianday(?) ORDER BY julianday(observed_at) DESC,id LIMIT 10001`)
    .bind(course,new Date(day+"T00:00:00Z").toISOString(),new Date(Date.parse(day+"T00:00:00Z")+30*3600000).toISOString()).all()
  if(results.length>10000)return json({error:'Map reading limit exceeded'},422)
  const features=allAreas?await fieldAreaFeatures(env):[]
  const areaByName=new Map(features.map(f=>[f.properties.name,f.properties.green]))
  const points=[]
  for(const row of results){
    const match=/^Green (\d{1,2})$/i.exec(row.location)
    let green=match?Number(match[1]):/^Greens?$/i.test(row.location)?row.hole:null
    if(allGreens){
      const par3=/^Par 3 Green ([1-9])$/i.exec(row.location)
      if(par3) green=18+Number(par3[1])
      else if(row.location==='Practice Green')green=28
      else if(row.location==='Small Practice Green')green=29
    }
    if(allAreas)green=areaByName.get(row.location)??green
    const time=Date.parse(row.observedAt)
    if(!Number.isInteger(green)||green<1||(!allAreas&&green>(allGreens?29:18))||!Number.isFinite(time)||courseDay.format(time)!==day)continue
    const point={green,time,vwc:row.vwc,lat:row.lat,lng:row.lng}
    if(!board){point.id=row.id;point.clientId=row.clientId}
    points.push(point)
  }
  return new Response(JSON.stringify({...(allAreas?{features}:{}),day,asOf:now.toISOString(),futureCount:points.filter(p=>p.time>+now).length,points,...(board?{moistureScale:await readCourseScale(env,course)}:{})}),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}})
}
