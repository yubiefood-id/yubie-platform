import AxeBuilder from '@axe-core/playwright';
import {test,expect} from '@playwright/test';
import { siteConfig } from '../../apps/web/config/site.js';
test('approved welcome offer is dismissible and does not reveal a code or block browsing',async({page})=>{
 await page.route('**/api/promotions/welcome',route=>route.fulfill({json:{ok:true,data:{available:true,percentage:15,endsAt:'2099-01-01T00:00:00Z',eligibility:'verification_required',requiresPhoneVerification:true}}}));
 await page.goto('/products');await expect(page.locator('body')).not.toContainText('YUBIE15');
 const offer=page.getByRole('complementary',{name:'Promo pelanggan terverifikasi'});await expect(offer).toBeVisible();await expect(offer.getByText(/15%/)).toBeVisible();
 await expect(offer.getByRole('link',{name:'komunitas WhatsApp Yubie'})).toHaveAttribute('href',siteConfig.social.whatsappCommunity);
 await expect(offer.getByRole('textbox')).toBeVisible();
 await expect(offer.getByRole('checkbox')).toBeVisible();
 await expect(offer.getByRole('link',{name:'Isi formulir feedback'})).toHaveAttribute('href',siteConfig.social.feedbackForm);
 await expect(page.getByRole('dialog',{name:/promo/i})).toHaveCount(0);await expect(offer.getByRole('link',{name:'Lihat kelayakan promo'})).toHaveAttribute('href','/login?next=/account');
 await offer.getByRole('button',{name:'Tutup promo',exact:true}).click();await expect(offer).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Tambah',exact:true}).first()).toBeVisible();
});
test('an inactive campaign hides the promo claim but the phone waitlist sign-up still shows',async({page})=>{
 await page.route('**/api/promotions/welcome',route=>route.fulfill({json:{ok:true,data:{available:false}}}));
 await page.goto('/products');
 await expect(page.locator('body')).not.toContainText('YUBIE15');
 await expect(page.getByRole('complementary',{name:'Promo pelanggan terverifikasi'})).toHaveCount(0);
 const waitlist=page.getByRole('complementary',{name:'Waitlist promo Yubie'});
 await expect(waitlist).toBeVisible();
 await expect(waitlist.getByText(/dapatkan info promo/i)).toBeVisible();
 await expect(waitlist.getByRole('textbox')).toBeVisible();
 await expect(waitlist.getByRole('checkbox')).toBeVisible();
 await expect(waitlist.getByRole('link',{name:'komunitas WhatsApp Yubie'})).toHaveAttribute('href',siteConfig.social.whatsappCommunity);
 await expect(waitlist.getByRole('link',{name:'Isi formulir feedback'})).toHaveAttribute('href',siteConfig.social.feedbackForm);
 await expect(waitlist.getByRole('link',{name:'Lihat kelayakan promo'})).toHaveAttribute('href','/login?next=/account');
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
 // No DOM or customer content in the failure report.
 expect(result.violations.filter((row)=>row.impact==='serious'||row.impact==='critical').map((row)=>row.id)).toEqual([]);
});
test('waitlist phone sign-up completes end to end',async({page})=>{
 await page.route('**/api/promotions/welcome',route=>route.fulfill({json:{ok:true,data:{available:false}}}));
 let submitted=0;
 await page.route('**/api/waitlist',async route=>{submitted++;await route.fulfill({status:201,json:{ok:true,data:{outcome:'joined'}}});});
 await page.goto('/products');
 const panel=page.getByRole('complementary',{name:'Waitlist promo Yubie'});
 await panel.getByRole('textbox').fill('+62812345678');
 await panel.getByRole('checkbox').check();
 await panel.getByRole('button',{name:/Daftar waitlist/i}).click();
 await expect(panel.getByRole('status')).toContainText('Nomor WhatsApp tercatat di waitlist');
 expect(submitted).toBe(1);
});
