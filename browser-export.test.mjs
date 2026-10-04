import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

test("browser exports the generated suite as parseable JSON and CSV", async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const files = new Map([["/", ["index.html", "text/html"]], ["/app.mjs", ["app.mjs", "text/javascript"]], ["/engine.mjs", ["engine.mjs", "text/javascript"]], ["/styles.css", ["styles.css", "text/css"]]]);
  const server = createServer(async (request, response) => {
    const entry = files.get(request.url);
    if (!entry) { response.writeHead(404).end(); return; }
    try {
      response.writeHead(200, { "Content-Type": entry[1] }).end(await readFile(join(root, entry[0])));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#total-count").innerText(), "21 cases");
    const jsonEvent = page.waitForEvent("download");
    await page.locator("#download-json").click();
    const jsonDownload = await jsonEvent;
    assert.equal(jsonDownload.suggestedFilename(), "scenarioseed-cases.json");
    const jsonBytes = [];
    for await (const chunk of await jsonDownload.createReadStream()) jsonBytes.push(chunk);
    const json = JSON.parse(Buffer.concat(jsonBytes).toString("utf8"));
    assert.equal(json.cases.length, 21);
    assert.equal(json.cases[0].expected, "Pass");

    const csvEvent = page.waitForEvent("download");
    await page.locator("#download-csv").click();
    const csvDownload = await csvEvent;
    assert.equal(csvDownload.suggestedFilename(), "scenarioseed-cases.csv");
    const csvBytes = [];
    for await (const chunk of await csvDownload.createReadStream()) csvBytes.push(chunk);
    const csv = Buffer.concat(csvBytes).toString("utf8");
    assert.equal(csv.split("\r\n").length, 22);
    assert.ok(csv.includes('"Missing customerId"'));
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
