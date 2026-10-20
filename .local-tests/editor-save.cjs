'use strict';
// Exercise the actual editor controller with a delayed save response and both buttons.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');
class Element extends EventTarget{
 constructor(){super();this.disabled=false;this.classList={add(){},remove(){}};this.style={};this.offsetHeight=64;}
 close(){} showModal(){} insertAdjacentHTML(){} addEventListener(...args){super.addEventListener(...args);}
}
const ids=new Map(),element=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
const top=new Element(),bottom=element('local-save');
const doc={body:new Element(),documentElement:{style:{setProperty(){}}},getElementById:element,
 querySelectorAll(selector){if(selector==='#top-panel .save-btn,#local-save')return [top,bottom];if(selector==='#top-panel .save-btn')return [top];if(selector==='#local-bar button')return [bottom,element('local-backups')];return [];}};
let html='<html><body><h1>original</h1></body></html>',requests=0,pending=null,failNext=false,readCount=0;
const frameBody=new Element(),window=new EventTarget();
window.location={href:'http://127.0.0.1:8787/editor.html'};
const iframe={contentWindow:{location:{href:''},document:{documentElement:{cloneNode(){readCount++;return {outerHTML:html,querySelectorAll(){return [];}};}}}}};
const Vvveb={Builder:{iframe,frameBody,removeHelpers:s=>s,getHtml:()=>html,setHtml(value){html=value;}},StyleManager:{setCss(){}},Undo:{reset(){}},FileManager:{pages:{page:{file:'original/id'}},loadPage(name){iframe.contentWindow.location.href=this.pages[name].url;window.dispatchEvent(new Event('Vvveb.iframe.loaded'));},reloadCurrentPage(){return this.loadPage('page');}}};
const context={window,document:doc,Vvveb,URL,Blob,ResizeObserver:class{observe(){}},queueMicrotask,setTimeout,location:window.location,
 fetch:async(url,options)=>{if(url.endsWith('/session'))return {ok:true,json:async()=>({session:'session-1',file:'original/id',title:'index.html',path:'/user/index.html',mode:'original',url:'/source/id/index.html?session=session-1'})};assert(url.endsWith('/save'));requests++;return await new Promise(resolve=>pending=()=>{resolve(failNext?{ok:false,status:500,text:async()=> 'save failed'}:{ok:true,json:async()=>({saved:true,message:'saved'})});failNext=false;});}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../local-editor.js'),'utf8'),context);
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const both=value=>{assert.equal(top.disabled,value,'top Save state');assert.equal(bottom.disabled,value,'bottom Save state');};
const change=value=>{html=value;frameBody.dispatchEvent(new Event('input'));};
(async()=>{
 window.LocalEditor.install();await Vvveb.FileManager.loadPage('page');await flush();both(true);
 await Vvveb.Builder.save({},'');assert.equal(requests,0);both(true);
 change('<html>edited</html>');await flush();both(false);
 change('<html><body><h1>original</h1></body></html>');await flush();both(true);
 Vvveb.Builder.setHtml('<html>code editor changed</html>');await flush();both(false);
 const first=bottom.onclick();both(true);assert.equal(requests,1);
 await Vvveb.Builder.save({},'');await bottom.onclick();assert.equal(requests,1);both(true);
 // New input during the pending save must remain dirty after the response.
 change('<html>new input during save</html>');await flush();both(true);
 pending();await first;both(false);
 // Saving with the top button uses the same controller and success callback.
 const second=Vvveb.Builder.save({},'',()=>{top.disabled=true;});both(true);assert.equal(requests,2);pending();await second;both(true);
 for(let i=0;i<10;i++)await Vvveb.Builder.save({},'');assert.equal(requests,2);both(true);
 change('<html>retry after failure</html>');await flush();failNext=true;
 const failed=bottom.onclick();both(true);pending();await failed;both(false);
 const retry=bottom.onclick();pending();await retry;both(true);
 const reads=readCount;Vvveb.StyleManager.setCss('');await flush();assert(readCount>reads);both(true);
 console.log('PASS: both Save buttons; clean open; undo to baseline; code/CSS events; repeated click suppression; edit during save; failed save retry; no request for unchanged content.');
})().catch(error=>{console.error(error);process.exitCode=1;});
