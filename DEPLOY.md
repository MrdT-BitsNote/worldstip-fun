# FUN · fun.worldstip.com — 上传与部署

> v0.9.2 · 32 省级单位 / 389 城 / 328,980 POI / 5,534 商圈 / 703 个 S·A 级商圈
> 纯静态，**解压即传、无需构建、无需 Node/PHP**。

## 一、包内容

| 路径 | 内容 |
|---|---|
| `index.html` | 首页 |
| `cities/<adcode>.html` | 389 个城市档案页 |
| `cities/<市名>.html` | 城市名 URL 兼容存根（跳转到 adcode 页） |
| `provinces/<省名>.html` | 省页（含香港 / 澳门空态页） |
| **`api/index.json`** | **分片接口入口**（约 12 KB）：省 / 城清单 + 各省文件路径 |
| **`api/provinces/<slug>.json`** | 省级包 32 个（4–51 KB）：省汇总 + 城市清单 + 本省榜单 |
| **`api/cities/<adcode>.json`** | 单城包 389 个（5–115 KB）：与 `data.json` 的 `cities[]` **逐字段相同** |
| **`api/food-top.json`** / **`api/districts-top.json`** | 全国美食榜 800 / S·A 商圈榜 703 |
| `data.json` | 全国全量单文件（40.1 MB · gzip 约 10 MB） |
| `data.md` | 全国全量 Markdown（32.1 MB），LLM / skill 直读 |
| `api.html` / `sources.html` / `README.html` | 接口文档 / 数据来源 / 站点说明 |
| `assets/` | 样式与地图脚本（自包含） |
| `_headers` | Cloudflare Pages / Netlify 规则（nginx 上不生效） |
| `.htaccess` | Apache 跨域兜底（nginx 上不生效） |
| `404.html` / `robots.txt` / `sitemap.xml` / `CNAME` | 错误页与 SEO |

> 分片与全量是**同一份数据的两种切法**（都由 `tools/build_api.py` 从 `data/` 源档案一次生成），
> 数值完全一致，可任选其一，也可交叉校验。改成「按需取数」后，看一个城市从 40 MB 降到约 110 KB。

## 二、上传

把本包**全部内容**解压到站点根目录（`index.html` 必须在根目录这一层）：

```bash
# 宝塔 / 面板：上传 zip 后选「解压到当前目录」
unzip fun-site-upload.zip -d /www/wwwroot/fun.worldstip.com
chown -R www:www /www/wwwroot/fun.worldstip.com
```

验证：
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fun.worldstip.com/api/index.json   # 期望 200
curl -s https://fun.worldstip.com/api/provinces/hunan.json | head -c 200             # 期望 JSON
```

## 三、跨域（CORS）—— 浏览器调用必须做，否则 `fetch()` 会被拦

静态文件无法自带跨域头，只能由服务器下发。当前线上实测：`GET` 不带
`Access-Control-Allow-Origin`，`OPTIONS` 返回 **405**，所以网页里的 `fetch()` 会失败
（Python / Node / curl 等服务端调用不受影响）。

在 nginx 站点配置的 `server { }` 内加入：

```nginx
location ~* \.(json|md)$ {
    add_header Access-Control-Allow-Origin      "*" always;
    add_header Access-Control-Allow-Methods     "GET, HEAD, OPTIONS" always;
    add_header Access-Control-Allow-Headers     "Range, If-None-Match, Content-Type" always;
    add_header Access-Control-Expose-Headers    "Content-Length, Content-Range, ETag" always;
    add_header Access-Control-Max-Age           86400 always;
    add_header Cache-Control                    "public, max-age=86400" always;
    if ($request_method = OPTIONS) { return 204; }
}
```

```bash
nginx -t && nginx -s reload
curl -sS -D - -o /dev/null -H "Origin: https://example.com" \
     https://fun.worldstip.com/api/index.json | grep -i access-control
# 期望：access-control-allow-origin: *
```

细节与完整 server 块示例见仓库 `deploy/nginx/fun.worldstip.com.conf`；
Cloudflare Pages / Netlify 用 `_headers`，Apache 用 `.htaccess`。

## 四、一致性自检（改完数据后跑）

```bash
# 单城包与全量逐字段比对（应输出 true）
node -e "const f=require('./data.json'),o=require('./api/cities/430600.json');
console.log(JSON.stringify(o)===JSON.stringify(f.cities.find(c=>String(c.adcode)==='430600')))"
```
