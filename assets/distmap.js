/* FUN · 商圈分布图
 *
 * 底图用高德瓦片：数据坐标本身就是高德 POI 的 GCJ-02，
 * 与高德瓦片同一坐标系，因此按 EPSG:3857 直接绘制即为对齐状态，
 * 不需要 WGS84↔GCJ-02 转换（转换反而会整体偏移 300–600m）。
 *
 * 降级顺序：Leaflet 缺失 → 纯 SVG 投影图；瓦片不可达 → 仅轮廓 + 深色网格底。
 * 任何一种降级都仍然绘制真实的商圈轮廓，不留空白占位。
 */
(function () {
  'use strict';

  var box = document.getElementById('dist-map');
  var src = document.getElementById('dm-data');
  if (!box || !src) return;

  var items = [];
  try { items = JSON.parse(src.textContent || '[]') || []; } catch (e) { items = []; }

  var note = document.getElementById('dm-note');
  var NOTE_HTML = note ? note.innerHTML : '';

  function warn(msg) {
    if (!note) return;
    note.className = 'dm-note is-warn';
    note.innerHTML = '<b>提示</b><span>' + msg + '</span>';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  if (!items.length) {
    box.innerHTML = '<div class="dm-empty">本城样本内未识别出满足门槛的商圈，无轮廓可绘。</div>';
    return;
  }

  var GRADE = {
    S: { c: '#ff375f', fo: 0.20, w: 2.6 },
    A: { c: '#ff9f0a', fo: 0.17, w: 2.2 },
    B: { c: '#0a84ff', fo: 0.13, w: 1.9 },
    C: { c: '#8e8e93', fo: 0.09, w: 1.5 }
  };
  var RANK = { C: 0, B: 1, A: 2, S: 3 };

  /* ---------- 无 Leaflet 时的纯 SVG 投影 ---------- */
  function svgFallback() {
    var W = box.clientWidth || 820, H = box.clientHeight || 430, pad = 30;
    var lngs = [], lats = [];
    items.forEach(function (it) {
      (it.ring || []).forEach(function (p) { lngs.push(p[0]); lats.push(p[1]); });
    });
    if (!lngs.length) { box.innerHTML = '<div class="dm-empty">无轮廓坐标。</div>'; return; }
    var x0 = Math.min.apply(null, lngs), x1 = Math.max.apply(null, lngs);
    var y0 = Math.min.apply(null, lats), y1 = Math.max.apply(null, lats);
    var kx = Math.cos((y0 + y1) / 2 * Math.PI / 180) || 1;
    var spanX = Math.max((x1 - x0) * kx, 1e-6), spanY = Math.max(y1 - y0, 1e-6);
    var sc = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
    var ox = (W - spanX * sc) / 2, oy = (H - spanY * sc) / 2;

    function px(lng) { return ox + (lng - x0) * kx * sc; }
    function py(lat) { return H - oy - (lat - y0) * sc; }

    var html = ['<svg class="dm-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="商圈分布示意图">'];
    items.slice().sort(function (a, b) { return (RANK[a.grade] || 0) - (RANK[b.grade] || 0); })
      .forEach(function (it) {
        var g = GRADE[it.grade] || GRADE.C;
        var pts = (it.ring || []).map(function (p) { return px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1); }).join(' ');
        html.push('<polygon points="' + pts + '" fill="' + g.c + '" fill-opacity="' + g.fo +
          '" stroke="' + g.c + '" stroke-width="' + g.w + '" stroke-linejoin="round"><title>' +
          esc(it.name) + (it.grade ? '（' + it.grade + ' 级）' : '') + '</title></polygon>');
      });
    html.push('</svg>');
    box.innerHTML = html.join('');
    warn('地图引擎未加载，已降级为等比投影示意图：轮廓与相对位置仍然真实，但没有街道底图。');
  }

  if (typeof window.L === 'undefined') { svgFallback(); return; }

  /* ---------- Leaflet 主路径 ---------- */
  var map = L.map(box, {
    scrollWheelZoom: false,      // 避免劫持页面滚动
    zoomControl: true,
    attributionControl: false,
    minZoom: 3,
    maxZoom: 18
  });

  var TILE = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
  var road = L.tileLayer(TILE, { subdomains: '1234', maxZoom: 18, detectRetina: false });
  road.addTo(map);

  var tileErr = 0, tileOk = 0, degraded = false;
  road.on('tileload', function () { tileOk++; });
  road.on('tileerror', function () {
    tileErr++;
    if (!degraded && tileErr >= 5 && tileOk === 0) {
      degraded = true;
      map.removeLayer(road);
      box.classList.add('dm-nobase');
      warn('底图瓦片不可达（网络或服务受限），已切换为仅轮廓模式：圈的位置仍按真实坐标绘制，缩放与拖动照常可用。');
    }
  });
  setTimeout(function () {
    if (!degraded && tileOk === 0) {
      degraded = true;
      map.removeLayer(road);
      box.classList.add('dm-nobase');
      warn('底图在 8 秒内未加载成功，已切换为仅轮廓模式。');
    }
  }, 8000);

  function popupHTML(it) {
    var g = GRADE[it.grade] || GRADE.C;
    var rows = [];
    rows.push('<span><span class="dm-pop-g" style="background:' + g.c + '">' +
      esc(it.grade || 'C') + ' 级</span>' +
      (it.t ? '总分 ' + it.t : '未评级') + '</span>');
    if (it.n != null) rows.push('<span>' + it.n + ' 家商业 POI</span>');
    if (it.r) rows.push('<span>覆盖半径约 ' + it.r + ' m（80 分位）</span>');
    rows.push('<span style="color:var(--text-3);margin-top:4px">点击可跳到下方档案</span>');
    return '<div class="dm-pop"><b>' + esc(it.name) + '</b>' + rows.join('') + '</div>';
  }

  var byName = {}, layers = [];
  items.slice()
    .sort(function (a, b) { return (RANK[a.grade] || 0) - (RANK[b.grade] || 0); })
    .forEach(function (it) {
      var ring = it.ring || [];
      if (ring.length < 3) return;
      var g = GRADE[it.grade] || GRADE.C;
      var poly = L.polygon(ring.map(function (p) { return [p[1], p[0]]; }), {
        color: g.c, weight: g.w, opacity: 0.92,
        fillColor: g.c, fillOpacity: g.fo, lineJoin: 'round'
      });
      poly._dmIt = it;
      if (it.grade === 'S' || it.grade === 'A') {
        poly.bindTooltip(it.name, {
          permanent: true, direction: 'center', className: 'dm-label',
          opacity: 1, interactive: false
        });
      } else {
        poly.bindTooltip(it.name, {
          className: 'dm-tips', direction: 'top', offset: [0, -3], sticky: true
        });
      }
      poly.bindPopup(popupHTML(it), { closeButton: true, minWidth: 190, autoPanPadding: [24, 24] });
      poly.on('click', function () { focusCard(it.name); });
      poly.addTo(map);
      byName[it.name] = poly;
      layers.push(poly);
    });

  if (!layers.length) {
    box.innerHTML = '<div class="dm-empty">本城商圈缺轮廓坐标（几何未生成），请重跑构建。</div>';
    return;
  }

  /* 视野外商圈计数（提示用户可缩小查看）*/
  function countOutside() {
    var vb = map.getBounds(), n = 0;
    layers.forEach(function (l) { if (!vb.intersects(l.getBounds())) n++; });
    return n;
  }

  /* 取景：地级市常把好几个县市并进来，全量 fitBounds 会把主城区压成几个像素。
     所以优先框住 S/A 级（重点商圈）；没有 S/A 时按 POI 数累加到 70% 取核。 */
  function pickFocus(all) {
    var hot = all.filter(function (l) {
      return l._dmIt.grade === 'S' || l._dmIt.grade === 'A';
    });
    if (hot.length >= 2) return hot;
    var sorted = all.slice().sort(function (a, b) {
      return (b._dmIt.n || 0) - (a._dmIt.n || 0);
    });
    var tot = 0, acc = 0, keep = [];
    sorted.forEach(function (l) { tot += (l._dmIt.n || 0); });
    for (var i = 0; i < sorted.length; i++) {
      keep.push(sorted[i]);
      acc += (sorted[i]._dmIt.n || 0);
      if (acc >= tot * 0.7) break;
    }
    return keep.length ? keep : all;
  }

  map.fitBounds(L.featureGroup(pickFocus(layers)).getBounds().pad(0.12),
                { maxZoom: 14, animate: false });

  map.on('moveend', syncNote);
  function syncNote() {
    if (!note || degraded) return;
    var n = countOutside();
    var base = NOTE_HTML;
    if (n > 0 && map.getZoom() >= 12) {
      note.className = 'dm-note';
      note.innerHTML = base + '<span style="display:block;margin-top:6px">' +
        '当前取景聚焦 S/A 级商圈；本图是地级市全域，另有 ' + n + ' 个商圈分布在县市，缩小地图即可看到。' +
        '</span>';
    } else {
      note.className = 'dm-note';
      note.innerHTML = base;
    }
  }
  setTimeout(syncNote, 60);
  if (window.__DM_DEBUG) window.__dmMap = map;

  /* ---------- 圈 → 档案卡片 ---------- */
  function focusCard(name) {
    var all = document.querySelectorAll('.dist-detail[data-name]');
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute('data-name') === name) {
        var card = all[i];
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-focus');
        clearTimeout(card._dmT);
        card._dmT = setTimeout(function () { card.classList.remove('is-focus'); }, 2800);
        return;
      }
    }
  }

  /* ---------- 档案卡片 → 圈 ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.dd-locate') : null;
    if (!btn) return;
    var name = btn.getAttribute('data-locate');
    var poly = byName[name];
    if (!poly) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyToBounds(poly.getBounds().pad(1.4), { maxZoom: 15, duration: 0.5 });
    setTimeout(function () { poly.openPopup(); }, 460);
  });

  /* ---------- 分级过滤（与卡片 chips 共用同一状态）---------- */
  function applyFilter(g) {
    layers.forEach(function (poly) {
      var it = poly._dmIt;
      var gf = GRADE[it.grade] || GRADE.C;
      var hit = (g === 'all' || it.grade === g);
      poly.setStyle(hit
        ? { opacity: 0.92, weight: gf.w, fillOpacity: gf.fo }
        : { opacity: 0.08, weight: 1, fillOpacity: 0.015 });
    });
  }
  window.DISTMAP_FILTER = applyFilter;

  var lg = document.getElementById('dm-legend');
  if (lg) {
    lg.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.dm-lg') : null;
      if (!b) return;
      var g = b.getAttribute('data-g');
      Array.prototype.forEach.call(lg.querySelectorAll('.dm-lg'), function (x) {
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      applyFilter(g);
      // 复用既有 chips 逻辑同时过滤下方档案（chip 的 click 会回写卡片与图例）
      var chip = document.querySelector('#city-dist-chips .chip[data-g="' + g + '"]');
      if (chip && !chip.classList.contains('on')) chip.click();
    });
  }

  /* ---------- 底图切换 ---------- */
  var base = document.getElementById('dm-base');
  if (base) {
    base.addEventListener('click', function () {
      if (degraded) return;
      var dark = box.classList.toggle('dm-dark');
      base.setAttribute('aria-pressed', dark ? 'true' : 'false');
      base.textContent = dark ? '浅色底图' : '深色底图';
    });
  }

  /* ---------- 尺寸校正（reveal 动画后）---------- */
  setTimeout(function () { map.invalidateSize(); }, 280);
  if (window.ResizeObserver) {
    new ResizeObserver(function () { map.invalidateSize(); }).observe(box);
  }

  /* ---------- #dist-map 直达：地图撑开后版面会下移，浏览器在 hash 定位时的位置已过期，二次对齐 ---------- */
  if (location.hash === '#dist-map') {
    var realign = function () {
      map.invalidateSize();
      var nav = document.querySelector('.nav');
      var bar = document.querySelector('.anchor-nav');
      var gap = 12 + (nav ? nav.offsetHeight : 0) + (bar ? bar.offsetHeight : 0);
      var top = box.getBoundingClientRect().top + window.pageYOffset - gap;
      window.scrollTo({ top: top, behavior: 'auto' });
    };
    setTimeout(realign, 320);
    setTimeout(realign, 900);
  }
})();
