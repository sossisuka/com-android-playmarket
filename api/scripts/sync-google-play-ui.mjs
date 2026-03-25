import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { runSync, runSyncPackages } from "./sync-google-play.mjs";

const HOST = process.env.PLAY_UI_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PLAY_UI_PORT ?? "8799", 10);
const DEFAULT_BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.PLAY_UI_BATCH_SIZE ?? "1", 10) || 1,
);
const MAX_REQUEST_BODY_BYTES = 100_000;
const MAX_LOG_ROWS = 400;
const APPS_FILE = path.resolve("src/data/apps.generated.ts");
const EXPORT_NAME = "generatedStoreApps";

const clients = new Set();
let running = false;

function sendEvent(response, type, payload) {
  response.write(`event: ${type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(type, payload) {
  for (const client of clients) {
    try {
      sendEvent(client, type, payload);
    } catch {
      clients.delete(client);
    }
  }
}

function pageHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Play Sync UI</title>
  <style>
    @font-face {
      font-family: "Product Sans";
      src: local("Product Sans"), local("Google Sans");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    :root {
      --bg: #d6d6d6;
      --panel: #f3f3f3;
      --line: #cfcfcf;
      --text: #565656;
      --muted: #7a7a7a;
      --green: #a8c52e;
      --green-dark: #7d931b;
      --warn: #d9534f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Product Sans", "Google Sans", "Poppins", "Montserrat", Arial, sans-serif;
      padding: 16px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .play-logo {
      width: 34px;
      height: 34px;
      flex: 0 0 auto;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      background: #fff;
      padding: 3px;
    }
    .wrap {
      max-width: 1140px;
      margin: 0 auto;
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }
    .head {
      padding: 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-weight: 300;
      font-size: 28px;
    }
    .status {
      font-size: 13px;
      color: var(--muted);
    }
    .body {
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    .section {
      border: 1px solid var(--line);
      background: #fafafa;
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    button {
      border: 0;
      background: var(--green);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
    }
    button:hover { box-shadow: inset 0 -3px 0 var(--green-dark); }
    button:disabled {
      opacity: 0.65;
      cursor: not-allowed;
      box-shadow: none;
    }
    .danger {
      background: #e56d6a;
    }
    .danger:hover {
      box-shadow: inset 0 -3px 0 #c65350;
    }
    .ghost-btn {
      background: #e7e7e7;
      color: #555;
      font-weight: 500;
    }
    .ghost-btn:hover { box-shadow: inset 0 -3px 0 #c8c8c8; }
    .input {
      width: 100%;
      border: 1px solid #c9c9c9;
      background: #fff;
      color: #555;
      padding: 8px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      min-height: 42px;
      resize: vertical;
    }
    .progress-box {
      border: 1px solid var(--line);
      background: #fafafa;
      padding: 10px;
    }
    .progress-track {
      width: 100%;
      height: 18px;
      border: 1px solid #b9b9b9;
      background: #e9e9e9;
      position: relative;
      overflow: hidden;
    }
    .progress-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      background: linear-gradient(#b6d13a, #96b52a);
      transition: width 120ms linear;
    }
    .progress-text {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
    .panel {
      border: 1px solid var(--line);
      background: #fff;
      min-height: 260px;
      display: flex;
      flex-direction: column;
    }
    .panel h2 {
      margin: 0;
      font-weight: 500;
      font-size: 14px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--line);
      background: #f7f7f7;
    }
    .scroll {
      padding: 8px 10px;
      overflow: auto;
      max-height: 360px;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #4b4b4b;
      margin: 0 0 6px;
      word-break: break-all;
    }
    .log-line {
      margin: 0 0 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #666;
    }
    .log-line.err { color: var(--warn); }
    pre {
      margin: 0;
      white-space: pre-wrap;
      color: #5f5f5f;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div class="brand">
        <svg class="play-logo" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="gpG1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00d7ff"/>
              <stop offset="100%" stop-color="#00a7e7"/>
            </linearGradient>
            <linearGradient id="gpG2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00f076"/>
              <stop offset="100%" stop-color="#00c85f"/>
            </linearGradient>
            <linearGradient id="gpG3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffd447"/>
              <stop offset="100%" stop-color="#ff9d2f"/>
            </linearGradient>
            <linearGradient id="gpG4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ff5e9f"/>
              <stop offset="100%" stop-color="#ff4747"/>
            </linearGradient>
          </defs>
          <polygon points="8,6 35,31.5 8,58" fill="url(#gpG1)"/>
          <polygon points="8,6 48,29 35,31.5" fill="url(#gpG2)"/>
          <polygon points="35,31.5 48,29 48,35 35,31.5" fill="url(#gpG4)"/>
          <polygon points="35,31.5 48,35 8,58" fill="url(#gpG3)"/>
        </svg>
        <h1>Sync Google Play</h1>
      </div>
      <span class="status" id="status">Ожидание запуска</span>
    </div>

    <div class="body">
      <div class="section">
        <div class="section-title">Google Play</div>
        <div class="row">
          <button id="startBtn" type="button">Полный sync</button>
          <button id="startPackagesBtn" type="button">Sync по package IDs</button>
        </div>
        <div class="row">
          <label for="batchSizeInput">Batch size:</label>
          <input
            id="batchSizeInput"
            class="input"
            type="number"
            min="1"
            step="1"
            value="${DEFAULT_BATCH_SIZE}"
            style="max-width: 130px; min-height: 36px; resize: none;"
          />
        </div>
        <textarea
          id="packagesInput"
          class="input"
          placeholder="com.openai.chatgpt&#10;com.anthropic.claude"
        ></textarea>
      </div>

      <div class="section">
        <div class="section-title">Web Archive</div>
        <div class="row">
          <button id="startArchiveBtn" type="button">Запустить archive sync</button>
        </div>
        <div class="row">
          <input
            id="archiveFromYearInput"
            class="input"
            type="number"
            min="2008"
            max="2100"
            step="1"
            placeholder="From year, e.g. 2013"
            style="max-width: 180px; min-height: 36px; resize: none;"
          />
          <input
            id="archiveToYearInput"
            class="input"
            type="number"
            min="2008"
            max="2100"
            step="1"
            placeholder="To year, e.g. 2015"
            style="max-width: 180px; min-height: 36px; resize: none;"
          />
          <input
            id="archiveLimitAppsInput"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="Limit apps, e.g. 50"
            style="max-width: 220px; min-height: 36px; resize: none;"
          />
          <input
            id="archiveSnapshotConcurrencyInput"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="Snapshot concurrency, e.g. 3"
            style="max-width: 260px; min-height: 36px; resize: none;"
          />
          <input
            id="archiveLimitPagesInput"
            class="input"
            type="number"
            min="1"
            step="1"
            placeholder="Limit pages, e.g. 100"
            style="max-width: 220px; min-height: 36px; resize: none;"
          />
          <input
            id="archivePackageInput"
            class="input"
            type="text"
            placeholder="Package id, e.g. com.rovio.angrybirdsspace.premium"
            style="max-width: 360px; min-height: 36px; resize: none;"
          />
        </div>
      </div>

      <div class="section">
        <div class="section-title">Data maintenance</div>
        <div class="row">
          <button id="cleanBtn" type="button">Очистить/нормализовать данные</button>
          <button id="clearBtn" class="danger" type="button">Удалить все app данные</button>
          <button id="clearLogsBtn" class="ghost-btn" type="button">Очистить UI лог</button>
        </div>
      </div>

      <div class="progress-box">
        <div class="progress-track">
          <div id="progressFill" class="progress-fill"></div>
        </div>
        <div class="progress-text" id="progressText">0%</div>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>События sync</h2>
          <div id="ids" class="scroll"></div>
        </section>
        <section class="panel">
          <h2>Статистика</h2>
          <div class="scroll">
            <pre id="stats">{}</pre>
          </div>
        </section>
      </div>

      <section class="panel">
        <h2>Лог скриптов</h2>
        <div id="scriptLog" class="scroll"></div>
      </section>
    </div>
  </div>

  <script>
    const startBtn = document.getElementById("startBtn");
    const startPackagesBtn = document.getElementById("startPackagesBtn");
    const startArchiveBtn = document.getElementById("startArchiveBtn");
    const cleanBtn = document.getElementById("cleanBtn");
    const clearBtn = document.getElementById("clearBtn");
    const clearLogsBtn = document.getElementById("clearLogsBtn");
    const statusEl = document.getElementById("status");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const idsEl = document.getElementById("ids");
    const statsEl = document.getElementById("stats");
    const scriptLogEl = document.getElementById("scriptLog");
    const packagesInput = document.getElementById("packagesInput");
    const batchSizeInput = document.getElementById("batchSizeInput");
    const archiveFromYearInput = document.getElementById("archiveFromYearInput");
    const archiveToYearInput = document.getElementById("archiveToYearInput");
    const archiveLimitAppsInput = document.getElementById("archiveLimitAppsInput");
    const archiveSnapshotConcurrencyInput = document.getElementById("archiveSnapshotConcurrencyInput");
    const archiveLimitPagesInput = document.getElementById("archiveLimitPagesInput");
    const archivePackageInput = document.getElementById("archivePackageInput");

    const MAX_IDS_IN_DOM = 100;
    const MAX_LOG_ROWS = 400;
    let latestStats = {};

    function setStatus(text) {
      statusEl.textContent = text;
    }

    function setRunning(nextRunning) {
      startBtn.disabled = nextRunning;
      startPackagesBtn.disabled = nextRunning;
      startArchiveBtn.disabled = nextRunning;
      cleanBtn.disabled = nextRunning;
      clearBtn.disabled = nextRunning;
    }

    function setProgress(percent, processed, total) {
      const p = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
      progressFill.style.width = p + "%";
      if (typeof processed === "number" && typeof total === "number") {
        progressText.textContent = p + "% (" + processed + "/" + total + ")";
      } else {
        progressText.textContent = p + "%";
      }
    }

    function pushId(id, label) {
      const row = document.createElement("div");
      row.className = "id";
      row.textContent = label + ": " + id;
      idsEl.prepend(row);
      while (idsEl.childElementCount > MAX_IDS_IN_DOM) {
        idsEl.lastElementChild?.remove();
      }
    }

    function clearIdsLog() {
      idsEl.textContent = "";
    }

    function appendScriptLog(line, isError) {
      const row = document.createElement("div");
      row.className = "log-line" + (isError ? " err" : "");
      row.textContent = line;
      scriptLogEl.prepend(row);
      while (scriptLogEl.childElementCount > MAX_LOG_ROWS) {
        scriptLogEl.lastElementChild?.remove();
      }
    }

    function clearScriptLog() {
      scriptLogEl.textContent = "";
    }

    function renderStats(next) {
      latestStats = { ...latestStats, ...next };
      statsEl.textContent = JSON.stringify(latestStats, null, 2);
    }

    function parsePositiveField(value) {
      const parsed = Number.parseInt(String(value ?? "").trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 1) return null;
      return parsed;
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      return response;
    }

    startBtn.addEventListener("click", async () => {
      const batchSize = Number.parseInt(String(batchSizeInput?.value ?? ""), 10);
      const response = await postJson("/start", {
        batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : ${DEFAULT_BATCH_SIZE},
      });
      if (response.status === 409) {
        setStatus("Уже выполняется другой процесс");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска полного sync");
        return;
      }
      clearIdsLog();
      latestStats = {};
      renderStats({});
      setProgress(0, 0, 0);
      setStatus("Запуск полного sync...");
    });

    startPackagesBtn.addEventListener("click", async () => {
      const packagesRaw = String(packagesInput.value ?? "").trim();
      if (!packagesRaw) {
        setStatus("Введите хотя бы один package id");
        return;
      }

      const response = await postJson("/start-packages", { packages: packagesRaw });
      if (response.status === 409) {
        setStatus("Уже выполняется другой процесс");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска package sync");
        return;
      }

      clearIdsLog();
      latestStats = {};
      renderStats({});
      setProgress(0, 0, 0);
      setStatus("Запуск package sync...");
    });

    startArchiveBtn.addEventListener("click", async () => {
      const fromYear = parsePositiveField(archiveFromYearInput?.value);
      const toYear = parsePositiveField(archiveToYearInput?.value);
      const limitApps = parsePositiveField(archiveLimitAppsInput?.value);
      const snapshotConcurrency = parsePositiveField(
        archiveSnapshotConcurrencyInput?.value,
      );
      const limitPages = parsePositiveField(archiveLimitPagesInput?.value);
      const packageId = String(archivePackageInput?.value ?? "").trim();

      if (fromYear && toYear && fromYear > toYear) {
        setStatus("Проверьте период: from year не должен быть больше to year");
        return;
      }

      const argsParts = [];
      if (fromYear) argsParts.push("--from-year=" + fromYear);
      if (toYear) argsParts.push("--to-year=" + toYear);
      if (limitApps) argsParts.push("--limit-apps=" + limitApps);
      if (snapshotConcurrency) {
        argsParts.push("--snapshot-concurrency=" + snapshotConcurrency);
      }
      if (limitPages) argsParts.push("--limit-pages=" + limitPages);
      if (packageId) argsParts.push("--package=" + packageId);

      const archiveArgs = argsParts.join(" ");
      const response = await postJson("/run-script", {
        action: "sync-archive-apps",
        args: archiveArgs,
      });

      if (response.status === 409) {
        setStatus("Уже выполняется другой процесс");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска archive sync");
        return;
      }

      setProgress(0, 0, 0);
      setStatus("Запуск archive sync...");
    });

    cleanBtn.addEventListener("click", async () => {
      const response = await postJson("/run-script", { action: "clean-app-data" });
      if (response.status === 409) {
        setStatus("Уже выполняется другой процесс");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска clean-app-data");
        return;
      }
      setStatus("Запуск clean-app-data...");
    });

    clearBtn.addEventListener("click", async () => {
      const confirmed = window.confirm("Удалить все app данные?");
      if (!confirmed) return;
      const response = await postJson("/run-script", { action: "clear-app-data" });
      if (response.status === 409) {
        setStatus("Уже выполняется другой процесс");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска clear-app-data");
        return;
      }
      clearIdsLog();
      latestStats = {};
      renderStats({});
      setProgress(0, 0, 0);
      setStatus("Запуск clear-app-data...");
    });

    clearLogsBtn.addEventListener("click", () => {
      clearIdsLog();
      clearScriptLog();
      setStatus("Логи UI очищены");
    });

    const es = new EventSource("/events");

    es.addEventListener("state", (e) => {
      const data = JSON.parse(e.data);
      setRunning(Boolean(data.running));
    });

    es.addEventListener("task_start", (e) => {
      const data = JSON.parse(e.data);
      setStatus("Запущено: " + data.task);
    });

    es.addEventListener("start", (e) => {
      const data = JSON.parse(e.data);
      setStatus("Sync запущен (" + data.country + "/" + data.lang + ")");
      setProgress(0, 0, 0);
      renderStats({ config: data });
    });

    es.addEventListener("queue", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ queue: data });
      setStatus("В очереди: " + data.queued);
    });

    es.addEventListener("stage_progress", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ stage: data });
      setStatus("Сбор " + data.stage + ": " + data.completed + "/" + data.total + " (" + data.percent + "%)");
    });

    es.addEventListener("batch_start", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ batch: data });
      setStatus("Batch " + data.batch + ": " + data.batchSize + " apps");
    });

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setProgress(data.percent, data.processed, data.total);
      renderStats({ progress: data });
    });

    es.addEventListener("item_result", (e) => {
      const data = JSON.parse(e.data);
      const label = data.action ? data.action.toUpperCase() : "ITEM";
      pushId(data.id, label);
      setStatus(
        "Обработано: " +
          data.processed +
          "/" +
          data.total +
          " | Осталось: " +
          data.remaining +
          " | Последнее: " +
          data.id
      );
    });

    es.addEventListener("persist", (e) => {
      const data = JSON.parse(e.data);
      setStatus("Сохранено: " + data.currentTotal + " | processed: " + data.processed);
    });

    es.addEventListener("stats", (e) => {
      const data = JSON.parse(e.data);
      renderStats(data);
    });

    es.addEventListener("script_log", (e) => {
      const data = JSON.parse(e.data);
      appendScriptLog(data.line, data.stream === "stderr");
    });

    es.addEventListener("script_exit", (e) => {
      const data = JSON.parse(e.data);
      if (data.success) {
        setStatus("Скрипт завершен успешно");
      } else {
        setStatus("Скрипт завершился с ошибкой (code=" + data.code + ")");
      }
    });

    es.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      setProgress(100);
      setStatus("Готово. Всего: " + data.total);
      renderStats({ final: data });
    });

    es.addEventListener("error", (e) => {
      const data = JSON.parse(e.data);
      setStatus("Ошибка: " + data.message);
      renderStats({ error: data });
      appendScriptLog("[ERROR] " + data.message, true);
    });
  </script>
</body>
</html>`;
}

function emptyAppsModule() {
  return [
    'import type { AppData } from "./apps";',
    "",
    "// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.",
    `// Generated at: ${new Date().toISOString()}`,
    "",
    `export const ${EXPORT_NAME}: AppData[] = [];`,
    "",
  ].join("\n");
}

async function ensureAppsFileExists() {
  await mkdir(path.dirname(APPS_FILE), { recursive: true });
  try {
    await access(APPS_FILE);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await writeFile(APPS_FILE, emptyAppsModule(), "utf8");
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_REQUEST_BODY_BYTES) {
      throw new Error("Request body too large");
    }
  }

  if (!body) return {};
  return JSON.parse(body);
}

