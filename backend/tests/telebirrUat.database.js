// Isolated disposable PostgreSQL schema; provider calls are test doubles, never UAT.
const assert = require('assert').strict;
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const config = require('../src/config/env');
const original = require('../src/config/db');
const { createService } = require('../src/modules/telebirrUat/service');
const schema = `telebirr_test_${randomUUID().replaceAll('-','')}`;
const pool = new Pool({ ...require('../src/config/databaseTls').databaseOptions(config.databaseUrl),
  max: 4, connectionTimeoutMillis: 10000, query_timeout: 20000, statement_timeout: 15000,
  options: `-c search_path=${schema},public` });
let installed = false, checks = 0;
const check = (value, label) => { assert(value,label); checks++; console.log(`PASS ${label}`); };
(async () => {
  try {
    await pool.query(`CREATE SCHEMA ${schema}`); installed = true;
    await pool.query('CREATE TABLE users(user_id uuid PRIMARY KEY,role text NOT NULL)');
    await pool.query(`CREATE FUNCTION ${schema}.simulation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable'; END $$`);
    const sql = fs.readFileSync(require.resolve('../db/migrations/012_telebirr_uat_funding.sql'),'utf8').replaceAll(/\bpublic\b/g,schema);
    await pool.query(sql);
    await pool.query(fs.readFileSync(require.resolve('../db/migrations/013_telebirr_uat_sdk_context.sql'),'utf8').replaceAll(/\bpublic\b/g,schema));
    const buyer = randomUUID(), farmer = randomUUID();
    await pool.query("INSERT INTO users VALUES($1,'buyer'),($2,'farmer')",[buyer,farmer]);
    let preorders = 0;
    const provider = { configuration() {}, async preorder() { preorders++; return { prepayId: randomUUID() }; },
      async verify() { return { authoritative: false, reason: 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED' }; } };
    const service = createService({ db: pool, provider });
    const input = { amount: '10.01', idempotency_key: randomUUID() };
    const [a,b] = await Promise.all([service.create(buyer,input),service.create(buyer,input)]);
    check(a.funding_id === b.funding_id && preorders === 1,'concurrent idempotent preorder creates one durable record');
    check(a.amount_minor === '1001' && !a.spendable && a.sdk_launch === null,'exact cents and safe separation');
    await assert.rejects(service.create(buyer,{ ...input,amount: '20' }),{ status: 409 }); checks++;
    await assert.rejects(service.create(farmer,{ ...input,idempotency_key: randomUUID() }),{ status: 403 }); checks++;
    const restarted = createService({ db: pool, provider });
    check((await restarted.get(buyer,a.funding_id)).funding_id === a.funding_id,'new service instance recovers durable records');
    await Promise.all([service.verify(buyer,a.funding_id,true),restarted.verify(buyer,a.funding_id,true)]);
    check((await restarted.get(buyer,a.funding_id)).verification_attempts === 1,'row locking deduplicates concurrent verification checks');
    const audits = (await pool.query("SELECT count(*)::int AS count FROM telebirr_uat_audit WHERE event_type='sdk_interaction_ended'")).rows[0].count;
    check(audits === 1,'duplicate interaction audit deduplicated');
    check((await restarted.get(buyer,a.funding_id)).reconciliation_reason === 'QUERY_RESPONSE_CONTRACT_UNCONFIRMED','sanitized query blocker persists without accepting payment evidence');
    await assert.rejects(service.get(farmer,a.funding_id),{ status:404 }); checks++;
    await assert.rejects(pool.query('UPDATE telebirr_uat_funding SET verified_at=now() WHERE funding_id=$1',[a.funding_id])); checks++;
    const another = await service.create(buyer,{ ...input, idempotency_key:randomUUID() });
    await pool.query('UPDATE telebirr_uat_funding SET provider_transaction_reference=$2 WHERE funding_id=$1',[a.funding_id,'fixture-reference-only']);
    await assert.rejects(pool.query('UPDATE telebirr_uat_funding SET provider_transaction_reference=$2 WHERE funding_id=$1',[another.funding_id,'fixture-reference-only']),{ code:'23505' }); checks++;
    for (const status of ['verified_success','failed','cancelled','expired']) {
      await assert.rejects(pool.query('UPDATE telebirr_uat_funding SET status=$2 WHERE funding_id=$1',[a.funding_id,status])); checks++;
    }
    await assert.rejects(pool.query('UPDATE telebirr_uat_funding SET amount_minor=2000 WHERE funding_id=$1',[a.funding_id])); checks++;
    await assert.rejects(pool.query('DELETE FROM telebirr_uat_audit')); checks++;
    await assert.rejects(pool.query('DELETE FROM telebirr_uat_funding')); checks++;
    const result = await pool.query("SELECT to_regclass($1) AS wallet,to_regclass($2) AS escrow",[`${schema}.demo_wallet_entries`,`${schema}.simulated_escrow_ledger`]);
    check(!result.rows[0].wallet && !result.rows[0].escrow,'UAT operations do not require or create wallet/escrow tables');
    const beforeFlag = process.env.TELEBIRR_UAT_SDK_ENABLED;
    try {
      process.env.TELEBIRR_UAT_SDK_ENABLED = 'true';
      const sdkProvider = { configuration() { return { MERCHANT_APP_ID: 'testmerchant', SHORT_CODE: '123456' }; },
        async preorder() { return { prepayId: randomUUID().replaceAll('-',''), sdkContext: {
          appId: 'testmerchant', shortCode: '123456', timeoutExpress: '120m', contract: 'inapp_create_order_v1',
        } }; }, async verify() { return { authoritative: false }; } };
      const sdkService = createService({ db: pool, provider: sdkProvider });
      check((await sdkService.create(buyer,input)).sdk_launch === null,'legacy preorder remains blocked with SDK opt-in enabled');
      const sdkInput = { amount: '12.34', idempotency_key: randomUUID() };
      const sdkAttempt = await sdkService.create(buyer,sdkInput);
      check(sdkAttempt.sdk_launch?.receiveCode === `TELEBIRR$BUYGOODS$123456$12.34$${sdkAttempt.provider_reference}$120m`,'validated SDK context round-trips through PostgreSQL exactly');
      const afterRestart = await createService({ db: pool, provider: sdkProvider }).create(buyer,sdkInput);
      check(afterRestart.sdk_launch?.receiveCode === sdkAttempt.sdk_launch.receiveCode,'idempotent restart recovery retains exact validated SDK context');
      await assert.rejects(pool.query('UPDATE telebirr_uat_funding SET sdk_short_code=$2 WHERE funding_id=$1',[sdkAttempt.funding_id,'654321'])); checks++;
      await assert.rejects(pool.query("UPDATE telebirr_uat_funding SET sdk_contract='inapp_create_order_v1' WHERE funding_id=$1",[a.funding_id])); checks++;
      await assert.rejects(pool.query("UPDATE telebirr_uat_funding SET sdk_app_id='testmerchant',sdk_short_code='123456',sdk_timeout_express='120m',sdk_contract='inapp_create_order_v1' WHERE funding_id=$1",[a.funding_id])); checks++;
      check((await sdkService.get(buyer,sdkAttempt.funding_id)).sdk_launch === null,'history/details do not disclose launch payloads');
      const checked = await sdkService.verify(buyer,sdkAttempt.funding_id,true);
      check(checked.status === 'verification_pending' && checked.verified_at === null && !checked.spendable,'SDK interaction still cannot verify or credit a payment');
    } finally {
      if (beforeFlag === undefined) delete process.env.TELEBIRR_UAT_SDK_ENABLED;
      else process.env.TELEBIRR_UAT_SDK_ENABLED = beforeFlag;
    }
    console.log(`${checks} Telebirr isolated database checks passed; no provider transactions executed`);
  } catch (e) { console.error(`Telebirr database tests failed: ${e.code || e.name}`); process.exitCode = 1; }
  finally {
    if (installed) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end(); await original.end();
  }
})();
