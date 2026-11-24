export const CHANNELS = {
  OWNED_WEB:'Owned website', ORGANIC_SOCIAL:'Organic social', PAID_SOCIAL:'Paid social', BROADCAST:'Broadcast', EVENT:'Event screening',
};
export const MEDIA = {FOOTAGE:'Footage', MUSIC:'Music', GRAPHIC:'Graphic', VOICE:'Voice', FONT:'Font'};
export const NOW = () => Math.floor(Date.now() / 60_000);
export const DAY = 1440;
export const minuteInput = (minute) => new Date(minute * 60_000).toISOString().slice(0, 16);
export const parseMinute = (value) => Math.floor(new Date(value + 'Z').getTime() / 60_000);
export const AUDIT_SCHEMA = 'slateclear-audit/v1';

function jsonString(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0'));
}

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => jsonString(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return jsonString(value);
}

export async function sha(value) {
  const data = new TextEncoder().encode(canonical(value));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2,'0')).join('');
}

export async function signedRecord(payload) {
  return {...payload, hash: await sha(payload)};
}

const same = (a,b) => canonical(a) === canonical(b);
const require = (test, description) => { if (!test) throw new Error(description); };

export function decisionGate(outcome, credit, supplied) {
  if (['DENY','TERMS_CHANGED','TERMS_WITHDRAWN','DATE_SCOPE'].includes(outcome)) return 'BLOCKED';
  if (outcome === 'UNKNOWN') return 'NEEDS_EVIDENCE';
  if (outcome === 'CREDIT' && (!credit || credit !== supplied)) return 'NEEDS_CREDIT';
  return 'READY';
}

export function placementGate(cells) {
  return ['BLOCKED','NEEDS_EVIDENCE','NEEDS_CREDIT'].find((gate) => cells.some((item) => item.gate === gate)) ?? 'READY';
}

export async function verifyRecord(value, name) {
  const {hash, ...payload} = value;
  require(hash === await sha(payload), `${name} digest does not match.`);
}

export function makeBundle(desk, campaign) {
  const cuts = Array.from({length:campaign.head_revision}, (_, i) => desk.cuts.get(campaign.id + '/' + (i + 1)));
  const pins = new Set(cuts.flatMap((cut) => cut.plan.manifest.assets.map((pin) => pin.terms_hash)));
  return {
    schema: AUDIT_SCHEMA, contract: desk.address || null, campaign, cuts,
    terms: [...pins].map((hash) => desk.terms.get(hash)),
    certificates: campaign.certificate_ids.map((id) => desk.certificates.get(id)),
  };
}

