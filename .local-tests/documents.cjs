const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const create=require('../local-documents.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vvveb-history-test-'));
try{
 fs.mkdirSync(path.join(root,'workspace'));fs.mkdirSync(path.join(root,'media'));const outside=path.join(root,'user-files');fs.mkdirSync(outside);fs.mkdirSync(path.join(outside,'assets'));
 const source=path.join(outside,"گزارش user's.htm"),original='<html dir="rtl"><link rel="stylesheet" href="assets/main.css"><img src="assets/a.svg"><h1>اولیه</h1></html>';
 fs.writeFileSync(source,original);fs.writeFileSync(path.join(outside,'assets/main.css'),'h1{color:red}');fs.writeFileSync(path.join(outside,'assets/a.svg'),'<svg/>');
 const docs=create(root),doc=docs.register(source);assert.equal(doc.mode,'original');assert.equal(fs.readFileSync(source,'utf8'),original);
 const a=docs.session(doc.file),b=docs.session(doc.file);assert.equal(docs.source(doc.id,path.basename(source),a.session).toString(),original);
 const initial=docs.history(a.session).versions.find(v=>v.kind==='initial');assert.equal(initial.files.length,3);
 const initialMtime=fs.statSync(source).mtimeMs;
 const historyBefore=JSON.stringify(docs.history(a.session).versions);
 for(let i=0;i<10;i++)assert.equal(docs.save(a.session,original).saved,false);
 assert.equal(fs.statSync(source).mtimeMs,initialMtime);assert.equal(JSON.stringify(docs.history(a.session).versions),historyBefore);
 assert.equal(docs.save(a.session,original.replace('اولیه','ویرایش اول')).saved,true);
 const savedMtime=fs.statSync(source).mtimeMs,oneSaveHistory=JSON.stringify(docs.history(a.session).versions);
 for(let i=0;i<10;i++)assert.equal(docs.save(a.session,original.replace('اولیه','ویرایش اول')).saved,false);
 assert.equal(fs.statSync(source).mtimeMs,savedMtime);assert.equal(JSON.stringify(docs.history(a.session).versions),oneSaveHistory);
assert.match(fs.readFileSync(source,'utf8'),/ویرایش اول/);
 assert.throws(()=>docs.save(b.session,'stale tab'),e=>e.status===409);assert.match(fs.readFileSync(source,'utf8'),/ویرایش اول/);
 fs.writeFileSync(source,'external change');assert.throws(()=>docs.save(a.session,'overwrite'),e=>e.status===409);assert.equal(fs.readFileSync(source,'utf8'),'external change');
 const c=docs.session(doc.file);docs.restore(c.session,'initial');assert.equal(fs.readFileSync(source,'utf8'),original);
 assert(docs.history(c.session).versions.some(v=>v.kind==='restore'));const beforeRestore=docs.history(c.session).versions.find(v=>v.kind==='restore');assert.equal(docs.versionFile(c.session,beforeRestore.id).data.toString(),'external change');
 fs.writeFileSync(path.join(root,'media','new.svg'),'<svg>new</svg>');docs.save(c.session,'<html><img src="/media/new.svg"><h1>new image</h1></html>');assert.equal(docs.save(c.session,'<html><img src="/media/new.svg"><h1>new image</h1></html>').saved,false);let html=fs.readFileSync(source,'utf8');assert(!html.includes('/media/'));const image=decodeURIComponent(html.match(/src="([^"]+)/)[1]);assert.equal(fs.readFileSync(path.join(outside,image),'utf8'),'<svg>new</svg>');
 docs.save(c.session,html.replace('new image','next'));const previous=docs.history(c.session).versions.find(v=>v.kind==='save');assert(previous.files.includes(image));
 fs.writeFileSync(path.join(outside,'assets/main.css'),'external CSS change');docs.restore(c.session,'initial');assert.equal(fs.readFileSync(path.join(outside,'assets/main.css'),'utf8'),'h1{color:red}');const preRestore=docs.history(c.session).versions.find(v=>v.kind==='restore');assert.equal(docs.versionFile(c.session,preRestore.id,'assets/main.css').data.toString(),'external CSS change');
 for(let i=0;i<25;i++)docs.save(c.session,'<html>'+i+'</html>');const history=docs.history(c.session);assert.equal(history.versions.length,21);assert(history.versions.some(v=>v.kind==='initial'));assert.equal(docs.versionFile(c.session,'initial').data.toString(),original);
 const retained=JSON.stringify(history.versions),retainedMtime=fs.statSync(source).mtimeMs;for(let i=0;i<25;i++)assert.equal(docs.save(c.session,'<html>24</html>').saved,false);assert.equal(JSON.stringify(docs.history(c.session).versions),retained);assert.equal(fs.statSync(source).mtimeMs,retainedMtime);
 const before=fs.readFileSync(source),write=fs.writeFileSync;fs.writeFileSync=function(file,...args){if(typeof file==='string'&&file.includes('/local-backups/'))throw Error('simulated backup disk failure');return write.call(fs,file,...args);};try{assert.throws(()=>docs.save(c.session,'should not save'),/simulated/);}finally{fs.writeFileSync=write;}assert.deepEqual(fs.readFileSync(source),before);
 // Simulate source rename failure after asset commit; rollback must remove the new asset.
 fs.writeFileSync(path.join(root,'media','other.svg'),'<svg>other</svg>');const rename=fs.renameSync;let blocked=false;fs.renameSync=function(from,to){if(to===fs.realpathSync(source)&&!blocked){blocked=true;throw Error('simulated save failure');}return rename.call(fs,from,to);};try{assert.throws(()=>docs.save(c.session,'<html><img src="/media/other.svg"></html>'),/simulated save failure/);}finally{fs.renameSync=rename;}assert.deepEqual(fs.readFileSync(source),before);
 const reloaded=create(root);assert.equal(reloaded.register(source).id,doc.id);assert.equal(reloaded.originals().length,1);
 assert.throws(()=>docs.source(doc.id,'../.local-launch-token'));assert.throws(()=>docs.versionFile(c.session,'initial','../.local-launch-token'));assert.throws(()=>docs.save('bad-session','<html/>'));
 const second=path.join(root,'other');fs.mkdirSync(second);fs.writeFileSync(path.join(second,path.basename(source)),'<html>other</html>');assert.notEqual(docs.register(path.join(second,path.basename(source))).id,doc.id);
 const copy=path.join(root,'workspace','sample.html');fs.writeFileSync(copy,'<html>copy</html>');const copySession=docs.session('workspace/sample.html');assert.equal(copySession.mode,'copy');docs.save(copySession.session,'<html>copy changed</html>');assert.equal(fs.readFileSync(copy,'utf8'),'<html>copy changed</html>');
 console.log('PASS: unchanged and repeated saves do not write or consume history; original save; initial + 20 snapshots; Persian paths; dependencies; two-tab and external conflicts; restore + undo-restore; portable new images; backup failure; atomic rollback; restart persistence; same-name isolation; copy mode; path/session guards.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
