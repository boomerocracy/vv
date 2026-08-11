const COOKIE_KEY = "QDREADER_COOKIE";

const QL_HOST = $persistentStore.read("yuheng_ql_host") || "";
const QL_CLIENT_ID = $persistentStore.read("yuheng_ql_clientid") || "";
const QL_CLIENT_SECRET = $persistentStore.read("yuheng_ql_clientsecret") || "";
const QD_COOKIE = $persistentStore.read(COOKIE_KEY) || "";

(async () => {
  if (!QD_COOKIE) {
    throw new Error("未读取到 QDREADER_COOKIE");
  }

  if (!QL_HOST || !QL_CLIENT_ID || !QL_CLIENT_SECRET) {
    throw new Error("BoxJS 中的青龙面板配置不完整");
  }

  const host = QL_HOST.endsWith("/") ? QL_HOST : QL_HOST + "/";

  // 1. 获取青龙 token
  const auth = await request({
    url:
      host +
      "open/auth/token?client_id=" +
      encodeURIComponent(QL_CLIENT_ID) +
      "&client_secret=" +
      encodeURIComponent(QL_CLIENT_SECRET),
    method: "GET",
  });

  if (auth.code !== 200 || !auth.data?.token) {
    throw new Error("获取青龙 Token 失败：" + JSON.stringify(auth));
  }

  const tokenType = auth.data.token_type || "Bearer";
  const token = `${tokenType} ${auth.data.token}`;

  // 2. 获取青龙环境变量
  const envResult = await request({
    url: host + "open/envs",
    method: "GET",
    headers: {
      Authorization: token,
    },
  });

  if (envResult.code !== 200 || !Array.isArray(envResult.data)) {
    throw new Error("读取青龙环境变量失败：" + JSON.stringify(envResult));
  }

  const oldEnv = envResult.data.find((item) => item.name === COOKIE_KEY);

  if (oldEnv) {
    // 3A. 已存在 → 更新
    const body = {
      name: COOKIE_KEY,
      value: QD_COOKIE,
      remarks: oldEnv.remarks || "起点读书",
      _id: oldEnv._id || oldEnv.id,
    };

    const updateResult = await request({
      url: host + "open/envs",
      method: "PUT",
      headers: {
        Authorization: token,
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify(body),
    });

    if (updateResult.code !== 200) {
      throw new Error("更新环境变量失败：" + JSON.stringify(updateResult));
    }

    // 如果之前被禁用，顺手启用
    const id = oldEnv._id || oldEnv.id;

    if (id) {
      await request({
        url: host + "open/envs/enable",
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify([id]),
      });
    }

    $notification.post(
      "起点读书 → 青龙",
      "同步成功",
      "已更新 QDREADER_COOKIE"
    );
  } else {
    // 3B. 不存在 → 创建
    const addResult = await request({
      url: host + "open/envs",
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json;charset=UTF-8",
      },
      body: JSON.stringify([
        {
          name: COOKIE_KEY,
          value: QD_COOKIE,
          remarks: "起点读书",
        },
      ]),
    });

    if (addResult.code !== 200) {
      throw new Error("创建环境变量失败：" + JSON.stringify(addResult));
    }

    $notification.post(
      "起点读书 → 青龙",
      "同步成功",
      "已创建 QDREADER_COOKIE"
    );
  }
})()
  .catch((err) => {
    console.log(err);
    $notification.post(
      "起点读书 → 青龙",
      "同步失败",
      String(err.message || err)
    );
  })
  .finally(() => $done());

function request(options) {
  return new Promise((resolve, reject) => {
    const method = (options.method || "GET").toLowerCase();

    $httpClient[method](options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject("响应不是 JSON：" + body);
      }
    });
  });
}
