import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
test.beforeEach(async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('yubie.promo.dismissed.v1','1'));});
test('account address book keeps manual entry usable without Maps and saves only explicit submission',async({page})=>{
 // Four viewport transitions, a full-page capture and Axe are one visual scenario.
 test.slow();
 let saved:Record<string,unknown>|null=null;
 await page.route('**/api/auth/session',route=>route.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'usr_synthetic',name:'Pengguna uji',email:null,picture:null},csrfToken:'a'.repeat(64),mapsAvailable:false}}}));
 await page.route('**/api/account/orders',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.route('**/api/account/addresses',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{ok:true,data:[]}});
  saved=route.request().postDataJSON();expect(route.request().headers()['x-csrf-token']).toBe('a'.repeat(64));
  return route.fulfill({status:201,json:{ok:true,data:{id:'adr_synthetic',address:saved,pin:null,isDefault:true}}});
 });
 await page.goto('/account');
 const promo=page.getByRole('button',{name:'Tutup promo',exact:true});if(await promo.isVisible())await promo.click();
 await page.getByRole('button',{name:'Tambah alamat',exact:true}).click();
 await expect(page.getByRole('button',{name:'Masukkan alamat manual',exact:true})).toBeVisible();
 for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await page.setViewportSize({width:375,height:900});await page.screenshot({path:test.info().outputPath('address-editor-375.png'),fullPage:true});
 expect(saved).toBeNull();
 await page.getByLabel('Nama penerima',{exact:true}).fill('Pengguna uji');
 await page.getByLabel('Nomor penerima',{exact:true}).fill('+12025550100');
 await page.getByLabel('Alamat lengkap',{exact:true}).fill('Alamat sintetis untuk pengujian');
 await page.getByLabel('Provinsi',{exact:true}).fill('Jawa Barat');
 await page.getByLabel('Kota / kabupaten',{exact:true}).fill('Bandung');
 await page.getByLabel('Kode pos',{exact:true}).fill('40135');
 await page.getByRole('button',{name:'Simpan alamat',exact:true}).click();
 await expect(page.getByText('Alamat tersimpan.',{exact:true})).toBeVisible();expect(saved).toMatchObject({recipientPhone:'+12025550100',countryCode:'ID'});expect(saved).not.toHaveProperty('pin');
 await expect(page.getByText('Utama',{exact:true})).toBeVisible();
 expect((await new AxeBuilder({page}).include('main').analyze()).violations).toEqual([]);
 await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('location permission is requested only after a click and denial keeps the manual editor usable',async({page})=>{
 await page.addInitScript(()=>{
  const scope=window as unknown as {syntheticGeoCalls:number};scope.syntheticGeoCalls=0;
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(_success:PositionCallback,error:PositionErrorCallback){scope.syntheticGeoCalls++;error({code:1,message:'Synthetic permission denial',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});}}});
 });
 await page.route('**/api/auth/session',route=>route.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'usr_synthetic',name:'Pengguna uji',email:null,picture:null},csrfToken:'a'.repeat(64),mapsAvailable:false}}}));
 await page.route('**/api/account/orders',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.route('**/api/account/addresses',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.goto('/account');const promo=page.getByRole('button',{name:'Tutup promo',exact:true});if(await promo.isVisible())await promo.click();
 await page.getByRole('button',{name:'Tambah alamat',exact:true}).click();
 expect(await page.evaluate(()=>(window as unknown as {syntheticGeoCalls:number}).syntheticGeoCalls)).toBe(0);
 await page.getByRole('button',{name:'Gunakan lokasi saya',exact:true}).click();
 await expect(page.getByText('Lokasi tidak dapat diakses. Cari alamat atau masukkan secara manual.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {syntheticGeoCalls:number}).syntheticGeoCalls)).toBe(1);
 await page.getByRole('button',{name:'Masukkan alamat manual',exact:true}).click();await expect(page.getByLabel('Alamat lengkap',{exact:true})).toBeFocused();
 await expect(page.getByRole('button',{name:'Simpan alamat',exact:true})).toBeEnabled();
});

test('late geolocation preserves typed fields and cannot cross address editing contexts',async({page})=>{
 await page.addInitScript(()=>{
  const scope=window as unknown as {finishSyntheticGeo:()=>void};
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success:PositionCallback){scope.finishSyntheticGeo=()=>success({timestamp:Date.now(),coords:{latitude:-6.9,longitude:107.6,accuracy:50,altitude:null,altitudeAccuracy:null,heading:null,speed:null,toJSON:()=>({})},toJSON:()=>({})});}}});
 });
 await page.route('**/api/auth/session',route=>route.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'usr_synthetic',name:'Pengguna uji'},csrfToken:'a'.repeat(64),mapsAvailable:false}}}));
 await page.route('**/api/account/orders',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.route('**/api/account/addresses',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.goto('/account');await page.getByRole('button',{name:'Tambah alamat',exact:true}).click();
 await page.getByRole('button',{name:'Gunakan lokasi saya',exact:true}).click();await page.getByLabel('Nama penerima',{exact:true}).fill('Nama tetap tersimpan');
 await page.evaluate(()=>(window as unknown as {finishSyntheticGeo:()=>void}).finishSyntheticGeo());await expect(page.getByLabel('Nama penerima',{exact:true})).toHaveValue('Nama tetap tersimpan');
 await page.getByRole('button',{name:'Gunakan lokasi saya',exact:true}).click();
 await page.getByRole('button',{name:'Tambah alamat',exact:true}).click();await page.getByLabel('Nama penerima',{exact:true}).fill('Alamat baru');
 await page.evaluate(()=>(window as unknown as {finishSyntheticGeo:()=>void}).finishSyntheticGeo());
 await expect(page.getByLabel('Nama penerima',{exact:true})).toHaveValue('Alamat baru');await expect(page.getByRole('button',{name:'Konfirmasi titik pengiriman',exact:true})).toHaveCount(0);
});

