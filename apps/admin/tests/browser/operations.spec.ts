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
 await page.getByRole('button',{name:'Pengiriman',exact:true}).click();await expect(page.getByLabel('Penanggung biaya')).toBeVisible();
 await page.getByRole('button',{name:'Hak staf',exact:true}).click();await expect(page.getByLabel('Google subject staf')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);const scan=await new AxeBuilder({page}).analyze();expect(scan.violations).toEqual([]);
});
test('viewer has no payment or mutation UI and anonymous API access is denied',async({page,context,request})=>{
 expect((await request.get('/v1/orders')).status()).toBe(401);
 await login(context,'TEST_ONLY_VIEWER');await page.goto('/');await expect(page.getByRole('heading',{name:'Ringkasan operasional'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Pembayaran',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Lot dan stok',exact:true}).click();await expect(page.getByRole('heading',{name:'Intake hitung fisik'})).toHaveCount(0);
});
