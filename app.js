// app.js — ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ (декабрь 2025)
// Один столбец tg-id: Telegram → чистое число, VK → число + "_VK"

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

const DATE_FIELD_ID = "ceasp9wcrd0ch0m"; // дата первой загрузки

let currentRecordId = null;
let userPlatform = null;   // 'tg' или 'vk'
let rawUserId = null;      // чистый числовой ID из TG или VK

const screens = {
    welcome: document.getElementById("welcomeScreen"),
    upload1: document.getElementById("uploadScreen1"),
    upload2: document.getElementById("uploadScreen2"),
    upload3: document.getElementById("uploadScreen3"),
    result: document.getElementById("resultScreen")
};

// Ждём готовности Telegram WebApp
function waitForTelegram() {
    return new Promise(resolve => {
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) return resolve(window.Telegram.WebApp);
        const int = setInterval(() => {
            if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
                clearInterval(int);
                resolve(window.Telegram.WebApp);
            }
        }, 100);
        setTimeout(() => { clearInterval(int); resolve(window.Telegram.WebApp); }, 5000);
    });
}

function showScreen(id) {
    Object.values(screens).forEach(s => s?.classList.add("hidden"));
    screens[id]?.classList.remove("hidden");
}

function showError(msg) {
    const div = document.createElement("div");
    div.className = "screen";
    div.innerHTML = `
        <div style="text-align:center;padding:40px;color:#fff;">
            <h2>Ошибка</h2>
            <p style="margin:20px 0;font-size:18px;">${msg}</p>
            <button id="closeErr" style="padding:12px 32px;font-size:17px;">Закрыть</button>
        </div>`;
    document.body.appendChild(div);
    document.getElementById("closeErr").onclick = () => {
        if (userPlatform === 'vk' && typeof vkBridge !== 'undefined') {
            vkBridge.send("VKWebAppClose", {status: "success"});
        } else if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.close();
        }
    };
}

// Поиск пользователя в NocoDB по tg-id (с учётом _VK)
async function findUser(idFromApp) {
    // 1. Ищем как Telegram ID
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${idFromApp})`, {
        headers: { "xc-token": API_KEY }
    });
    let data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'tg' };
    }

    // 2. Ищем как VK ID
    const vkValue = idFromApp + "_VK";
    res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkValue})`, {
        headers: { "xc-token": API_KEY }
    });
    data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'vk' };
    }

    return null;
}

// Загрузка файла в NocoDB
async function uploadFile(recordId, fieldId, file, extra = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    const up = await fetch(FILE_UPLOAD_ENDPOINT, { method: "POST", headers: { "xc-token": API_KEY }, body: form });
    if (!up.ok) throw new Error("Не удалось загрузить файл на сервер");

    let info = await up.json();
    if (!Array.isArray(info)) info = [info];
    const url = info[0].url || `${BASE_URL}/${info[0].path}`;

    const attachment = [{ title: file.name, mimetype: file.type, size: file.size, url }];

    const body = { Id: Number(recordId), [fieldId]: attachment, ...extra };

    const patch = await fetch(RECORDS_ENDPOINT, {
        method: "PATCH",
        headers: { "xc-token": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!patch.ok) throw new Error("Ошибка сохранения в базу");
}

// Валидация
function validateFile(file) {
    if (file.size > 15 * 1024 * 1024) return "Файл больше 15 МБ";
    const ok = ["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "image/png","image/jpeg","image/jpg","image/webp"];
    if (!ok.includes(file.type)) return "Неподдерживаемый формат";
    return null;
}

// Фейковый прогресс
async function progress(barId, statusId) {
    const bar = document.getElementById(barId);
    const status = document.getElementById(statusId);
    let p = 0;
    return new Promise(res => {
        const i = setInterval(() => {
            p += Math.random() * 20 + 5;
            if (p >= 100) { p = 100; clearInterval(i); status.textContent = "Готово!"; res(); }
            bar.style.width = p + "%";
            status.textContent = `Загрузка ${Math.round(p)}%`;
        }, 120);
    });
}

// Уведомление в ВК (по желанию)
async function notifyVk() {
    if (userPlatform !== 'vk') return;
    const VK_TOKEN = "ВСТАВЬ_СВОЙ_СЕРВИСНЫЙ_КЛЮЧ_ЗДЕСЬ"; // ← обязательно замени
    try {
        await fetch("https://api.vk.com/method/messages.send", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                user_id: rawUserId,
                random_id: Date.now(),
                message: "Спасибо! Мы получили твоё задание. Проверим в течение 5 дней!",
                access_token: VK_TOKEN,
                v: "5.199"
            })
        });
    } catch(e) { console.log("VK уведомление не отправлено:", e); }
}

// ==================== ЗАПУСК ====================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Получаем ID
        if (window.Telegram?.WebApp) {
            const tg = await waitForTelegram();
            rawUserId = tg?.initDataUnsafe?.user?.id;
            if (rawUserId) { tg.ready(); tg.expand(); }
        } else if (typeof vkBridge !== 'undefined') {
            await vkBridge.send("VKWebAppInit");
            const info = await vkBridge.send("VKWebAppGetUserInfo");
            rawUserId = info.id;
        }

        if (!rawUserId) throw new Error("Не удалось определить пользователя");

        const user = await findUser(rawUserId);
        if (!user) throw new Error("Вы не зарегистрированы. Напишите в бот");

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        console.log(`Успешный вход: ${userPlatform.toUpperCase()} (ID ${rawUserId})`);
        showScreen("welcome");

    } catch (e) {
        showError(e.message || "Ошибка приложения");
    }
});

// ==================== КНОПКИ ====================
document.getElementById("startUpload")?.addEventListener("click", () => showScreen("upload1"));

async function handleUpload(num, fieldId, nextScreen = null) {
    const input = document.getElementById(`fileInput${num}`);
    const errEl = document.getElementById(`error${num}`);
    const file = input.files[0];

    errEl.classList.add("hidden");
    if (!file) return errEl.textContent = "Выберите файл", errEl.classList.remove("hidden");

    const err = validateFile(file);
    if (err) return errEl.textContent = err, errEl.classList.remove("hidden");

    try {
        await progress(`progress${num}`, `status${num}`);

        const extra = (num === 1) ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};

        await uploadFile(currentRecordId, fieldId, file, extra);

        if (nextScreen) showScreen(nextScreen);
        else {
            showScreen("result");
            notifyVk(); // ← отправит сообщение только VK-пользователям
        }
    } catch (e) {
        errEl.textContent = e.message || "Ошибка загрузки";
        errEl.classList.remove("hidden");
    }
}

document.getElementById("submitFile1")?.addEventListener("click", () => handleUpload(1, SOLUTION_FIELDS.solution1, "upload2"));
document.getElementById("submitFile2")?.addEventListener("click", () => handleUpload(2, SOLUTION_FIELDS.solution2, "upload3"));
document.getElementById("submitFile3")?.addEventListener("click", () => handleUpload(3, SOLUTION_FIELDS.solution3));

document.getElementById("skipFile2")?.addEventListener("click", () => { showScreen("result"); notifyVk(); });
document.getElementById("skipFile3")?.addEventListener("click", () => { showScreen("result"); notifyVk(); });

// Кнопка «Закрыть приложение» в твоём HTML имеет id="closeApp"
document.getElementById("closeApp")?.addEventListener("click", () => {
    if (userPlatform === 'vk' && typeof vkBridge !== 'undefined') {
        vkBridge.send("VKWebAppClose", {status: "success"});
    } else if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.close();
    }
});