export async function verifyAudit(bundle) {
  require(bundle.schema === AUDIT_SCHEMA, 'Unrecognized audit bundle.');
  const {campaign, cuts, terms, certificates} = bundle;
  require(cuts.length === campaign.head_revision && campaign.publisher !== campaign.reviewer &&
    certificates.length === campaign.certificate_ids.length, 'Registry contents do not match the campaign.');
  const evidence = new Map();
  for (const record of terms) {
    await verifyRecord(record, 'Terms');
    require(!evidence.has(record.hash), 'Duplicate terms in the audit bundle.');
    evidence.set(record.hash, record);
  }
  let previous = '';
  for (const [index, cut] of cuts.entries()) {
    const {plan, plan_hash:planHash, review, approval} = cut;
    const {assets, routes} = plan.manifest;
    require(plan.campaign_id === campaign.id && plan.publisher === campaign.publisher &&
      plan.revision === index + 1 && plan.previous === previous && planHash === await sha(plan), 'Cut lineage mismatch.');
    previous = planHash;
    for (const asset of assets) {
      require(evidence.get(asset.terms_hash)?.asset_id === asset.id, 'Pinned asset evidence is missing.');
    }
    if (!review) {
      require(approval === null, 'Approval exists without a review.');
      continue;
    }
    await verifyRecord(review, 'Matrix review');
    require(review.plan_hash === planHash && review.cells.length === assets.length * routes.length, 'Matrix review does not match the cut.');
    let position = 0;
    const aggregated = {};
    for (const route of routes) {
      const cells = [];
      for (const asset of assets) {
        const row = review.cells[position++];
        const terms = evidence.get(asset.terms_hash);
        require(row.id === route.id + '/' + asset.id && row.asset_id === asset.id &&
          row.route_id === route.id && row.terms_hash === asset.terms_hash, 'Matrix cell does not match the manifest.');
        const hard = ['TERMS_CHANGED','TERMS_WITHDRAWN','DATE_SCOPE'];
        const quoted = ['ALLOW','CREDIT','DENY'].includes(row.outcome);
        const indexes = row.clauses;
        require(quoted || hard.includes(row.outcome) || row.outcome === 'UNKNOWN', 'Unsupported matrix outcome.');
        require(indexes.every((n, i) => Number.isInteger(n) && n > (indexes[i - 1] ?? 0) &&
          n <= terms.clauses.length) && (quoted === (indexes.length > 0)), 'Invalid evidence citation.');
        require(row.credit === terms.credit_line && row.supplied === (route.credits[asset.id] ?? '') &&
          row.gate === decisionGate(row.outcome, row.credit, row.supplied), 'Credit obligation or gate calculation differs.');
        const covered = terms.valid_from <= route.start && route.end <= terms.valid_to;
        if (!['TERMS_CHANGED','TERMS_WITHDRAWN'].includes(row.outcome)) {
          require(covered === (row.outcome !== 'DATE_SCOPE'), 'Publication dates do not match the review.');
        }
        cells.push(row);
      }
      aggregated[route.id] = placementGate(cells);
    }
    require(same(aggregated, review.routes), 'Placement status differs from the evidence matrix.');
    if (approval) {
      await verifyRecord(approval, 'Reviewer approval');
      require(approval.review_hash === review.hash && approval.reviewer === campaign.reviewer, 'Reviewer approval does not match the matrix.');
    }
  }
  const latest = {};
  for (const [index, record] of certificates.entries()) {
    const receipt = record.receipt;
    const cut = cuts[receipt.revision - 1];
    const route = cut?.plan.manifest.routes.find((item) => item.id === receipt.route.id);
    await verifyRecord(receipt, 'Certificate');
    require(route && receipt.campaign_id === campaign.id && receipt.publisher === campaign.publisher &&
      receipt.id === `${campaign.id}/${receipt.revision}/${route.id}` && receipt.id === campaign.certificate_ids[index] &&
      same(route, receipt.route) && same(cut.plan.manifest.assets, receipt.assets) && receipt.issued_at < route.end &&
      receipt.plan_hash === cut.plan_hash && receipt.review_hash === cut.review?.hash &&
      receipt.approval_hash === cut.approval?.hash && cut.review?.routes[route.id] === 'READY' &&
      receipt.replaces === (latest[route.id] ?? ''), 'Certificate scope or published lineage differs.');
    latest[route.id] = receipt.id;
  }
  require(same(latest,campaign.active_by_route), 'Active certificate pointers do not match the history.');
  return {cuts:cuts.length, terms:terms.length, certificates:certificates.length};
}

export function compareCuts(first, second, assets) {
  const prior = new Map(first.plan.manifest.assets.map((pin) => [pin.id, pin]));
  const next = new Map(second.plan.manifest.assets.map((pin) => [pin.id, pin]));
  return {
    assets: [...new Set([...prior.keys(), ...next.keys()])].flatMap((id) => {
      const from = prior.get(id), to = next.get(id);
      if (from && to && same(from,to)) return [];
      return [{id, label:assets.get(id)?.label ?? id, from, to}];
    }),
    routes: [...new Set([...first.plan.manifest.routes, ...second.plan.manifest.routes].map((route) => route.id))].map((id) => {
      const from = first.plan.manifest.routes.find((route) => route.id === id);
      const to = second.plan.manifest.routes.find((route) => route.id === id);
      return {id, label:to?.label ?? from?.label ?? id, from:first.review?.routes[id] ?? (from ? 'PENDING' : 'ABSENT'),
        to:second.review?.routes[id] ?? (to ? 'PENDING' : 'ABSENT'), scopeChanged:!from || !to || !same(from,to)};
    }),
  };
}
