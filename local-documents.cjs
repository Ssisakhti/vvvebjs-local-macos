'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const uuid=()=>crypto.randomUUID();
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
module.exports=function(root){
 const dbFile=path.join(root,'.local-documents.json'),backupRoot=path.join(root,'local-backups','documents');
 let db=fs.existsSync(dbFile)?JSON.parse(fs.readFileSync(dbFile,'utf8')):{};
 const sessions=new Map();
 const tokenFile=path.join(root,'.local-launch-token');
 if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
 const token=fs.readFileSync(tokenFile,'utf8').trim();
 function atomic(file,data,mode=0o600){const temp=path.join(path.dirname(file),'.vvveb-'+uuid());try{const fd=fs.openSync(temp,'wx',mode);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 function persist(){atomic(dbFile,JSON.stringify(db,null,2));}
 function checked(doc){if(!fs.existsSync(doc.path))fail('فایل اصلی پیدا نشد. آن را دوباره انتخاب کنید.',404);if(fs.realpathSync(doc.path)!==doc.path||!fs.statSync(doc.path).isFile())fail('مسیر فایل تغییر کرده است. آن را دوباره انتخاب کنید.',409);return doc.path;}
 function metadata(doc){const file=checked(doc),st=fs.statSync(file);return {id:doc.id,file:doc.file,title:path.basename(file),path:file,mode:doc.mode,size:st.size,modified:st.mtimeMs,sample:file===path.join(root,'workspace/test-fa.html')};}
 function docDir(doc){return path.join(backupRoot,doc.id);}
 function manifest(doc){const f=path.join(docDir(doc),'history.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[];}
 function writeHistory(doc,entries){atomic(path.join(docDir(doc),'history.json'),JSON.stringify(entries,null,2));}
 function localPath(base,rel){if(typeof rel!=='string'||rel.includes('\\')||rel.split('/').some(p=>p.startsWith('.')))fail('مسیر فایل جانبی مجاز نیست.');const f=path.resolve(base,rel);if(!f.startsWith(base+path.sep))fail('مسیر فایل جانبی مجاز نیست.');let p=f;while(p!==base){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())fail('پیوند فایل جانبی مجاز نیست.');p=path.dirname(p);}return f;}
 const extensions=new Set(['.css','.js','.json','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2','.ttf','.otf','.ico','.mp4','.webm']);
 function collect(doc,extras=[]){const base=path.dirname(checked(doc)),files=new Map(),queue=[path.basename(doc.path),...extras];let total=0;
  while(queue.length){const rel=queue.pop();if(files.has(rel))continue;let file;try{file=localPath(base,rel);}catch{continue;}if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
   const size=fs.statSync(file).size;if(total+size>60*1024*1024||files.size>=1000)fail('حجم پشتیبان بیشتر از ۶۰ مگابایت یا تعداد فایل‌ها بیشتر از ۱۰۰۰ است. ذخیره انجام نشد.');
   const data=fs.readFileSync(file);total+=data.length;files.set(rel,data);
   if(file!==doc.path&&!['.css','.svg'].includes(path.extname(file).toLowerCase()))continue;
   const text=data.toString('utf8'),refs=[];
   for(const match of text.matchAll(/(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gi))refs.push(match[2]);
   for(const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi))refs.push(match[1]??match[2]??match[3]);
   for(const match of text.matchAll(/@import\s*(["'])(.*?)\1/gi))refs.push(match[2]);
   for(let ref of refs){if(/^(?:[a-z]+:|\/|#)/i.test(ref))continue;try{ref=decodeURIComponent(ref.split(/[?#]/)[0]);}catch{continue;}const child=path.posix.normalize(path.posix.join(path.posix.dirname(rel),ref));if(extensions.has(path.extname(child).toLowerCase()))queue.push(child);}
  }return files;
 }
 function snapshot(doc,kind='save',extras=[]){const entries=manifest(doc);if(kind==='initial'&&entries.some(e=>e.kind==='initial'))return;
  const id=kind==='initial'?'initial':uuid(),dir=path.join(docDir(doc),id),files=collect(doc,extras);fs.mkdirSync(dir,{recursive:true});
  try{for(const [rel,data] of files){const dest=localPath(dir,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data,{flag:'wx',mode:0o600});}
   const item={id,kind,time:Date.now(),size:files.get(path.basename(doc.path)).length,files:[...files.keys()]};entries.push(item);writeHistory(doc,entries);return item;
  }catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
 }
 function prune(doc){try{const entries=manifest(doc),saved=entries.filter(e=>e.kind!=='initial'),keep=new Set(saved.slice(-20).map(e=>e.id)),retained=entries.filter(e=>e.kind==='initial'||keep.has(e.id));writeHistory(doc,retained);for(const entry of entries)if(!retained.includes(entry))fs.rmSync(path.join(docDir(doc),entry.id),{recursive:true,force:true});}catch(e){console.error('Backup retention:',e.message);}}
 function register(source,mode='original'){
  const file=fs.realpathSync(source);if(!/\.html?$/i.test(file)||!fs.statSync(file).isFile())fail('یک فایل HTML یا HTM انتخاب کنید.');
  let doc=Object.values(db).find(d=>d.path===file);if(!doc){const id=uuid();doc={id,path:file,mode,file:mode==='original'?'original/'+id:path.relative(root,file).split(path.sep).join('/')};snapshot(doc,'initial');db[id]=doc;try{persist();}catch(e){delete db[id];throw e;}}
  checked(doc);return metadata(doc);
 }
 function getDoc(file){let doc=Object.values(db).find(d=>d.file===file);if(!doc){if(typeof file!=='string'||!file.startsWith('workspace/'))fail('فایل ثبت نشده است.',404);const f=localPath(root,file);register(f,'copy');doc=Object.values(db).find(d=>d.path===fs.realpathSync(f));}checked(doc);return doc;}
 function session(file){const doc=getDoc(file),data=fs.readFileSync(doc.path);if(data.length>60*1024*1024)fail('حجم فایل بیشتر از ۶۰ مگابایت است.');snapshot(doc,'initial');const id=uuid();while(sessions.size>=100)sessions.delete(sessions.keys().next().value);sessions.set(id,{doc,hash:hash(data),data,created:Date.now()});return {...metadata(doc),session:id,url:'/source/'+doc.id+'/'+encodeURIComponent(path.basename(doc.path))+'?session='+id};}
 function getSession(id){const s=sessions.get(id);if(!s||Date.now()-s.created>24*60*60*1000)fail('نشست ویرایش پایان یافته است. خروجی تغییرات را دریافت کنید و فایل را دوباره باز کنید.',409);checked(s.doc);return s;}
 function assertUnchanged(s){if(hash(fs.readFileSync(checked(s.doc)))!==s.hash)fail('فایل در جای دیگری تغییر کرده است. ذخیره متوقف شد. تغییرات خود را دریافت کنید یا نسخهٔ روی دیسک را بررسی کنید.',409);}
 function portableMedia(doc,html){const base=path.dirname(doc.path),folder=path.basename(doc.path,path.extname(doc.path))+'.vvveb-assets';const writes=new Map();
  html=html.replace(/(?:https?:\/\/(?:127\.0\.0\.1|localhost):8787)?\/media\/([^\s"'<>?#)]+)/g,(url,name)=>{let decoded;try{decoded=decodeURIComponent(name);}catch{return url;}let src;try{src=localPath(path.join(root,'media'),decoded);}catch{return url;}if(!fs.existsSync(src))fail('تصویر افزوده‌شده پیدا نشد. ذخیره انجام نشد.');const data=fs.readFileSync(src),rel=folder+'/'+hash(data).slice(0,20)+path.extname(src).toLowerCase();const target=localPath(base,rel);if(fs.existsSync(target)){if(!fs.readFileSync(target).equals(data))fail('فایل تصویر در مقصد تغییر کرده است. ذخیره انجام نشد.',409);}else writes.set(rel,data);return rel.split('/').map(p=>encodeURIComponent(p).replace(/'/g,'%27')).join('/');});return {html,writes};
 }
 function commit(doc,writes,expected){const base=path.dirname(checked(doc)),previous=new Map(),prepared=new Map(),done=[];try{
  for(const [rel,data] of writes){const dest=localPath(base,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});const exists=fs.existsSync(dest);if(exists&&!fs.statSync(dest).isFile())fail('مقصد ذخیره یک فایل نیست.');previous.set(dest,exists?fs.readFileSync(dest):null);const temp=path.join(path.dirname(dest),'.vvveb-'+uuid()),mode=exists?fs.statSync(dest).mode&0o777:0o644;const fd=fs.openSync(temp,'wx',mode);prepared.set(dest,temp);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  if(hash(fs.readFileSync(checked(doc)))!==expected)fail('فایل هنگام ذخیره تغییر کرد. ذخیره متوقف شد.',409);
  for(const [dest,temp] of prepared){fs.renameSync(temp,dest);done.push(dest);}
 }catch(error){for(const dest of done.reverse()){const data=previous.get(dest);if(data===null)fs.unlinkSync(dest);else atomic(dest,data,fs.statSync(dest).mode&0o777);}throw error;
 }finally{for(const temp of prepared.values())if(fs.existsSync(temp))fs.unlinkSync(temp);}}
 function save(id,html){const s=getSession(id);assertUnchanged(s);fs.accessSync(s.doc.path,fs.constants.W_OK);if(typeof html!=='string'||!html.trim())fail('محتوای HTML خالی است.');const result=portableMedia(s.doc,html);snapshot(s.doc,'save');const writes=result.writes;writes.set(path.basename(s.doc.path),Buffer.from(result.html));commit(s.doc,writes,s.hash);s.hash=hash(Buffer.from(result.html));s.data=Buffer.from(result.html);prune(s.doc);return {message:'ذخیره شد؛ نسخهٔ پشتیبان آماده است.',...metadata(s.doc)};}
 function history(id){const s=getSession(id);return {...metadata(s.doc),conflict:hash(fs.readFileSync(s.doc.path))!==s.hash,versions:manifest(s.doc).slice().reverse()};}
 function version(doc,id){const item=manifest(doc).find(e=>e.id===id);if(!item)fail('نسخه پیدا نشد.',404);return item;}
 function versionFile(sessionId,versionId,rel){const s=getSession(sessionId),entry=version(s.doc,versionId);rel=rel||path.basename(s.doc.path);if(!entry.files.includes(rel))fail('فایل پشتیبان پیدا نشد.',404);return {data:fs.readFileSync(localPath(path.join(docDir(s.doc),versionId),rel)),name:rel};}
 function restore(id,versionId){const s=getSession(id);assertUnchanged(s);fs.accessSync(s.doc.path,fs.constants.W_OK);const entry=version(s.doc,versionId),files=new Map();for(const rel of entry.files)files.set(rel,versionFile(id,versionId,rel).data);const main=path.basename(s.doc.path),data=files.get(main);files.delete(main);files.set(main,data);snapshot(s.doc,'restore',entry.files);commit(s.doc,files,s.hash);s.hash=hash(data);s.data=data;prune(s.doc);return {message:'نسخه بازیابی شد. وضعیت پیش از بازیابی نیز نگهداری شد.'};}
 function source(id,rel,sessionId){const doc=db[id];if(!doc)fail('فایل پیدا نشد.',404);const main=path.basename(doc.path);if(rel===main&&sessionId){const s=getSession(sessionId);if(s.doc.id!==id)fail('نشست معتبر نیست.',403);return s.data;}const file=localPath(path.dirname(checked(doc)),rel);if(rel!==main&&!extensions.has(path.extname(file).toLowerCase()))fail('نوع فایل مجاز نیست.',403);return fs.readFileSync(file);}
 return {token,register,session,getSession,save,history,restore,versionFile,source,metadata,getDoc,originals:()=>Object.values(db).filter(d=>d.mode==='original').flatMap(d=>{try{return [metadata(d)];}catch{return [];}})};
};
