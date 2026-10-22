import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { FakeZammadClient,ZammadSupportProvider } from '../dist/index.js';

test('approved final PNG is a native article attachment with stable delivery marker; concept/mismatch rejected',async()=>{
  const root=await mkdtemp(join(tmpdir(),'yubi-media-test-'));
  try {
    const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#7950a0'}}).png().toBuffer();
    const digest=createHash('sha256').update(bytes).digest('hex');
    const fileName=digest+'.png';await writeFile(join(root,fileName),bytes);
    const asset={assetId:'flour-final-test',productId:'flour',kind:'final-photograph',approvalStatus:'approved',approvalRef:'SYNTHETIC_TEST_ONLY',sha256:digest,fileName,mimeType:'image/png',byteLength:bytes.length,width:4,height:4};
    const client=new FakeZammadClient();
    const provider=new ZammadSupportProvider(client,'whatsapp message',{root,assets:[asset]});
    const command={threadRef:{provider:'zammad',threadId:'1'},productId:'flour',assetId:asset.assetId,caption:'Yubie Flour',websiteUrl:'https://yubiefood.com/products/yubie-flour',idempotencyKey:'media-1',correlationId:'test-1'};
    const r=await provider.sendProductMedia(command);
    assert.equal(r.ok,true);
    const article=Array.from(client.articles.values())[0];
    assert.equal(article.type,'whatsapp message');
    assert.equal(article.sender,'Agent');
    assert.equal(article.attachments.length,1);
    assert.equal(article.attachments[0]['mime-type'],'image/png');
    assert.deepEqual(Buffer.from(article.attachments[0].data,'base64'),bytes);
    assert.equal(article.preferences.yubie_delivery_key,'media-1');
    assert.equal((await provider.sendProductMedia({...command,productId:'shake'})).ok,false);
    assert.equal((await provider.sendProductMedia({...command,assetId:'../../etc/passwd'})).ok,false);
    await writeFile(join(root,fileName),'invalid image');
    assert.equal((await provider.sendProductMedia(command)).ok,false);
    assert.equal(client.articles.size,1);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('unapproved or missing product media never sends any article',async()=>{
  const client=new FakeZammadClient();const p=new ZammadSupportProvider(client,'whatsapp message');
  const r=await p.sendProductMedia({threadRef:{provider:'zammad',threadId:'1'},productId:'ppang',assetId:'concept',caption:'test',websiteUrl:'https://evil.test',idempotencyKey:'test',correlationId:'test'});
  assert.equal(r.ok,false);assert.equal(client.articles.size,0);
});
