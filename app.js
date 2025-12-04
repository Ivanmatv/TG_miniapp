const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

const SOLUTION_FIELDS = {
    solution1: "cckbnapoy433x0p",
    solution2: "cd4uozpxqsupg9y",
    solution3: "c9d7t4372ag9rl8"
};
const DATE_FIELD_ID = "ckg3vnwv4h6wg9a";
const USER_ID_COLUMN_BT = "clqmvd04l5wmzyl"; // ← внутренний ID колонки tg-id

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
    document.body.innerHTML = `<div style="padding:50px;text-align:center;color:white;background:#d32f2f;">
        <h2>Ошибка</h2>
        <p style="font-size:18px;margin:30px 0;">${msg}</p>
        <button onclick="location.reload()" style="padding:15px 30px;font-size:17px;">Обновить страницу</button>
    </div>`;
}

// Ждём VK Bridge
async function waitForVkBridge() {
    return new Promise(resolve => {
        if (window.vkBridge) return resolve(vkBridge);
        const timer = setInterval(() => {
            if (window.vkBridge) {
                clearInterval(timer);
                resolve(vkBridge);
            }
        }, 50);
        setTimeout(() => { clearInterval(timer); resolve(null); }, 4000);
    });
}

// НАДЁЖНЫЙ поиск по BT ID колонки (работает всегда)
async function findUser(rawId) {
    const userId = Number(rawId);
    if (!userId || isNaN(userId)) return null;

    // Telegram — чистый ID
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(${USER_ID_COLUMN_BT},eq,${userId})&limit=1`, {
        headers: { "xc-token": API_KEY }
    });
    let data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'tg' };
    }

    // VK — с суффиксом _VK
    const vkValue = `${userId}_VK`;
    res = await fetch(`${RECORDS_ENDPOINT}?where=(${USER_ID_COLUMN_BT},eq,${vkValue})&limit=1`, {
        headers: { "xc-token": API_KEY }
    });
    data = await res.json();
    if (data.list?.length > 0) {
        return { recordId: data.list[0].Id || data.list[0].id, platform: 'vk' };
    }

    return null;
}

// РАБОЧАЯ загрузка файла для ndb.fut.ru (PATCH с Id в теле)
// Загрузка файла (исправленная версия для NocoDB v2)
async function uploadFile(recordId, fieldId, file, extra = {}) {
    // ПРОВЕРКА: recordId не должен быть null
    if (!recordId) {
        throw new Error("Не удалось определить запись пользователя");
    }

    console.log(`Начинаю загрузку файла ${file.name} для записи ${recordId}`);
    
    // 1. Загружаем файл в хранилище
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    console.log("Загружаю файл в хранилище...");
    const uploadResponse = await fetch(FILE_UPLOAD_ENDPOINT, { 
        method: "POST", 
        headers: { "xc-token": API_KEY }, 
        body: form 
    });
    
    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Ошибка загрузки файла в хранилище:", errorText);
        throw new Error("Не удалось загрузить файл на сервер");
    }

    const uploadData = await uploadResponse.json();
    const fileUrl = Array.isArray(uploadData) 
        ? (uploadData[0].url || `${BASE_URL}/${uploadData[0].path}`) 
        : uploadData.url;
    
    console.log("Файл загружен в хранилище:", fileUrl);

    // 2. Обновляем запись в таблице (NocoDB v2 формат)
    const updateBody = { 
        Id: Number(recordId), // Ключевое изменение: Id передается в теле
        [fieldId]: [{ 
            title: file.name, 
            url: fileUrl, 
            mimetype: file.type, 
            size: file.size 
        }], 
        ...extra 
    };

    console.log("Отправляю PATCH запрос на:", RECORDS_ENDPOINT);
    console.log("Тело запроса:", JSON.stringify(updateBody, null, 2));

    const updateResponse = await fetch(RECORDS_ENDPOINT, { // Без /recordId в URL
        method: "PATCH",
        headers: { 
            "xc-token": API_KEY, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify(updateBody)
    });
    
    if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error("Ошибка обновления записи:", errorText);
        
        // Пробуем получить больше информации об ошибке
        try {
            const errorJson = JSON.parse(errorText);
            console.error("Детали ошибки:", errorJson);
        } catch (e) {
            // Не JSON ответ
        }
        
        throw new Error(`Ошибка сохранения файла в базу данных (${updateResponse.status})`);
    }
    
    const updateResult = await updateResponse.json();
    console.log("✅ Запись успешно обновлена!");
    return updateResult;
}

// Прогресс-бар (красивый фейк)
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
            rawUserId = Number(info.id);
            userPlatform = "vk";
        }
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = Number(tg.initDataUnsafe.user.id); // ← избавляемся от BigInt
            userPlatform = "tg";
        }
        else {
            throw new Error("Неизвестная платформа");
        }

        const user = await findUser(rawUserId);
        if (!user) throw new Error("Ты не зарегистрирован. Напиши в бот");

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        showScreen("welcome");

    } catch (err) {
        console.error(err);
        showError(err.message || "Ошибка запуска");
    }
})();

// ======================= КНОПКИ =======================
document.getElementById("startUpload")?.addEventListener("click", () => showScreen("upload1"));

async function handleUpload(num, fieldId, nextScreen = null) {
    const input = document.getElementById(`fileInput${num}`);
    const err = document.getElementById(`error${num}`);
    const file = input.files[0];
    if (err) err.classList.add("hidden");

    if (!file) {
        err && (err.textContent = "Выберите файл") && err.classList.remove("hidden");
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        err && (err.textContent = "Файл больше 15 МБ") && err.classList.remove("hidden");
        return;
    }

    try {
        await showProgress(`progress${num}`, `status${num}`);
        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        await uploadFile(currentRecordId, fieldId, file, extra);
        nextScreen ? showScreen(nextScreen) : showScreen("result");
    } catch (e) {
        err && (err.textContent = e.message || "Ошибка загрузки") && err.classList.remove("hidden");
    }
}

document.getElementById("submitFile1")?.addEventListener("click", () => handleUpload(1, SOLUTION_FIELDS.solution1, "upload2"));
document.getElementById("submitFile2")?.addEventListener("click", () => handleUpload(2, SOLUTION_FIELDS.solution2, "upload3"));
document.getElementById("submitFile3")?.addEventListener("click", () => handleUpload(3, SOLUTION_FIELDS.solution3));

document.getElementById("skipFile2")?.addEventListener("click", () => showScreen("result"));
document.getElementById("skipFile3")?.addEventListener("click", () => showScreen("result"));

document.getElementById("closeApp")?.addEventListener("click", () => {
    if (userPlatform === "vk" && window.vkBridge) {
        vkBridge.send("VKWebAppClose", { status: "success" });
    } else if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.close();
    }
});