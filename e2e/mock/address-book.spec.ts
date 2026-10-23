import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('account address book keeps manual entry usable without Maps and saves only explicit submission',async({page})=>{
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
