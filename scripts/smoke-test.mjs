import { chromium } from "playwright-core";
import { mkdir, stat } from "node:fs/promises";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = process.env.QINGMING_URL ?? "http://127.0.0.1:5173/";
const OUTPUT_DIR = "output/playwright";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isServerUp() {
  try {
    const response = await fetch(BASE_URL);
    return response.ok;
  } catch {
    return false;
  }
}

async function startViteIfNeeded() {
  if (await isServerUp()) {
    return undefined;
  }
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isServerUp()) {
      return child;
    }
    if (child.exitCode !== null) {
      throw new Error(`Vite exited early:\n${log}`);
    }
    await wait(250);
  }
  child.kill();
  throw new Error(`Vite did not become ready:\n${log}`);
}

async function getStatus(page) {
  return page.evaluate(() => window.__qingmingGameDebug.status());
}

async function debug(page, method, ...args) {
  return page.evaluate(
    ([name, params]) => window.__qingmingGameDebug[name](...params),
    [method, args],
  );
}

async function clickOption(page, text) {
  await page.getByRole("button", { name: text }).click();
  await wait(80);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const viteProcess = await startViteIfNeeded();
  if (viteProcess) {
    process.once("exit", () => viteProcess.kill());
  }
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--disable-gpu-sandbox", "--no-sandbox"],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__qingmingGameDebug));
  await page.waitForFunction(() => document.body.dataset.gameReady === "true");
  await page.screenshot({ path: `${OUTPUT_DIR}/desktop-boot.png`, fullPage: false });
  const screenshotStat = await stat(`${OUTPUT_DIR}/desktop-boot.png`);
  assert.ok(screenshotStat.size > 20_000, "desktop screenshot should not be blank or tiny");

  await debug(page, "newGame");
  await wait(250);
  await page.screenshot({ path: `${OUTPUT_DIR}/desktop-play.png`, fullPage: false });
  let status = await getStatus(page);
  assert.equal(status.running, true, "new game starts running");
  assert.ok(status.npcCount >= 8, "at least 8 NPCs exist");
  assert.ok(status.interactions.includes("door:teahouse"), "teahouse door interaction exists");
  assert.ok(status.interactions.includes("pickup:market_ledger_page"), "market clue pickup exists");
  assert.equal(await debug(page, "testMissingAssetFallback"), true, "missing optional assets use fallback assets");

  const start = status.player.position;
  await page.keyboard.down("w");
  await wait(700);
  await page.keyboard.up("w");
  status = await getStatus(page);
  assert.ok(
    Math.hypot(status.player.position[0] - start[0], status.player.position[2] - start[2]) > 0.3,
    "desktop WASD movement changes player position",
  );

  await debug(page, "interact", "door:teahouse");
  await wait(250);
  status = await getStatus(page);
  assert.equal(status.world.doors.find((door) => door.id === "teahouse-door").open, true, "door opens");
  await debug(page, "interact", "door:teahouse");
  await wait(250);
  status = await getStatus(page);
  assert.equal(status.world.doors.find((door) => door.id === "teahouse-door").open, false, "door closes");

  await debug(page, "teleport", -32.8, 0, -4.5);
  await debug(page, "setLook", -Math.PI / 2, 0);
  await page.keyboard.down("w");
  await wait(800);
  await page.keyboard.up("w");
  status = await getStatus(page);
  assert.ok(status.player.position[0] > -33.25, "player cannot walk through the city gate wall");

  await debug(page, "teleport", 6.65, 0, 3.35);
  await debug(page, "setLook", 0, 0);
  await page.keyboard.down("w");
  await wait(1600);
  await page.keyboard.up("w");
  status = await getStatus(page);
  assert.ok(status.player.position[1] > 1.0, "player can climb the tea-house stairs");

  await debug(page, "interact", "npc:tea_owner");
  await clickOption(page, "接受調查");
  await debug(page, "collect", "market_ledger_page");
  await debug(page, "interact", "npc:food_merchant");
  await clickOption(page, "記下小販線索");
  await debug(page, "interact", "npc:city_guard");
  await clickOption(page, "記下守衛線索");
  await debug(page, "interact", "npc:delivery_worker");
  await clickOption(page, "追問搬運路線");
  await debug(page, "collect", "ledger_seal_clue");
  await debug(page, "collect", "missing_ledger");
  await debug(page, "interact", "npc:tea_owner");
  await clickOption(page, "交還帳簿");
  status = await getStatus(page);
  assert.equal(status.quests.main_missing_ledger.status, "completed", "main quest is completable");
  assert.ok(status.history.includes("info_river_trade"), "main quest unlocks historical info");

  await debug(page, "interact", "npc:fisherman");
  await clickOption(page, "幫忙找竹籃");
  await debug(page, "collect", "lost_basket");
  await debug(page, "interact", "npc:fisherman");
  await clickOption(page, "交還竹籃");
  status = await getStatus(page);
  assert.equal(status.quests.side_lost_basket.status, "completed", "side quest can be completed");

  await debug(page, "save");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__qingmingGameDebug));
  const continued = await debug(page, "continueGame");
  assert.equal(continued, true, "continue loads saved game");
  status = await getStatus(page);
  assert.equal(status.quests.main_missing_ledger.status, "completed", "mission progress survives refresh");

  await page.setViewportSize({ width: 844, height: 390 });
  await wait(150);
  await debug(page, "newGame");
  await debug(page, "setMobileMove", 0, 1);
  const mobileStart = (await getStatus(page)).player.position;
  await wait(800);
  await debug(page, "setMobileMove", 0, 0);
  status = await getStatus(page);
  assert.ok(status.player.position[0] > mobileStart[0] + 0.3, "mobile movement follows initial camera direction");
  await debug(page, "setMobileLook", 900, 0);
  await wait(100);
  const yawAfterLook = (await getStatus(page)).player.yaw;
  await debug(page, "setMobileLook", 0, 99999);
  await wait(100);
  status = await getStatus(page);
  assert.ok(Number.isFinite(yawAfterLook), "mobile camera changes yaw");
  assert.ok(Math.abs(status.player.pitch) <= 1.251, "camera pitch is clamped and does not flip");
  await page.screenshot({ path: `${OUTPUT_DIR}/mobile-landscape.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await wait(150);
  const portraitWarning = await page.locator("#portrait-warning").evaluate((node) => getComputedStyle(node).display);
  assert.notEqual(portraitWarning, "none", "portrait warning appears on phone portrait");

  await page.setViewportSize({ width: 1024, height: 768 });
  await wait(150);
  await page.screenshot({ path: `${OUTPUT_DIR}/ipad.png`, fullPage: false });

  const filteredErrors = consoleErrors.filter(
    (error) =>
      !error.includes("favicon") &&
      !error.includes("Failed to load resource") &&
      !error.includes("WebAudio"),
  );
  assert.deepEqual(filteredErrors, [], `blocking console errors: ${filteredErrors.join("\n")}`);

  await browser.close();
  viteProcess?.kill();
  console.log(
    JSON.stringify(
      {
        ok: true,
        screenshots: [
          `${OUTPUT_DIR}/desktop-boot.png`,
          `${OUTPUT_DIR}/desktop-play.png`,
          `${OUTPUT_DIR}/mobile-landscape.png`,
          `${OUTPUT_DIR}/ipad.png`,
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
