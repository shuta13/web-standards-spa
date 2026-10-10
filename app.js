import { readRoute, listURL, detailURL } from "./routes.js";

const $ = (s) => document.querySelector(s);

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

const KEY = "fieldnotes-v1";

const seed = [
  {
    id: "welcome",
    title: "アイデアを、小さな一歩にする",
    note: "まずは今日取り組みたいことをひとつ。右上のボタンから追加できます。",
    category: "デザイン",
    done: false,
  },
  {
    id: "native",
    title: "Web標準でできることを探る",
    note: "カードを編集したり、↑ ↓ で並べ替えてみよう。",
    category: "開発",
    done: false,
  },
  {
    id: "walk",
    title: "散歩しながら、次のアイデアを考える",
    note: "画面から少し離れる時間も、大切な作業。",
    category: "暮らし",
    done: true,
  },
];

let tasks = structuredClone(seed),
  persistenceError = false;

try {
  const data = JSON.parse(localStorage.getItem(KEY));
  if (
    Array.isArray(data) &&
    data.every(
      (t) =>
        typeof t.id === "string" &&
        /^[\w-]+$/.test(t.id) &&
        typeof t.title === "string" &&
        typeof t.note === "string" &&
        ["デザイン", "開発", "暮らし"].includes(t.category) &&
        typeof t.done === "boolean",
    ) &&
    new Set(data.map((t) => t.id)).size === data.length
  )
    tasks = data;
} catch {
  persistenceError = true;
}

let route = "all",
  query = "",
  editing = null,
  queue = Promise.resolve(),
  generation = 0,
  scope;

let currentRoute = readRoute();
let activeTransition;

function notice(message) {
  $("#notice").textContent = message;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => ($("#notice").textContent = ""), 3000);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    notice("保存できませんでした。このタブ内でのみ保持されます。");
  }
}

const range = (name, html) => `<?start name="${name}">${html}<?end>`;
// The browser consumes <template for>. No JavaScript marker parser or DOM diff.

async function patch(name, html) {
  const writer = $("#shell").streamAppendHTMLUnsafe().getWriter();
  try {
    await writer.write(
      `<template for="${name}">${range(name, html)}</template>`,
    );
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  }
}

function enqueue(work) {
  queue = queue.then(work).catch((error) => {
    $("#problem").hidden = false;
    $("#problem").textContent = `更新できませんでした: ${error.message}`;
    console.error(error);
  });
  return queue;
}

class TaskCard extends HTMLElement {
  connectedCallback() {
    if (this.controller) return;
    this.controller = new AbortController();
    this.addEventListener(
      "click",
      (e) => {
        const button = e
          .composedPath()
          .find((node) => node instanceof HTMLButtonElement);
        if (button)
          this.dispatchEvent(
            new CustomEvent("task-action", {
              bubbles: true,
              detail: { id: this.dataset.id, action: button.dataset.action },
            }),
          );
      },
      { signal: this.controller.signal },
    );
  }

  disconnectedCallback() {
    this.controller?.abort();
    this.controller = null;
  }

  connectedMoveCallback() {} // moveBefore preserves this component's event subscription and state.
}

customElements.define("task-card", TaskCard);

// タスクカードの Shadow DOM 内だけに適用するスタイル。
const cardStyle = /* CSS */ `
  :host {
    display: block;
  }
  article {
    display: flex;
    align-items: center;
    gap: 17px;
    padding: 22px;
    background: #fff;
    border: 1px solid #dfe5dc;
    border-radius: 11px;
    color: #253a32;
    font-family: system-ui;
  }
  button {
    font: inherit;
    cursor: pointer;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 6px;
    padding: 6px;
  }
  button:hover {
    background: #edf2e9;
  }
  button:focus-visible {
    outline: 2px solid #286347;
  }
  .check {
    border: 1px solid #c9d4c4;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    flex-shrink: 0;
    padding: 0;
  }
  .done .check {
    background: #dfead7;
    color: #426831;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 7px;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid #286347; outline-offset: 4px; }
  .done h3 {
    text-decoration: line-through;
    color: #8c968a;
  }
  p {
    font-size: 11px;
    color: #83907f;
    margin: 0;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .category {
    font-size: 10px;
    background: #eef2e8;
    padding: 5px 9px;
    border-radius: 5px;
    color: #6b7d61;
  }
  .actions {
    display: flex;
    gap: 2px;
    font-size: 11px;
  }
  @media (max-width: 760px) {
    article {
      padding: 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .body {
      flex-basis: 70%;
    }
    .actions {
      margin-left: auto;
    }
  }
`;

