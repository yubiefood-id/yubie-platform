import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

// Operator-only local transformation. This command does not grant image approval.
const [productId,inputPath,outputDirectory]=process.argv.slice(2);
if(!/^(flour|shake|ppang|mie)$/.test(productId??'') || !inputPath || !outputDirectory)throw Error('usage: node scripts/prepare-yubi-photo.mjs <productId> <final-photo-file> <output-directory>');
const source=await readFile(inputPath);
if(source.length>25*1024*1024)throw Error('source_too_large');
const bytes=await sharp(source,{limitInputPixels:40_000_000,failOn:'warning'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
if(bytes.length>5*1024*1024)throw Error('output_too_large');
const {width,height}=await sharp(bytes).metadata();
const sha256=createHash('sha256').update(bytes).digest('hex');
const fileName=sha256+'.jpg';await mkdir(outputDirectory,{recursive:true});await writeFile(join(resolve(outputDirectory),fileName),bytes,{flag:'wx'});
console.log(JSON.stringify({productId,assetId:`${productId}-final-v1`,kind:'final-photograph',approvalStatus:'pending',approvalRef:null,sha256,fileName,mimeType:'image/jpeg',byteLength:bytes.length,width,height},null,2));
