/* Exercise the real normalization, MPD and serialized playback loader. No TV,
 * account, network credentials or generated product hooks are required. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {XMLParser} from 'fast-xml-parser';
const source=n=>fs.readFileSync(new URL('../app/js/'+n,import.meta.url),'utf8');
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseAttributeValue:true});
const list=x=>[].concat(x||[]);
let checks=0;
async function check(name,fn){await fn();checks++;console.log('✓ '+name);}
function context(extra={}){
 const stored=new Map();const c=vm.createContext({console,Promise,Blob,URL,ArrayBuffer,Uint8Array,DataView,
  localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},
  MediaSource:{isTypeSupported:()=>true},webapis:{avinfo:{isHdrTvSupport:()=>true}},...extra});
 c.window=c;vm.runInContext(source('settings.js'),c);vm.runInContext(source('mpd.js'),c);return c;
}
const seg={init:'0-12',index:'13-24'};
const v=(id,codec='hvc1.1.6.L150.90')=>({id,codecid:12,codecs:codec,width:1920,height:1080,bandwidth:500000,urls:['https://media.invalid/'+id+'.m4s'],baseUrl:'https://media.invalid/'+id+'.m4s',segments:seg});
const hdr=()=>({...v(125,'hvc1.2.4.L150.90'),width:3840,height:1920,bandwidth:14000000});
const aac=()=>({...v(30280,'mp4a.40.2'),bandwidth:128000,audioSamplingRate:44100,channels:2});
const dolby=()=>({...v(30250,'ec-3'),bandwidth:640000,audioSamplingRate:48000,channels:6,spatialAudio:true});
const fixture=()=>({duration:120,video:[hdr(),v(80),v(32)],audio:[aac(),dolby()]});
await check('HDR defaults remain 4K/auto; explicit cap is provisional until saved',()=>{
 const {Settings:s}=context();assert.equal(s.qnCap(),120);assert.equal(s.qualityPreference(),0);assert.equal(s.preferAtmos(),true);
 assert.equal(s.resolveQuality([80,120,125],125),120);assert.equal(s.resolveQuality([80,120,125],125,125),125);assert.equal(s.qnCap(),120);
 s.set('preferredQn',125);s.set('maxQn',125);assert.equal(s.qualityPreference(),125);assert.equal(s.resolveQuality([80,32]),80);assert.equal(s.qualityPreference(),125);
 s.set('preferAtmos',false);assert.equal(s.preferAtmos(),false);
});
await check('HDR requires the panel, Main10 codec support and an actual indexed QN 125 rep',()=>{
 for(const extra of [{webapis:{}},{webapis:{avinfo:{isHdrTvSupport(){throw Error('unsupported');}}}},{MediaSource:{isTypeSupported:t=>!t.includes('.2.')}}]){
  const {Mpd:m}=context(extra);assert.equal(m.hasHdr(fixture()),false);assert.ok(!m.build(fixture(),125).includes('id="125"'));
 }
 const {Mpd:m}=context();assert.equal(m.hasHdr({video:[{...hdr(),segments:null}]}),false);assert.equal(m.hasHdr({video:[{...hdr(),codecs:'avc1.640032'}]}),false);
});
await check('MPD keeps HDR/SDR and audio codecs separate; JOC is on the audio Representation',()=>{
 const {Mpd:m}=context(),d=fixture();let xml=m.build(d,125),sets=parser.parse(xml).MPD.Period.AdaptationSet;
 assert.deepEqual(list(sets[0].Representation).map(r=>r['@id']),[125]);assert.equal(m.chosenHdr(),true);assert.equal(m.chosenAudio(),'ec-3');
 const audio=list(sets[1].Representation)[0];assert.equal(audio['@audioSamplingRate'],48000);assert.equal(audio.SupplementalProperty['@value'],'JOC');assert.equal(audio.AudioChannelConfiguration['@value'],'F801');
 assert.ok(xml.includes('TransferCharacteristics" value="16"'));
 xml=m.build(d,125,null,null,{hdr:false,atmos:false});sets=parser.parse(xml).MPD.Period.AdaptationSet;
 assert.deepEqual(list(sets[0].Representation).map(r=>r['@id']),[80,32]);assert.ok(!xml.includes('JOC'));assert.equal(m.chosenAudio(),'mp4a.40.2');assert.ok(!xml.includes('TransferCharacteristics'));
 assert.deepEqual(Array.from(m.tiers(d,125)),[125,80,32]);
});
await check('generic ec-3 and missing decoder metadata cannot acquire an Atmos preference',()=>{
 const {Mpd:m}=context();for(const change of [{spatialAudio:false},{audioSamplingRate:0},{channels:0}])assert.equal(parser.parse(m.build({...fixture(),audio:[aac(),{...dolby(),...change}]},120)).MPD.Period.AdaptationSet[1].Representation['@codecs'],'mp4a.40.2');
 const c=context();c.Settings.set('preferAtmos',false);assert.equal(c.Mpd.build(fixture(),125).includes('JOC'),false);
});
const init=Uint8Array.from([0,0,0,13,100,101,99,51,0x14,0,0x20,0x0f,0]).buffer;
await check('both endpoints preserve Main10 dimensions, normalize Dolby mirrors and derive 48 kHz/5.1',()=>{
 const requests=[];let out;
 const web={duration:120,video:[hdr(),v(80)],audio:[aac()],dolby:{type:2,audio:[{...dolby(),urls:undefined,audioSamplingRate:0,channels:0,baseUrl:'https://upos-sz-mirrorcosov.bilivideo.com/30250.m4s',backupUrl:['https://upos-hz-mirrorakam.akamaized.net/30250.m4s']} ]}};
 for(const r of web.video.concat(web.audio,web.dolby.audio)){r.SegmentBase={Initialization:seg.init,indexRange:seg.index};}
 class XHR{
  open(method,url){this.url=url;this.headers={};}setRequestHeader(k,v){this.headers[k]=v;}
  send(){requests.push(this);this.status=200;this.readyState=4;
   if(this.url.includes('bilibili.com/')){
    const app=this.url.includes('app.bilibili.com/');
    const d=app?{timelength:120000,dash:{video:web.video.map(r=>({...r,codecs:undefined,width:undefined,height:undefined,segments:undefined,SegmentBase:undefined})),audio:[{...aac(),segments:undefined,SegmentBase:undefined}]}}:{dash:web,accept_quality:[125,80]};
    this.responseText=JSON.stringify({code:0,data:d});this.onreadystatechange?.();
   }else{this.status=206;this.response=init.slice(0);this.onload?.();}
  }
 }
 const c=context({XMLHttpRequest:XHR,setTimeout,clearTimeout,Auth:{isLoggedIn:()=>true,accessKey:()=> 'test',cookieHeader:()=>'',jarIsOurs:()=>false,signTv:p=>new URLSearchParams(p).toString()}});
 vm.runInContext(source('api.js'),c);
 c.API.playurlDash('BVTEST',1,80,x=>out=x,e=>{throw Error(e);});assert.ok(out);
 assert.equal(out.audio.find(r=>r.id===30250).channels,6);assert.equal(out.audio.find(r=>r.id===30250).audioSamplingRate,48000);
 assert.equal(out.audio.find(r=>r.id===30250).urls.length,2);
 const q=new URL(requests[0].url).searchParams,flags=Number(q.get('fnval'));assert.equal(q.get('qn'),'125');assert.equal(flags&64,64);assert.equal(flags&256,256);assert.equal(flags&(512|1024),0);
 assert.ok(requests.filter(x=>!x.url.includes('bilibili.com/')).every(x=>!x.headers.Cookie&&x.headers.Range==='bytes=0-12'));
 out=null;c.API.playurlDashStrong(1,1,80,x=>out=x,e=>{throw Error(e);});assert.ok(out);
 const h=out.video.find(r=>r.id===125);assert.equal(h.codecs,hdr().codecs);assert.equal(h.width,3840);assert.equal(h.height,1920);
 assert.equal(out.audio.find(r=>r.id===30250).webToken,true);assert.equal(out.audio.find(r=>r.id===30250).channels,6);
});
async function playerHarness(){
 const timers=new Map(),listeners=new Map(),sdkListeners=new Map(),reqFilters=[],respFilters=[],nodes=new Map();let id=0,tracks=[],loads=[],abr=true;
 function node(name){if(!nodes.has(name))nodes.set(name,{id:name,style:{},className:'',currentTime:0,duration:120,paused:true,readyState:4,ended:false,
  buffered:{length:1,start:()=>0,end:()=>120},addEventListener:(k,f)=>listeners.set(k,f),removeAttribute(){},load(){},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}});return nodes.get(name);}
 const video=node('html5-video');
 const engine={attach:async()=>{},unload:async()=>{},configure:c=>{if(c.abr)abr=c.abr.enabled;},
  addEventListener:(k,f)=>sdkListeners.set(k,f),getNetworkingEngine:()=>({registerRequestFilter:f=>reqFilters.push(f),registerResponseFilter:f=>respFilters.push(f)}),
  getVariantTracks:()=>tracks,getStats:()=>({}),getBufferedInfo:()=>({audio:[{start:0,end:120}],video:[{start:0,end:120}]}),retryStreaming(){},
  cancelTrickPlay(){},trickPlay(){video.paused=false;},selectVariantTrack:t=>{tracks.forEach(x=>x.active=x===t);sdkListeners.get('segmentappended')?.({contentType:'video'});},
  load:async(url,start)=>{const xml=await (await fetch(url)).text();loads.push({xml,start});const sets=parser.parse(xml).MPD.Period.AdaptationSet,a=list(sets[1].Representation)[0];
   tracks=list(sets[0].Representation).map((v,i)=>({id:i,originalVideoId:String(v['@id']),originalAudioId:String(a['@id']),audioId:a['@id'],videoCodec:v['@codecs'],audioCodec:a['@codecs'],spatialAudio:!!a.SupplementalProperty,width:v['@width'],height:v['@height'],active:i===0}));
   video.currentTime=start||0;video.paused=!video.autoplay;sdkListeners.get('segmentappended')?.({contentType:'video'});
  }};
 class SdkError extends Error{constructor(severity,category,code,...data){super(String(code));Object.assign(this,{severity,category,code,data});}}
 SdkError.Severity={RECOVERABLE:1,CRITICAL:2};SdkError.Category={NETWORK:1,PLAYER:7};SdkError.Code={OPERATION_ABORTED:7001,HTTP_ERROR:1002};
 function FakePlayer(){return engine;}FakePlayer.isBrowserSupported=()=>true;
 const c=context({document:{getElementById:node,createElement:()=>node('created'),body:{appendChild(){}}},setTimeout:(f,ms)=>{timers.set(++id,{f,ms});return id;},clearTimeout:k=>timers.delete(k),setInterval:()=>++id,clearInterval(){},navigator:{userAgent:'test'},
  shaka:{Player:FakePlayer,polyfill:{installAll(){}},net:{NetworkingEngine:{RequestType:{SEGMENT:1}}},util:{Error:SdkError}}});
 c.addEventListener=()=>{};let src=source('player.js').replace('    return {\n        on:', '    window.__epoch=function(){return mseGeneration;};\n    return {\n        on:');vm.runInContext(src,c);
 c.Settings.set('maxQn',125);c.Player.on(()=>{});c.Player.prewarm();
 async function drain(){for(let i=0;i<20;i++)await new Promise(setImmediate);}
 async function open(d=fixture(),options={}){c.Player.playDash(d,50000,{quality:0,...options});await drain();listeners.get('timeupdate')?.();}
 async function jobs(){for(const [k,t] of Array.from(timers))if(t.ms===0){timers.delete(k);t.f();}await drain();}
 function partial(uri,epoch=c.__epoch()){
  const r={uri,data:new ArrayBuffer(41014),headers:{'content-range':'bytes 5201866-5601317/15200966'}};
  assert.throws(()=>respFilters[0](1,r,{biliGeneration:epoch}),e=>e.code===7001);return r;
 }
 return {c,video,engine,loads,open,jobs,drain,partial,reqFilters,respFilters,epoch:()=>c.__epoch(),abr:()=>abr,sdkListeners};
}
await check('short E-AC-3 response is rejected before append, preserves HDR and resumes on AAC',async()=>{
 const h=await playerHarness();await h.open();assert.equal(h.c.Player.currentQuality(),125);assert.equal(h.c.Player.formatStatus().audio,'Dolby Atmos');
 h.partial(dolby().urls[0]);await h.jobs();assert.equal(h.c.Player.formatStatus().atmosFailed,true);assert.equal(h.c.Player.formatStatus().hdrFailed,false);assert.equal(h.c.Player.currentQuality(),125);assert.equal(h.c.Player.formatStatus().audio,'AAC');assert.equal(h.loads.at(-1).start,50);assert.equal(h.video.paused,false);
});
await check('pause and resume issued after failure win across the serialized reload, including 2x',async()=>{
 for(const paused of [true,false]){
  const h=await playerHarness();await h.open();h.c.Player.setRate(2);if(!paused)h.c.Player.pause();
  h.partial(dolby().urls[0]);paused?h.c.Player.pause():h.c.Player.resume();await h.jobs();
  assert.equal(h.video.paused,paused);assert.equal(h.video.currentTime,50);assert.equal(h.c.Player.rate(),2);assert.equal(h.c.Player.formatStatus().audio,'AAC');
 }
});
await check('HDR failure preserves Atmos and enables SDR ABR without overwriting saved HDR preference',async()=>{
 const h=await playerHarness();h.c.Settings.set('preferredQn',125);await h.open(fixture(),{quality:125});
 h.partial(hdr().urls[0]);await h.jobs();assert.equal(h.c.Player.formatStatus().hdrFailed,true);assert.equal(h.c.Player.formatStatus().audio,'Dolby Atmos');assert.ok(h.c.Player.currentQuality()<125);assert.equal(h.abr(),true);assert.equal(h.c.Settings.qualityPreference(),125);assert.ok(!h.c.Player.qualityChoices(fixture()).includes(125));
});
await check('a web-token 403 reaches token recovery before disabling HDR',async()=>{
 const h=await playerHarness();await h.open();
 h.sdkListeners.get('error')({detail:{severity:2,category:1,code:1001,data:[hdr().urls[0],403]}});
 assert.equal(h.c.Player.formatStatus().hdrFailed,false);
});
await check('same-video teardown and fresh manifests retain the failed-format budget',async()=>{
 const h=await playerHarness();await h.open();h.partial(dolby().urls[0]);await h.jobs();
 h.c.Player.stop({keepFormats:true});await h.open(fixture());
 assert.equal(h.c.Player.formatStatus().atmosFailed,true);assert.equal(h.c.Player.formatStatus().audio,'AAC');
});
await check('new video cancels queued format recovery and rejects old-generation segment responses',async()=>{
 const h=await playerHarness();await h.open();const old=h.epoch();h.partial(dolby().urls[0]);h.c.Player.stop();
 const next=fixture();next.video=next.video.map(r=>({...r,urls:r.urls.map(u=>u.replace('.m4s','-next.m4s'))}));next.audio=next.audio.map(r=>({...r,urls:r.urls.map(u=>u.replace('.m4s','-next.m4s'))}));
 await h.open(next);const before=h.loads.length;await h.jobs();assert.equal(h.loads.length,before);assert.equal(h.c.Player.formatStatus().atmosFailed,false);assert.equal(h.c.Player.formatStatus().audio,'Dolby Atmos');
 h.partial(dolby().urls[0],old);await h.jobs();assert.equal(h.loads.length,before);assert.equal(h.c.Player.formatStatus().atmosFailed,false);
});
console.log(`${checks}/${checks} HDR/Atmos scenarios passed (controlled media, not device output acceptance).`);
