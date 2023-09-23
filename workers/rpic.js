export default {
    async fetch(request, env, ctx) {
        // 检查是否是预检请求（OPTIONS请求），如果是则返回CORS头部
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET', // 允许的HTTP方法
                    'Access-Control-Allow-Headers': '*', // 允许的请求头
                },
            });
        }

        const url = new URL(request.url);
        // 检查URL中是否包含 "favicon.ico"
        if (url.pathname.includes("favicon.ico")) {
            // 如果包含 "favicon.ico"，则返回404响应
            return new Response('Not Found', {
                status: 404,
                statusText: 'Not Found',
                headers: {
                    'Content-Type': 'text/plain',
                },
            });
        }

        // https://developer.mozilla.org/zh-CN/docs/Web/API/URLSearchParams#%E6%96%B9%E6%B3%95
        const searchParams = new URLSearchParams(url.search);
        //return Response.json(env.DEFAULT_TABLES);
        var tableNamesArray = [];
        // 获取所有目前存在的表名
        try{
            const tableNameRows = await env.PIC_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != '_cf_KV' AND name NOT LIKE 'sqlite_%';").all();
            for (let index = 0; index < tableNameRows.results.length; index++) {
                const tableNameRow = tableNameRows.results[index];
                tableNamesArray.push(tableNameRow.name);
            }
        }
        catch{
            return new Response('服务器内部错误，这不是你的错。请联系管理员：“你忘了绑定 D1 数据库至参数 PIC_DB ”', {
                status: 500,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }

        let isHasTableName = false;

        let validatedSqlParts = [];
        // 处理 UA 参数
        // https://www.feiniaomy.com/post/306.html
        if (searchParams.has("ua")) {
            const userAgent = navigator.userAgent || "";
            const isMobile = /Mobile|Android|Silk\/|Kindle|BlackBerry|Opera Mini|Opera Mobi/.test(userAgent);
            // 判断 UA 是否包含手机或平板设备相关标识
            if (isMobile) {
                // 如果 UA 中包含手机或平板设备标识，则设置 landscape=0
                validatedSqlParts.push("`landscape` = 0");
            } else {
                // 否则，设置 landscape=1
                validatedSqlParts.push("`landscape` = 1");
            }
        }
        else {
            if (searchParams.has("landscape")) {
                const landscape = searchParams.get("landscape") === "1" ? 1 : 0;
                validatedSqlParts.push("`landscape` = " + landscape);
            }
        }

        // 处理 near_square 参数
        if (searchParams.has('near_square')) {
            const nearSquare = parseInt(searchParams.get('near_square')) === 1 ? true : false;
            validatedSqlParts.push(`near_square = ${nearSquare}`);
        }

        // 处理尺寸参数 (big_size, mid_size, small_size)
        const sizeConditions = [];
        const sizeParams = ['big_size', 'mid_size', 'small_size'];
        sizeParams.forEach(param => {
            if (searchParams.has(param)) {
                const paramValue = parseInt(searchParams.get(param)) === 1 ? true : false;
                sizeConditions.push(`${param} = ${paramValue}`);
            }
        });
        if (sizeConditions.length > 0) {
            validatedSqlParts.push(`(${sizeConditions.join(' and ')})`);
        }

        // 处理分辨率参数 (big_res, mid_res, small_res)
        const resConditions = [];
        const resParams = ['big_res', 'mid_res', 'small_res'];
        resParams.forEach(param => {
            if (searchParams.has(param)) {
                const paramValue = parseInt(searchParams.get(param)) === 1 ? true : false;
                resConditions.push(`${param} = ${paramValue}`);
            }
        });
        if (resConditions.length > 0) {
            validatedSqlParts.push(`(${resConditions.join(' and ')})`);
        }


        // 处理 bjn 参数
        if (searchParams.has('nobjn')) {
            // 不允许 bjn 参数为 1 来指定只要蛇图
            validatedSqlParts.push('bjn = 0');
        }

        let className = "";
        try {
            className = env.DEFAULT_TABLE;
        }
        catch {
            return new Response('服务器内部错误，这不是你的错。请联系管理员：“你忘了设置参数 DEFAULT_TABLE ”', {
                status: 500,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
        if (searchParams.has('class')) {
            className = searchParams.get('class');
        }

        // 构建 SQL 查询语句
        let sql = "SELECT";
        sql += searchParams.has('count') ? " COUNT(*) AS count" : " url";
        sql += ` FROM \`${className}\``;
        if (validatedSqlParts.length > 0) {
            sql += ` WHERE ${validatedSqlParts.join(' and ')}`;
        }
        var rows
        try {
            rows = await env.PIC_DB.prepare(sql).all()
        }
        catch (error) {
            return new Response('SQL 查询失败。请先检查你的 SQL 是否有误；如果确认无误，请联系管理员。', {
                status: 400,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }

        var allUrls = [];
        rows.results.forEach(row => {
            allUrls.push(row.url);
        });

        var randomImageUrl = ""
        if (allUrls.length > 0) {
            // 随机选择一个URL
            const randomIndex = Math.floor(Math.random() * allUrls.length);
            randomImageUrl = allUrls[randomIndex];
            // 构建重定向响应，将用户重定向到随机选择的图片URL
            // 允许跨域，因为 Sakurairo 需要跨域预载多一张图片
            // 这样下次访问就能直接从缓存中读取，加快封面图加载速度
            return new Response(null, {
                status: 302,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET', // 允许的HTTP方法
                    'Access-Control-Allow-Headers': '*', // 允许的请求头
                    'Location': randomImageUrl,
                },
            });
        } else {
            return new Response('没有找到符合条件的图片。', {
                status: 404,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
    },
};