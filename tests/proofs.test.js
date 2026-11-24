import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoDesk} from '../src/demo.js';
import {AUDIT_SCHEMA, canonical, compareCuts, decisionGate, makeBundle, placementGate, sha, verifyAudit} from '../src/proofs.js';

const deployed = JSON.parse(readFileSync(new URL('../docs/studionet-report.json',import.meta.url),'utf8'));
const live = {schema:AUDIT_SCHEMA,contract:deployed.contract_address,campaign:deployed.campaign,cuts:deployed.cuts,
  terms:deployed.terms,certificates:deployed.certificates};
const payload = ({hash,...rest}) => rest;

test('the same canonical JSON is hashed by browser and contract',()=>{
  assert.equal(canonical({z:'🎬',a:['á','\u007f',null]}),'{"a":["\\u00e1","\\u007f",null],"z":"\\ud83c\\udfac"}');
});

test('sample bundle connects the exact source, both cuts and both certificates',async()=>{
  const desk=await demoDesk();
  const campaign=desk.campaigns.get('signal-room');
  const bundle=makeBundle(desk,campaign);
  assert.deepEqual(await verifyAudit(bundle),{cuts:2,terms:4,certificates:2});
  const diff=compareCuts(...bundle.cuts,desk.assets);
  assert.deepEqual(diff.assets.map(({id})=>id),['signal-score']);
  assert.deepEqual(diff.routes.map(({from,to})=>[from,to]),[['READY','READY'],['BLOCKED','READY']]);
});

test('the live Studionet report verifies independently against browser clearance rules',async()=>{
  assert.deepEqual(await verifyAudit(live),{cuts:2,terms:4,certificates:2});
  assert.equal(deployed.source_matches_onchain,true);
  assert.equal(deployed.finalized_transactions,17);
  assert.equal(deployed.web_before_update.status,'VALID');
  assert.deepEqual(live.certificates.map(({status})=>status),['STALE_TERMS','VALID']);
});

test('credit text and placement rules are exact and ordered by gate severity',()=>{
  assert.equal(decisionGate('CREDIT','Art by S','Art by S'),'READY');
  assert.equal(decisionGate('CREDIT','Art by S','Art by s'),'NEEDS_CREDIT');
  assert.equal(decisionGate('DENY','Art by S','Art by S'),'BLOCKED');
  assert.equal(placementGate([{gate:'NEEDS_CREDIT'},{gate:'NEEDS_EVIDENCE'}]),'NEEDS_EVIDENCE');
  assert.equal(placementGate([{gate:'NEEDS_EVIDENCE'},{gate:'BLOCKED'}]),'BLOCKED');
});

test('changing a committed clause breaks the evidence digest',async()=>{
  const edited=structuredClone(live);
  edited.terms[0].clauses[0]+=' Added text.';
  await assert.rejects(()=>verifyAudit(edited),/Terms digest/);
});

test('a rewritten review hash cannot justify an invalid citation',async()=>{
  const edited=structuredClone(live);
  const review=edited.cuts[0].review;
  review.cells[0].clauses=[99];
  review.hash=await sha(payload(review));
  await assert.rejects(()=>verifyAudit(edited),/Invalid evidence citation/);
});

test('a rewritten hash cannot turn a restricted placement into a ready one',async()=>{
  const edited=structuredClone(live);
  const review=edited.cuts[0].review;
  review.routes.paid='READY';
  review.hash=await sha(payload(review));
  await assert.rejects(()=>verifyAudit(edited),/Placement status differs/);
});

test('audit verification rejects a receipt for a different territory',async()=>{
  const edited=structuredClone(live);
  const {receipt}=edited.certificates[0];
  receipt.route.territory='GB';
  receipt.hash=await sha(payload(receipt));
  await assert.rejects(()=>verifyAudit(edited),/Certificate scope/);
});

test('receipt revisions and approval digest remain linked when cuts are reordered',async()=>{
  const edited=structuredClone(live);
  edited.cuts.reverse();
  await assert.rejects(()=>verifyAudit(edited),/Cut lineage mismatch/);
});

test('publishing pointers match the complete receipt history',async()=>{
  const edited=structuredClone(live);
  edited.campaign.active_by_route.paid=edited.campaign.active_by_route.web;
  await assert.rejects(()=>verifyAudit(edited),/Active certificate pointers/);
});
