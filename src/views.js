import {
  Aperture, ArrowDownToLine, BadgeCheck, BookOpen, Circle, CircleAlert, CircleCheck, CircleX, Clock3, Clapperboard,
  Copy, FileCheck2, FileImage, FileText, Film, GitCompare, Globe2, Headphones, Layers3, Link2, ListChecks,
  Mic, Plus, Radio, RefreshCw, Shield, ShieldCheck, Upload, WalletCards, X, createElement,
} from 'lucide';
import {CHANNELS, MEDIA, compareCuts} from './proofs.js';

const ICONS = {Aperture, ArrowDownToLine, BadgeCheck, BookOpen, Circle, CircleAlert, CircleCheck, CircleX, Clock3, Clapperboard,
  Copy, FileCheck2, FileImage, FileText, Film, GitCompare, Globe2, Headphones, Layers3, Link2, ListChecks,
  Mic, Plus, Radio, RefreshCw, Shield, ShieldCheck, Upload, WalletCards, X};
export const icon = (name, cls = '') => createElement(ICONS[name], {'aria-hidden':'true',class:`icon ${cls}`,'stroke-width':'1.8'}).outerHTML;
export const escape = (v) => String(v ?? '').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const es = escape;
export const digestShort = (h) => h ? `${h.slice(0,8)}…${h.slice(-6)}` : '—';
const explorer = 'https://explorer-studio.genlayer.com';
const nav = [['desk','Release desk','Layers3'],['assets','Asset library','BookOpen'],['certs','Certificates','ShieldCheck']];
const mediaIcon = {FOOTAGE:'Film',MUSIC:'Headphones',GRAPHIC:'FileImage',VOICE:'Mic',FONT:'FileText'};
const date = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const time = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'UTC'});
const d = (m) => date.format(new Date(m*60_000));
const dt = (m) => `${time.format(new Date(m*60_000))} UTC`;
const rev = (n) => `Cut ${String(n).padStart(2,'0')}`;

export function button(label, action, {glyph='',kind='',value='',disabled=false}={}) {
  return `<button type="button" class="btn ${kind}" data-action="${action}" ${value !== '' ? `data-value="${es(value)}"` : ''} ${disabled?'disabled':''}>
    ${glyph?icon(glyph):''}<span>${es(label)}</span></button>`;
}

const STATE = {
  READY:['Ready','good','CircleCheck'], BLOCKED:['Blocked','stop','CircleX'], NEEDS_CREDIT:['Credit needed','hold','CircleAlert'],
  NEEDS_EVIDENCE:['Evidence needed','hold','CircleAlert'], ALLOW:['Allowed','good','CircleCheck'], CREDIT:['Credit included','teal','FileCheck2'],
  DENY:['Restricted','stop','CircleX'], UNKNOWN:['Unclear','hold','CircleAlert'], DATE_SCOPE:['Outside term','stop','Clock3'],
  TERMS_CHANGED:['Terms changed','hold','GitCompare'], TERMS_WITHDRAWN:['Terms withdrawn','stop','CircleX'], 
  VALID:['Valid','good','ShieldCheck'], STALE_TERMS:['Stale terms','hold','CircleAlert'], PENDING:['Awaiting review','quiet','Clock3'],
  SUPERSEDED:['Superseded','quiet','GitCompare'], RETIRED:['Retired','quiet','CircleX'], SCHEDULED:['Scheduled','teal','Clock3'],
  EXPIRED:['Expired','quiet','Clock3'], ABSENT:['—','quiet','Circle'], ACTIVE:['Current','good','CircleCheck'],
  NO_TERMS:['Awaiting terms','quiet','Clock3'], APPROVED:['Reviewer signed','good','BadgeCheck'],
};

export function badge(status) {
  const [label,tone,glyph]=STATE[status] ?? [status,'quiet','Circle'];
  return `<span class="badge ${tone}">${icon(glyph)}${es(label)}</span>`;
}

