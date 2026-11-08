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
import { json } from '../lib/json.js'
import { resolveActor, actorCanAccessCourse } from '../lib/actor.js'
const course='crossroads-gc'
const categories=['greens','tees','fairways','lawns']
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export async function fieldAreaFeatures(env){
  const {results}=await env.DB.prepare('SELECT * FROM field_areas WHERE course_id=? ORDER BY id').bind(course).all()
  return results.map(r=>({type:'Feature',properties:{green:r.id,name:r.name,category:r.category,revision:r.revision,topBearingDeg:r.top_bearing},geometry:JSON.parse(r.geometry_json)}))
}
export async function fieldAreaCatalog(env){
  return new Response(JSON.stringify({type:'FeatureCollection',features:await fieldAreaFeatures(env)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
}
export function validateBoundary(points){
  if(!Array.isArray(points)||points.length<3||points.length>600)throw Error('Use 3–600 perimeter points.')
  for(const p of points)if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0]+81.234)>0.06||Math.abs(p[1]-32.132)>0.06)throw Error('Each point must have valid coordinates near Crosswinds.')
  const unique=new Set(points.map(p=>p.join(',')))
  if(unique.size!==points.length)throw Error('Remove repeated points. The boundary closes automatically.')
  const ring=[...points,points[0]]
  const xy=points.map(p=>[(p[0]-points[0][0])*94180,(p[1]-points[0][1])*111320])
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  const touches=(a,b,c)=>Math.abs(cross(a,b,c))<1e-8&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8
  let area=0
  for(let i=0;i<xy.length;i++){
    const a=xy[i],b=xy[(i+1)%xy.length]
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<0.5)throw Error('Perimeter points must be at least half a metre apart.')
    area+=a[0]*b[1]-b[0]*a[1]
    for(let j=i+2;j<xy.length;j++){
      if(i===0&&j===xy.length-1)continue
      const c=xy[j],d=xy[(j+1)%xy.length]
      if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||touches(a,b,c)||touches(a,b,d)||touches(c,d,a)||touches(c,d,b))throw Error('The perimeter crosses itself. Undo points and walk around the edge in order.')
    }
  }
  if(Math.abs(area)/2<5)throw Error('The boundary must enclose at least 5 square metres.')
  return {type:'Polygon',coordinates:[ring]}
}
export async function saveAreaDraft(env,req,user){
  const body=await req.json().catch(()=>null)
  if(!body||!uuid.test(body.id)||!categories.includes(body.category)||typeof body.name!=='string'||!body.name.trim()||body.name.length>80||
    !Number.isInteger(body.baseRevision)||body.baseRevision<0||!Number.isFinite(body.topBearingDeg)||body.topBearingDeg<0||body.topBearingDeg>=360)return json({error:'Invalid mapping draft.'},400)
  body.gpsSource=['phone','tdr'].includes(body.gpsSource)?body.gpsSource:'unknown'
  const accuracy=Array.isArray(body.accuracies)?body.accuracies:[]
  body.accuracies=Array.isArray(body.points)?body.points.map((_,i)=>Number.isFinite(accuracy[i])&&accuracy[i]>=0?accuracy[i]:null):[]
  let geometry
  try{geometry=validateBoundary(body.points)}catch(e){return json({error:e.message},400)}
  body.topBearingDeg=firstPointBearing(body.points)
  const target=body.targetId==null?null:await env.DB.prepare('SELECT * FROM field_areas WHERE id=? AND course_id=?').bind(body.targetId,course).first()
  if(body.targetId!=null&&(!target||target.name!==body.name||target.category!==body.category||target.revision!==body.baseRevision))return json({error:'The area changed. Refresh before mapping it again.'},409)
  if(!target&&(body.baseRevision!==0||/^Green \d+$|^Par 3 Green \d+$|^Practice Green$|^Small Practice Green$/i.test(body.name.trim())))return json({error:'Use Correct existing area for an existing green.'},400)
  if(!target&&await env.DB.prepare('SELECT id FROM field_areas WHERE course_id=? AND name=?').bind(course,body.name.trim()).first())return json({error:'That name already exists. Choose Correct existing area.'},409)
  const previous=await env.DB.prepare('SELECT * FROM field_area_drafts WHERE id=?').bind(body.id).first()
  const geometryJson=JSON.stringify(geometry)
  if(previous)return previous.author_id===user.id&&previous.course_id===course&&previous.geometry_json===geometryJson&&previous.name===body.name.trim()&&previous.target_id===(target?.id??null)&&previous.base_revision===body.baseRevision&&previous.category===body.category&&previous.top_bearing===body.topBearingDeg&&previous.gps_source===body.gpsSource&&previous.accuracy_json===JSON.stringify(body.accuracies)?json({id:previous.id,status:previous.status}):json({error:'Draft ID conflict.'},409)
  await env.DB.prepare('INSERT INTO field_area_drafts(id,course_id,target_id,base_revision,name,category,geometry_json,top_bearing,author_id,created_at,gps_source,accuracy_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(body.id,course,target?.id??null,body.baseRevision,body.name.trim(),body.category,geometryJson,body.topBearingDeg,user.id,new Date().toISOString(),body.gpsSource,JSON.stringify(body.accuracies)).run()
  return json({id:body.id,status:'pending'})
}
export async function areaReviewApi(env,req){
  const actor=await resolveActor(req,env)
  if(!actor||!actorCanAccessCourse(actor,course)||!['owner_admin','superintendent'].includes(actor.role)||(!actor.synthetic&&actor.status!=='active'))return json({error:'Sign in as a superintendent or owner to review maps.'},403)
  if(req.method==='GET'){
    const {results}=await env.DB.prepare('SELECT id,target_id AS targetId,base_revision AS baseRevision,name,category,geometry_json,top_bearing AS topBearingDeg,created_at AS createdAt,gps_source AS gpsSource,accuracy_json FROM field_area_drafts WHERE course_id=? AND status=? ORDER BY created_at').bind(course,'pending').all()
    return json({drafts:results.map(r=>{const {geometry_json,accuracy_json,...rest}=r;return {...rest,accuracies:accuracy_json?JSON.parse(accuracy_json):[],geometry:JSON.parse(geometry_json)}})})
  }
  if(req.method!=='POST')return json({error:'Unsupported method'},405)
  if(!actor.synthetic&&req.headers.get('Origin')!==new URL(req.url).origin)return json({error:'Invalid request origin'},403)
  const b=await req.json().catch(()=>null)
  if(!b||!uuid.test(b.id)||!['approve','reject'].includes(b.action))return json({error:'Invalid decision'},400)
  const draft=await env.DB.prepare('SELECT * FROM field_area_drafts WHERE course_id=? AND id=?').bind(course,b.id).first()
  if(!draft)return json({error:'Draft not found'},404)
  if(draft.status!=='pending')return json({status:draft.status})
  const now=new Date().toISOString(),reviewer=actor.id||'admin'
  if(b.action==='reject'){
    await env.DB.prepare("UPDATE field_area_drafts SET status='rejected',reviewed_by=?,reviewed_at=? WHERE id=? AND status='pending'").bind(reviewer,now,b.id).run()
    return json(await env.DB.prepare('SELECT status FROM field_area_drafts WHERE id=?').bind(b.id).first())
  }
  const update=draft.target_id!=null?
    env.DB.prepare("UPDATE field_areas SET geometry_json=?,top_bearing=?,revision=revision+1,last_draft_id=? WHERE course_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM field_area_drafts WHERE id=? AND status='pending')")
      .bind(draft.geometry_json,draft.top_bearing,draft.id,course,draft.target_id,draft.base_revision,draft.id):
    env.DB.prepare("INSERT OR IGNORE INTO field_areas(course_id,name,category,geometry_json,top_bearing,last_draft_id) SELECT course_id,name,category,geometry_json,top_bearing,id FROM field_area_drafts WHERE id=? AND status='pending'")
      .bind(draft.id)
  await env.DB.batch([update,env.DB.prepare("UPDATE field_area_drafts SET status='approved',reviewed_by=?,reviewed_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM field_areas WHERE course_id=? AND last_draft_id=?)").bind(reviewer,now,draft.id,course,draft.id)])
  const result=await env.DB.prepare('SELECT status FROM field_area_drafts WHERE id=?').bind(draft.id).first()
  return result.status==='approved'?json(result):json({error:'Another map change was approved first, or the name already exists. Review a fresh draft.'},409)
}

