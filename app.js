const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "crDte8gB-CSZzNujzSsy9obQRqZYkY3SNp8wre88";

const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

const SOLUTION_FIELDS = {
    solution1: "cckbnapoy433x0p",
    solution2: "cd4uozpxqsupg9y",
    solution3: "c9d7t4372ag9rl8"
};
const DATE_FIELD_ID = "ckg3vnwv4h6wg9a";

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
    document.body.innerHTML = `<div style="padding:50px;text-align:center;color:white;">
        <h2>Ошибка</h2>
        <p style="font-size:18px;margin:30px 0;">${msg}</p>
        <button onclick="location.reload()" style="padding:15px 30px;font-size:17px;">Обновить</button>
    </div>`;
}

// Ждём vkBridge
async function waitForVkBridge() {
    return new Promise(resolve => {
        if (window.vkBridge) return resolve(vkBridge);
        const timer = setInterval(() => {
            if (window.vkBridge) {
                clearInterval(timer);
                resolve(window.vkBridge);
            }
        }, 50);
        setTimeout(() => { clearInterval(timer); resolve(null); }, 4000);
    });
}

// === ПОЧИНЕННАЯ ФУНКЦИЯ ПОИСКА (главное изменение!) ===
async function findUser(rawId) {
    const userId = Number(rawId);                     // ← Приводим к чистому числу
    if (!userId || isNaN(userId)) return null;

    // 1. Ищем как Telegram (чистый ID)
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${userId})&limit=1`, {
        headers: { "xc-token": API_KEY }
    });
    let data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'tg' };
    }

    // 2. Ищем как VK (с суффиксом _VK)
    const vkValue = userId + "_VK";
    res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkValue})&limit=1`, {
        headers: { "xc-token": API_KEY }
    });
    data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'vk' };
    }

    return null;
}
// =============================================

// Загрузка файла (уже правильная)
async function uploadFile(recordId, fieldId, file, extra = {}) {
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    const up = await fetch(FILE_UPLOAD_ENDPOINT, { 
        method: "POST", 
        headers: { "xc-token": API_KEY }, 
        body: form 
    });
    
    if (!up.ok) throw new Error("Не удалось загрузить файл на сервер");

    const info = await up.json();
    const url = Array.isArray(info) ? (info[0].url || `${BASE_URL}/${info[0].path}`) : info.url;

    const body = { 
        [fieldId]: [{ title: file.name, url, mimetype: file.type, size: file.size }], 
        ...extra 
    };

    const patch = await fetch(`${RECORDS_ENDPOINT}/${recordId}`, {
        method: "PATCH",
        headers: { "xc-token": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    
    if (!patch.ok) {
        const err = await patch.text();
        throw new Error("Ошибка сохранения в базу: " + err);
    }
}

// Прогресс-бар
async function showProgress(barId, statusId) {
    const bar = document.getElementById(barId);
    const status = document.getElementById(statusId);
    let p = 0;
    return new Promise(res => {
        const int = setInterval(() => {
            p += 15 + Math.random() * 25;
            if (p >= 100) { p = 100; clearInterval(int); status.textContent = "Готово!"; res(); }
            bar.style.width = p + "%";
            status.textContent = `Загрузка ${Math.round(p)}%`;
        }, 100);
    });
}

// ======================= ЗАПУСК =======================
(async () => {
    try {
        const bridge = await waitForVkBridge();

        if (bridge) {
            await bridge.send("VKWebAppInit");
            const info = await bridge.send("VKWebAppGetUserInfo");
            rawUserId = Number(info.id);           // ← Number!
            userPlatform = "vk";
            console.log("VK ID:", rawUserId);
        }
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = Number(tg.initDataUnsafe.user.id);  // ← Number! (главное исправление)
            userPlatform = "tg";
            console.log("Telegram ID:", rawUserId);
        }
        else {
            throw new Error("Платформа не определена");
        }

        const user = await findUser(rawUserId);
        if (!user) throw new Error("Ты не зарегистрирован в конкурсе. Напиши в бот");

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        showScreen("welcome");

    } catch (err) {
        console.error(err);
        showError(err.message || "Ошибка приложения");
    }
})();

// ======================= КНОПКИ =======================
document.getElementById("startUpload")?.addEventListener("click", () => showScreen("upload1"));

async function handleUpload(num, fieldId, nextScreen = null) {
    const input = document.getElementById(`fileInput${num}`);
    const err = document.getElementById(`error${num}`);
    const file = input.files[0];
    err.classList.add("hidden");

    if (!file) return err.textContent = "Выберите файл", err.classList.remove("hidden");
    if (file.size > 15*1024*1024) return err.textContent = "Файл больше 15 МБ", err.classList.remove("hidden");

    try {
        await showProgress(`progress${num}`, `status${num}`);
        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        await uploadFile(currentRecordId, fieldId, file, extra);
        nextScreen ? showScreen(nextScreen) : showScreen("result");
    } catch (e) {
        err.textContent = e.message || "Ошибка загрузки";
        err.classList.remove("hidden");
    }
}

document.getElementById("submitFile1")?.addEventListener("click", () => handleUpload(1, SOLUTION_FIELDS.solution1, "upload2"));
document.getElementById("submitFile2")?.addEventListener("click", () => handleUpload(2, SOLUTION_FIELDS.solution2, "upload3"));
document.getElementById("submitFile3")?.addEventListener("click", () => handleUpload(3, SOLUTION_FIELDS.solution3));

document.getElementById("skipFile2")?.addEventListener("click", () => showScreen("result"));
document.getElementById("skipFile3")?.addEventListener("click", () => showScreen("result"));

document.getElementById("closeApp")?.addEventListener("click", () => {
    if (userPlatform === "vk" && window.vkBridge) {
        vkBridge.send("VKWebAppClose", {status: "success"});
    } else if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.close();
    }
});