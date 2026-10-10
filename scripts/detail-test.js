(async () => {
  const results = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    results.push(label);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 450));
  const $ = (selector) => document.querySelector(selector);

  await navigation.navigate("#/all").finished;
  const search = $("#search");
  search.value = "Web標準";
  search.dispatchEvent(new Event("input"));
  await wait();
  assert(
    location.hash.includes("q=") &&
      document.querySelectorAll("task-card").length === 1,
    "list filter is encoded in URL",
  );
  const card = $("task-card");
  const id = card.dataset.id;
  const link = card.shadowRoot.querySelector("h3 a");
  const detailURL = link.href;

  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  navigation.addEventListener(
    "navigate",
    (event) => event.intercept({ handler: () => hold }),
    { once: true },
  );
  try {
    link.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(
      $(".task-detail")?.dataset.id === id,
      "detail route renders matching task",
    );
    assert(
      getComputedStyle($(".task-detail")).viewTransitionName === `task-${id}`,
      "CSS navigation enables ID-based shared element",
    );
    assert(
      getComputedStyle(document.documentElement, "::view-transition-new(root)")
        .animationName === "route-enter-from-right",
      "CSS selects list-to-detail direction",
    );
  } finally {
    release();
  }
  await wait();
  assert(
    document.activeElement === $(".task-detail h1"),
    "detail heading receives focus",
  );

  await navigation.back().finished;
  assert(
    $("#search").value === "Web標準" &&
      document.querySelectorAll("task-card").length === 1,
    "back restores filter and list",
  );
  assert(
    $("task-card").shadowRoot.activeElement?.matches("h3 a"),
    "back restores focus to matching card without click state",
  );
  await navigation.forward().finished;
  assert(
    location.href === detailURL && $(".task-detail").dataset.id === id,
    "forward reopens same detail",
  );
  $("#back-to-list").click();
  await wait();
  assert(
    $("#search").value === "Web標準",
    "in-page back restores original list",
  );

  await navigation.navigate("#/task/missing?list=active").finished;
  assert(
    $("#view h1").textContent === "タスクが見つかりません",
    "unknown task has recoverable missing state",
  );
  await navigation.navigate("#/all").finished;
  assert($("#problem").hidden, "no application errors");
  // CSSの算出値だけでなく、ブラウザーが両側のスナップショットを生成したことを確認する。
  const startTransition = document.startViewTransition.bind(document);
  const snapshots = [];
  document.startViewTransition = (update) => {
    const transition = startTransition(update);
    transition.ready.then(
      () =>
        snapshots.push(
          document
            .getAnimations()
            .map((animation) => animation.effect?.pseudoElement),
        ),
      () => snapshots.push([]),
    );
    return transition;
  };

  try {
    await navigation.navigate("#/task/native?list=all").finished;
    await navigation.back().finished;
    assert(
      snapshots.length === 2 &&
        snapshots.every(
          (names) =>
            names.includes("::view-transition-old(task-native)") &&
            names.includes("::view-transition-new(task-native)"),
        ),
      "forward and back generate both shared-element snapshots",
    );
  } finally {
    document.startViewTransition = startTransition;
  }

  return results;
})();
