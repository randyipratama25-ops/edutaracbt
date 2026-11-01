import { staff } from "../../../lib/results/server";
import { body, failure, HttpError, json, requireOrigin } from "../../../lib/http";
import { drillSchema } from "../../../lib/operational/health";
async function run(input:Record<string,unknown>){
 const a=await staff();if(a.role!=="admin")throw new HttpError(403,"Hanya Admin.");
 const r=await a.client.rpc("operational_health",{input});
 if(r.error)throw new HttpError(422,"Data operasional belum dapat diproses. Periksa backup, checksum, dan waktu latihan.");
 return json(r.data);
}
export async function GET(){try{return await run({action:"get"});}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireOrigin(request);return await run(drillSchema.parse(await body(request)));}catch(e){return failure(e);}}