function card(t) {
  return /* HTML */ `
    <task-card data-id="${t.id}" style="--task-transition: task-${t.id}">
      <template shadowrootmode="open">
        <style>
          ${cardStyle}
        </style>
        ${range("card-" + t.id, cardBody(t))}
      </template>
    </task-card>
  `;
}

function cardBody(t) {
  return /* HTML */ `
    <article class="${t.done ? "done" : ""}">
      <button
        class="check"
        data-action="toggle"
        aria-label="${t.done ? "未完了に戻す" : "完了にする"}"
        aria-pressed="${t.done}"
      >
        ${t.done ? "✓" : ""}
      </button>
      <div class="body">
        <h3>
          <a href="${escapeHTML(detailURL(t.id, route, query))}">
            ${escapeHTML(t.title)}
          </a>
        </h3>
        <p>${escapeHTML(t.note)}</p>
      </div>
      <span class="category">${t.category}</span>
      <div class="actions">
        <button data-action="up" aria-label="上へ移動">↑</button>
        <button data-action="down" aria-label="下へ移動">↓</button>
        <button data-action="edit" aria-label="編集">編集</button>
        <button data-action="delete" aria-label="削除">×</button>
      </div>
    </article>
  `;
}

function visibleTasks() {
  return tasks.filter(
    (t) =>
      (route === "all" || (route === "done" ? t.done : !t.done)) &&
      `${t.title} ${t.note} ${t.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
}

function stats() {
  return /* HTML */ `
    <div class="stats">
      ${[
        ["すべてのタスク", tasks.length],
        ["進行中", tasks.filter((t) => !t.done).length],
        ["完了", tasks.filter((t) => t.done).length],
      ]
        .map(
          ([label, n]) => /* HTML */ `
            <div class="stat">
              <small>${label}</small>
              <strong>${String(n).padStart(2, "0")}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function list() {
  return (
    visibleTasks().map(card).join("") ||
    '<p class="empty">ここは、まだ余白です。<br>新しいタスクを追加するか、検索条件を変えてみましょう。</p>'
  );
}

const names = {
  all: "すべてのタスク",
  active: "進行中のタスク",
  done: "完了したタスク",
  about: "Webが、そのままアプリになる。",
};

function detailView() {
  const task = tasks.find((item) => item.id === currentRoute.id);
  const backURL = listURL(currentRoute.list, currentRoute.query);

  if (!task) {
    return /* HTML */ `
      <a class="back-link" href="${escapeHTML(backURL)}">← 一覧へ戻る</a>
      <h1 tabindex="-1">タスクが見つかりません</h1>
      <p>削除されたか、このブラウザーに保存されていないタスクです。</p>
    `;
  }

  return /* HTML */ `
    <a class="back-link" id="back-to-list" href="${escapeHTML(backURL)}">
      ← 一覧へ戻る
    </a>
    <article
      class="task-detail"
      data-id="${task.id}"
      style="--task-transition: task-${task.id}"
    >
      <p class="eyebrow">TASK DETAILS</p>
      <span class="detail-category">${task.category}</span>
      <h1 tabindex="-1">${escapeHTML(task.title)}</h1>
      <p class="detail-status">${task.done ? "✓ 完了" : "◷ 進行中"}</p>
      <h2>メモ</h2>
      <p class="detail-note">
        ${escapeHTML(task.note || "メモはまだありません。")}
      </p>
    </article>
    <p class="intro">
      このURLから、いつでもこのタスクを開けます。ブラウザーの「戻る」「進む」も使えます。
    </p>
  `;
}

function view() {
  if (route === "detail") return detailView();
  if (route === "about")
    return /* HTML */ `
      <p class="eyebrow">UNDER THE HOOD</p>
      <h1>${names.about}</h1>
      <p class="intro">
        ビルドも、フレームワークも、Polyfillも使わない小さな実験。
      </p>
      <div class="about">
        <ul>
          <li>
            <code>&lt;template for&gt;</code>
            と processing instructions：ブラウザー自身が部分更新を実行。
          </li>
          <li>
            <code>streamAppendHTMLUnsafe()</code>
            ：HTMLパッチをネイティブパーサーへ送信。
          </li>
          <li>
            Web Components + Declarative Shadow
            DOM：タスクの表示とイベントをカプセル化。
          </li>
          <li>
            <code>moveBefore()</code>
            ：カードのDOM・コンポーネント状態を保って並べ替え。
          </li>
          <li>
            <code>AbortSignal</code>
            ：画面とコンポーネントのイベント購読を破棄。
          </li>
          <li>View Transition API：同一ドキュメント内の画面遷移。</li>
          <li>
            CSS Navigation
            Matching：遷移先リンクとルート別アニメーションをCSSで指定。
          </li>
          <li>Popover / dialog：メニューと編集画面をTop Layerへ。</li>
          <li>
            DOM Parts API と TC39 Signals
            は使用していません。Polyfillを導入せず、ネイティブAPIのみ使用します。
          </li>
        </ul>
        <p>データはこのブラウザーのlocalStorageに保存されます。</p>
        <a
          href="https://github.com/WICG/declarative-partial-updates"
          target="_blank"
          rel="noreferrer"
        >
          WICGの提案を読む ↗
        </a>
      </div>
    `;
  return /* HTML */ `
    <div class="heading">
      <div>
        <p class="eyebrow">MAKE ROOM FOR WHAT MATTERS</p>
        <h1>${names[route]}</h1>
        <p class="intro">考えていることを整理して、今日もひとつずつ。</p>
      </div>
      <button id="add" class="primary">＋ タスクを追加</button>
    </div>
    ${range("stats", stats())}
    <div class="toolbar">
      <h2>あなたのタスク</h2>
      <input
        id="search"
        type="search"
        aria-label="タスクを検索"
        placeholder="⌕ タスクを検索"
        value="${escapeHTML(query)}"
      />
    </div>
    <div id="tasks">${range("tasks", list())}</div>
  `;
}

async function renderRoute(event) {
  if ($("#editor").open) $("#editor").close();
  const current = ++generation;
  activeTransition?.skipTransition();
  const nextRoute = readRoute();
  scope?.abort();
  scope = new AbortController();
  const signal = scope.signal;
  await enqueue(async () => {
    if (current !== generation || event?.signal.aborted) return;
    const previousRoute = currentRoute;
    currentRoute = nextRoute;
    route = nextRoute.name;
    query = nextRoute.query;
    const update = () => patch("view", view());
    let transition;

    if (
      document.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      transition = document.startViewTransition(update);
      activeTransition = transition;
      await transition.updateCallbackDone;
    } else {
      await update();
    }
    if (signal.aborted) return;
    const title =
      route === "detail"
        ? tasks.find((task) => task.id === currentRoute.id)?.title ||
          "タスクが見つかりません"
        : names[route];
    document.title = `${title} — Fieldnotes`;
    $("#breadcrumb").textContent =
      route === "about"
        ? "このアプリについて"
        : route === "detail"
          ? "タスク / 詳細"
          : "タスク";
    document.querySelectorAll("nav a").forEach((a) => {
      a.removeAttribute("aria-current");
      if (a.hash === `#/${route === "detail" ? currentRoute.list : route}`)
        a.setAttribute("aria-current", "page");
    });
    $("#add")?.addEventListener("click", () => openEditor(), { signal });
    $("#search")?.addEventListener(
      "input",
      (e) => {
        query = e.target.value;
        currentRoute = { ...currentRoute, query };
        // 入力ごとに履歴を増やさず、一覧の条件をURLに残す。
        history.replaceState(history.state, "", listURL(route, query));
        enqueue(() => patch("tasks", list()));
      },
      { signal },
    );

    // 詳細から戻るリンクは、直前の一覧なら履歴を戻す。直リンクの場合は通常のリンク。
    $("#back-to-list")?.addEventListener(
      "click",
      (click) => {
        if (
          click.button !== 0 ||
          click.metaKey ||
          click.ctrlKey ||
          click.shiftKey ||
          click.altKey
        )
          return;
        const entries = navigation.entries();
        const previous = entries[navigation.currentEntry.index - 1];
        const target = new URL(click.currentTarget.href);
        if (previous?.url === target.href && navigation.canGoBack) {
          click.preventDefault();
          navigation.back();
        }
      },
      { signal },
    );

    if (route === "detail") {
      $("#view h1")?.focus({ preventScroll: true });
    } else if (previousRoute.name === "detail" && route !== "about") {
      const card = document.querySelector(
        `task-card[data-id="${previousRoute.id}"]`,
      );
      card?.shadowRoot.querySelector("h3 a")?.focus({ preventScroll: true });
    }

    // CSS の @navigation がアニメーション中も遷移情報を参照できるようにする。
    await transition?.finished.catch(() => {});
    if (activeTransition === transition) activeTransition = null;
  });
}

