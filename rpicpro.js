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
        const tableNameRows = await env.PIC_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != '_cf_KV' AND name NOT LIKE 'sqlite_%';").all();
        for (let index = 0; index < tableNameRows.results.length; index++) {
            const tableNameRow = tableNameRows.results[index];
            tableNamesArray.push(tableNameRow.name);
        }

        let isHasTableName = false;
        const builtSqls = [];


        for (let index = 0; index < tableNamesArray.length; index++) {
            let tableName = tableNamesArray[index];
            if (searchParams.has(tableName)) {
                isHasTableName = true;
                var sqlOrResponse = buildSql(tableName, searchParams.get(tableName), searchParams);
                if (sqlOrResponse instanceof Response) { // 如果是 Response 类型，说明构建 SQL 失败
                    return sqlOrResponse;
                }
                builtSqls.push(sqlOrResponse);
            } else if (searchParams.has("all")) {
                isHasTableName = true;
                var sqlOrResponse = buildSql(tableName, searchParams.get("all"), searchParams);
                if (sqlOrResponse instanceof Response) { // 如果是 Response 类型，说明构建 SQL 失败
                    return sqlOrResponse;
                }
                builtSqls.push(sqlOrResponse);
            }
        }

        if (!isHasTableName) {
            const defaultTables = env.DEFAULT_TABLES.split(',').map(part => part.trim());
            defaultTables.forEach((tableName) => {
                // 构建 SQL 查询语句
                let sql = "select";
                sql += (searchParams.has('count')) ? " COUNT(*) AS count" : " `url` ";
                sql += ` from \`${tableName}\``;
                builtSqls.push(sql);
            });
        }
        var isEnableDebug = false;
        try {
            isEnableDebug = env.ENABLE_DEBUG;
        }
        catch (error) {
            isEnableDebug = false;
        }
        if (searchParams.has("debug") && isEnableDebug) {
            if (isEnableDebug) {
                return Response.json(builtSqls)
            }
            else {
                return new Response('该 API 的管理员禁止使用 debug 检查 SQL 语句。', {
                    status: 403,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                    },
                });
            }
        }
        var statementsPrepared = [];
        for (let index = 0; index < builtSqls.length; index++) {
            const builtSql = builtSqls[index];
            statementsPrepared.push(env.PIC_DB.prepare(builtSql));
        }
        var rowsList
        try
        {
            rowsList = await env.PIC_DB.batch(statementsPrepared);
        }
        catch (error)
        {
            return new Response('SQL 查询失败。请先检查你的 SQL 是否有误；如果确认无误，请联系管理员。', {
                status: 400,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
        var rowResults = [];
        rowsList.forEach(rows => {
            rows.results.forEach(row => {
                rowResults.push(row);
            });
        });

        var isEnableCount = false;
        try {
            isEnableCount = env.ENABLE_COUNT;
        }
        catch (error) {
            isEnableCount = false;
        }
        if (searchParams.has("count")) {
            if (isEnableCount) {
                var count = 0;
                rowResults.forEach(countRow => {
                    count += countRow.count;
                });
                return Response.json(count)
            }
            else {
                return new Response('该 API 的管理员禁止使用 count 查询数量。', {
                    status: 403,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                    },
                });
            }
        }

        var allUrls = [];
        rowResults.forEach(row => {
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

function parseSqlElements(whereTerms) {
    const keyWords = ["(", ")", "or", "and", "not"];
    const permittedColumnNames = ["size", "width", "height", "ratio", "landscape", "near_square", "big_size", "mid_size", "small_size", "big_res", "mid_res", "small_res", "bjn", "ua"];
    const operators = ["=", "<>", ">", "<", ">=", "<="];

    const validatedSqlParts = [];
    let lastColumnName = null;

    for (let index = 0; index < whereTerms.length; index++) {
        const whereTerm = whereTerms[index];
        if (whereTerm === "") {
            continue;
        }
        if (keyWords.includes(whereTerm) || permittedColumnNames.includes(whereTerm) || operators.includes(whereTerm) || !isNaN(whereTerm)) {
            if (permittedColumnNames.includes(whereTerm)) {
                lastColumnName = whereTerm;
                // 为列名加上反引号
                whereTerms[index] = "`" + whereTerm + "`";
            }
            if (!isNaN(whereTerm) && lastColumnName === "bjn" && Number(whereTerm) === 1) {
                return new Response('不允许项：bjn = 1 。不允许单独查询 bjn 图片。', {
                    status: 400,
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                    },
                });
            }
            // 处理 UA 参数
            // https://www.feiniaomy.com/post/306.html
            if (whereTerm === "ua") {
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
            } else {
                validatedSqlParts.push(whereTerm);
            }
        } else {
            return new Response("不允许项：" + whereTerm, {
                status: 400,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
    }
    return validatedSqlParts;
}

function buildSql(tableName, whereRaw, searchParams) {
    let whereCondition = "";
    try {
        const whereTerms = whereRaw.split(' ');
        // trim
        for (let i = 0; i < whereTerms.length; i++) {
            whereTerms[i] = whereTerms[i].trim();
        }
        if (whereTerms.length >= 30) {
            return new Response(`你的 where 条件 (${whereRaw}) 太长了：${whereTerms.length} 个 >= 30 个。过多的 where 条件会加重服务器负担，请精简你的 sql。`, {
                status: 400,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                },
            });
        }
        const validatedSqlParts = parseSqlElements(whereTerms);
        if (validatedSqlParts instanceof Response) { // 如果是 Response 类型，说明构建 SQL 失败
            return validatedSqlParts;
        }
        if (validatedSqlParts.length === 0) {
            whereCondition = "";
        } else {
            whereCondition = " where " + validatedSqlParts.join(" ");
        }
    } catch (error) {
        return new Response(`SQL 构建失败。请联系管理员。`, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
            },
        });
    }
    // 构建 SQL 查询语句
    let sql = "select";
    sql += searchParams.has('count') ? " COUNT(*) AS count" : " `url` ";
    sql += ` from \`${tableName}\` ${whereCondition}`;
    return sql;
}

