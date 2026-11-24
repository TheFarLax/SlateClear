import {DAY, NOW, decisionGate, placementGate, sha, signedRecord} from './proofs.js';

const publisher = '0x1000000000000000000000000000000000000001';
const reviewer = '0x2000000000000000000000000000000000000002';
const issuer = '0x3000000000000000000000000000000000000003';

export async function demoDesk() {
  const now = NOW();
  const cid = 'signal-room';
  const titleCredit = 'Graphics by Paper Signal';
  const terms = new Map();
  const assets = new Map();
  const cuts = new Map();
  const certificates = new Map();
  const campaign = {id:cid, title:'Signal Room trailer', publisher, reviewer, created_at:now-6*DAY,
    head_revision:2, active_by_route:{web:`${cid}/1/web`,paid:`${cid}/2/paid`}, certificate_ids:[`${cid}/1/web`,`${cid}/2/paid`]};
  async function seedTerms(id, label, kind, clause, credit_line = '') {
    const item = assets.get(id) || {id, label, kind, issuer, registered_at:now-6*DAY, head:'', versions:[], withdrawal:null,withdrawals:[]};
    const record = await signedRecord({
      asset_id:id, issuer, version:item.versions.length + 1, posted_at:now-(item.head ? 2 : 6)*DAY,
      valid_from:now-7*DAY, valid_to:now+179*DAY, previous:item.head, clauses:[clause], credit_line, reference:'',
    });
    terms.set(record.hash,record);
    item.versions.push(record.hash);
    item.head=record.hash;
    assets.set(id, item);
    return record.hash;
  }
  const photo = await seedTerms('relay-footage','Relay exterior','FOOTAGE',
    'Edited and unedited footage is permitted worldwide on owned websites and paid social advertisements. Attribution is optional.');
  const score1 = await seedTerms('signal-score','Signal Room score','MUSIC',
    'The edited or unedited score may be used worldwide on owned websites. Paid social advertising is prohibited worldwide.');
  const title = await seedTerms('title-art','Title treatment','GRAPHIC',
    `Edited and unedited illustrations are permitted worldwide on owned websites and paid social advertisements. A display credit is required in the following form: ${titleCredit}.`, titleCredit);
  const score2 = await seedTerms('signal-score','Signal Room score','MUSIC',
    'The amended agreement permits the score, edited or unedited, worldwide on owned websites and paid social advertisements, with no required attribution.');
  const uses = [
    {id:'web',label:'Owned website',channel:'OWNED_WEB',territory:'WORLD',start:now-3*DAY,end:now+90*DAY,credits:{'title-art':titleCredit}},
    {id:'paid',label:'Paid social',channel:'PAID_SOCIAL',territory:'WORLD',start:now-3*DAY,end:now+90*DAY,credits:{'title-art':titleCredit}},
  ];
  async function seedCut(revision, score, label, prior, at) {
    const pins=[['relay-footage',photo],['signal-score',score],['title-art',title]].map(([id,terms_hash])=>({id,terms_hash,edited:true}));
    const plan = {campaign_id:cid, revision, publisher, submitted_at:at, previous:prior,
      manifest:{label,assets:pins,routes:uses}};
    const planHash=await sha(plan);
    const cells = uses.flatMap((route) => pins.map((pin) => {
      const outcome = pin.id === 'title-art' ? 'CREDIT' : revision === 1 && route.id === 'paid' && pin.id === 'signal-score' ? 'DENY' : 'ALLOW';
      const credit = terms.get(pin.terms_hash).credit_line;
      const supplied = route.credits[pin.id] ?? '';
      return {id:route.id+'/'+pin.id,route_id:route.id,asset_id:pin.id,terms_hash:pin.terms_hash,outcome,clauses:[1],credit,supplied,
        gate:decisionGate(outcome,credit,supplied)};
    }));
    const routes=Object.fromEntries(uses.map((route)=>[route.id,placementGate(cells.filter((cell)=>cell.route_id===route.id))]));
    const review=await signedRecord({plan_hash:planHash,reviewed_at:at+10,cells,routes});
    const approval=await signedRecord({review_hash:review.hash,reviewer,approved_at:at+24});
    const cut={plan,plan_hash:planHash,review,approval};
    cuts.set(cid+'/'+revision,cut);
    return cut;
  }
  async function seedCertificate(cut,route,status,changed=[]) {
    const revision=cut.plan.revision;
    const receipt=await signedRecord({id:`${cid}/${revision}/${route.id}`,campaign_id:cid,revision,publisher,route,
      assets:cut.plan.manifest.assets,plan_hash:cut.plan_hash,review_hash:cut.review.hash,
      approval_hash:cut.approval.hash,issued_at:cut.approval.approved_at+15,replaces:''});
    certificates.set(receipt.id,{receipt,status,changed,checked_at:now,retirement:null});
  }
  const a=await seedCut(1,score1,'Editorial cut','',now-3*DAY);
  const b=await seedCut(2,score2,'Paid release cut',a.plan_hash,now-DAY);
  await seedCertificate(a,uses[0],'STALE_TERMS',[{asset_id:'signal-score',pinned:score1,current:score2,reason:'TERMS_CHANGED'}]);
  await seedCertificate(b,uses[1],'VALID');
  return {now, assets, terms, cuts, campaigns:new Map([[cid,campaign]]),certificates,more:{asset:false,campaign:false}};
}
