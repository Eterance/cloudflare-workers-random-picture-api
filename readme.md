# 随机图片 API (部署于 Cloudflare)

## 这是什么？

这是一个随机图片 API，部署于 Cloudflare Workers / Functions，可以用于生成随机图片。

## 如何使用？

详细过程参见：[使用 Cloudflare Workers + D1 + R2 搭建免费的随机图片 API](https://blog.baldcoder.top/articles/building-a-free-random-image-api-with-cloudflare-workers-d1-r2/)

首先，将要被随机的图片上传至对象存储（如 Cloudflare R2）中。不同的图片集可以放在不同的存储桶（bucket）中。

然后，使用[这个网页工具](https://tools.eterance.com/zh-cn/pictures-to-insert-sql)将图片的 URL 转换为 SQL 语句。

之后，将 SQL 语句放在 Cloudflare D1 数据库中执行，构建图片索引。不同的图片集放在不同的表中。

最后部署本仓库的代码，见下。

## 方法一：Cloudflare Workers

代码位于 [/workers](https://github.com/Eterance/web-toolbox/tree/main/workers) 文件夹下。

1. 在 Cloudflare Workers 中创建一个新的 Worker。
2. 设置 workers 环境变量和绑定 D1 数据库，见下面的章节：[Cloudflare 环境变量设置](#环境变量设置)。
3. 将代码复制粘贴并部署。[rpic.js](https://github.com/Eterance/web-toolbox/tree/main/workers/rpic.js) 是普通版本，[rpicpro.js](https://github.com/Eterance/web-toolbox/tree/main/workers/rpicpro.js) 是支持在查询字符串中使用 SQL 的高级版本。

## 方法二：Cloudflare Functions

代码位于 [/functions](https://github.com/Eterance/web-toolbox/tree/main/functions) 文件夹下。

1. 在 Cloudflare Pages 中创建一个新的 Pages 项目。
2. 设置 Pages 环境变量和绑定 D1 数据库，见下面的章节：[Cloudflare 环境变量设置](#环境变量设置)。
3. 将 [/functions](https://github.com/Eterance/web-toolbox/tree/main/functions) 文件夹下载到本地。里面的代码文件命名可随意更改，详见 [Functions routing](https://developers.cloudflare.com/pages/platform/functions/routing/)。
4. 使用 Wrangler CLI 推送项目到 Cloudflare Pages。`/functions` 文件夹需要在项目根目录下。

Wrangler CLI 全局安装（需要安装 NPM）：

```shell
# https://developers.cloudflare.com/workers/wrangler/install-and-update/
npm install wrangler -g
```

Wrangler 推送项目：

```shell
# https://developers.cloudflare.com/workers/wrangler/commands/#deploy-1
cd /到你的/包含functions文件夹的/项目根目录
wrangler pages deploy <本地文件夹路径> --project-name <pages 名字>
```

## 环境变量设置

### 通用

- PIC_DB: D1 数据库的名称。

### rpic

- DEFAULT_TABLE （必需）：如果用户提供的 URL 没有指定任何表（比如就只是直接的 https://rpic-api.eterance.com），默认随机 D1 数据库里的什么表（图集）。比如我设置为默认 pixiv 表。

### rpicpro

- DEFAULT_TABLES （必需）：如果用户提供的 URL 没有指定任何表（比如就只是直接的 https://rpicpro-api.eterance.com），默认随机 D1 数据库里的什么表（图集），多个图集用英文逗号隔开。比如我设置为默认 pixiv, imas 两张表。
- ENABLE_COUNT（可选）：用户是否可以使用 count 参数查询 SQL 语句所选择的随机图片范围的图片数量，比如 https://rpicpro-api.eterance.com?count&pixiv 。设置为 true 就是允许；false 和不设置就是不允许。
- ENABLE_DEBUG（可选）：用户是否可以使用 debug 参数查询自己构建的 SQL 语句最终长什么样，比如 https://rpicpro-api.eterance.com?debug&pixiv 。设置为 true 就是允许；false 和不设置就是不允许。
