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
test('an inactive or unavailable campaign is not advertised from source constants',async({page})=>{
 await page.route('**/api/promotions/welcome',route=>route.fulfill({json:{ok:true,data:{available:false}}}));await page.goto('/products');
 await expect(page.locator('body')).not.toContainText('YUBIE15');await expect(page.getByRole('complementary',{name:'Promo pelanggan terverifikasi'})).toHaveCount(0);
});