function hashButton(hash) {
  return `<button type="button" class="hash" data-action="copy" data-value="${es(hash)}" title="Copy full SHA-256 digest" aria-label="Copy digest ${es(hash)}">${es(digestShort(hash))}${icon('Copy')}</button>`;
}

function external(url,label,cls='text-link') {
  return `<a class="${cls}" href="${es(url)}" target="_blank" rel="noopener noreferrer">${es(label)}</a>`;
}

function listNav(state, mobile=false) {
  return `<nav class="${mobile?'mobile-nav':'nav'}" aria-label="Workspace">${nav.map(([id,name,glyph])=>
    `<button type="button" data-action="nav" data-value="${id}" class="${state.page===id?'active':''}" ${state.page===id?'aria-current="page"':''}>${icon(glyph)}${name}</button>`).join('')}</nav>`;
}

function brand() {
  return `<div class="brand"><i>${icon('Aperture')}</i><b>Slate<span>Clear</span></b></div>`;
}

function sidebar(state) {
  return `<aside class="sidebar">
    ${brand()}${listNav(state)}
    <div class="sidebar-foot">
      ${button('Workflow guide','help',{glyph:'ListChecks',kind:'guide'})}
      <div class="rail-network">${icon('Layers3')}<div><strong>GenLayer</strong><small>${state.mode==='live'?'Studionet · 61999':'Preview workspace'}</small></div></div>
    </div>
  </aside>`;
}

function toolbar(state) {
  const page=nav.find(([id])=>id===state.page)[1];
  const live=state.mode==='live';
  return `<header class="toolbar">
    <div class="crumb"><div class="mobile-brand">${brand()}</div><span>Workspace</span><i></i><b>${page}</b></div>
    <div class="top-actions">
      <button type="button" class="mode ${live?'live':''}" data-action="workspace" ${state.busy?'disabled':''}><span></span>${live?'Studionet':'Sample data'}</button>
      ${live ? button(state.account?digestShort(state.account):'Connect wallet','wallet',{glyph:'WalletCards',disabled:state.busy}) :
        button('Open live case','live-default',{glyph:'Radio',kind:'soft',disabled:state.busy || !state.deployment.contract_address})}
    </div>
  </header>${listNav(state,true)}`;
}

function launchHeader(campaign,state) {
  const title={desk:'Release clearance',assets:'Asset library',certs:'Release certificates'}[state.page];
  const detail={desk:'Review where each media asset can be used.',assets:'Inspect the evidence and change history for each asset.',
    certs:'Check issued clearances against current rights evidence.'}[state.page];
  const live=state.mode==='live';
  const publisher=campaign?.publisher===state.account?.toLowerCase();
  const options=[...state.desk.campaigns.values()];
  return `<div class="page-head">
    <div><h1>${title}</h1><p>${detail}</p></div>
    <div class="head-actions">
      ${state.page!=='assets' && options.length>1 ? `<label class="campaign-select"><span class="sr-only">Campaign</span>
        <select id="campaign-select" ${state.busy?'disabled':''}>${options.map((entry)=>
          `<option value="${es(entry.id)}" ${entry.id===state.campaignId?'selected':''}>${es(entry.title)}</option>`).join('')}</select></label>` : ''}
      ${live ? button('Refresh','refresh',{glyph:'RefreshCw',disabled:state.busy}) : ''}
      ${live && state.page==='desk' && publisher ? button('Commit cut','new-cut',{glyph:'Plus',kind:'primary',disabled:state.busy}) : ''}
      ${live && state.page==='desk' && state.account ? button('New campaign','new-campaign',{glyph:'Plus',disabled:state.busy}) : ''}
      ${live && state.page==='assets' && state.account ? button('Register asset','new-asset',{glyph:'Plus',kind:'primary',disabled:state.busy}) : ''}
    </div>
  </div>`;
}