function splitCliArgs(value) {
  return (
    String(value ?? "")
      .match(/"[^"]*"|'[^']*'|[^\s]+/g)
      ?.map((item) => item.replace(/^['"]|['"]$/g, ""))
      .filter(Boolean) ?? []
  );
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

async function runExclusive(taskName, runner) {
  if (running) return false;
  running = true;
  broadcast("state", { running });
  broadcast("task_start", { task: taskName });

  Promise.resolve()
    .then(() => runner())
    .catch((error) => {
      broadcast("error", { message: String(error?.message ?? error) });
    })
    .finally(() => {
      running = false;
      broadcast("state", { running });
    });

  return true;
}

async function runBunScript(scriptName, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn("bun", [scriptName, ...args], {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const forward = (streamName) => (chunk) => {
      const lines = String(chunk ?? "")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .slice(-MAX_LOG_ROWS);
      for (const line of lines) {
        broadcast("script_log", { stream: streamName, line });
      }
    };

    child.stdout.on("data", forward("stdout"));
    child.stderr.on("data", forward("stderr"));

    child.once("error", reject);
    child.once("close", (code) => {
      const success = code === 0;
      broadcast("script_exit", { code: code ?? -1, success });
      if (success) {
        resolve();
      } else {
        reject(
          new Error(`${scriptName} exited with code ${code ?? "unknown"}`),
        );
      }
    });
  });
}

async function startSync(options = {}) {
  const batchSize = parsePositiveInt(options.batchSize, DEFAULT_BATCH_SIZE);
  return runExclusive("sync-google-play", async () => {
    await ensureAppsFileExists();
    await runSync({
      batchSize,
      persistEvery: 25,
      onEvent: ({ type, payload }) => {
        broadcast(type, payload);
      },
    });
  });
}

async function startPackagesSync(packagesRaw) {
  return runExclusive("sync-google-play-packages", async () => {
    await ensureAppsFileExists();
    await runSyncPackages(packagesRaw, {
      persistEvery: 10,
      onEvent: ({ type, payload }) => {
        broadcast(type, payload);
      },
    });
  });
}

async function startNamedScript(action, args = "") {
  const actionToScript = {
    "clear-app-data": "scripts/clear-app-data.mjs",
    "clean-app-data": "scripts/clean-app-data.mjs",
    "sync-archive-apps": "scripts/sync-archive-apps.mjs",
  };

  const script = actionToScript[action];
  if (!script) {
    throw new Error(`Unsupported action: ${action}`);
  }

  const parsedArgs = splitCliArgs(args);
  return runExclusive(action, async () => {
    await ensureAppsFileExists();
    await runBunScript(script, parsedArgs);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(pageHtml());
    return;
  }

  if (request.method === "GET" && url.pathname === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.write("\n");
    clients.add(response);
    sendEvent(response, "state", { running });

    request.on("close", () => {
      clients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/start") {
    let parsed = {};
    try {
      parsed = await readJsonBody(request);
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, message: "Invalid JSON" }));
      return;
    }

    const started = await startSync({
      batchSize: parsePositiveInt(parsed.batchSize, DEFAULT_BATCH_SIZE),
    });
    if (!started) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, message: "Task is already running" }),
      );
      return;
    }
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/start-packages") {
    let packagesRaw = "";
    try {
      const parsed = await readJsonBody(request);
      packagesRaw = String(parsed.packages ?? "").trim();
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, message: "Invalid JSON" }));
      return;
    }

    if (!packagesRaw) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, message: "packages is required" }),
      );
      return;
    }

    const started = await startPackagesSync(packagesRaw);
    if (!started) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, message: "Task is already running" }),
      );
      return;
    }
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/run-script") {
    let parsed;
    try {
      parsed = await readJsonBody(request);
    } catch (error) {
      const message = String(error?.message ?? "Invalid JSON");
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, message }));
      return;
    }

    const action = String(parsed.action ?? "").trim();
    const args = String(parsed.args ?? "").trim();
    if (!action) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, message: "action is required" }),
      );
      return;
    }

    try {
      const started = await startNamedScript(action, args);
      if (!started) {
        response.writeHead(409, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({ ok: false, message: "Task is already running" }),
        );
        return;
      }
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          ok: false,
          message: String(error?.message ?? error),
        }),
      );
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Sync UI: http://${HOST}:${PORT}`);
});
