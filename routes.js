// ハッシュ内に画面・タスクID・一覧の検索条件を保存する。
// サーバーのリライト設定なしで、詳細URLを直接開いたり再読み込みできる。
const listRoutes = new Set(["all", "active", "done"]);

export function readRoute(hash = location.hash) {
  const [path, search = ""] = hash.replace(/^#\//, "").split("?");
  const params = new URLSearchParams(search);
  const detail = /^task\/([\w-]+)$/.exec(path);
  const list = listRoutes.has(params.get("list")) ? params.get("list") : "all";

  if (detail) {
    return {
      name: "detail",
      id: detail[1],
      list,
      query: params.get("q") || "",
    };
  }

  const name = listRoutes.has(path) || path === "about" ? path : "all";
  return {
    name,
    id: null,
    list: name === "about" ? "all" : name,
    query: params.get("q") || "",
  };
}

export function listURL(list, query = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  return `#/${list}${params.size ? `?${params}` : ""}`;
}

export function detailURL(id, list, query = "") {
  const params = new URLSearchParams({ list });
  if (query) params.set("q", query);
  return `#/task/${id}?${params}`;
}
