import test from 'node:test';import assert from 'node:assert/strict';import * as config from '../dist/index.js';
test('Maps defaults disabled, requires durable budgets and never exposes catalog location APIs',()=>{
 assert.equal(config.parseDeliveryMapsConfig({}),null);
 assert.throws(()=>config.parseDeliveryMapsConfig({MAPS_PROVIDER:'fake'}),/MAPS_PROVIDER/);
 assert.throws(()=>config.parseDeliveryMapsConfig({MAPS_PROVIDER:'google',GOOGLE_MAPS_SERVER_KEY:'synthetic'}),/DATABASE_URL/);
 assert.equal(config.customerRouteEnabled('PUBLIC_CATALOG_NO_SALES','/v1/locations/autocomplete'),false);
});