function pendingBar(state) {
  if (!state.pending) return '';
  const tx=state.pending;
  return `<div class="pending">${icon('Radio')}<b>${es(tx.status ?? 'Submitted')}</b>
    ${external(`${explorer}/tx/${tx.consensus_hash || tx.hash}`,digestShort(tx.consensus_hash || tx.hash))}
    ${button('Check status','resume',{disabled:state.busy})}</div>`;
}

function hero(campaign,cut,state) {
  const manifest=cut?.plan.manifest;
  const summary=cut?.review?.routes;
  const ready=Object.values(summary ?? {}).filter((status)=>status==='READY').length;
  const denied=Object.values(summary ?? {}).filter((status)=>status==='BLOCKED').length;
  const certs=campaign.certificate_ids.map((id)=>state.desk.certificates.get(id));
  const live=state.mode==='live';
  const imaging=campaign.id==='signal-room';
  return `<section class="campaign-hero ${imaging?'has-image':''}" aria-label="Campaign summary">
    ${imaging?'<img src="./goldstone.webp" alt="" class="hero-photo">':''}
    <div class="hero-content">
      <div class="hero-context">${icon('Clapperboard')}<span>${es(campaign.id)}</span>${cut?`<i></i>${rev(cut.plan.revision)}`:''}</div>
      <h2>${es(campaign.title)}</h2>
      <p>${manifest?es(manifest.label):'Awaiting the first cut'}</p>
      <div class="hero-metrics">
        <div><strong>${manifest?.assets.length ?? 0}</strong><span>Assets</span></div>
        <div><strong>${ready}<small> / ${manifest?.routes.length ?? 0}</small></strong><span>Placements ready</span></div>
        <div><strong>${certs.filter((cert)=>cert?.status === 'VALID').length}</strong><span>Valid certificates</span></div>
      </div>
    </div>
    <div class="hero-aside">
      ${denied?`<span class="hero-warning">${icon('CircleAlert')}${denied} blocked ${denied===1?'placement':'placements'}</span>`:''}
      ${live?external(`${explorer}/address/${state.desk.address}`,'Contract explorer','hero-link'):''}
    </div>
    ${imaging?external('https://www.jpl.nasa.gov/images/pia26150-the-goldstone-solar-system-radar-at-sunset/','Illustrative still · NASA/JPL-Caltech','photo-credit'):''}
  </section>`;
}

function cutToolbar(campaign,state) {
  return `<div class="cut-toolbar">
    <label class="cut-picker"><span>Revision</span><select id="revision-select" aria-label="Cut revision">${Array.from({length:campaign.head_revision},(_,i)=>i+1).map((n)=>
      `<option value="${n}" ${n===state.revision?'selected':''}>${rev(n)}${n===campaign.head_revision?' · Latest':''}</option>`).join('')}</select></label>
    <div class="switch" aria-label="Release desk view">
      ${[['matrix','Rights matrix','Layers3'],['compare','Compare cuts','GitCompare']].map(([id,label,glyph])=>
      `<button type="button" class="${state.tab===id?'active':''}" data-action="tab" data-value="${id}" aria-pressed="${state.tab===id}" ${id==='compare'&&campaign.head_revision<2?'disabled':''}>${icon(glyph)}${label}</button>`).join('')}
    </div>
  </div>`;
}

function heading(title,description,aside='') {
  return `<div class="panel-title"><div><h3>${title}</h3>${description?`<p>${description}</p>`:''}</div>${aside}</div>`;
}

function mediaGlyph(kind) {
  return `<span class="media-glyph ${kind?.toLowerCase() || ''}">${icon(mediaIcon[kind] || 'FileText')}</span>`;
}

function cellState(cell) {
  if (!cell) return 'PENDING';
  return cell.outcome === 'CREDIT' && cell.gate === 'NEEDS_CREDIT' ? 'NEEDS_CREDIT' : cell.outcome;
}