function openEditor(t) {
  editing = t?.id ?? null;
  const form = $("#task-form");
  form.reset();
  form.querySelector("h2").textContent = t ? "タスクを編集" : "タスクを追加";
  if (t)
    for (const key of ["title", "note", "category"])
      form.elements[key].value = t[key];
  $("#editor").showModal();
  form.elements.title.focus();
}

async function refresh() {
  await patch("stats", stats());
  await patch("tasks", list());
}

$("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const title = data.get("title").trim();
  if (!title) {
    e.target.elements.title.setCustomValidity("タイトルを入力してください");
    e.target.elements.title.reportValidity();
    return;
  }
  const values = {
    title,
    note: data.get("note").trim(),
    category: data.get("category"),
  };
  const t = tasks.find((t) => t.id === editing);
  if (t) Object.assign(t, values);
  else tasks.unshift({ id: crypto.randomUUID(), ...values, done: false });
  save();
  $("#editor").close();
  enqueue(refresh);
  notice(t ? "変更を保存しました" : "タスクを追加しました");
});

$("#task-form").elements.title.addEventListener("input", (e) =>
  e.target.setCustomValidity(""),
);

$("#close-editor").addEventListener("click", () => $("#editor").close());

$("#shell").addEventListener("task-action", (e) =>
  enqueue(async () => {
    const { id, action } = e.detail;
    const t = tasks.find((t) => t.id === id);
    if (!t) return;
    if (action === "edit") {
      openEditor(t);
      return;
    }
    if (action === "up" || action === "down") {
      const filtered = visibleTasks();
      const index = filtered.indexOf(t);
      const neighbor = filtered[index + (action === "up" ? -1 : 1)];
      if (!neighbor) return;
      const a = tasks.indexOf(t),
        b = tasks.indexOf(neighbor);
      [tasks[a], tasks[b]] = [tasks[b], tasks[a]];
      const host = $("#tasks");
      const end = [...host.childNodes].find(
        (n) => n.nodeType === 7 && n.target === "end",
      );
      for (const item of visibleTasks())
        host.moveBefore(host.querySelector(`[data-id="${item.id}"]`), end);
      save();
      return;
    }
    if (action === "toggle") t.done = !t.done;
    if (action === "delete") tasks = tasks.filter((item) => item !== t);
    save();
    await refresh();
    notice(
      action === "delete" ? "タスクを削除しました" : "タスクを更新しました",
    );
  }),
);

