/* FUN · 首页商圈地图（两级视图）
 *
 * 一级 全国：每城一枚气泡，小比例尺按经纬网格聚合，点气泡/聚合块钻进去。
 *            数据 assets/geo-cities.json（约 63KB）。
 * 二级 城市：fetch assets/geo/{adcode}.json，绘制该城全部商圈的凸包轮廓。
 *
 * 两点刻意为之：
 * 1) 不做全国商圈排行。跨城总分不可比——每城采集深度不同，小城商业集中反而
 *    密度分虚高，按总分排出的是石河子、铜川压过北京。侧栏只做「视野内城市」
 *    导航，同城内才给商圈排序（同口径才可比）。
 * 2) 小比例尺必须聚合。385 城在 z4 的屏幕上，长三角几十城会糊成一块红斑。
 *
 * 坐标即高德 GCJ-02，与高德瓦片同源，按 EPSG:3857 直接绘制即对齐。
 */
(function () {
  'use strict';

  var box = document.getElementById('hm-map');
  if (!box) return;

  var GRADE = {
    S: { c: '#ff375f', fo: 0.22, w: 2.6 },
    A: { c: '#ff9f0a', fo: 0.18, w: 2.2 },
    B: { c: '#0a84ff', fo: 0.14, w: 1.9 },
    C: { c: '#8e8e93', fo: 0.10, w: 1.5 }
  };
  var RANK = { C: 0, B: 1, A: 2, S: 3 };
  var TILE = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';

  var listEl = document.getElementById('hm-list');
  var titleEl = document.getElementById('hm-title');
  var subEl = document.getElementById('hm-sub');
  var tipEl = document.getElementById('hm-tip');
  var backEl = document.getElementById('hm-back');
  var gradesEl = document.getElementById('hm-grades');

  var META = null;
  var curG = 'all';
  var curCity = null;
  var cityCache = {};
  var map = null;
  var bubbleLayer = null;
  var polyLayer = null;
  var polys = {};
  var pendingFocus = null;
  var painting = false;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function fmt(n) { return (n == null ? '—' : Number(n).toLocaleString('zh-CN')); }

  function countFor(row) {
    return curG === 'all' ? row.k : ((row.s && row.s[curG]) || 0);
  }
  /* 半径开根号压极端值；上限压在 20px，否则聚合块互相压盖 */
  function cityR(k) { return Math.max(4, Math.min(11, 2.6 + Math.sqrt(k) * 0.85)); }
  function clusterR(k) { return Math.max(6.5, Math.min(20, 4 + Math.sqrt(k) * 1.05)); }

  /* ---------------- 侧栏 ---------------- */
  var GNAMES = { S: 'S 级', A: 'A 级', B: 'B 级', C: 'C 级' };

  /* 全国层不做城市榜单：POI 是定额采集（成都 1240、北京 1199，撞的是采集上限），
     商圈数则会把宜宾顶到第一。两个指标都不代表城市体量，排出来就是误导。
     这里只报当前视野内的真实计数，随地图移动重算。 */
  function renderNationPanel() {
    if (!map || curCity || !META) return;
    var b = map.getBounds();
    var inView = META.cities.filter(function (r) { return b.contains(L.latLng(r.y, r.x)); });
    var g = { S: 0, A: 0, B: 0, C: 0 }, all = 0, nCity = 0;
    inView.forEach(function (r) {
      all += r.k;
      if (countFor(r) > 0) nCity++;
      ['S', 'A', 'B', 'C'].forEach(function (k) { g[k] += (r.s && r.s[k]) || 0; });
    });
    if (titleEl) {
      titleEl.textContent = curG === 'all'
        ? '视野内 ' + inView.length + ' 城'
        : '视野内 ' + nCity + ' 城有 ' + curG + ' 级';
    }
    if (subEl) subEl.textContent = fmt(curG === 'all' ? all : g[curG]) + ' 个'
      + (curG === 'all' ? '' : ' ' + curG + ' 级') + '商圈 · 随地图移动重算';
    var total = Math.max(all, 1);
    var bars = ['S', 'A', 'B', 'C'].map(function (k) {
      var pct = Math.round(g[k] / total * 100);
      return '<div class="hm-stat"><span class="hm-badge gb-' + k.toLowerCase() + '">' + k + '</span>'
        + '<b>' + fmt(g[k]) + '</b><i>' + pct + '%</i></div>';
    }).join('');
    listEl.innerHTML = '<div class="hm-panel">'
      + '<div class="hm-stats">' + bars + '</div>'
      + '<div class="hm-help"><b>怎么用</b>'
      + '<span>点气泡 → 进城市，看每个商圈的凸包轮廓</span>'
      + '<span>点轮廓 → 分数、口碑、POI 数</span>'
      + '<span>点一下地图 → 滚轮才能缩放，不劫持页面滚动</span>'
      + '<span>顶部 S/A/B/C → 只留该级的圈与气泡</span>'
      + '</div>'
      + '<p class="hm-note">圈数按<b>样本内</b>识别结果计：每城约 1,200 条 POI 采集，'
      + '没覆盖到的街区不会凭空出现，也不等于该城商圈总数。</p>'
      + '</div>';
  }

  function renderCityList(payload) {
    var ds = (payload.d || []).map(function (d, i) { return { d: d, i: i }; })
      .filter(function (o) { return curG === 'all' || o.d[1] === curG; })
      .sort(function (a, c) { return (c.d[2] || 0) - (a.d[2] || 0); });
    if (titleEl) titleEl.textContent = payload.n;
    if (subEl) subEl.textContent = payload.p + ' · ' + ds.length + ' 个商圈';
    if (!ds.length) {
      listEl.innerHTML = '<p class="hm-empty">本城没有该级别的商圈。</p>';
      return;
    }
    listEl.innerHTML = ds.map(function (o) {
      var d = o.d;
      return '<button class="hm-item" data-i="' + o.i + '">'
        + '<span class="hm-badge gb-' + String(d[1]).toLowerCase() + '">' + esc(d[1]) + '</span>'
        + '<span class="hm-tx"><b>' + esc(d[0]) + '</b><i>'
        + (d[2] != null ? d[2] : '—') + ' 分 · 口碑 ' + (d[3] != null ? d[3] : '—')
        + ' · ' + fmt(d[4]) + ' POI</i></span></button>';
    }).join('');
  }

  function focusDistrict(payload, name) {
    var idx = -1;
    (payload.d || []).forEach(function (d, i) { if (d[0] === name) idx = i; });
    var poly = polys[idx];
    if (!poly) return;
    poly.openPopup();
    map.fitBounds(poly.getBounds().pad(1.2), { animate: true, maxZoom: 16 });
    var item = listEl.querySelector('.hm-item[data-i="' + idx + '"]');
    if (item) { item.classList.add('is-on'); item.scrollIntoView({ block: 'nearest' }); }
  }

  /* ---------------- 地图 ---------------- */
  function initMap() {
    map = L.map(box, {
      center: [34.2, 108.5], zoom: 4, minZoom: 3, maxZoom: 17,
      zoomControl: false, attributionControl: false, scrollWheelZoom: false
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(TILE, { subdomains: '1234', maxZoom: 18 }).addTo(map);
    /* 滚轮缩放要先点进地图，避免划过就劫持页面滚动 */
    box.addEventListener('click', function () { map.scrollWheelZoom.enable(); });
    box.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });
    bubbleLayer = L.layerGroup().addTo(map);
    polyLayer = L.layerGroup().addTo(map);
    map.on('zoomend', function () { if (!curCity && !painting) drawBubbles(false); });
    map.on('moveend', function () { if (!curCity) renderNationPanel(); });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { map.invalidateSize(); }).observe(box);
    }
  }

  /* 聚合粒度按屏幕像素定，不按固定度数：目标是每格 52px，比最大气泡直径还宽，
     否则网格再"按度数"算，长三角该糊还是糊。z>=8 已是城市尺度，直接单城。 */
  function gridStep() {
    if (map.getZoom() >= 8) return 0;
    var b = map.getBounds();
    var span = b.getEast() - b.getWest();
    var px = box.clientWidth || 800;
    return Math.max(span / px * 52, 0.004);
  }

  function drawBubbles(fly) {
    painting = true;
    bubbleLayer.clearLayers();
    polyLayer.clearLayers();
    polys = {};
    var step = gridStep();
    var groups = {}, order = [];
    META.cities.forEach(function (r) {
      var k = countFor(r);
      if (k <= 0) return;
      var key = step ? (Math.round(r.y / step) + '|' + Math.round(r.x / step)) : 'c' + r.a;
      var g = groups[key];
      if (!g) {
        g = groups[key] = { n: 0, k: 0, sy: 0, sx: 0, sw: 0, best: 'C', rows: [] };
        order.push(key);
      }
      g.n++; g.k += k; g.sy += r.y * k; g.sx += r.x * k; g.sw += k;
      g.rows.push(r);
      if (RANK[r.g] > RANK[g.best]) g.best = r.g;
    });

    /* 相邻网格的块圆心可能只差几像素，叠在一起看起来像"大圈里套个小黑点"。
       按商圈数降序做一次像素级合并：40px 内并入已有块。 */
    var keep = [];
    order.map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.k - a.k; })
      .forEach(function (g) {
        var y = g.sy / g.sw, x = g.sx / g.sw;
        for (var i = 0; i < keep.length; i++) {
          var p0 = map.latLngToContainerPoint([keep[i].sy / keep[i].sw, keep[i].sx / keep[i].sw]);
          var p1 = map.latLngToContainerPoint([y, x]);
          if (p0.distanceTo(p1) < 40) {
            var o = keep[i];
            o.sy += g.sy; o.sx += g.sx; o.sw += g.sw;
            o.n += g.n; o.k += g.k; o.rows = o.rows.concat(g.rows);
            if (RANK[g.best] > RANK[o.best]) o.best = g.best;
            return;
          }
        }
        keep.push(g);
      });

    keep.forEach(function (g) {
      var y = g.sy / g.sw, x = g.sx / g.sw;
      /* 聚合块用中性色：一块可能是 8 个城市里只有 1 个有 S 级，
         若按"块内最高级"上色，整块会误报成 S 级城市，全国图一片红。 */
      var single = g.rows.length === 1;
      var col = single ? ((GRADE[g.best] || GRADE.C).c) : '#ff375f';
      var m = L.circleMarker([y, x], {
        radius: single ? cityR(g.k) : clusterR(g.k),
        color: col, weight: single ? 1.8 : 1.8,
        fillColor: col, fillOpacity: single ? 0.16 : 0.07, opacity: single ? 0.9 : 0.5
      });
      /* 闭包里只认 forEach 的形参 g：用 var 存 city/坐标会被后续迭代覆盖，
         所有气泡最后都指向同一个城市（点了没反应或跳错城）。 */
      if (single) {
        m.bindTooltip(esc(g.rows[0].n) + ' · ' + g.k + (curG === 'all' ? ' 个商圈' : ' 个 ' + curG + ' 级'), {
          className: 'hm-tipbox', direction: 'top', offset: [0, -4]
        });
        m.on('click', function () { enterCity(g.rows[0]); });
      } else {
        m.bindTooltip(g.n + ' 城 · ' + g.k + ' 个商圈 · 点开放大', {
          className: 'hm-tipbox', direction: 'top', offset: [0, -4]
        });
        m.on('click', function () {
          map.flyTo([g.sy / g.sw, g.sx / g.sw], Math.min(map.getZoom() + 2, 12), { duration: 0.5 });
        });
      }
      m.addTo(bubbleLayer);
    });

    if (tipEl) {
      var cityN = META.cities.filter(function (r) { return countFor(r) > 0; }).length;
      tipEl.textContent = curG === 'all'
        ? '全国 ' + cityN + ' 城 · ' + fmt(META.total) + ' 个商圈 · 点气泡进城市'
        : '有 ' + curG + ' 级商圈的城市 ' + cityN + ' 个 · 点气泡进城市';
    }
    renderNationPanel();
    painting = false;
    if (fly) map.flyTo([34.2, 108.5], 4, { duration: 0.5 });
  }

  function drawCity(payload) {
    painting = true;
    bubbleLayer.clearLayers();
    polyLayer.clearLayers();
    polys = {};
    var bounds = [];
    var vis = [];
    (payload.d || []).forEach(function (d) {
      if (curG !== 'all' && d[1] !== curG) return;
      var ll = (d[8] || []).map(function (p) { return [p[1], p[0]]; });
      if (ll.length < 3) return;
      vis.push({ d: d, ll: ll });
      ll.forEach(function (p) { bounds.push(p); });
    });

    /* 地级市的商圈常散在几百公里（酒泉从敦煌到玉门、滁州从天长到定远），
       全城 fit 之后 0.02° 的轮廓只剩 2px，等于什么都没看见。
       跨度超 0.4° 就先落到主城片区：以 POI 最多的商圈为种子收拢 25km 内。 */
    var spanAll = 0;
    if (bounds.length) {
      var bb0 = L.latLngBounds(bounds);
      spanAll = Math.max(bb0.getNorth() - bb0.getSouth(), bb0.getEast() - bb0.getWest());
    }
    var focus = null;
    if (spanAll > 0.4) {
      var seed = vis.slice().sort(function (a, b) { return (b.d[4] || 0) - (a.d[4] || 0); })[0];
      /* 4km 内才算同一片商业核心：阈值放大到 25km 时 fit 出来还是 z10，
         轮廓仍然只有几像素，等于白聚焦。 */
      var near = vis.filter(function (v) {
        return Math.abs(v.d[5] - seed.d[5]) < 0.036 && Math.abs(v.d[6] - seed.d[6]) < 0.043;
      });
      if (near.length && near.length < vis.length) focus = near;
    }
    if (focus) {
      var fb = [];
      focus.forEach(function (v) { v.ll.forEach(function (p) { fb.push(p); }); });
      bounds = fb;
    }

    vis.forEach(function (o) {
      var d = o.d, ll = o.ll, i = payload.d.indexOf(d);
      var g = GRADE[d[1]] || GRADE.C;
      var poly = L.polygon(ll, {
        color: g.c, weight: g.w, fillColor: g.c, fillOpacity: g.fo,
        opacity: 0.95, bubblingMouseEvents: false
      });
      poly.bindPopup(
        '<div class="hm-pop"><b>' + esc(d[0]) + '</b>'
        + '<span class="hm-pop-row">' + esc(d[1]) + ' 级 · ' + (d[2] != null ? d[2] : '—') + ' 分 · 口碑 '
        + (d[3] != null ? d[3] : '—') + '</span>'
        + '<span class="hm-pop-row">' + fmt(d[4]) + ' 个商业 POI · 覆盖半径约 ' + fmt(d[7]) + ' m</span>'
        + '<a class="hm-pop-go" href="' + esc(payload.pg) + '#dist-map">打开城市档案 →</a></div>',
        { className: 'hm-popup', maxWidth: 250 }
      );
      poly.__g = g;
      poly.on('mouseover', function () { poly.setStyle({ weight: g.w + 2, fillOpacity: Math.min(g.fo + 0.12, 0.5) }); });
      poly.on('mouseout', function () { poly.setStyle({ weight: g.w, fillOpacity: g.fo }); });
      poly.addTo(polyLayer);
      polys[i] = poly;
      /* 地级市的商圈常常散在几百公里（酒泉从敦煌到玉门），全城 fit 之后
         0.02° 的轮廓只剩 2px。补一枚固定像素的点，远景看分布、近景看形状。 */
      var dot = L.circleMarker([d[5], d[6]], {
        radius: 4, color: '#fff', weight: 1.6,
        fillColor: g.c, fillOpacity: 1, opacity: 1
      });
      dot.bindPopup(poly.getPopup());
      dot.on('click', function () {
        L.popup({ className: 'hm-popup', maxWidth: 250 })
          .setLatLng([d[5], d[6]]).setContent(poly.getPopup().getContent()).openOn(map);
      });
      dot.addTo(polyLayer);
    });
    /* 用 fitBounds 而非 flyToBounds：flyTo 的动画会被 ResizeObserver 的
       invalidateSize 打断，实测停在 z7（商圈被压成 2px 的点），fitBounds 瞬时可靠 */
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.12), { animate: false, maxZoom: 15 });
    if (tipEl) {
      var n0 = Object.keys(polys).length;
      tipEl.textContent = payload.n + ' · ' + n0 + ' 个'
        + (curG === 'all' ? '' : ' ' + curG + ' 级') + '商圈（样本内）'
        + (focus
          ? '，已落到主城片区；另有 ' + (vis.length - focus.length) + ' 个散在其他县市，缩小可看全'
          : ' · 圈 = 成员 POI 凸包');
    }
    backEl.hidden = false;
    renderCityList(payload);
    painting = false;
  }

  function enterCity(row, focus) {
    curCity = row;
    pendingFocus = focus || null;
    function paint(payload) {
      if (!curCity || curCity.a !== row.a) return;
      drawCity(payload);
      var f = pendingFocus;
      pendingFocus = null;
      if (f) focusDistrict(payload, f);
    }
    if (cityCache[row.a]) { paint(cityCache[row.a]); return; }
    if (tipEl) tipEl.textContent = '正在载入 ' + row.n + ' 的商圈轮廓…';
    fetch('assets/geo/' + row.a + '.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (payload) {
      cityCache[row.a] = payload;
      paint(payload);
    }).catch(function () {
      if (tipEl) {
        tipEl.textContent = row.n + ' 的轮廓没取到（直接双击 html 打开会被 CORS 拦住），'
          + '起个本地服务或进城市档案页看同样的图。';
      }
      backEl.hidden = false;
    });
  }

  function backToNation() {
    curCity = null;
    pendingFocus = null;
    drawBubbles(true);
  }

  /* ---------------- 事件 ---------------- */
  if (listEl) {
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('.hm-item');
      if (!b) return;
      var a = b.getAttribute('data-a');
      if (a) {
        var row = META.cities.filter(function (r) { return r.a === a; })[0];
        if (row) enterCity(row);
        return;
      }
      var i = Number(b.getAttribute('data-i'));
      var poly = polys[i];
      if (poly) {
        poly.openPopup();
        map.fitBounds(poly.getBounds().pad(1.0), { animate: true, maxZoom: 16 });
      }
    });
    listEl.addEventListener('mouseover', function (e) {
      var b = e.target.closest('.hm-item');
      if (!b) return;
      var i = b.getAttribute('data-i');
      if (i != null && polys[i]) polys[i].setStyle({ weight: 5, fillOpacity: 0.44 });
    });
    listEl.addEventListener('mouseout', function (e) {
      var b = e.target.closest('.hm-item');
      if (!b) return;
      var i = b.getAttribute('data-i');
      var poly = i != null ? polys[i] : null;
      if (poly && poly.__g) poly.setStyle({ weight: poly.__g.w, fillOpacity: poly.__g.fo });
    });
  }

  if (gradesEl) {
    gradesEl.addEventListener('click', function (e) {
      var b = e.target.closest('.hm-g');
      if (!b) return;
      Array.prototype.forEach.call(gradesEl.querySelectorAll('.hm-g'), function (x) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      curG = b.getAttribute('data-g');
      if (curCity && cityCache[curCity.a]) drawCity(cityCache[curCity.a]);
      else drawBubbles(false);
    });
  }

  if (backEl) backEl.addEventListener('click', backToNation);

  /* ---------------- 启动 ---------------- */
  if (!window.L) {
    box.innerHTML = '<div class="hm-fallback">地图组件没加载出来，可直接进任一城市档案页看同样的商圈轮廓图。</div>';
    return;
  }
  fetch('assets/geo-cities.json').then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (d) {
    META = d;
    initMap();
    drawBubbles(false);
  }).catch(function () {
    box.innerHTML = '<div class="hm-fallback">地图数据没取到（本地直接双击 html 会被 CORS 拦住）。'
      + '用 <code>python -m http.server</code> 起服务后访问即可，或直接进任一城市档案页看商圈轮廓。</div>';
  });
})();
