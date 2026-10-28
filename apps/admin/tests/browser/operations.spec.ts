import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { issueAdminSession } from "../../dist/session.js";
async function login(context: import('@playwright/test').BrowserContext,subject="TEST_ONLY_OPERATOR") {
 const token=issueAdminSession({sub:subject,role:subject==="TEST_ONLY_VIEWER"?"viewer":"operator",exp:Date.now()+60000},"TEST_ONLY_BROWSER_SECRET_NOT_PRODUCTION");
 await context.addCookies([{name:"yubie_ops",value:token,domain:"localhost",path:"/",secure:true,httpOnly:true,sameSite:"Strict"}]);
}
test('private operations dashboard renders real isolated DB data and forms without overflow',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await login(context);await page.goto('/');await expect(page.getByRole('heading',{name:'Ringkasan operasional'})).toBeVisible();await expect(page.getByText('Admission checkout')).toBeVisible();await expect(page.getByText('disabled',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Lot dan stok',exact:true}).click();await expect(page.getByRole('heading',{name:'Intake hitung fisik'})).toBeVisible();await expect(page.getByRole('button',{name:'Validasi dan dry-run'})).toBeDisabled();
 await page.getByRole('button',{name:'Ketersediaan SKU',exact:true}).click();await expect(page.getByRole('cell',{name:'YBS-7X45',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Ledger stok',exact:true}).click();await expect(page.getByRole('heading',{name:'Ledger stok'})).toBeVisible();
 await page.getByRole('button',{name:'Pengiriman',exact:true}).click();await expect(page.getByLabel('Penanggung biaya')).toBeVisible();
 await page.getByRole('button',{name:'Hak staf',exact:true}).click();await expect(page.getByLabel('Google subject staf')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);const scan=await new AxeBuilder({page}).analyze();expect(scan.violations).toEqual([]);
});
test('shipping approval is a two-person transaction and freeze stays non-chargeable',async({page,context},info)=>{
 await login(context);await page.goto('/');await page.getByRole('button',{name:'Pengiriman',exact:true}).click();
 await page.getByLabel('Alasan freeze',{exact:true}).fill('TEST_ONLY shipping '+info.project.name);await page.getByRole('button',{name:'Mulai freeze operasional baru'}).click();await expect(page.getByText(/Freeze tercatat sampai/)).toBeVisible();
 const city='TEST_ONLY_CITY_'+info.project.name;await page.getByLabel('Kota/kabupaten disetujui (pisahkan koma)').fill(city);
 for(const label of ['Layanan dan batas cakupan','Penanggung biaya','Referensi persetujuan','Referensi bukti asli','Penanggung jawab verifikasi'])await page.getByLabel(label,{exact:true}).fill('TEST_ONLY_DOCUMENT');
 const local=(delta:number)=>new Date(Date.now()+delta+7*3600000).toISOString().slice(0,16);
 await page.getByLabel('Mulai (waktu perangkat)',{exact:true}).fill(local(-3600000));await page.getByLabel('Berakhir (waktu perangkat)',{exact:true}).fill(local(3600000));await page.getByLabel('Waktu verifikasi asli (waktu perangkat)',{exact:true}).fill(local(0));
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Ajukan draft pengiriman'}).click();await expect(page.getByText(/Draft pengiriman tercatat/)).toBeVisible();
 await context.clearCookies();await login(context,'TEST_ONLY_REVIEWER');await page.reload();await page.getByRole('button',{name:'Persetujuan',exact:true}).click();
 let card=page.locator('.request-card').filter({hasText:city});await expect(card).toHaveCount(1);await card.getByLabel('Alasan tindakan').fill('TEST_ONLY independent Finance approval');await card.getByRole('button',{name:'Setujui sebagai pemeriksa berbeda'}).click();await expect(card.getByText(/shipping_policy · approved/)).toBeVisible();
 await context.clearCookies();await login(context);await page.reload();await page.getByRole('button',{name:'Persetujuan',exact:true}).click();card=page.locator('.request-card').filter({hasText:city});await card.getByLabel('Alasan tindakan').fill('TEST_ONLY approved application');await card.getByRole('button',{name:'Terapkan transaksi yang disetujui'}).click();await expect(card.getByText(/shipping_policy · applied/)).toBeVisible();
 await page.getByRole('button',{name:'Pengiriman',exact:true}).click();await expect(page.getByRole('cell',{name:city,exact:true})).toBeVisible();
});
test('viewer has no payment or mutation UI and anonymous API access is denied',async({page,context,request})=>{
 expect((await request.get('/v1/orders')).status()).toBe(401);
 await login(context,'TEST_ONLY_VIEWER');await page.goto('/');await expect(page.getByRole('heading',{name:'Ringkasan operasional'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Pembayaran',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Lot dan stok',exact:true}).click();await expect(page.getByRole('heading',{name:'Intake hitung fisik'})).toHaveCount(0);
});
