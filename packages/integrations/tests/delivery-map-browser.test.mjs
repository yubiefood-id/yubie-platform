import test from 'node:test';import assert from 'node:assert/strict';
test('browser map adapter can be imported on a server and rejects incomplete config without external calls',async()=>{
 const {createDeliveryMap}=await import('../dist/google-maps/browser.js');
 await assert.rejects(()=>createDeliveryMap({apiKey:'',mapId:'',element:null,point:{latitude:0,longitude:0},onChange:()=>{}}),/MAP_UNAVAILABLE/);
});
