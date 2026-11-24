import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles.css';
import deployment from './deployment.json';
import {demoDesk} from './demo.js';
import {CHANNELS, DAY, MEDIA, makeBundle, minuteInput, parseMinute, verifyAudit, verifyRecord} from './proofs.js';
import {button, certificateContent, escape as esc, icon, render, termsContent} from './views.js';

const root = document.getElementById('app');
const dialog = document.getElementById('dialog');
const notice = document.getElementById('notice');
const state = {deployment,mode:'demo',page:'desk',desk:null,demo:null,busy:false,account:'',campaignId:'',
  revision:1,tab:'matrix',cell:'',assetId:'',termsHash:'',pending:null};
let timer;

function paint() {
  if (state.desk) root.innerHTML = render(state);
}

function toast(message, error=false) {
  notice.innerHTML=`<div class="toast ${error?'error':''}">${icon(error?'CircleAlert':'CircleCheck')}<span>${esc(message)}</span></div>`;
  clearTimeout(timer);
  timer=setTimeout(()=>{notice.innerHTML='';},error?7900:4600);
}

const campaign = () => state.desk.campaigns.get(state.campaignId);
const cut = () => state.desk.cuts.get(`${state.campaignId}/${state.revision}`);
const asset = () => state.desk.assets.get(state.assetId);

function show(title,content,wide=false) {
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>
    <button type="button" class="icon-button" data-action="close" aria-label="Close dialog">${icon('X')}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}

function form(kind,content,label) {
  return `<form data-form="${kind}">${content}
    <p class="form-error" role="alert" hidden></p><footer class="dialog-actions">${button('Cancel','close')}
    <button type="submit" class="btn primary">${label}</button></footer></form>`;
}

function field(name,label,{type='text',value='',attrs='',optional=false,help=''}={}) {
  return `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${optional?'':'required'} ${attrs}>
    ${help?`<small>${help}</small>`:''}</label>`;
}

function area(name,label,{max=220,rows=3,value='',help=''}={}) {
  return `<label class="field"><span>${label}</span><textarea name="${name}" rows="${rows}" maxlength="${max}" required>${esc(value)}</textarea>
    ${help?`<small>${help}</small>`:''}</label>`;
}

