# FUN · fun.worldstip.com（站点镜像）

全国美食 × 商圈 × 娱乐探索站的**部署产物镜像**。本仓库根目录即站点根目录，检出后直接指向
`index.html` 所在层即可托管，无需构建。

> 数据采集、清洗与站点生成在另一个仓库：`MrdT-BitsNote/fun`（`data/` + `tools/`）。
> 本仓库只放可部署产物，方便直接 `git clone` 后上传。

---

## 数据接口

```bash
# ① 分片入口（推荐，约 12 KB）：32 省 + 389 城清单、各省文件路径与体积
curl https://fun.worldstip.com/api/index.json

# ② 省级包（4–51 KB）：省汇总 + 城市清单 + 本省美食榜/商圈榜
curl https://fun.worldstip.com/api/provinces/hunan.json

# ③ 单城包（5–115 KB）：与 data.json 的 cities[] 元素逐字段相同
curl https://fun.worldstip.com/api/cities/430600.json

# ④ 榜单单独成文件
curl https://fun.worldstip.com/api/food-top.json      # 800 条美食
curl https://fun.worldstip.com/api/districts-top.json # 703 个 S·A 商圈

# ⑤ 全量（40.1 MB / gzip 约 10 MB）—— 确实需要全量时才下
curl https://fun.worldstip.com/data.json
curl https://fun.worldstip.com/data.md
```

`api/` 目录由 `tools/build_api.py --split-only` 从 `data.json` 切出，**不重算任何数值**。
本仓库不提交这 421 个切片文件（约 39 MB 的重复数据），需要时用项目仓库重新生成：

```bash
python tools/build_api.py --split-only   # 读 site/data.json → 写 site/api/
```

## 跨域（CORS）：部署时必须做

静态文件无法自带跨域头。线上实测（2026-11-06）：`GET` 不带 `Access-Control-Allow-Origin`，
`OPTIONS` 返回 **405**，网页里的 `fetch()` 会被浏览器拦（Python / Node / curl 不受影响）。

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

完整配置见 `deploy/nginx/fun.worldstip.com.conf`。Cloudflare Pages / Netlify 用 `_headers`，
Apache 用 `.htaccess`（两者都已随包提供，nginx 上不生效）。

部署步骤与包结构见 `DEPLOY.md`。
