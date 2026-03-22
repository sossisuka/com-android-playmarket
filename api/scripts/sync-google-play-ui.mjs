import http from "node:http";
import { runSync, runSyncPackages } from "./sync-google-play.mjs";

const HOST = process.env.PLAY_UI_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.PLAY_UI_PORT ?? "8787", 10);

const clients = new Set();
let running = false;

function sendEvent(response, type, payload) {
  response.write(`event: ${type}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(type, payload) {
  for (const client of clients) {
    sendEvent(client, type, payload);
  }
}

function pageHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Play Sync Monitor</title>
  <style>
    :root {
      --bg: #d6d6d6;
      --panel: #f3f3f3;
      --line: #cfcfcf;
      --text: #565656;
      --muted: #7a7a7a;
      --green: #a8c52e;
      --green-dark: #7d931b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Poppins", "Montserrat", Arial, sans-serif;
      padding: 16px;
    }
    .wrap {
      max-width: 1040px;
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
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .gloader {
      width: 18px;
      height: 18px;
      position: relative;
      display: none;
      border-radius: 50%;
      animation: gspin 1.1s linear infinite;
    }
    .gloader.active {
      display: inline-block;
    }
    .gloader::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(
        #4285f4 0 25%,
        #db4437 25% 50%,
        #f4b400 50% 75%,
        #0f9d58 75% 100%
      );
      -webkit-mask: radial-gradient(
        farthest-side,
        transparent calc(100% - 3px),
        #000 calc(100% - 2px)
      );
      mask: radial-gradient(
        farthest-side,
        transparent calc(100% - 3px),
        #000 calc(100% - 2px)
      );
    }
    @keyframes gspin {
      to { transform: rotate(360deg); }
    }
    button {
      border: 0;
      background: var(--green);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 14px;
      cursor: pointer;
    }
    button:hover {
      box-shadow: inset 0 -3px 0 var(--green-dark);
    }
    button:disabled {
      opacity: 0.65;
      cursor: not-allowed;
      box-shadow: none;
    }
    .ghost-btn {
      background: #e7e7e7;
      color: #555;
      font-weight: 500;
    }
    .ghost-btn:hover {
      box-shadow: inset 0 -3px 0 #c8c8c8;
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
    .pkg-box {
      border: 1px solid var(--line);
      background: #fafafa;
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .pkg-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .pkg-input {
      width: 100%;
      min-height: 68px;
      resize: vertical;
      border: 1px solid #c9c9c9;
      background: #fff;
      color: #555;
      padding: 8px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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
      min-height: 240px;
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
    }
    .id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #4b4b4b;
      margin: 0 0 6px;
      word-break: break-all;
    }
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
      <h1>Sync Google Play</h1>
      <div class="actions">
        <button id="startBtn">Запустить синк</button>
        <button id="startPackagesBtn" type="button">Парсить пакеты</button>
        <button id="clearBtn" class="ghost-btn" type="button">Очистить лог</button>
        <span id="loader" class="gloader" aria-hidden="true"></span>
        <span class="status" id="status">Ожидание запуска</span>
      </div>
    </div>

    <div class="body">
      <div class="pkg-box">
        <div>Package IDs (через запятую/пробел/новую строку):</div>
        <textarea
          id="packagesInput"
          class="pkg-input"
          placeholder="com.openai.chatgpt&#10;com.anthropic.claude"
        ></textarea>
      </div>

      <div class="progress-box">
        <div class="progress-track">
          <div id="progressFill" class="progress-fill"></div>
        </div>
        <div class="progress-text" id="progressText">0%</div>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>Добавляемые appId (real-time)</h2>
          <div id="ids" class="scroll"></div>
        </section>

        <section class="panel">
          <h2>Статистика / события</h2>
          <div class="scroll">
            <pre id="stats">{}</pre>
          </div>
        </section>
      </div>
    </div>
  </div>

  <script>
    const startBtn = document.getElementById("startBtn");
    const startPackagesBtn = document.getElementById("startPackagesBtn");
    const clearBtn = document.getElementById("clearBtn");
    const statusEl = document.getElementById("status");
    const loaderEl = document.getElementById("loader");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    const idsEl = document.getElementById("ids");
    const statsEl = document.getElementById("stats");
    const packagesInput = document.getElementById("packagesInput");
    const MAX_IDS_IN_DOM = 80;

    let latestStats = {};

    function setStatus(text) {
      statusEl.textContent = text;
    }
    function setRunning(running) {
      startBtn.disabled = running;
      startPackagesBtn.disabled = running;
      loaderEl.classList.toggle("active", running);
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

    function renderStats(next) {
      latestStats = { ...latestStats, ...next };
      statsEl.textContent = JSON.stringify(latestStats, null, 2);
    }

    startBtn.addEventListener("click", async () => {
      const response = await fetch("/start", { method: "POST" });
      if (response.status === 409) {
        setStatus("Синк уже выполняется");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска синка");
        return;
      }
      clearIdsLog();
      latestStats = {};
      renderStats({});
      setProgress(0, 0, 0);
      setStatus("Запуск...");
    });

    startPackagesBtn.addEventListener("click", async () => {
      const packagesRaw = String(packagesInput.value ?? "").trim();
      if (!packagesRaw) {
        setStatus("Введите хотя бы один package id");
        return;
      }

      const response = await fetch("/start-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages: packagesRaw }),
      });

      if (response.status === 409) {
        setStatus("Синк уже выполняется");
        return;
      }
      if (!response.ok) {
        setStatus("Ошибка запуска парсинга пакетов");
        return;
      }

      clearIdsLog();
      latestStats = {};
      renderStats({});
      setProgress(0, 0, 0);
      setStatus("Запуск парсинга пакетов...");
    });

    clearBtn.addEventListener("click", () => {
      clearIdsLog();
      setStatus("Лог appId очищен");
    });

    const es = new EventSource("/events");

    es.addEventListener("state", (e) => {
      const data = JSON.parse(e.data);
      setRunning(Boolean(data.running));
    });

    es.addEventListener("start", (e) => {
      const data = JSON.parse(e.data);
      setStatus("Синк запущен (" + data.country + "/" + data.lang + ")");
      setProgress(0, 0, 0);
      renderStats({ config: data });
    });

    es.addEventListener("queue", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ queue: data });
      setStatus("В очереди: " + data.queued + " приложений");
    });

    es.addEventListener("stage_progress", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ stage: data });
      if (data.stage === "feed") {
        setStatus(
          "Сбор feed: " +
            data.completed +
            "/" +
            data.total +
            " (" +
            data.percent +
            "%)",
        );
      } else if (data.stage === "search") {
        setStatus(
          "Сбор search: " +
            data.completed +
            "/" +
            data.total +
            " (" +
            data.percent +
            "%)",
        );
      }
    });

    es.addEventListener("batch_start", (e) => {
      const data = JSON.parse(e.data);
      renderStats({ batch: data });
      setStatus("Пакет " + data.batch + ": " + data.batchSize + " приложений");
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
          data.id,
      );
    });

    es.addEventListener("stats", (e) => {
      const data = JSON.parse(e.data);
      renderStats(data);
    });

    es.addEventListener("persist", (e) => {
      const data = JSON.parse(e.data);
      setStatus(
        "Сохранено: " +
          data.currentTotal +
          " | Обработано: " +
          data.processed,
      );
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
    });
  </script>
</body>
</html>`;
}

async function startSync() {
  if (running) return false;
  running = true;
  broadcast("state", { running });

  runSync({
    batchSize: 1,
    persistEvery: 25,
    onEvent: ({ type, payload }) => {
      broadcast(type, payload);
    },
  })
    .catch((error) => {
      broadcast("error", {
        message: String(error?.message ?? error),
      });
    })
    .finally(() => {
      running = false;
      broadcast("state", { running });
    });

  return true;
}

async function startPackagesSync(packagesRaw) {
  if (running) return false;
  running = true;
  broadcast("state", { running });

  runSyncPackages(packagesRaw, {
    persistEvery: 10,
    onEvent: ({ type, payload }) => {
      broadcast(type, payload);
    },
  })
    .catch((error) => {
      broadcast("error", {
        message: String(error?.message ?? error),
      });
    })
    .finally(() => {
      running = false;
      broadcast("state", { running });
    });

  return true;
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
    const started = await startSync();
    if (!started) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ ok: false, message: "Sync is already running" }),
      );
      return;
    }
    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/start-packages") {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 100_000) break;
    }

    let packagesRaw = "";
    try {
      const parsed = JSON.parse(body || "{}");
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
        JSON.stringify({ ok: false, message: "Sync is already running" }),
      );
      return;
    }

    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Sync UI: http://${HOST}:${PORT}`);
});