async function boot() {
  try {
    if (
      !Element.prototype.streamAppendHTMLUnsafe ||
      !Element.prototype.moveBefore
    )
      throw Error(
        "Chrome 154以降で Experimental Web Platform features を有効にしてください。",
      );
    const probe = document.createElement("div");
    probe.setHTMLUnsafe(range("probe", "before"));
    const w = probe.streamAppendHTMLUnsafe().getWriter();
    await w.write('<template for="probe">after</template>');
    await w.close();
    if (probe.textContent !== "after")
      throw Error(
        "ネイティブHTMLパッチが有効ではありません。chrome://flags/#enable-experimental-web-platform-features を確認してください。",
      );
    // ネイティブ Navigation API に処理の寿命を伝える。URL の更新はブラウザーが行う。
    navigation.addEventListener("navigate", (event) => {
      const destination = new URL(event.destination.url);
      if (
        !event.canIntercept ||
        event.navigationType === "reload" ||
        event.downloadRequest !== null ||
        destination.origin !== location.origin ||
        destination.pathname !== location.pathname ||
        destination.search !== location.search
      ) {
        return;
      }

      event.intercept({
        handler: () => renderRoute(event),
        focusReset: "manual",
      });
    });
    await renderRoute();
    if (persistenceError) notice("保存済みデータを読み込めませんでした。");
  } catch (error) {
    $("#problem").hidden = false;
    $("#problem").textContent = error.message;
  }
}

await boot();