test('deferred Maps loading uses the latest point and a moved pin ignores an old reverse result',async({page})=>{
 const sdkReady=deferred(),sdkSeen=deferred(),reverseReady=deferred(),reverseSeen=deferred();let reverses=0,confirmed:Record<string,unknown>|null=null;
 await page.addInitScript(()=>{
  let calls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success:PositionCallback){calls++;success({timestamp:Date.now(),coords:{latitude:calls===1?-6.9:-6.8,longitude:107.6,accuracy:50,altitude:null,altitudeAccuracy:null,heading:null,speed:null,toJSON:()=>({})},toJSON:()=>({})});}}});
 });
 await page.route('https://*.googleapis.com/**',route=>route.abort());
 await page.route(/https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/,async route=>{
  sdkSeen.resolve();await sdkReady.promise;await route.fulfill({contentType:'application/javascript',body:`
   window.google={maps:{Map:class{constructor(element,options){this.element=element;window.syntheticMapPoint=options.center;}panTo(point){window.syntheticMapPoint=point;}addListener(event,callback){const button=document.createElement('button');button.type='button';button.textContent='Geser pin uji';button.onclick=()=>callback({latLng:{lat:()=>-6.7,lng:()=>107.7}});this.element.append(button);return{remove:()=>button.remove()};}},marker:{AdvancedMarkerElement:class{constructor(options){this.position=options.position;this.map=options.map;}addListener(){return{remove(){}};}}}}};window.__yubieMapsReady();`});
 });
 await page.route('**/api/auth/session',route=>route.fulfill({json:{ok:true,data:{authenticated:true,user:{id:'usr_synthetic',name:'Pengguna uji'},csrfToken:'a'.repeat(64),mapsAvailable:true}}}));
 await page.route('**/api/account/orders',route=>route.fulfill({json:{ok:true,data:[]}}));await page.route('**/api/account/addresses',route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.route('**/api/locations/reverse-geocode',async route=>{reverses++;if(reverses===2){reverseSeen.resolve();await reverseReady.promise;}await route.fulfill({json:{ok:true,data:{label:reverses===1?'Lokasi awal':'Label lama',latitude:-6.8,longitude:107.6,countryCode:'ID'}}});});
 await page.route('**/api/locations/confirm',async route=>{confirmed=route.request().postDataJSON();await route.fulfill({json:{ok:true,data:{validationToken:'synthetic-pin-proof'}}});});
 await page.goto('/account');await page.getByRole('button',{name:'Tambah alamat',exact:true}).click();await page.getByRole('button',{name:'Gunakan lokasi saya',exact:true}).click();await sdkSeen.promise;
 await expect(page.getByRole('button',{name:'Gunakan lokasi saya',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Gunakan lokasi saya',exact:true}).click();await reverseSeen.promise;sdkReady.resolve();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {syntheticMapPoint:{lat:number;lng:number}}).syntheticMapPoint)).toEqual({lat:-6.8,lng:107.6});
 await page.getByRole('button',{name:'Geser pin uji',exact:true}).click();const finished=page.waitForResponse('**/api/locations/reverse-geocode');reverseReady.resolve();await(await finished).finished();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(page.getByText(/Label lama/)).toHaveCount(0);
 await page.getByRole('button',{name:'Konfirmasi titik pengiriman',exact:true}).click();await expect(page.getByText(/Titik pengiriman sudah dikonfirmasi/)).toBeVisible();expect(confirmed).toEqual({latitude:-6.7,longitude:107.7});
});
