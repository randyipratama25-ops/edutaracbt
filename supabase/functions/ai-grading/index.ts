import { createClient } from "@supabase/supabase-js";
import { generateGrade,safeAIError } from "./engine.ts";
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async(request:Request)=>{
 try{
  if(request.method!=="POST")return reply({error:"Metode tidak diizinkan"},405);
  const token=request.headers.get("authorization")||"";
  if(!token.startsWith("Bearer "))return reply({error:"Login diperlukan"},401);
  const text=await request.text();if(text.length>50000)return reply({error:"Data terlalu besar"},413);
  const input=JSON.parse(text);
  const url=Deno.env.get("SUPABASE_URL")!;
  const user=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await user.auth.getUser();if(authError||!auth.user)return reply({error:"Login diperlukan"},401);
  const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  if(input.action==="test"){
   const gate=await user.rpc("ai_command",{input:{action:"test_authorize",provider:input.provider}});
   if(gate.error)return reply({error:"Hanya Admin dengan konfigurasi tersimpan yang dapat menguji koneksi."},403);
   const c=await admin.rpc("ai_worker",{input:{action:"test_credentials",actor_id:auth.user.id,provider:input.provider}});
   if(c.error)return reply({error:"Konfigurasi tidak tersedia"},422);
   let ok=false;
   try{await generateGrade(c.data.provider,c.data.model,c.data.key,{question:"Hitung 1+1",rubric:"Jawaban 2 mendapat 1 poin",answer:"2",max_points:1,criteria:[]},true);ok=true;}
   catch(e){return reply({error:safeAIError(e)},422);}
   const saved=await admin.rpc("ai_worker",{input:{action:"tested",actor_id:auth.user.id,provider:input.provider,version:c.data.version}});
   if(saved.error)return reply({error:"Konfigurasi berubah selama pengujian. Uji kembali."},409);
   return reply({ok});
  }
  const queued=await user.rpc("ai_command",{input:{...input,action:"enqueue"}});
  if(queued.error)return reply({error:queued.error.message},422);
  const results=await Promise.all(queued.data.map(async(j:{id:string})=>{
   const claim=await admin.rpc("ai_worker",{input:{action:"claim",id:j.id,actor_id:auth.user.id}});
   if(claim.error||!claim.data?.claimed)return {id:j.id,status:claim.data?.status||"unavailable"};
   const c=claim.data;let output;
   try{output={...await generateGrade(c.provider,c.model,c.key,c.payload),ok:true};}
   catch(e){output={ok:false,error:safeAIError(e)};}
   const done=await admin.rpc("ai_worker",{input:{action:"finish",id:j.id,actor_id:auth.user.id,lease:c.lease,output}});
   return {id:j.id,status:done.error?"unavailable":done.data.status};
  }));
  return reply({items:results});
 }catch{return reply({error:"Permintaan AI tidak dapat diproses. Periksa konfigurasi atau coba lagi."},422);}
});
