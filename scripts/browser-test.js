(async () => {
  const results = [];

  const wait = () => new Promise((r) => setTimeout(r, 350));

  const assert = (condition, label) => {
    if (!condition) throw Error(label);
    results.push(label);
  };

  const $ = (s) => document.querySelector(s);

  const action = (card, name) =>
    card.shadowRoot.querySelector(`[data-action="${name}"]`).click();

  const original = localStorage.getItem("fieldnotes-v1");

  try {
    location.hash = "/all";
    await wait();
    assert(
      document.querySelectorAll("task-card").length >= 3,
      "initial native patch and DSD",
    );

    const first = $("task-card");

    const controller = first.controller;
    action(first, "down");
    await wait();
    assert(
      document.querySelectorAll("task-card")[1] === first &&
        first.controller === controller,
      "moveBefore preserves node and component lifecycle",
    );

    $("#add").click();
    assert($("#editor").open, "dialog opens");

    const f = $("#task-form");
    f.elements.title.value = "TEST <img src=x onerror=alert(1)>";
    f.elements.note.value = "test note";
    f.requestSubmit();
    await wait();
    assert(!$("#editor").open, "submit closes dialog");

    const added = $("task-card");

    const addedId = added.dataset.id;
    assert(
      added.shadowRoot.querySelector("h3").textContent.includes("<img") &&
        !added.shadowRoot.querySelector("img"),
      "escaped user content",
    );
    assert(
      document.querySelectorAll("task-card").length === 4,
      "refresh after reorder does not duplicate cards",
    );

    action(added, "edit");
    f.elements.title.value = "Edited test";
    f.requestSubmit();
    await wait();
    assert(
      $("task-card").shadowRoot.querySelector("h3").textContent ===
        "Edited test",
      "edit saves",
    );

    action($("task-card"), "toggle");
    await wait();
    assert(
      $("task-card")
        .shadowRoot.querySelector("[aria-pressed]")
        .getAttribute("aria-pressed") === "true",
      "completion toggles",
    );

    $("#search").value = "Edited test";
    $("#search").dispatchEvent(new Event("input"));
    await wait();
    assert(
      document.querySelectorAll("task-card").length === 1,
      "search filters",
    );

    location.hash = "/done";
    await wait();
    assert(document.querySelectorAll("task-card").length === 2, "route filter");

    location.hash = "/about";
    await wait();
    assert($(".about") && !$("#tasks"), "about route patches view");

    history.back();
    await wait();
    assert($("#tasks") && location.hash === "#/done", "history back");

    $("button[popovertarget]").click();
    assert($("#menu").matches(":popover-open"), "native popover");
    $("#menu").hidePopover();
    action(
      [...document.querySelectorAll("task-card")].find(
        (c) => c.shadowRoot.querySelector("h3").textContent === "Edited test",
      ),
      "delete",
    );
    await wait();
    assert(
      !document.querySelector('[data-id="' + addedId + '"]'),
      "delete task",
    );
    assert($("#problem").hidden, "no application errors");
    return results;
  } finally {
    if (original === null) localStorage.removeItem("fieldnotes-v1");
    else localStorage.setItem("fieldnotes-v1", original);
  }
})();
