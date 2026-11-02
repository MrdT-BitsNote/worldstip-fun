(function(){
"use strict";
var nav=document.querySelector('.nav'),bar=document.querySelector('.scroll-progress');
var heroIn=document.querySelector('.hero-in');
function onScroll(){
  var y=window.scrollY||document.documentElement.scrollTop;
  if(nav)nav.classList.toggle('show',y>640);
  if(bar){var h=document.documentElement.scrollHeight-window.innerHeight;
    bar.style.width=(h>0?(y/h*100):0)+'%';}
  if(heroIn&&y<window.innerHeight*1.2){
    var p=Math.min(y/(window.innerHeight*.85),1);
    heroIn.style.transform='translateY('+(y*.32)+'px) scale('+(1-p*.14)+')';
    heroIn.style.opacity=String(1-p*.9);
  }
}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();

/* 进场动画 */
var io=('IntersectionObserver'in window)?new IntersectionObserver(function(es){
  es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
},{threshold:.08,rootMargin:'0px 0px -30px 0px'}):null;
document.querySelectorAll('.reveal').forEach(function(el){io?io.observe(el):el.classList.add('in');});

/* 数字滚动 */
function countUp(el){
  var target=parseFloat(el.getAttribute('data-count'))||0,dec=+(el.getAttribute('data-dec')||0);
  var t0=performance.now(),dur=1400;
  function step(t){
    var p=Math.min((t-t0)/dur,1),e=1-Math.pow(1-p,3);
    var v=target*e;
    el.textContent=dec?v.toFixed(dec):Math.round(v).toLocaleString('zh-CN');
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
var cio=('IntersectionObserver'in window)?new IntersectionObserver(function(es){
  es.forEach(function(e){if(e.isIntersecting){countUp(e.target);cio.unobserve(e.target);}});
},{threshold:.4}):null;
document.querySelectorAll('[data-count]').forEach(function(el){cio?cio.observe(el):
  el.textContent=(+(el.getAttribute('data-dec')||0)?(+el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-dec')||0)):(+el.getAttribute('data-count')).toLocaleString('zh-CN'));});

/* 城市搜索 + 省筛选 + 渐进展开（首屏只渲染 18 张，避免 389 张卡片一次铺满） */
var grid=document.getElementById('city-grid'),q=document.getElementById('city-q'),
    chips=document.getElementById('prov-chips'),cnt=document.getElementById('city-count'),
    shownEl=document.getElementById('city-shown'),moreBtn=document.getElementById('city-more');
var CITIES=[];try{CITIES=JSON.parse(document.getElementById('cities-data').textContent);}catch(e){}
var CITY0=window.innerWidth<700?6:12;
var curProv='全部',cityLimit=CITY0;
var CITY_STEP=24;
function renderCities(){
  if(!grid)return;
  var kw=(q&&q.value||'').trim().toLowerCase(),match=[];
  CITIES.forEach(function(c){
    var okP=curProv==='全部'||c.province===curProv;
    var okK=!kw||c.city.toLowerCase().indexOf(kw)>=0||c.province.toLowerCase().indexOf(kw)>=0;
    if(okP&&okK)match.push(c);
  });
  function dim(v,l){return v>0?'<span class="dim-tag">'+l+' '+v+'</span>':'';}
  var frag=document.createDocumentFragment(),n=Math.min(cityLimit,match.length);
  match.slice(0,cityLimit).forEach(function(c){
    var cell=document.createElement('div');cell.className='city-cell';
    var el=document.createElement('a');
    el.className='city-card';el.href=c.page;
    var gd='';
    ['S','A','B','C'].forEach(function(g){var v=c.grades[g]||0;
      if(v>0)gd+='<i class="g-'+g.toLowerCase()+'" style="width:'+(v/Math.max(c.districts||1,1)*100)+'%" title="'+g+'级 '+v+' 个"></i>';});
    el.innerHTML='<div class="cc-top"><span class="cc-name">'+esc(c.city)+'</span><span class="cc-prov">'+esc(c.province)+'</span></div>'
      +'<div class="cc-poi"><b>'+(c.poi||0).toLocaleString('zh-CN')+'</b> POI · 商圈 <b>'+(c.districts||0)+'</b> 处</div>'
      +'<div class="gradebar">'+gd+'</div>'
      +'<div class="cc-dims">'
      +dim(c.dims.food,'美食')+dim(c.dims.leisure,'休闲')
      +dim(c.dims.kids,'亲子')+dim(c.dims.hotel,'酒店')+dim(c.dims.product,'特产')
      +'</div><div class="cc-foot"><span class="cc-go">进入城市</span></div>';
    cell.appendChild(el);
    if(c.map){
      var mb=document.createElement('a');mb.className='cc-mapbtn';
      mb.href=c.page+'#dist-map';mb.title='看 '+c.city+' 的商圈地图';mb.innerHTML='🗺 地图';
      cell.appendChild(mb);
    }
    frag.appendChild(cell);
  });
  grid.innerHTML='';
  if(match.length===0){grid.innerHTML='<div class="empty-hint">没有匹配的城市，换个关键词试试</div>';}
  else grid.appendChild(frag);
  if(cnt)cnt.textContent=match.length;
  if(shownEl)shownEl.textContent=n;
  if(moreBtn){
    var left=match.length-cityLimit;
    if(left>0){moreBtn.hidden=false;moreBtn.textContent='展开更多城市（还有 '+left+' 座）';}
    else moreBtn.hidden=true;
  }
}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
if(q)q.addEventListener('input',function(){cityLimit=CITY0;renderCities();});
if(chips)chips.addEventListener('click',function(e){
  var b=e.target.closest('.chip');if(!b)return;
  chips.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on');});
  b.classList.add('on');curProv=b.getAttribute('data-prov');cityLimit=CITY0;renderCities();
});
if(moreBtn)moreBtn.addEventListener('click',function(){cityLimit+=CITY_STEP;renderCities();});
renderCities();

/* 随机城市 */
var dice=document.getElementById('dice');
if(dice)dice.addEventListener('click',function(){
  var c=CITIES[Math.floor(Math.random()*CITIES.length)];
  if(c)location.href=c.page;
});
/* "/" 聚焦搜索 */
document.addEventListener('keydown',function(e){
  if(e.key==='/'&&document.activeElement!==q){e.preventDefault();if(q)q.focus();}
});

/* 商圈地图入口：datalist 由 CITIES 现场生成，输入后直达该城 #dist-map */
var mapForm=document.getElementById('map-form'),mapInput=document.getElementById('map-city'),
    mapList=document.getElementById('map-city-list'),mapHint=document.getElementById('map-hint'),
    mapHint0=mapHint?mapHint.textContent:'';
if(mapList&&CITIES.length){
  var _df=document.createDocumentFragment();
  CITIES.forEach(function(c){
    if(!c.map)return;
    var o=document.createElement('option');o.value=c.city;o.label=c.province;_df.appendChild(o);
  });
  mapList.appendChild(_df);
}
function normCity(t){return (t||'').replace(/\s+/g,'').replace(/[市地区盟州]+$/,'');}
if(mapForm)mapForm.addEventListener('submit',function(e){
  e.preventDefault();
  var key=normCity(mapInput&&mapInput.value),hit=null,i;
  if(!key){if(mapHint){mapHint.className='me-hint me-err';mapHint.textContent='先输入城市名，例如 岳阳';}return;}
  for(i=0;i<CITIES.length;i++){if(normCity(CITIES[i].city)===key){hit=CITIES[i];break;}}
  if(!hit)for(i=0;i<CITIES.length;i++){if(normCity(CITIES[i].city).indexOf(key)>=0){hit=CITIES[i];break;}}
  if(!hit){if(mapHint){mapHint.className='me-hint me-err';mapHint.textContent='没找到「'+key+'」，换个写法试试';}return;}
  if(!hit.map){if(mapHint){mapHint.className='me-hint me-err';mapHint.textContent=hit.city+' 暂无商圈轮廓数据';}return;}
  location.href=hit.page+'#dist-map';
});
if(mapInput)mapInput.addEventListener('input',function(){
  if(mapHint){mapHint.className='me-hint';mapHint.textContent=mapHint0;}
});

/* 商圈评级筛选 + 渐进展开 */
var dgrid=document.getElementById('dist-grid'),dchips=document.getElementById('dist-chips');
if(dgrid){
  var DTOP=[];try{DTOP=JSON.parse(document.getElementById('dist-data').textContent);}catch(e){}
  var dmore=document.getElementById('dist-more'),curG='SA',distLimit=12,DSTEP=18;
  function renderTop(){
    var match=DTOP.filter(function(d){return curG.indexOf(d.grade)>=0;});
    var frag=document.createDocumentFragment();
    match.slice(0,distLimit).forEach(function(d){
      var el=document.createElement('a');el.className='dist-card';el.href=d.city_page;
      el.innerHTML='<div class="dc-head"><span class="grade-badge gb-'+d.grade.toLowerCase()+'">'+d.grade+'</span>'
        +'<span class="dc-name">'+esc(d.name)+'</span></div>'
        +'<div class="dc-meta"><b>'+(d.total!=null?d.total:'—')+'</b> 分 · 口碑 <b>'+(d.rating!=null?d.rating:'—')+'</b> · '+(d.poi||0)+' 个 POI</div>'
        +'<div class="dc-counts"><span class="cnt">美食 <b>'+(d.food||0)+'</b></span>'
        +'<span class="cnt">休闲 <b>'+(d.leisure||0)+'</b></span>'
        +'<span class="cnt">儿童 <b>'+(d.kids||0)+'</b></span>'
        +'<span class="cnt">酒店 <b>'+(d.hotel||0)+'</b></span></div>'
        +'<div class="dc-city">'+esc(d.city)+' · '+esc(d.province)+'</div>';
      frag.appendChild(el);
    });
    dgrid.innerHTML='';dgrid.appendChild(frag);
    if(dmore){
      var left=match.length-distLimit;
      if(left>0){dmore.hidden=false;dmore.textContent='展开更多商圈（还有 '+left+' 个）';}
      else dmore.hidden=true;
    }
  }
  if(dchips)dchips.addEventListener('click',function(e){
    var b=e.target.closest('.chip');if(!b)return;
    dchips.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');curG=b.getAttribute('data-g');distLimit=12;renderTop();
  });
  if(dmore)dmore.addEventListener('click',function(){distLimit+=DSTEP;renderTop();});
  renderTop();
}

/* 城市页：图片失败降级 + 复制链接 + 锚点高亮 */
document.querySelectorAll('.food-img img').forEach(function(img){
  img.addEventListener('error',function(){img.style.display='none';});
});
document.querySelectorAll('[data-copy]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var txt=btn.getAttribute('data-copy');
    function done(){btn.textContent='已复制';setTimeout(function(){btn.textContent='复制';},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,done);}
    else{var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);
      ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done();}
  });
});
var anchors=document.querySelectorAll('.anchor-nav a'),secs=[];
anchors.forEach(function(a){var s=document.querySelector(a.getAttribute('href'));if(s)secs.push([a,s]);});
if(secs.length){
  var aio=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){
      anchors.forEach(function(a){a.classList.remove('on');});
      for(var i=0;i<secs.length;i++)if(secs[i][1]===e.target){secs[i][0].classList.add('on');break;}
    }});
  },{rootMargin:'-30% 0px -60% 0px'});
  secs.forEach(function(p){aio.observe(p[1]);});
}
/* 城市页商圈等级筛选 */
var cgrid=document.getElementById('city-dist-grid');
if(cgrid){
  var cchips=document.getElementById('city-dist-chips');
  function filt(g){
    cgrid.querySelectorAll('[data-g]').forEach(function(el){
      el.style.display=(g==='all'||el.getAttribute('data-g')===g)?'':'none';});
  }
  if(cchips)cchips.addEventListener('click',function(e){
    var b=e.target.closest('.chip');if(!b)return;
    cchips.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on');
    var g=b.getAttribute('data-g');
    filt(g);
    // 同一分级状态驱动地图（distmap.js 存在时）
    if(typeof window.DISTMAP_FILTER==='function')window.DISTMAP_FILTER(g);
    var lg=document.getElementById('dm-legend');
    if(lg)lg.querySelectorAll('.dm-lg').forEach(function(x){
      x.setAttribute('aria-pressed',x.getAttribute('data-g')===g?'true':'false');});
  });
}

