const BASE=process.env.SUPABASE_URL;
const SECRET=process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN=(process.env.RFN_AGREEMENT_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const response=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
export async function handler(event){
 if(event.httpMethod!=='GET')return response(405,{error:'Method not allowed'});
 if(!BASE||!SECRET||!ADMIN.length)return response(503,{error:'Admin configuration incomplete'});
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return response(401,{error:'Sign in required'});
 try{
  const verified=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SECRET,Authorization:'Bearer '+token}});
  if(!verified.ok)return response(401,{error:'Invalid login session'});
  const user=await verified.json();
  if(!user.email_confirmed_at||!ADMIN.includes(String(user.email||'').toLowerCase()))return response(403,{error:'Admin access only'});
  const headers={apikey:SECRET,Authorization:'Bearer '+SECRET};
  const file=event.queryStringParameters?.file;
  if(file){
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(file))return response(400,{error:'Invalid file identifier'});
   const q=await fetch(BASE+'/rest/v1/dealer_agreement_acceptances?user_id=eq.'+encodeURIComponent(file)+'&select=pdf_path',{headers});
   if(!q.ok)return response(500,{error:'Unable to find agreement'});
   const records=await q.json();
   if(!records.length)return response(404,{error:'Agreement not found'});
   const path=records[0].pdf_path;
   if(!path||!path.startsWith(file+'/'))return response(500,{error:'Invalid storage record'});
   const pdf=await fetch(BASE+'/storage/v1/object/dealer-agreements/'+path.split('/').map(encodeURIComponent).join('/'),{headers});
   if(!pdf.ok)return response(404,{error:'PDF not found'});
   return {statusCode:200,isBase64Encoded:true,headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="RFN-Dealer-Agreement-'+file+'.pdf"','Cache-Control':'private, no-store'},body:Buffer.from(await pdf.arrayBuffer()).toString('base64')};
  }
  const q=await fetch(BASE+'/rest/v1/dealer_agreement_acceptances?select=user_id,dealer_name,contact_person,email,phone,accepted_at&order=accepted_at.desc&limit=500',{headers});
  if(!q.ok)return response(500,{error:'Unable to read records'});
  return response(200,{agreements:await q.json()});
 }catch(error){console.error('Agreement admin error:',error);return response(500,{error:'Agreement lookup failed'})}
}