function select(name,label,options,current) {
  return `<label class="field"><span>${label}</span><select name="${name}">${Object.entries(options).map(([id,text])=>
    `<option value="${esc(id)}" ${id===current?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
}

function setBusy(flag) {
  state.busy=flag;
  const submit=dialog.querySelector('[type="submit"]');
  if (submit) submit.disabled=flag;
  paint();
}

function fail(error) {
  const message=error.shortMessage || error.message || String(error);
  const current=dialog.open && dialog.querySelector('.form-error');
  if (current) {
    current.textContent=message;
    current.hidden=false;
  } else toast(message,true);
}

async function task(operation) {
  if (state.busy) return;
  setBusy(true);
  try { await operation(); }
  catch (error) { fail(error); }
  finally { setBusy(false); }
}

function selectCut(revision) {
  state.revision=revision;
  state.cell='';
  state.tab='matrix';
}

async function selectCampaign(id,refresh=true) {
  const current=state.mode==='live' && refresh ? await state.desk.refreshCampaign(id) : state.desk.campaigns.get(id);
  state.campaignId=id;
  selectCut(current?.head_revision ? 1 : 0);
}

async function selectAsset(id) {
  if (state.mode==='live' && id) await state.desk.refreshAsset(id);
  state.assetId=id;
  state.termsHash='';
}

const pendingKey = (address) => 'slateclear-pending-v1:' + address.toLowerCase();
function getPending(address) {
  try { return JSON.parse(localStorage.getItem(pendingKey(address)) || 'null'); }
  catch { return null; }
}

function savePending(value) {
  state.pending=value;
  try {
    const key=pendingKey(state.desk.address);
    if (value) localStorage.setItem(key,JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {}
}

async function openLive(address,builtin=false) {
  const {StudioDesk}=await import('./chain.js');
  const desk=new StudioDesk(address);
  await desk.start();
  const id=builtin && desk.campaigns.has(deployment.campaign_id)?deployment.campaign_id:desk.campaigns.keys().next().value;
  if (id) await desk.refreshCampaign(id);
  state.mode='live';
  state.desk=desk;
  state.pending=getPending(address);
  await selectCampaign(id || '',false);
  state.assetId=desk.assets.keys().next().value || '';
  state.termsHash='';
  state.page='desk';
  dialog.close();
  toast('Finalized Studionet data loaded.');
}

async function refresh() {
  if (state.campaignId) {
    const oldRevision=state.revision;
    const updated=await state.desk.refreshCampaign(state.campaignId);
    state.revision=Math.min(oldRevision || updated.head_revision,updated.head_revision);
  } else {
    await state.desk.loadPage('campaign');
    const id=state.desk.campaigns.keys().next().value;
    if (id) await selectCampaign(id);
  }
  if (state.page==='assets' && state.assetId) await selectAsset(state.assetId);
  toast('Finalized state refreshed.');
}

async function applyWrite(pending) {
  if (pending.asset) {
    await selectAsset(pending.asset);
    if (campaign()) await state.desk.refreshCampaign(state.campaignId);
    state.page='assets';
  }
  if (pending.campaign) {
    const result=await state.desk.refreshCampaign(pending.campaign);
    if (pending.method==='create_campaign' || pending.method==='commit_cut') {
      state.campaignId=result.id;
      selectCut(result.head_revision);
      state.page='desk';
    }
  }
}

async function finalizePending() {
  if (!state.pending) return;
  const {waitFinal}=await import('./chain.js');
  const tx=state.pending;
  const result=await waitFinal(tx,(status,hash)=>{
    if (status===tx.status && hash===tx.consensus_hash) return;
    tx.status=status;
    tx.consensus_hash=hash;
    savePending(tx);
    paint();
  });
  savePending(null);
  if (result.error) throw new Error(result.error);
  try {
    await applyWrite(tx);
    toast('Transaction finalized on Studionet.');
  } catch {
    toast('Finalized on Studionet. Refresh the workspace to load the updated state.');
  }
}

async function write(method,args,context) {
  if (state.mode!=='live') throw new Error('Open Studionet to sign transactions.');
  if (state.pending) throw new Error('Check the pending transaction before signing a new one.');
  const {connectWallet,sign,wallet}=await import('./chain.js');
  if (!state.account) state.account=await connectWallet();
  const hash=await sign(wallet(),state.account,state.desk.address,method,args);
  savePending({hash,status:'Submitted',method,...context});
  dialog.close();
  paint();
  await finalizePending();
}

function openNetwork() {
  show('Workspace connection',`<div class="modes">
    <div><b>Sample workspace</b><p>Inspect an example rights matrix, compare two cuts and export their evidence.</p>
    ${button('Open sample','demo',{disabled:state.mode==='demo'})}</div>
    <div><b>GenLayer Studionet</b><p>Read finalized receipts or sign actions as an issuer, publisher or reviewer.</p>
    ${deployment.contract_address?button('Open live case','live-default',{glyph:'Radio',kind:'soft'}):''}</div></div>
    ${form('network',field('address','SlateClear contract address',{value:state.desk.address || deployment.contract_address,
      attrs:'pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" spellcheck="false"'}),'Open registry')}`);
}

function openGuide() {
  show('Clearance workflow',`<div class="guide-list">
    <article><span>${icon('BookOpen')}</span><div><b>Commit the source terms</b><p>The issuer registers media and publishes numbered, versioned terms.</p></div></article>
    <article><span>${icon('Clapperboard')}</span><div><b>Set the release placements</b><p>The publisher pins asset terms and picks channels, territories, dates and credits.</p></div></article>
    <article><span>${icon('Radio')}</span><div><b>Review the rights matrix</b><p>GenLayer validators independently check each use and agree on its outcome and cited clause numbers.</p></div></article>
    <article><span>${icon('ShieldCheck')}</span><div><b>Issue a certificate</b><p>The named reviewer signs the matrix. The publisher issues a receipt for each eligible placement.</p></div></article>
    </div><div class="dialog-actions last">${button('Done','close',{kind:'primary'})}</div>`);
}

const freshId=(prefix)=>prefix+'-'+crypto.randomUUID().slice(0,8);

function openCampaign() {
  show('New campaign',form('campaign',`
    ${field('title','Campaign title',{attrs:'maxlength="100" placeholder="Signal Room trailer"'})}
    ${field('id','Campaign ID',{value:freshId('release'),attrs:'maxlength="28"'})}
    ${field('reviewer','Reviewer wallet',{attrs:'pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" spellcheck="false"',
      help:'The named reviewer signs the matrix before the publisher issues certificates.'})}`,'Create campaign'));
}

function openAsset() {
  show('Register media asset',form('asset',`
    ${field('label','Asset name',{attrs:'maxlength="90" placeholder="Signal Room score"'})}
    ${field('id','Asset ID',{value:freshId('asset'),attrs:'maxlength="28"'})}
    ${select('kind','Media type',MEDIA,'FOOTAGE')}`,'Register asset'));
}

function openTerms() {
  const a=asset();
  const prior=state.desk.terms.get(a.head);
  const now=state.desk.now;
  show('Publish asset terms',form('terms',`<p class="form-note">${esc(a.label)} · Version ${a.versions.length+1}. Terms excerpts are public on Studionet.</p>
    <div class="form-grid">
      ${field('from','Valid from (UTC)',{type:'datetime-local',value:minuteInput(prior?.valid_from || now-DAY)})}
      ${field('to','Valid until (UTC)',{type:'datetime-local',value:minuteInput(prior && prior.valid_to>now?prior.valid_to:now+90*DAY)})}</div>
    ${area('clauses','Quoted clauses',{max:3605,rows:6,value:prior?.clauses.join('\n') ?? '',
      help:'One excerpt per line. Use up to six clauses and preserve their wording.'})}
    ${field('credit','Exact required credit',{value:prior?.credit_line || '',attrs:'maxlength="180"',optional:true,
      help:'The credit text must appear in a quoted clause.'})}
    ${field('source','Public source reference',{type:'url',value:prior?.reference || '',attrs:'maxlength="250" placeholder="https://"',optional:true})}`,
    'Publish terms'));
}

function placementForm(index,route,visible,creditAssets,now) {
  const defaults=[['web','Owned website','OWNED_WEB'],['paid','Paid social','PAID_SOCIAL'],['organic','Organic social','ORGANIC_SOCIAL']][index];
  return `<section class="placement-field">
    <label class="toggle-row"><input type="checkbox" name="use-${index}" data-placement-toggle="${index}" ${visible?'checked':''}>
      <strong>Placement ${index+1}</strong><span>${visible?'Included':'Optional'}</span></label>
    <fieldset id="placement-${index}" ${visible?'':'disabled hidden'}>
      <div class="form-grid">${field(`label-${index}`,'Placement name',{value:route?.label || defaults[1],attrs:'maxlength="72"'})}
        ${field(`id-${index}`,'Placement ID',{value:route?.id || defaults[0],attrs:'maxlength="28"'})}
        ${select(`channel-${index}`,'Channel',CHANNELS,route?.channel || defaults[2])}
        ${field(`territory-${index}`,'Territory',{value:route?.territory || 'WORLD',attrs:'maxlength="5"',help:'WORLD or a two-letter code.'})}
        ${field(`start-${index}`,'Release start (UTC)',{type:'datetime-local',value:minuteInput(route?.end>now?route.start:now)})}
        ${field(`end-${index}`,'Release end (UTC)',{type:'datetime-local',value:minuteInput(route?.end>now?route.end:now+14*DAY)})}</div>
      ${creditAssets.length?`<div class="credit-options"><strong>Included credit lines</strong>${creditAssets.map(({asset,credit})=>
        `<label><input type="checkbox" name="credit-${index}-${esc(asset.id)}" ${route?.credits[asset.id]===credit?'checked':''}>
          <span><b>${esc(asset.label)}</b><small>${esc(credit)}</small></span></label>`).join('')}</div>`:''}
    </fieldset></section>`;
}

async function openCut() {
  const current=campaign();
  const previous=state.desk.cuts.get(`${current.id}/${current.head_revision}`)?.plan.manifest;
  const available=[...state.desk.assets.values()].filter((item)=>item.head && !item.withdrawal);
  if (!available.length) throw new Error('Publish active terms for at least one registered asset first.');
  await state.desk.loadTerms(available.map((item)=>item.head));
  const creditAssets=available.flatMap((asset)=>{
    const credit=state.desk.terms.get(asset.head)?.credit_line;
    return credit?[{asset,credit}]:[];
  });
  const pins=new Map(previous?.assets.map((item)=>[item.id,item]) ?? []);
  show('Commit a cut',form('cut',`
    ${field('label','Cut label',{value:`Cut ${String(current.head_revision+1).padStart(2,'0')}`,attrs:'maxlength="100"'})}
    <div class="form-section"><h3>Pin assets</h3><p>Choose up to four assets. Each selection uses the current terms digest.</p>
    <div class="asset-options">${available.map((item)=>`<div>
      <label><input type="checkbox" name="asset" value="${esc(item.id)}" ${pins.has(item.id)?'checked':''}><span>${esc(item.label)}</span></label>
      <small>Terms v${item.versions.length}</small>
      <label><input type="checkbox" name="edit-${esc(item.id)}" ${pins.get(item.id)?.edited?'checked':''}>Edited in cut</label>
    </div>`).join('')}</div></div>
    <div class="form-section"><h3>Choose placements</h3><p>Set a channel, territory and release window for each placement.</p>
    ${Array.from({length:3},(_, index)=>placementForm(index,previous?.routes[index],
      !!previous?.routes[index] || index===0,creditAssets,state.desk.now)).join('')}</div>`,'Commit cut'),true);
}

function openReason(title,kind,value) {
  show(title,form(kind,`<input type="hidden" name="value" value="${esc(value)}">
    ${area('reason','Reason',{max:220})}`,kind==='withdraw'?'Withdraw terms':'Retire certificate'));
}

async function openCertificate(id) {
  const live=state.mode==='live';
  const cert=live?await state.desk.read('get_certificate',id):state.desk.certificates.get(id);
  await verifyRecord(cert.receipt,'Certificate');
  state.desk.certificates.set(id,cert);
  const isSeed=live && state.desk.address.toLowerCase()===deployment.contract_address.toLowerCase();
  const proofKey=id==='signal-room/1/web'?'web_certificate':id==='signal-room/2/paid'?'paid_certificate':'';
  const proof=proofKey && deployment.transactions[proofKey];
  show('Certificate verification',`<div class="dialog-content">${certificateContent(cert,state)}
    ${isSeed&&proof?`<a class="text-link" href="https://explorer-studio.genlayer.com/tx/${esc(proof)}" target="_blank" rel="noopener noreferrer">Open issuance transaction</a>`:''}
    </div><footer class="dialog-actions last">${button('Done','close',{kind:'primary'})}</footer>`);
}

async function exportAudit() {
  const bundle=makeBundle(state.desk,campaign());
  await verifyAudit(bundle);
  const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=`slateclear-${bundle.campaign.id}.json`;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast('Audit bundle checked and downloaded.');
}

function openImport() {
  show('Verify an audit bundle',form('import',`<p class="form-note">Recompute source digests, placement results and certificate links from a SlateClear export.</p>
    <label class="field"><span>Audit bundle</span><input type="file" name="bundle" accept=".json,application/json" required></label>`,'Verify bundle'));
}

document.addEventListener('click',(event)=>{
  const target=event.target.closest('[data-action]');
  if (!target) return;
  const {action,value}=target.dataset;
  const sync={
    nav:()=>{
      state.page=value;
      paint();
      window.scrollTo({top:0});
      if (value==='assets' && state.mode==='live' && asset()?.head && !state.desk.terms.has(asset().head)) {
        void task(()=>selectAsset(state.assetId));
      }
    },
    tab:()=>{state.tab=value;paint();root.querySelector(`[data-action="tab"][data-value="${value}"]`)?.focus();},
    cell:()=>{state.cell=value;paint();root.querySelector(`[data-action="cell"][data-value="${CSS.escape(value)}"]`)?.focus({preventScroll:true});
      if (matchMedia('(max-width:910px)').matches) root.querySelector('.inspector')?.scrollIntoView({block:'nearest',behavior:'smooth'});},
    close:()=>dialog.close(),
    workspace:openNetwork,
    demo:()=>{state.mode='demo';state.desk=state.demo;state.pending=null;state.page='desk';state.assetId='signal-score';state.termsHash='';
      void selectCampaign('signal-room',false).then(paint);dialog.close();},
    help:openGuide,
    'new-campaign':openCampaign,
    'new-asset':openAsset,
    'new-terms':openTerms,
    'withdraw-terms':()=>openReason('Withdraw asset terms','withdraw',asset().id),
    retire:()=>openReason('Retire certificate','retire',value),
    'show-terms':()=>show('Committed terms',termsContent(state.desk.terms.get(value),state)),
    import:openImport,
  }[action];
  if (sync) {sync();return;}
  const active=campaign();
  const current=cut();
  const async={
    wallet:async()=>{const {connectWallet}=await import('./chain.js');state.account=await connectWallet();toast('Wallet connected.');},
    'live-default':()=>openLive(deployment.contract_address,true),
    refresh,
    resume:finalizePending,
    asset:()=>selectAsset(value),
    'more-assets':()=>state.desk.loadPage('asset'),
    'more-campaigns':()=>state.desk.loadPage('campaign'),
    'new-cut':openCut,
    certificate:()=>openCertificate(value),
    export:exportAudit,
    copy:async()=>{await navigator.clipboard.writeText(value);toast('Digest copied.');},
    review:()=>write('review_cut',[active.id,current.plan.revision,current.plan_hash],{campaign:active.id}),
    approve:()=>write('approve_review',[active.id,current.plan.revision,current.review.hash],{campaign:active.id}),
    issue:()=>write('issue_certificate',[active.id,current.plan.revision,value,current.review.hash],{campaign:active.id}),
  }[action];
  if (async) void task(async);
});

document.addEventListener('change',(event)=>{
  const target=event.target;
  if (target.id==='campaign-select') void task(()=>selectCampaign(target.value));
  if (target.id==='revision-select') {selectCut(Number(target.value));paint();}
  if (target.id==='terms-select') {state.termsHash=target.value;paint();}
  if (target.dataset.placementToggle!==undefined) {
    const fieldset=document.getElementById('placement-'+target.dataset.placementToggle);
    fieldset.disabled = !target.checked;
    fieldset.hidden = !target.checked;
    target.closest('.toggle-row').querySelector('span').textContent=target.checked?'Included':'Optional';
  }
});

document.addEventListener('submit',(event)=>{
  const form=event.target;
  const key=form.dataset.form;
  if (!key) return;
  event.preventDefault();
  const data=new FormData(form);
  const val=(name)=>String(data.get(name) ?? '').trim();
  const method={
    network:()=>openLive(val('address')),
    campaign:()=>write('create_campaign',[val('id'),val('title'),val('reviewer')],{campaign:val('id')}),
    asset:()=>write('register_asset',[val('id'),val('label'),val('kind')],{asset:val('id')}),
    terms:()=>{
      const a=asset();
      const clauses=val('clauses').split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
      return write('publish_terms',[a.id,a.head,parseMinute(val('from')),parseMinute(val('to')),JSON.stringify(clauses),val('credit'),val('source')],{asset:a.id});
    },
    withdraw:()=>write('withdraw_terms',[asset().id,asset().head,val('reason')],{asset:asset().id}),
    retire:()=>{
      const cert=state.desk.certificates.get(val('value'));
      return write('retire_certificate',[cert.receipt.id,cert.receipt.hash,val('reason')],{campaign:cert.receipt.campaign_id});
    },
    cut:()=>{
      const active=campaign();
      const assets=data.getAll('asset').map((id)=>({id,terms_hash:state.desk.assets.get(id).head,edited:data.has('edit-'+id)}));
      if (!assets.length || assets.length>4) throw new Error('Select one to four assets.');
      const routes=[0,1,2].filter((index)=>data.has('use-'+index)).map((index)=>({
        id:val('id-'+index),label:val('label-'+index),channel:val('channel-'+index),territory:val('territory-'+index).toUpperCase(),
        start:parseMinute(val('start-'+index)),end:parseMinute(val('end-'+index)),
        credits:Object.fromEntries(assets.filter(({id})=>data.has(`credit-${index}-${id}`))
          .map(({id,terms_hash})=>[id,state.desk.terms.get(terms_hash).credit_line])),
      }));
      if (!routes.length) throw new Error('Include at least one placement.');
      return write('commit_cut',[active.id,active.head_revision,JSON.stringify({label:val('label'),assets,routes})],{campaign:active.id});
    },
    import:async()=>{
      const file=data.get('bundle');
      if (!file?.size || file.size>1_000_000) throw new Error('Choose a SlateClear audit JSON file under 1 MB.');
      const result=await verifyAudit(JSON.parse(await file.text()));
      dialog.close();
      toast(`Verified ${result.cuts} cuts, ${result.terms} terms records and ${result.certificates} certificates.`);
    },
  }[key];
  if (method) void task(method);
});

globalThis.ethereum?.on?.('accountsChanged',([account])=>{
  state.account=account || '';
  if (state.mode==='live') paint();
});

async function start() {
  root.innerHTML='<div class="loading"><b>SlateClear</b><p>Opening clearance desk…</p></div>';
  state.demo=await demoDesk();
  state.desk=state.demo;
  state.assetId='signal-score';
  await selectCampaign('signal-room',false);
  paint();
  if (new URLSearchParams(location.search).get('network')==='studionet' && deployment.contract_address) {
    await task(()=>openLive(deployment.contract_address,true));
  }
}

start().catch((error)=>{
  root.innerHTML='<div class="loading"><b>SlateClear</b><p>Workspace unavailable.</p></div>';
  toast(error.message,true);
});