/* 首页数据调用入口：单次 Range 请求演示
   全量 data.json 有几十 MB，但「meta + stats」集中在文件头 4KB 内，
   故只取前 8KB 即可解析出全站统计——这也是推荐的高效调用方式。 */
var tryBtn=document.getElementById('api-try'),liveBox=document.getElementById('api-live'),
    liveMeta=document.getElementById('api-live-meta'),liveGrid=document.getElementById('api-live-grid');
if(tryBtn&&liveBox&&liveGrid){
  /* 只读取响应体的第一段即取消下载，避免为看统计而拉完整个大文件 */
  function readHead(res,limit){
    if(res.body&&res.body.getReader){
      var rd=res.body.getReader(),parts=[],len=0,dec=new TextDecoder();
      return new Promise(function(resolve,reject){
        function pump(){
          rd.read().then(function(ch){
            if(ch.done){resolve(parts.join(''));return;}
            var s=dec.decode(ch.value,{stream:true});
            parts.push(s);len+=s.length;
            if(len>=limit){rd.cancel();resolve(parts.join(''));return;}
            pump();
          }).catch(reject);
        }
        pump();
      });
    }
    return res.text();
  }
  /* 从首段文本中按花括号配对提取顶层 "stats" 对象 */
  function pickStats(txt){
    var i=txt.indexOf('"stats": {');
    if(i<0)return null;
    var j=txt.indexOf('{',i+8),d=0,k=-1;
    for(var p2=j;p2<txt.length;p2++){
      var c=txt.charAt(p2);
      if(c==='{')d++;
      else if(c==='}'){d--;if(d===0){k=p2;break;}}
    }
    if(k<0)return null;
    try{return JSON.parse(txt.slice(j,k+1));}catch(e){return null;}
  }
  tryBtn.addEventListener('click',function(){
    if(!window.fetch){
      liveBox.hidden=false;liveMeta.textContent='';
      liveGrid.innerHTML='<div class="api-live-err">当前浏览器不支持 fetch，请点击上方文件卡片直接查看原文。</div>';
      return;
    }
    tryBtn.disabled=true;tryBtn.textContent='调用中…';
    var t0=performance.now();
    fetch('data.json',{headers:{'Range':'bytes=0-8191'},cache:'no-store'}).then(function(r){
      if(!r.ok&&r.status!==206)throw new Error('HTTP '+r.status);
      return readHead(r,8192).then(function(txt){return {r:r,txt:txt};});
    }).then(function(o){
      var s=pickStats(o.txt);
      if(!s)throw new Error('首段未解析到 stats');
      var ms=Math.round(performance.now()-t0);
      var served=o.txt.length;
      liveBox.hidden=false;
      liveMeta.textContent='HTTP '+o.r.status+' · '+ms+' ms · 传输 '+served+' 字节'
        +(o.r.status===206?'（Range 分段）':'（流式截断）');
      var g=s.grades||{};
      var vals=[[s.provinces,'省级行政区'],[s.cities,'已建库城市'],[s.poi_total,'POI（去重）'],
                [s.districts_total,'商圈档案'],[g.S,'S 级商圈'],[g.A,'A 级商圈'],[g.B,'B 级商圈'],[g.C,'C 级商圈']];
      liveGrid.innerHTML=vals.map(function(p){
        if(p[0]==null)return '';
        return '<div class="alv"><b>'+(typeof p[0]==='number'?p[0].toLocaleString('zh-CN'):esc(p[0]))+'</b><span>'+p[1]+'</span></div>';
      }).join('');
      tryBtn.textContent='✓ 调用成功，可再次调用';
    }).catch(function(err){
      liveBox.hidden=false;liveMeta.textContent='';
      liveGrid.innerHTML='<div class="api-live-err">现场调用未成功：'+esc(err.message||String(err))
        +'。<br>该按钮对 <code>/data.json</code> 发起 <code>Range: bytes=0-8191</code> 请求，读取首段后即取消下载，解析其中 stats；'
        +'以 file:// 本地打开时浏览器会拦截 fetch——请用 http(s) 访问，或直接点击上方文件卡片查看原文。</div>';
      tryBtn.textContent='▶ 重新调用';
    }).then(function(){tryBtn.disabled=false;});
  });
}
})();