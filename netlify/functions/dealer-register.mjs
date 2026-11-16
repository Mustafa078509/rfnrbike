import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BASE = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const SITE = process.env.SITE_URL;
const AGREEMENT_ID = 'RFN-USA-DEALER-AGREEMENT-2026-02-17';
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(body)});
const serviceHeaders=()=>({apikey:SECRET,Authorization:'Bearer '+SECRET});
const plain=s=>String(s??'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\x0A\x20-\x7E]/g,' ');
function addText(doc,text,size=10,header=false){
 const lines=text.split('\n'),margin=43,pageWidth=612;
 return doc.embedFont(StandardFonts.Helvetica).then(async font=>{
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page=doc.addPage([612,792]),y=745;
  if(header){page.drawText('RFN USA INC. - DEALER AGREEMENT',{x:margin,y,size:14,font:bold,color:rgb(.17,.55,.78)});y-=35;}
  for(const line of lines){
   const words=plain(line).split(/\s+/);
   const wrapped=[];
   let current='';
   for(const word of words){
    const test=current?current+' '+word:word;
    if(font.widthOfTextAtSize(test,size)>pageWidth-2*margin&&current){wrapped.push(current);current=word;} else current=test;
   }
   wrapped.push(current);
   for(const segment of wrapped){
    if(y<55){page=doc.addPage([612,792]);y=748;}
    if(segment)page.drawText(segment,{x:margin,y,size,font,color:rgb(.12,.19,.24)});
    y-=size+4;
   }
   y-=3;
  }
 });
}
function valid(value,max=255){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=max}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
 if(!BASE||!SECRET||!PUBLIC_KEY||!SITE)return reply(503,{error:'Dealer agreement configuration incomplete'});
 let req;
 try{req=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'Invalid registration request'})}
 const details=req.dealer||{};
 const email=String(details.email||'').trim().toLowerCase();
 const password=String(req.password||'');
 if(req.accepted!==true||req.agreement_id!==AGREEMENT_ID)return reply(422,{error:'Please scroll through the entire agreement and agree before registering.'});
 if(!valid(details.dealer_name)||!valid(details.contact_person)||!valid(details.contact_title)||!valid(details.phone)||!valid(details.address,500)||!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return reply(422,{error:'Complete every registration field and use a password of at least eight characters.'});
 try{
  const source=await fetch(SITE.replace(/\/$/,'')+'/assets/rfn-dealer-agreement.txt',{cache:'no-store'});
  if(!source.ok)throw Error('Agreement source missing from deployment');
  const original=await source.text();
  if(original.length<4000||!original.includes('Indemnification:')||!original.includes('Termination:'))throw Error('Agreement source validation failed');
  const sha=crypto.createHash('sha256').update(original,'utf8').digest('hex');
  const acceptedAt=new Date().toISOString();
  const metadata={dealer_name:details.dealer_name.trim(),contact_person:details.contact_person.trim(),full_name:details.contact_person.trim(),contact_title:details.contact_title.trim(),phone:details.phone.trim(),address:details.address.trim(),email,role:'dealer',agreement_id:AGREEMENT_ID,agreement_sha256:sha,agreement_accepted:true,agreement_accepted_at:acceptedAt};
  const signup=await fetch(BASE+'/auth/v1/signup',{method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,data:metadata})});
  const result=await signup.json().catch(()=>({}));
  if(!signup.ok)return reply(signup.status,{error:result.msg||result.message||result.error_description||'Registration failed'});
  const user=result.user||result.session?.user;
  if(!user?.id)return reply(409,{error:'Registration request received, but account could not be confirmed. Contact RFN USA Sales.'});
  const record={user_id:user.id,dealer_name:metadata.dealer_name,contact_person:metadata.contact_person,contact_title:metadata.contact_title,email,phone:metadata.phone,address:metadata.address,agreement_id:AGREEMENT_ID,agreement_sha256:sha,accepted_at:acceptedAt,pdf_path:user.id+'/RFN-Dealer-Agreement.pdf'};
  const doc=await PDFDocument.create();
  await addText(doc,original,9,true);
  const receipt=['ELECTRONIC DEALER AGREEMENT ACCEPTANCE','','Dealer: '+record.dealer_name,'Authorized representative: '+record.contact_person,'Title: '+record.contact_title,'Email: '+email,'Phone: '+record.phone,'Business address: '+record.address,'Accepted at (UTC): '+acceptedAt,'Agreement ID: '+AGREEMENT_ID,'Agreement SHA-256: '+sha,'Supabase user ID: '+user.id,'','Acceptance: I have read and agree to the full RFN USA Dealer Agreement.'].join('\n');
  await addText(doc,receipt,10,true);
  const bytes=await doc.save();
  const path=record.pdf_path.split('/').map(encodeURIComponent).join('/');
  const uploaded=await fetch(BASE+'/storage/v1/object/dealer-agreements/'+path,{method:'POST',headers:{...serviceHeaders(),'Content-Type':'application/pdf','x-upsert':'false'},body:Buffer.from(bytes)});
  if(!uploaded.ok)throw Error('Could not save agreement PDF: '+uploaded.status);
  const saved=await fetch(BASE+'/rest/v1/dealer_agreement_acceptances',{method:'POST',headers:{...serviceHeaders(),'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(record)});
  if(!saved.ok)throw Error('Could not save agreement record: '+saved.status);
  return reply(200,{success:true,requiresEmailConfirmation:!(result.access_token||result.session?.access_token)});
 }catch(err){console.error('Dealer agreement registration failure:',err);return reply(503,{error:'Registration or agreement archive could not be completed. If you already submitted, contact RFN USA Sales before trying again.'})}
}