function matrix(cut,state,selected) {
  const {assets,routes}=cut.plan.manifest;
  return `<section class="panel matrix">
    ${heading('Rights matrix','Select a placement cell to inspect its source clauses.',cut.approval?badge('APPROVED'):'')}
    <div class="table-scroll"><table class="rights-table"><caption class="sr-only">Asset rights by release placement</caption>
      <thead><tr><th scope="col">Media asset</th>${routes.map((r)=>`<th scope="col">
        <div class="column-title">${es(r.label)}</div><small>${es(r.territory==='WORLD'?'Worldwide':r.territory)}${r.label===CHANNELS[r.channel]?'':` · ${es(CHANNELS[r.channel])}`}</small>
      </th>`).join('')}</tr></thead>
      <tbody>${assets.map((pin)=>{
        const asset=state.desk.assets.get(pin.id);
        const terms=state.desk.terms.get(pin.terms_hash);
        return `<tr><th scope="row"><div class="asset-cell">${mediaGlyph(asset?.kind)}<div>
          <b>${es(asset?.label ?? pin.id)}</b><small>${es(MEDIA[asset?.kind] ?? 'Media')} · Terms v${terms?.version ?? '—'}</small></div></div></th>
          ${routes.map((route)=>{
            const id=route.id+'/'+pin.id;
            const cell=cut.review?.cells.find((item)=>item.id===id);
            const citation=cell?.clauses.length?`Clause${cell.clauses.length===1?'':'s'} ${cell.clauses.join(', ')}`:
              cell?.outcome==='DATE_SCOPE'?'Window mismatch':'';
            return `<td><button type="button" class="matrix-cell ${selected===id?'selected':''}" data-action="cell" data-value="${es(id)}"
              aria-pressed="${selected===id}" aria-label="${es((asset?.label ?? pin.id)+' / '+route.label+' / '+(STATE[cellState(cell)]?.[0] ?? cellState(cell)))}">
              ${badge(cellState(cell))}${citation?`<small>${citation}</small>`:''}</button></td>`;
          }).join('')}</tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th scope="row">Placement gate</th>${routes.map((r)=>`<td>${badge(cut.review?.routes[r.id] || 'PENDING')}</td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="matrix-footer"><span>${icon('Shield')}Every asset must qualify for the placement.</span>
      ${cut.review?hashButton(cut.review.hash):''}</div>
  </section>`;
}

function inspector(cut,selected,state) {
  const [rid,aid]=selected.split('/');
  const manifest=cut.plan.manifest;
  const route=manifest.routes.find((item)=>item.id===rid);
  const pin=manifest.assets.find((item)=>item.id===aid);
  const asset=state.desk.assets.get(aid);
  const terms=state.desk.terms.get(pin?.terms_hash);
  if (!route || !pin || !terms) return `<section class="panel">${heading('Evidence inspector','Select an asset and placement.')}</section>`;
  const cell=cut.review?.cells.find((item)=>item.id===selected);
  const active=asset?.head===terms.hash && !asset.withdrawal;
  const status=cellState(cell);
  return `<section class="panel inspector">
    ${heading('Evidence inspector','',icon('FileText'))}
    <div class="inspector-body">
      <div class="asset-top">${mediaGlyph(asset?.kind)}<div><h4>${es(asset?.label ?? aid)}</h4><p>${es(route.label)} · ${es(route.territory==='WORLD'?'Worldwide':route.territory)} · ${pin.edited?'Edited':'Unedited'}</p></div></div>
      ${badge(status)}
      ${cell?.clauses.length ? `<div class="cited">${cell.clauses.map(n=>`<blockquote><span>Clause ${n} · Terms v${terms.version}</span>
        <p>${es(terms.clauses[n-1])}</p></blockquote>`).join('')}</div>` :
        `<p class="inline-note">${!cell?'A review will attach its supporting clauses.':cell.outcome==='UNKNOWN'?'The committed terms leave this use unclear.':
          'The pinned evidence does not meet the placement requirements.'}</p>`}
      ${cell?.outcome==='CREDIT' ? `<div class="credit-line"><span>Required credit</span><strong>${es(cell.credit || 'Credit text missing')}</strong></div>`:''}
      ${!active ? `<div class="drift">${icon('GitCompare')}<span>${asset?.withdrawal?'Terms withdrawn by the issuer.':'A newer terms version is available.'}</span></div>`:''}
      <div class="inspector-actions">${button('Open pinned terms','show-terms',{glyph:'BookOpen',value:terms.hash})}
        ${asset?.head && asset.head!==terms.hash ? button('Current terms','show-terms',{value:asset.head}) : ''}</div>
    </div>
  </section>`;
}

function placementActions(cut,campaign,state) {
  const current=cut.plan.revision===campaign.head_revision;
  const publisher=campaign.publisher===state.account?.toLowerCase();
  const reviewer=campaign.reviewer===state.account?.toLowerCase();
  const protectedPins=cut.plan.manifest.assets.every((pin)=>{
    const a=state.desk.assets.get(pin.id);
    return a?.head===pin.terms_hash && !a.withdrawal;
  });
  const live=state.mode==='live';
  return `<section class="panel route-panel">
    ${heading('Release placements','Certificates are issued for individual placements.',
      live && current && !cut.review && (publisher||reviewer) ? button('Run GenLayer review','review',{glyph:'Radio',kind:'primary',disabled:state.busy}) :
      live && current && cut.review && !cut.approval && reviewer ? button('Approve review','approve',{glyph:'ShieldCheck',kind:'primary',disabled:state.busy}) : '')}
    <div class="route-list">${cut.plan.manifest.routes.map((r)=>{
      const cert=state.desk.certificates.get(`${campaign.id}/${cut.plan.revision}/${r.id}`);
      const ready=cut.review?.routes[r.id]==='READY';
      const canIssue=live && current && publisher && cut.approval && ready && !cert && protectedPins && r.end>state.desk.now;
      return `<div class="route-row">
       <span class="route-icon">${icon(r.channel==='OWNED_WEB'?'Globe2':'Radio')}</span>
       <div class="route-text"><strong>${es(r.label)}</strong><small>${d(r.start)} – ${d(r.end)}</small></div>
       ${badge(cut.review?.routes[r.id] ?? 'PENDING')}
       ${cert?button(STATE[cert.status]?.[0]+' certificate','certificate',{glyph:'Shield',value:cert.receipt.id}):
         canIssue?button('Issue certificate','issue',{glyph:'BadgeCheck',kind:'primary',value:r.id,disabled:state.busy}):'<span class="route-end">—</span>'}
      </div>`;
    }).join('')}</div>
  </section>`;
}

function comparison(campaign,state) {
  const terminal=Math.max(2,state.revision);
  const first=state.desk.cuts.get(campaign.id+'/'+(terminal-1));
  const second=state.desk.cuts.get(campaign.id+'/'+terminal);
  const diff=compareCuts(first,second,state.desk.assets);
  return `<section class="panel comparison">
    ${heading(`${rev(first.plan.revision)} to ${rev(second.plan.revision)}`,'Changes to pinned terms and the release gates.')}
    <div class="compare-body">
    <h4>Changed assets</h4>
    ${diff.assets.map(({label,from,to})=>`<article class="compare-row"><strong>${es(label)}</strong>
      <div><span>${from?'Terms v'+state.desk.terms.get(from.terms_hash)?.version:'Added'}</span>
        ${from?hashButton(from.terms_hash):''}${from&&to&&from.edited!==to.edited?`<small>${from.edited?'Edited':'Unedited'}</small>`:''}</div>
      <div><span>${to?'Terms v'+state.desk.terms.get(to.terms_hash)?.version:'Removed'}</span>
        ${to?hashButton(to.terms_hash):''}${from&&to&&from.edited!==to.edited?`<small>${to.edited?'Edited':'Unedited'}</small>`:''}</div></article>`).join('') || '<p class="inline-note">The same assets and terms are pinned in both cuts.</p>'}
    <h4>Placement outcomes</h4>
    ${diff.routes.map((r)=>`<article class="compare-row"><strong>${es(r.label)}${r.scopeChanged?'<small>Scope updated</small>':''}</strong>
      <div>${badge(r.from)}</div><div>${badge(r.to)}</div></article>`).join('')}</div>
  </section>`;
}

function releaseDesk(campaign,cut,state) {
  if (!campaign) return `<div class="panel empty">${icon('Layers3')}<h2>Start a campaign</h2><p>Register a campaign and assign a reviewer.</p>
    ${state.mode==='live' && state.account?button('New campaign','new-campaign',{kind:'primary'}):''}</div>`;
  if (!cut) return hero(campaign,cut,state) + `<div class="panel empty">${icon('Clapperboard')}<h2>Awaiting the first cut</h2><p>The publisher commits a cut with active asset terms and release placements.</p></div>`;
  const chosen=state.cell || cut.review?.cells.find((row)=>row.gate!=='READY')?.id ||
    `${cut.plan.manifest.routes[0].id}/${cut.plan.manifest.assets[0].id}`;
  return hero(campaign,cut,state)+cutToolbar(campaign,state)+
    (state.tab==='compare'?comparison(campaign,state):`<div class="evidence-grid">${matrix(cut,state,chosen)}${inspector(cut,chosen,state)}</div>`)+
    placementActions(cut,campaign,state);
}

export function termsContent(terms,state) {
  const asset=state.desk.assets.get(terms.asset_id);
  return `<div class="terms-content">
    <div class="asset-top">${mediaGlyph(asset?.kind)}<div><h4>${es(asset?.label ?? terms.asset_id)}</h4><p>Terms v${terms.version} · ${d(terms.valid_from)} – ${d(terms.valid_to)}</p></div></div>
    <div class="terms-meta"><div><span>Issuer</span><b class="mono">${es(digestShort(terms.issuer))}</b></div><div><span>Terms digest</span>${hashButton(terms.hash)}</div></div>
    <ol class="license-clauses">${terms.clauses.map((clause)=>`<li>${es(clause)}</li>`).join('')}</ol>
    ${terms.credit_line?`<div class="credit-line"><span>Credit text</span><strong>${es(terms.credit_line)}</strong></div>`:''}
    ${/^https:\/\/[a-zA-Z0-9]/.test(terms.reference)?`<p class="reference">${external(terms.reference,'Open source reference')}</p>`:''}
  </div>`;
}

function assetsPage(state) {
  const records=[...state.desk.assets.values()];
  const active=state.desk.assets.get(state.assetId);
  const selected=state.desk.terms.get(state.termsHash || active?.head);
  const issuer=state.mode==='live' && active?.issuer===state.account?.toLowerCase();
  return `<div class="evidence-grid asset-grid">
    <section class="panel">
      ${heading('Registered media',`${records.length} assets`)}
      <div class="registry-list">${records.map((row)=>`<button type="button" class="registry-row ${row.id===state.assetId?'selected':''}" data-action="asset"
         data-value="${es(row.id)}" aria-pressed="${row.id===state.assetId}">${mediaGlyph(row.kind)}<div><b>${es(row.label)}</b>
         <small>${es(MEDIA[row.kind])} · ${row.versions.length} ${row.versions.length===1?'version':'versions'}</small></div>
         ${badge(row.withdrawal?'TERMS_WITHDRAWN':row.head?'ACTIVE':'NO_TERMS')}</button>`).join('') || '<p class="inline-note">The registry has no assets yet.</p>'}</div>
      ${state.desk.more.asset?`<div class="panel-end">${button('Load more assets','more-assets',{disabled:state.busy})}</div>`:''}
    </section>
    <section class="panel">
      ${heading('Terms history',active?es(active.label):'Select a registered asset.',issuer?button('Publish terms','new-terms',{glyph:'Plus',kind:'primary',disabled:state.busy}):'')}
      ${active?.versions.length ? `<div class="terms-versions"><label><span>Version</span>
          <select id="terms-select" aria-label="Terms version">${[...active.versions].reverse().map((hash,index)=>`<option value="${hash}"
            ${hash===selected?.hash?'selected':''}>Version ${active.versions.length-index}${hash===active.head?' · Latest':''}</option>`).join('')}</select></label>
        ${issuer && active.head && !active.withdrawal ? button('Withdraw terms','withdraw-terms',{disabled:state.busy}):''}
      </div>` : ''}
      ${active?.withdrawal?`<div class="withdrawal">${icon('CircleAlert')}${es(active.withdrawal.reason)}</div>`:''}
      ${selected?termsContent(selected,state):'<p class="panel-end inline-note">The issuer can publish numbered clauses and an optional credit line.</p>'}
    </section>
  </div>`;
}

export function certificateContent(cert,state) {
  const {receipt,status,changed,retirement}=cert;
  return `<div class="certificate-info">
    <div class="event-head"><div><h4>${es(receipt.route.label)}</h4><p class="mono">${es(receipt.id)}</p></div>${badge(status)}</div>
    <dl>
      <div><dt>Placement</dt><dd>${es(CHANNELS[receipt.route.channel])} · ${es(receipt.route.territory === 'WORLD'?'Worldwide':receipt.route.territory)}</dd></div>
      <div><dt>Release window</dt><dd>${d(receipt.route.start)} – ${d(receipt.route.end)}</dd></div>
      <div><dt>Receipt digest</dt><dd>${hashButton(receipt.hash)}</dd></div>
      <div><dt>Reviewer approval</dt><dd>${hashButton(receipt.approval_hash)}</dd></div>
    </dl>
    ${changed.length?`<ul class="receipt-reasons">${changed.map((change)=>`<li>${icon('GitCompare')}
      <span>${es(state.desk.assets.get(change.asset_id)?.label ?? change.asset_id)} · ${change.reason==='TERMS_CHANGED'?'New terms':'Terms withdrawn'}</span></li>`).join('')}</ul>`:''}
    ${retirement?`<p class="inline-note">${es(retirement.reason)}</p>`:''}
    <p class="checked-at">Checked ${dt(cert.checked_at)}</p>
  </div>`;
}

function certsPage(campaign,state) {
  if (!campaign) return '<div class="panel empty"><h2>Select a campaign</h2></div>';
  const all=campaign.certificate_ids.map((id)=>state.desk.certificates.get(id)).filter(Boolean).reverse();
  return `<section class="panel certificate-page">${heading('Certificate history',`${all.length} issued for ${es(campaign.title)}`,
    button('Export audit bundle','export',{glyph:'ArrowDownToLine',disabled:state.busy}))}
    <div class="cert-grid">${all.map((cert)=>`<article class="cert-card">${certificateContent(cert,state)}
      <div class="cert-actions">
        ${button(state.mode==='live'?'Verify live status':'Inspect receipt','certificate',{glyph:'ShieldCheck',value:cert.receipt.id,disabled:state.busy})}
        ${state.mode==='live' && !cert.retirement && state.account?.toLowerCase()===cert.receipt.publisher?
          button('Retire certificate','retire',{value:cert.receipt.id,disabled:state.busy}):''}</div></article>`).join('') || '<p class="inline-note">The campaign has no issued certificates.</p>'}</div>
    <div class="panel-end">${button('Verify an audit bundle','import',{glyph:'Upload',disabled:state.busy})}</div>
  </section>`;
}

export function render(state) {
  const campaign=state.desk.campaigns.get(state.campaignId);
  const cut=state.desk.cuts.get(`${state.campaignId}/${state.revision}`);
  const view=state.page==='assets' ? assetsPage(state) : state.page==='certs' ? certsPage(campaign,state) : releaseDesk(campaign,cut,state);
  return `<div class="layout">${sidebar(state)}<div class="shell">${toolbar(state)}
    <main>${launchHeader(campaign,state)}${pendingBar(state)}${view}
    ${state.desk.more.campaign && state.page!=='assets'?`<div class="bottom-actions">${button('Load more campaigns','more-campaigns',{disabled:state.busy})}</div>`:''}
    </main></div></div>`;
}
