(async () => {
  const results = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    results.push(label);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 400));

  location.hash = "/all";
  await wait();

  const aboutLink = document.querySelector('nav a[href="#/about"]');
  assert(
    aboutLink.matches(":link-to(--about)"),
    "native named location matches about link",
  );
  assert(
    !aboutLink.matches(":link-to(--tasks)"),
    "task location excludes about link",
  );

  // 一時的に遷移を保持して、@navigation の実際の適用を観測する。
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  navigation.addEventListener(
    "navigate",
    (event) => {
      event.intercept({ handler: () => hold });
    },
    { once: true },
  );

  try {
    aboutLink.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert(
      getComputedStyle(aboutLink).outlineStyle === "solid",
      "navigation destination styling applies",
    );
    assert(
      getComputedStyle(document.documentElement, "::view-transition-new(root)")
        .animationName === "route-enter-from-right",
      "tasks to about uses CSS-selected animation",
    );
  } finally {
    release();
  }

  await wait();
  assert(document.querySelector(".about"), "about content patched");
  assert(
    getComputedStyle(aboutLink).outlineStyle === "none",
    "navigation styling clears after completion",
  );
  history.back();
  await wait();
  assert(
    location.hash === "#/all" && document.querySelector("#tasks"),
    "history restores task route",
  );
  assert(document.querySelector("#problem").hidden, "no application errors");
  return results;
})();
