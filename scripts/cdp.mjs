import { readFile, writeFile } from "node:fs/promises";

const pages = await (
  await fetch(`http://localhost:${process.env.CDP_PORT || 9224}/json/list`)
).json();

const ws = new WebSocket(
  pages.find((p) => p.type === "page").webSocketDebuggerUrl,
);

await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();

ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});

const call = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

if (process.argv[2] === "--screenshot") {
  await call("Emulation.setDeviceMetricsOverride", {
    width: Number(process.env.VIEWPORT_WIDTH || 1440),
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Runtime.evaluate", {
    expression:
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    awaitPromise: true,
  });
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(process.argv[3], Buffer.from(shot.result.data, "base64"));
  ws.close();
  process.exit(0);
}

const expression =
  (process.argv[2] === "--file"
    ? await readFile(process.argv[3], "utf8")
    : process.argv[2]) ||
  `JSON.stringify({ua:navigator.userAgent, methods:Object.getOwnPropertyNames(Element.prototype).filter(x=>/HTML|moveBefore/.test(x)),parts:typeof Part,signal:typeof Signal})`;

const result = await call("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});

console.log(JSON.stringify(result.result, null, 2));
ws.close();
if (result.result.exceptionDetails) process.exitCode = 1;
