const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname, port = Number(process.env.VVVEB_PORT || 8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid VVVEB_PORT');
const docs=require('./local-documents.cjs')(root);
const {execFile}=require('node:child_process');
const runFile=require('node:util').promisify(execFile);
let picking=false;
const workspace = path.join(root,'workspace');
fs.mkdirSync(workspace,{recursive:true});
for(const name of ['test-fa.html','test-banner.svg']){const source=path.join(root,'samples',name),dest=path.join(workspace,name);if(fs.existsSync(source)&&!fs.existsSync(dest))fs.copyFileSync(source,dest);}
fs.mkdirSync(path.join(root,'media'),{recursive:true});
const mime={'.htm':'text/html; charset=utf-8','.otf':'font/otf','.mp4':'video/mp4','.webm':'video/webm','.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.ico':'image/x-icon'};
function safe(base,relative){
 if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').some(p=>p.startsWith('.'))) throw Error('مسیر فایل مجاز نیست.');
 const full=path.resolve(base,relative);
 if(!full.startsWith(base+path.sep))throw Error('مسیر فایل مجاز نیست.');
 let p=full;while(p!==base){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('پیوند فایل مجاز نیست.');p=path.dirname(p);}
 return full;
}
function backup(file){if(fs.existsSync(file)){const dest=path.join(root,'local-backups',Date.now()+'-'+path.basename(file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);}}
function pages(){let result=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.name.startsWith('.')||d.isSymbolicLink())continue;const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(/\.html?$/i.test(d.name)){const rel=path.relative(root,p).split(path.sep).join('/');result.push({name:rel,title:path.relative(workspace,p),file:rel,url:rel});}}}walk(workspace);return result.concat(docs.originals().map(d=>({name:d.file,title:d.title,file:d.file,url:'/source/'+d.id+'/'+encodeURIComponent(d.title)})));}
function media(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(d=>!d.name.startsWith('.')&&!d.isSymbolicLink()).map(d=>{const f=path.join(dir,d.name),rel='/'+path.relative(path.join(root,'media'),f).split(path.sep).join('/');return d.isDirectory()?{name:d.name,type:'folder',path:rel,items:media(f)}:{name:d.name,type:'file',path:rel,size:fs.statSync(f).size};});}
const server=http.createServer(async(req,res)=>{
 const send=(status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return send(403,'Forbidden');
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(req.method==='GET'){
   if(url.pathname==='/api/pages')return send(200,JSON.stringify(pages().map(p=>{if(p.file.startsWith('original/'))return docs.originals().find(d=>d.file===p.file);const stat=fs.statSync(path.join(root,p.file));return {file:p.file,title:path.basename(p.file),modified:stat.mtimeMs,size:stat.size,mode:'copy',sample:p.file==='workspace/test-fa.html'};}).sort((a,b)=>b.modified-a.modified)),'application/json');
   if(url.pathname.startsWith('/source/')){const parts=url.pathname.split('/');const rel=decodeURIComponent(parts.slice(3).join('/'));return send(200,docs.source(parts[2],rel,url.searchParams.get('session')),mime[path.extname(rel).toLowerCase()]||'application/octet-stream');}
   if(url.pathname==='/api/docs/history')return send(200,JSON.stringify(docs.history(url.searchParams.get('session'))),'application/json');
   if(url.pathname==='/api/docs/version'){
    const v=docs.versionFile(url.searchParams.get('session'),url.searchParams.get('version'),url.searchParams.get('asset'));
    if(url.searchParams.has('download'))res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(path.basename(v.name)));
    return send(200,v.data,url.searchParams.has('asset')?(mime[path.extname(v.name).toLowerCase()]||'application/octet-stream'):'text/plain; charset=utf-8');
   }
   if(url.pathname.startsWith('/api/docs/assets/')){const parts=url.pathname.split('/');const v=docs.versionFile(parts[4],parts[5],decodeURIComponent(parts.slice(6).join('/')));res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'none'; frame-src 'none'; form-action 'none'; sandbox allow-same-origin");return send(200,v.data,mime[path.extname(v.name).toLowerCase()]||'application/octet-stream');}
   if(url.pathname==='/api/docs/preview'){
    const sid=url.searchParams.get('session'),ver=url.searchParams.get('version'),s=docs.getSession(sid);
    const data=ver?docs.versionFile(sid,ver).data:fs.readFileSync(s.doc.path);
    const base=ver?'/api/docs/assets/'+sid+'/'+ver+'/':'/source/'+s.doc.id+'/';
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; script-src 'none'; frame-src 'none'; form-action 'none'; sandbox allow-same-origin");
    const html=data.toString('utf8').replace(/<base\b[^>]*>/gi,'').replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi,'');
    return send(200,'<base href="'+base+'">'+html,'text/html; charset=utf-8');
   }
   if(url.pathname==='/api/docs/disk'){const d=docs.getSession(url.searchParams.get('session')).doc;return send(200,fs.readFileSync(d.path),'text/plain; charset=utf-8');}
   if(url.pathname==='/health')return send(200,JSON.stringify({app:'vvvebjs-local',version:'2.0.9',instance:require('node:crypto').createHash('sha256').update(docs.token).digest('hex').slice(0,16)}),'application/json');
   if(url.pathname==='/scan.php')return send(200,JSON.stringify({name:'',type:'folder',path:'',items:media(path.join(root,'media'))}),'application/json');
   if(url.pathname==='/editor.html'){
    let html=fs.readFileSync(path.join(root,'editor.html'),'utf8');
    const list=pages();if(!list.length)return send(400,'ابتدا یک فایل HTML وارد کنید.');
    html=html.replace("window.mediaPath = '../../media';","window.mediaPath = '/media';");
    html=html.replace('<script src="libs/builder/inputs.js"></script>','<script src="libs/builder/inputs.js"></script><script>TextareaInput.events.unshift(["input","onChange","textarea"]);</script>');
    html=html.replace('let pages = defaultPages;','let pages = '+JSON.stringify(list).replace(/</g,'\\u003c')+';');
    html=html.replace('let firstPage = Object.keys(pages)[0];',`let firstPage = Math.max(0,pages.findIndex(p=>p.file===new URLSearchParams(location.search).get('file')));`);
    html=html.replace('</head>','<link rel="stylesheet" href="/local-editor.css"></head>');
    html=html.replace('<script src="libs/autocomplete/autocomplete.js"></script>','<script src="libs/autocomplete/autocomplete.js"></script><script src="/local-editor.js"></script>');
    html=html.replace('Vvveb.Builder.init(pages[firstPage]["url"]',"Vvveb.Builder.init('about:blank'");
    html=html.replace('Vvveb.FileManager.init();','LocalEditor.install();Vvveb.FileManager.init();');
    return send(200,html,'text/html; charset=utf-8');
   }
   const name=url.pathname==='/'?'local-home.html':decodeURIComponent(url.pathname.slice(1));
   if(name.startsWith('local-backups')||name.startsWith('local-server')||name.startsWith('local-launch')||name.endsWith('.log')||name.endsWith('.cjs')||name.endsWith('.py'))return send(403,'Forbidden');
   const f=safe(root,name);if(!fs.existsSync(f)||!fs.statSync(f).isFile())return send(404,'Not found');
   return send(200,fs.readFileSync(f),mime[path.extname(f).toLowerCase()]||'application/octet-stream');
  }
  if(req.method!=='POST')return send(405,'Method not allowed');
  if(req.headers.origin!=='http://'+req.headers.host)return send(403,'Forbidden');
  let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)return send(413,'حجم فایل زیاد است.');chunks.push(chunk);}const body=Buffer.concat(chunks);
  if(url.pathname.startsWith('/api/docs/')){
   const data=JSON.parse(body.toString()||'{}');
   if(url.pathname==='/api/docs/register'){
    if(req.headers['x-vvveb-launch-token']!==docs.token)return send(403,'Forbidden');
    const doc=docs.register(data.path);return send(200,JSON.stringify({url:'/editor.html?file='+encodeURIComponent(doc.file)}),'application/json');
   }
   if(url.pathname==='/api/docs/pick'){
    if(picking)return send(409,'پنجرهٔ انتخاب فایل باز است.');picking=true;
    try{const result=await runFile('/usr/bin/osascript',['-e','POSIX path of (choose file with prompt "فایل اصلی برای ویرایش را انتخاب کنید" of type {"public.html"})'],{timeout:180000});const doc=docs.register(result.stdout.trim());return send(200,JSON.stringify({url:'/editor.html?file='+encodeURIComponent(doc.file)}),'application/json');}
    catch(e){if(String(e.stderr).includes('-128'))return send(200,JSON.stringify({cancelled:true}),'application/json');throw e;}finally{picking=false;}
   }
   if(url.pathname==='/api/docs/session')return send(200,JSON.stringify(docs.session(data.file)),'application/json');
   if(url.pathname==='/api/docs/save')return send(200,JSON.stringify(docs.save(data.session,data.html)),'application/json');
   if(url.pathname==='/api/docs/restore')return send(200,JSON.stringify(docs.restore(data.session,data.version)),'application/json');
   if(url.pathname==='/api/docs/reveal-backups'){const doc=docs.getSession(data.session).doc;await runFile('/usr/bin/open',[path.join(root,'local-backups','documents',doc.id)]);return send(200,'{}','application/json');}
   if(url.pathname==='/api/docs/reveal'){const doc=docs.getSession(data.session).doc;await runFile('/usr/bin/open',['-R',doc.path]);return send(200,'{}','application/json');}
  }
  if(url.pathname==='/api/import'||url.pathname==='/upload.php'){
   const form=await new Request('http://127.0.0.1:'+port,{method:'POST',headers:{'content-type':req.headers['content-type']},body}).formData();
   if(url.pathname==='/api/import'){
    const entries=[];let total=0;
    for(const [key,file] of form.entries()){
     if(typeof file==='string')continue;
     const rel=key==='file'?file.name:key;
     if(!['.html','.htm','.css','.js','.json','.png','.jpg','.jpeg','.webp','.gif','.svg','.woff','.woff2','.ttf','.otf','.ico','.mp4','.webm'].includes(path.extname(rel).toLowerCase()))continue;
     safe(workspace,rel);total+=file.size;entries.push({rel,file});
    }
    if(!entries.some(e=>/\.html?$/i.test(e.rel)))return send(400,'فایل HTML پیدا نشد.');
    if(entries.length>1000||total>60*1024*1024)return send(413,'حداکثر ۱۰۰۰ فایل و ۶۰ مگابایت را وارد کنید.');
    const dest=fs.mkdtempSync(path.join(workspace,'import-'));let first='';
    try{
     for(const {rel,file} of entries){
      const f=safe(dest,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,Buffer.from(await file.arrayBuffer()));
      if(/\.html?$/i.test(rel)&&(!first||path.basename(rel).toLowerCase()==='index.html'))first=path.relative(root,f).split(path.sep).join('/');
     }
     return send(200,JSON.stringify({url:'/editor.html?file='+encodeURIComponent(first)}),'application/json');
    }catch(error){fs.rmSync(dest,{recursive:true,force:true});throw error;}
   }
   const file=form.get('file');if(!file||typeof file==='string')return send(400,'فایل انتخاب نشده است.');
   if(!/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file.name))return send(400,'یک فایل تصویر انتخاب کنید.');
   const name=Date.now()+'-'+path.basename(file.name);fs.writeFileSync(safe(path.join(root,'media'),name),Buffer.from(await file.arrayBuffer()));
   return send(200,form.get('onlyFilename')?name:'/media/'+name);
  }
  if(url.pathname==='/save.php'){
   return send(409,'روش ذخیره به‌روز شده است. ابتدا خروجی تغییرات را دریافت کنید. سپس ویرایشگر را دوباره باز کنید.');
  }
  return send(404,'Not found');
 }catch(e){console.error(e.message);if(!res.headersSent)send(e.status||400,e.message);}
});
server.listen(port,'127.0.0.1',()=>console.log('VvvebJs: http://127.0.0.1:'+port));
