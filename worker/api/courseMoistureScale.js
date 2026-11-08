import { DEFAULT_MOISTURE_DISPLAY_SETTINGS } from '../../src/utils/moisture/moistureDisplayConfig.js'
import { json } from '../lib/json.js'
import { resolveActor, actorCanAccessCourse, actorHasPermission } from '../lib/actor.js'

export async function readCourseScale(env,course){
  const row=await env.DB.prepare('SELECT scale_json,revision,updated_at FROM course_moisture_scale WHERE course_id=?').bind(course).first()
  return row?{scale:JSON.parse(row.scale_json),revision:row.revision,updatedAt:row.updated_at}
    :{scale:DEFAULT_MOISTURE_DISPLAY_SETTINGS.moisture,revision:0,updatedAt:null}
}
export async function courseScaleApi(env,req,url){
  const actor=await resolveActor(req,env),course=url.searchParams.get('courseId')
  if(!course||!actor||!actorCanAccessCourse(actor,course))return json({error:'Course access required'},403)
  if(req.method==='GET')return json(await readCourseScale(env,course))
  if(req.method!=='POST'||!actorHasPermission(actor,'canEditMoisture'))return json({error:'Moisture edit permission required'},403)
  const body=await req.json().catch(()=>null),scale=body?.scale,revision=body?.revision
  if(!Number.isSafeInteger(revision)||revision<0||!Array.isArray(scale?.points)||scale.points.length!==6||
    !scale.points.every(n=>Number.isFinite(n)&&n>=0&&n<=100)||!Array.isArray(scale.colors)||scale.colors.length!==6||
    !scale.colors.every(c=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c)))return json({error:'Enter six VWC values from 0 to 100 and six colors'},400)
  const now=new Date().toISOString(),data=JSON.stringify({points:scale.points,colors:scale.colors})
  const statement=revision===0?env.DB.prepare('INSERT OR IGNORE INTO course_moisture_scale VALUES(?,?,1,?)').bind(course,data,now):
    env.DB.prepare('UPDATE course_moisture_scale SET scale_json=?,revision=revision+1,updated_at=? WHERE course_id=? AND revision=?').bind(data,now,course,revision)
  const result=await statement.run()
  if(!result.meta.changes)return json({error:'Course settings changed in another browser. Reload Settings to review them before saving.'},409)
  return json({scale,revision:revision+1,updatedAt:now})
}
