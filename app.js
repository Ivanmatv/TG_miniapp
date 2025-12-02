// app.js — РАБОЧАЯ ВЕРСИЯ ДЕКАБРЬ 2025
// Один столбец tg-id: Telegram → число, VK → число + "_VK"

const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

const SOLUTION_FIELDS = {
    solution1: "ciqdqkdc7frd7kr",
    solution2: "civhqu1url55ef7",
    solution3: "ck7de0z75mrtzt6"
};

const DATE_FIELD_ID = "ceasp9wcrd0ch0m";

let currentRecordId = null;
let userPlatform = null;
let rawUserId = null;

const screens = {
    welcome: document.getElementById("welcomeScreen"),
    upload1: document.getElementById("uploadScreen1"),
    upload2: document.getElementById("uploadScreen2"),
    upload3: document.getElementById("uploadScreen3"),
    result: document.getElementById("resultScreen")
};

function showScreen(id) {
    Object.values(screens).forEach(s => s?.classList.add("hidden"));
    screens[id]?.classList.remove("hidden");
}

function showError(msg) {
    document.body.innerHTML = `
        <div style="padding:40px; text-align:center; color:white; font-family:sans-serif;">
            <h2>Ошибка</h2>
            <p style="font-size:18px;margin:20px 0;">${msg}</p>
            <button onclick="location.reload()" style="padding:12px 30px; font-size:17px;">Попробовать ещё раз</button>
        </div>`;
}

// Поиск пользователя
async function findUser(id) {
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${id})`, { headers: { "xc-token": API_KEY } });
    let data = await res.json();
    if (data.list?.length > 0) return { recordId: data.list[0].Id || data.list[0].id, platform: 'tg' };

    const vk = id + "_VK";
    res = await fetch(`${RECORDS_ENDPOINT + `?where=(tg-id,eq,${vk})`, { headers: { "xc-token": API_KEY } });
    data = await res.json();
    if (data.list?.length > 0) return { recordId: data.list[0].Id || data.list[0].id, platform: 'vk' };

    return null;
}

// Загрузка файла (упрощённая, но рабочая)
async function uploadFile(recordId, fieldId, file, extra = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    const up = await fetch(FILE_UPLOAD_ENDPOINT, { method: "POST", headers: { "xc-token": API_KEY }, body: form });
    if (!up.ok) throw new Error("Ошибка загрузки файла");

    const info = await up.json();
    const url = Array.isArray(info) ? (info[0].url || `${BASE_URL}/${info[0].path}`) : info.url;

    const body = { Id: Number(recordId), [fieldId]: [{ title: file.name, url, mimetype: file.type, size: file.size }], ...extra };

    const patch = await fetch(RECORDS_ENDPOINT, {
        method: "PATCH",
        headers: { "xc-token": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!patch.ok) throw new Error("Ошибка сохранения");
}

// Прогресс
async function progress(bar, status) {
    const b = document.getElementById(bar);
    const s = document.getElementById(status);
    let p = 0;
    return new Promise(r => {
        const i = setInterval(() => {
            p += 15 + Math.random() * 20;
            if (p >= 100) { p = 100; clearInterval(i); s.textContent = "Готово!"; r(); }
            b.style.width = p + "%";
            s.textContent = `Загрузка ${Math.round(p)}%`;
        }, 100);
    });
}

// ==================================== СТАРТ ====================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. ОПРЕДЕЛЯЕМ ПЛАТФОРМУ И ID
        // Сначала проверяем VK — он надёжнее
        if (typeof vkBridge !== "undefined") {
            await vkBridge.send("VKWebAppInit");
            const info = await vkBridge.send("VKWebAppGetUserInfo");
            rawUserId = info.id;
            userPlatform = "vk";
            console.log("VK пользователь:", rawUserId);
        }
        // Потом Telegram — только если VK не сработал
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            rawUserId = window.Telegram.WebApp.initDataUnsafe.user.id;
            userPlatform = "tg";
            console.log("Telegram пользователь:", rawUserId);
        }
        else {
            throw new Error("Неизвестная платформа");
        }

        if (!rawUserId) throw new Error("Не удалось получить ID");

        // 2. Ищем в базе
        const user = await findUser(rawUserId);
        if (!user) throw new Error("Вы не зарегистрированы в боте");

        currentRecordId = user.recordId;
        userPlatform = user.platform; // переопределяем точно по базе

        // 3. Всё ок — показываем приветствие
        showScreen("welcome");

    } catch (err) {
        console.error(err);
        showError(err.message || "Ошибка загрузки приложения");
    }
});

// ==================================== КНОПКИ ====================================
document.getElementById("startUpload")?.addEventListener("click", () => showScreen("upload1"));

async function handle(num, field, next = null) {
    const file = document.getElementById(`fileInput${num}`).files[0];
    const err = document.getElementById(`error${num}`);
    err.classList.add("hidden");

    if (!file) return err.textContent = "Выберите файл", err.classList.remove("hidden");
    if (file.size > 15*1024*1024) return err.textContent = "Файл > 15 МБ", err.classList.remove("hidden");

    try {
        await progress(`progress${num}`, `status${num}`);

        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        await uploadFile(currentRecordId, field, file, extra);

        next ? showScreen(next) : showScreen("result");
    } catch (e) {
        err.textContent = "Ошибка: " + e.message;
        err.classList.remove("hidden");
    }
}

document.getElementById("submitFile1")?.addEventListener("click", () => handle(1, SOLUTION_FIELDS.solution1, "upload2"));
document.getElementById("submitFile2")?.addEventListener("click", () => handle(2, SOLUTION_FIELDS.solution2, "upload3"));
document.getElementById("submitFile3")?.addEventListener("click", () => handle(3, SOLUTION_FIELDS.solution3));

document.getElementById("skipFile2")?.addEventListener("click", () => showScreen("result"));
document.getElementById("skipFile3")?.addEventListener("click", () => showScreen("result"));

document.getElementById("closeApp")?.addEventListener("click", () => {
    if (userPlatform === "vk") vkBridge?.send("VKWebAppClose", {status: "success"});
    else window.Telegram?.WebApp?.close();
});