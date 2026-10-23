import test from 'node:test';import assert from 'node:assert/strict';
import * as integrations from '../dist/index.js';
const token='00000000-0000-4000-8000-000000000001';
test('Places New requests are minimal, Indonesia-restricted and use fixed endpoints',async()=>{
 const captured=[];const provider=new integrations.GoogleDeliveryLocationProvider({apiKey:'synthetic',fetchFn:async(url,init)=>{captured.push({url,init});return Response.json({suggestions:[{placePrediction:{placeId:'ChIJ_synthetic',text:{text:'Lokasi uji'}}}]});}});
 const rows=await provider.autocomplete({query:'Alamat uji',sessionToken:token});assert.deepEqual(rows,[{id:'ChIJ_synthetic',label:'Lokasi uji'}]);
 const body=JSON.parse(captured[0].init.body);assert.deepEqual(body.includedRegionCodes,['id']);assert.equal(body.sessionToken,token);assert.equal(captured[0].url,'https://places.googleapis.com/v1/places:autocomplete');assert.equal(captured[0].init.redirect,'error');
 assert.equal(captured[0].init.headers['X-Goog-FieldMask'],'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text');
});
test('foreign, invalid and unavailable locations never become approved Indonesian delivery results',async()=>{
 const provider=new integrations.GoogleDeliveryLocationProvider({apiKey:'synthetic',fetchFn:async()=>Response.json({id:'ChIJ_synthetic',formattedAddress:'Synthetic',location:{latitude:1,longitude:103},addressComponents:[{types:['country'],shortText:'SG'}]})});
 assert.equal(await provider.details({placeId:'ChIJ_synthetic',sessionToken:token}),null);
 await assert.rejects(()=>provider.details({placeId:'https://internal.invalid/private',sessionToken:token}),/LOCATION_REQUEST_INVALID/);
 const down=new integrations.GoogleDeliveryLocationProvider({apiKey:'synthetic',fetchFn:async()=>{throw Error('secret provider response');}});await assert.rejects(()=>down.autocomplete({query:'Alamat',sessionToken:token}),e=>e.message==='LOCATION_PROVIDER_UNAVAILABLE');
});
