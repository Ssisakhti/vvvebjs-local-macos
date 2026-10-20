'use strict';
window.LocalEditor=(()=>{
 let current=null,loading=false,saving=false,dirty=false,loadSerial=0,savedHtml=null,dirtyQueued=false;
 const $=id=>document.getElementById(id);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function api(path,data){const response=await fetch('/api/docs/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});if(!response.ok){const e=Error(await response.text());e.status=response.status;throw e;}return response.json();}
 function state(text,kind=''){$('local-state').textContent=text;$('local-state').className=kind;}
 function editorHtml(){
  const doc=Vvveb.Builder.iframe.contentWindow.document;
  const clone=doc.documentElement.cloneNode(true);
  clone.querySelectorAll('[contenteditable],[spellcheckker]').forEach(node=>{node.removeAttribute('contenteditable');node.removeAttribute('spellcheckker');});
  clone.querySelectorAll('script[src^="chrome-extension://"],script[src^="moz-extension://"]').forEach(node=>node.remove());
  return Vvveb.Builder.removeHelpers(clone.outerHTML);
 }
 function syncSaveButtons(){
  const disabled=!current||loading||saving||!dirty;
  document.querySelectorAll('#top-panel .save-btn,#local-save').forEach(button=>button.disabled=disabled);
 }
 function refreshDirty(report=true){
  if(!current||loading||savedHtml===null){syncSaveButtons();return;}
  dirty=editorHtml()!==savedHtml;
  syncSaveButtons();
  if(report&&!saving)state(dirty?'ذخیره نشده':'تغییر ذخیره‌نشده‌ای وجود ندارد',dirty?'dirty':'');
 }
 function setDirty(){
  if(dirtyQueued)return;
  dirtyQueued=true;
  queueMicrotask(()=>{dirtyQueued=false;refreshDirty();});
 }
 function disable(value){for(const button of document.querySelectorAll('#local-bar button'))button.disabled=value;syncSaveButtons();}
 function download(html,name){const blob=new Blob([html],{type:'text/html;charset=utf-8'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
 function confirmAction(message,label){return new Promise(resolve=>{const dlg=$('local-confirm');$('local-confirm-message').textContent=message;$('local-confirm-yes').textContent=label;dlg.returnValue='';dlg.onclose=()=>resolve(dlg.returnValue==='yes');dlg.showModal();});}
 function preview(version){const frame=$('local-preview-frame');frame.src='/api/docs/preview?session='+encodeURIComponent(current.session)+(version?'&version='+encodeURIComponent(version):'');$('local-preview-title').textContent=version?'پیش‌نمایش نسخهٔ پشتیبان':'نسخهٔ فعلی روی دیسک';$('local-preview').showModal();}
 async function loadHistory(){const list=$('local-version-list');list.textContent='در حال دریافت نسخه‌ها…';try{const info=await api('history?session='+encodeURIComponent(current.session));$('local-history-path').textContent=info.path;list.replaceChildren();for(const item of info.versions){const row=document.createElement('div');row.className='local-version';const text=document.createElement('div'),title=document.createElement('b'),date=document.createElement('small');title.textContent=item.kind==='initial'?'نسخهٔ اولیه':item.kind==='restore'?'پیش از بازیابی':'پیش از ذخیره';date.textContent=new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'medium'}).format(item.time)+' · '+new Intl.NumberFormat('fa-IR').format(item.files.length)+' فایل';text.append(title,date);const actions=document.createElement('div');actions.className='local-actions';const see=document.createElement('button');see.className='local-button';see.textContent='پیش‌نمایش';see.onclick=()=>preview(item.id);const receive=document.createElement('a');receive.className='local-button';receive.textContent='دریافت HTML';receive.href='/api/docs/version?session='+encodeURIComponent(current.session)+'&version='+encodeURIComponent(item.id)+'&download=1';const restore=document.createElement('button');restore.className='local-button';restore.textContent='بازیابی';restore.onclick=async()=>{if(!await confirmAction('این نسخه روی فایل بازشده و فایل‌های همراه آن اعمال می‌شود. از وضعیت فعلی پشتیبان می‌گیریم.'+(dirty?' تغییرات ذخیره‌نشدهٔ ویرایشگر کنار گذاشته می‌شوند؛ در صورت نیاز ابتدا آن‌ها را دریافت کنید.':''),'بازیابی نسخه'))return;restore.disabled=true;try{await api('restore',{session:current.session,version:item.id});dirty=false;Vvveb.Undo.reset();$('local-history').close();await Vvveb.FileManager.reloadCurrentPage();state('نسخه بازیابی شد');}catch(e){$('local-history-error').textContent=e.message;state(e.message,'error');if(e.status===409)$('local-compare-actions').classList.add('visible');}finally{restore.disabled=false;}};actions.append(see,receive,restore);row.append(text,actions);list.append(row);}}catch(e){list.textContent=e.message;}}
 async function save(data,saveUrl,success,error,done){
  if(!current||loading||saving){if(done)done();syncSaveButtons();return;}
  if(data.startTemplateUrl||(data.file&&data.file!==current.file)||(saveUrl&&new URL(saveUrl,location.href).searchParams.has('action'))){const e=Error('برای ساخت فایل تازه، از صفحهٔ شروع استفاده کنید. فایل فعلی تغییر نکرد.');state(e.message,'error');if(error)error(e);return;}
  refreshDirty(false);
  if(!dirty){if(done)done();syncSaveButtons();state('تغییر ذخیره‌نشده‌ای وجود ندارد');return;}
  saving=true;disable(true);state('در حال ساخت پشتیبان و ذخیره…');
  const serial=loadSerial;
  try{
   const submitted=Vvveb.Builder.getHtml(),submittedEditor=editorHtml();
   const result=await api('save',{session:current.session,html:submitted});
   if(serial!==loadSerial)return;
   savedHtml=submittedEditor;
   const changed=editorHtml()!==savedHtml;
   if(success)success(result.message);
   if(!changed){Vvveb.Undo.reset();dirty=false;state(result.saved===false?'تغییر تازه‌ای برای ذخیره وجود نداشت':'ذخیره شد · پشتیبان آماده است');}
   else{dirty=true;state('ذخیره شد؛ تغییرات تازه هنوز ذخیره نشده‌اند','dirty');}
   $('local-compare-actions').classList.remove('visible');
  }catch(e){refreshDirty(false);state(e.message,'error');if(error)error(e);if(e.status===409)$('local-compare-actions').classList.add('visible');}
  finally{saving=false;disable(false);}
 }
 function install(){
  document.body.insertAdjacentHTML('beforeend',`<section id="local-bar" aria-label="وضعیت فایل"><div class="local-info"><span id="local-name">در حال باز کردن فایل…</span><span id="local-mode"></span><span id="local-path"></span></div><span id="local-state" role="status" aria-live="polite"></span><div class="local-actions" id="local-compare-actions"><button class="local-button" id="local-disk">بررسی نسخهٔ دیسک</button><button class="local-button" id="local-reload">باز کردن نسخهٔ دیسک</button></div><div class="local-actions"><a class="local-button" href="/">فایل‌های من</a><button class="local-button" id="local-export">دریافت تغییرات</button><button class="local-button" id="local-reveal">نمایش در Finder</button><button class="local-button" id="local-backups">نسخه‌های پشتیبان</button><button class="local-button primary" id="local-save">ذخیره</button></div></section>
  <dialog id="local-history" class="local-panel"><header><h2>نسخه‌های پشتیبان</h2><button class="local-button" data-local-close>بستن</button></header><div class="local-content"><p id="local-history-path" dir="ltr"></p><p>نسخهٔ اولیه و آخرین ۲۰ نسخهٔ قبل از تغییر نگهداری می‌شوند. نسخه‌ها شامل فایل HTML و فایل‌های همراه شناسایی‌شده هستند.</p><button class="local-button" id="local-backup-folder">نمایش پوشهٔ پشتیبان در Finder</button><p id="local-history-error" class="local-error" role="alert"></p><div id="local-version-list"></div></div></dialog>
  <dialog id="local-preview" class="local-panel"><header><h2 id="local-preview-title"></h2><button class="local-button" data-local-close>بستن</button></header><iframe id="local-preview-frame" title="پیش‌نمایش بدون اجرای اسکریپت" sandbox="allow-same-origin"></iframe></dialog>
  <dialog id="local-confirm" class="local-panel"><header><h2>بازیابی فایل</h2></header><form method="dialog" class="local-content"><p id="local-confirm-message"></p><div class="local-actions"><button class="local-button primary" id="local-confirm-yes" value="yes"></button><button class="local-button" value="cancel">انصراف</button></div></form></dialog>`);
  new ResizeObserver(()=>document.documentElement.style.setProperty('--local-bar-height',$('local-bar').offsetHeight+'px')).observe($('local-bar'));
  for(const b of document.querySelectorAll('[data-local-close]'))b.onclick=()=>b.closest('dialog').close();
  $('local-save').onclick=()=>save({},'');$('local-export').onclick=()=>download(Vvveb.Builder.getHtml(),current?.title||'edited.html');$('local-reveal').onclick=()=>api('reveal',{session:current.session}).catch(e=>state(e.message,'error'));$('local-backups').onclick=()=>{$('local-history-error').textContent='';$('local-history').showModal();loadHistory();};$('local-disk').onclick=()=>preview();$('local-reload').onclick=async()=>{if(await confirmAction('نسخهٔ روی دیسک باز شود؟ تغییرات ذخیره‌نشده کنار گذاشته می‌شوند. برای نگهداری آن‌ها ابتدا «دریافت تغییرات» را بزنید.','باز کردن نسخهٔ دیسک')){dirty=false;Vvveb.Undo.reset();Vvveb.FileManager.reloadCurrentPage();}};
  $('local-backup-folder').onclick=()=>api('reveal-backups',{session:current.session}).catch(e=>$('local-history-error').textContent=e.message);
  const load=Vvveb.FileManager.loadPage;
  Vvveb.FileManager.loadPage=async function(name,...args){if(saving){state('ذخیره در حال انجام است. کمی صبر کنید.');return;}if(dirty&&!await confirmAction('تغییرات ذخیره نشده‌اند. فایل دیگری باز شود؟ برای نگهداری تغییرات ابتدا ذخیره یا دریافت را انتخاب کنید.','باز کردن فایل'))return;const serial=++loadSerial;loading=true;savedHtml=null;dirty=false;disable(true);try{const next=await api('session',{file:this.pages[name].file});if(serial!==loadSerial)return;current=next;this.pages[name].url=next.url;$('local-name').textContent=next.title;$('local-mode').textContent=next.mode==='original'?'ویرایش فایل اصلی':'ویرایش کپی';$('local-path').textContent=next.path;$('local-path').title=next.path;dirty=false;$('local-compare-actions').classList.remove('visible');state('در حال باز کردن…');await load.call(this,name,...args);}catch(e){state(e.message,'error');loading=false;disable(false);}};
  Vvveb.Builder.save=save;
  // These editors can change HTML/CSS without an Undo event.
  for(const [owner,key] of [[Vvveb.Builder,'setHtml'],[Vvveb.StyleManager,'setCss']]){const original=owner[key];owner[key]=function(...args){const result=original.apply(this,args);setDirty();return result;};}
  window.addEventListener('Vvveb.StyleManager.setStyle',setDirty);
  window.addEventListener('Vvveb.iframe.loaded',()=>{
   if(!current||!Vvveb.Builder.iframe.contentWindow.location.href.includes(current.session))return;
   const serial=loadSerial,body=Vvveb.Builder.frameBody;
   body.addEventListener('vvveb.undo.add',setDirty);body.addEventListener('vvveb.undo.restore',setDirty);body.addEventListener('input',setDirty);
   // Wait until upstream has installed its helpers and initialized styles.
   queueMicrotask(()=>{if(serial!==loadSerial)return;savedHtml=editorHtml();dirty=false;loading=false;disable(false);state('آمادهٔ ویرایش · نسخهٔ اولیه محفوظ است');});
  });
  window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
 }
 return {install};
})();
