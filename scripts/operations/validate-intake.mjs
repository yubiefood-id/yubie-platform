import { readFileSync } from 'node:fs';
import { verifiedInventoryIntakeSchema, operationsCreateSchema } from '@yubie/validation';
import { validateVerifiedInventoryIntake } from '@yubie/domain';
try {
  const input=JSON.parse(readFileSync(0,'utf8'));
  if(input.documentType==='YUBIE_VERIFIED_INVENTORY_INTAKE_V1'){
    const intake=verifiedInventoryIntakeSchema.parse(input);
    validateVerifiedInventoryIntake(intake,new Date().toISOString());
  }else{
    if(!Array.isArray(input.requests)||!input.requests.length)throw new Error('No verified requests');
    for(const request of input.requests)operationsCreateSchema.parse(request);
  }
  console.log('VALIDATED_NO_MUTATION');
}catch{console.error('Intake belum memenuhi schema/domain: periksa bukti, waktu hitung, lot/QC, konversi dan persetujuan.');process.exitCode=2;}
