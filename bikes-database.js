(function(){
 const U='https://buprdivnomupwvazrlhl.supabase.co',K='sb_publishable_HJ_AjabA3Uo26xp2R9O4SA_jY8ODq1z';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function run(){
  const r=await fetch(`${U}/rest/v1/bikes?featured=eq.true&status=neq.hidden&select=*&order=name.asc`,{headers:{apikey:K},cache:'no-store'});const bikes=await r.json();if(!r.ok)throw new Error(bikes.message||'Bike request failed');
  const cards=[...document.querySelectorAll('.sale-bike')];
  for(const b of bikes){
   let card=cards.find(c=>String(c.dataset.name||'').trim().toLowerCase()===String(b.name||'').trim().toLowerCase());
   if(!card)continue;
   card.dataset.retailPrice=Number(b.retail_price||0);card.dataset.dealerPrice=Number(b.dealer_price||0);
   card.querySelector('.bike-card-name')&&(card.querySelector('.bike-card-name').textContent=b.name);
   card.querySelector('.bike-card-sub')&&(card.querySelector('.bike-card-sub').textContent=b.description||'RFN electric dirt bike.');
   const img=card.querySelector('.bike-thumb');if(img&&b.image_url)img.src=b.image_url;
   const prices=card.querySelectorAll('.price-card b');if(prices[0])prices[0].textContent=`$${Number(b.retail_price||0)}`;if(prices[1])prices[1].textContent=`$${Number(b.dealer_price||0)}`;
   const link=card.querySelector('.parts-btn');if(link&&b.catalog_url)link.href=b.catalog_url;
   const out=b.status==='out_of_stock'||Number(b.quantity||0)<=0;card.classList.toggle('out-of-stock-bike',out);
   const add=card.querySelector('.add-bike-btn,.out-stock-btn');if(add){add.disabled=out;add.textContent=out?'Out Of Stock':'Add Bike To Cart';add.classList.toggle('out-stock-btn',out);add.classList.toggle('add-bike-btn',!out)}
  }
 }
 run().catch(console.error);
})();
