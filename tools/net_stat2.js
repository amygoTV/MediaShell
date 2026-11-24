const { app, net } = require('electron');
const APIS = {
  '光速影视':'https://api.guangsuapi.com/api.php/provide/vod/',
  '虎牙采集':'https://www.huyaapi.com/api.php/provide/vod/',
  '虎牙HLS ':'https://www.huyaapi.com/api.php/provide/vod/from/hym3u8',
  '红牛影视':'https://www.hongniuzy2.com/api.php/provide/vod/',
  '淘片采集':'https://taopianapi.com/cjapi/mc/vod/json.html',
  '量子资源':'https://lzizy1.com/api.php/provide/vod/',
  '闪电影视':'http://sdzyapi.com/api.php/provide/vod/',
  '光速(短剧点播)':'https://api.guangsuapi.com/api.php/provide/vod/',
};
function get(url,timeout){
  return new Promise((resolve)=>{
    const t0=Date.now();
    const req=net.request({url,method:'GET',redirect:'follow',headers:{'User-Agent':'okhttp/3.15','Accept':'application/json,text/plain,*/*'}});
    let buf=[],done=false;const fin=(o)=>{if(!done){done=true;resolve(o);}};
    req.on('response',(res)=>{res.on('data',c=>buf.push(c));res.on('end',()=>fin({ok:true,ms:Date.now()-t0,len:Buffer.concat(buf).length}));res.on('error',e=>fin({ok:false,err:String(e&&e.message||e)}));});
    req.on('error',e=>fin({ok:false,err:String(e&&e.message||e)}));
    const t=setTimeout(()=>{try{req.abort();}catch(e){}fin({ok:false,err:'TIMEOUT'});},timeout);
    req.on('close',()=>clearTimeout(t));req.end();
  });
}
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const N=4;
  console.log(`=== 各站成功率统计（每站 ${N} 次，Electron net 模块）===\n`);
  for(const [name,api] of Object.entries(APIS)){
    const url=api+(api.includes('?')?'&':'?')+'ac=videolist&pg=1';
    const res=[];
    for(let i=0;i<N;i++) res.push(await get(url,12000));
    const ok=res.filter(r=>r.ok);
    const errs={};
    res.filter(r=>!r.ok).forEach(r=>{const k=String(r.err).replace(/[\d.]+ms/,'Xms').slice(0,40);errs[k]=(errs[k]||0)+1;});
    const avg=ok.length?Math.round(ok.reduce((a,r)=>a+r.ms,0)/ok.length):0;
    console.log(`${name}  ${String(ok.length).padStart(2)}/${N} 成功  平均${String(avg).padStart(5)}ms  ${Object.keys(errs).length?'失败:'+JSON.stringify(errs):''}`);
  }
  setTimeout(()=>{try{app.quit();}catch(e){process.exit(0);}},300);
});
