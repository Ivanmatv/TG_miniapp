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
    console.log("Переход на экран:", id);
    Object.values(screens).forEach(s => s?.classList.add("hidden"));
    screens[id]?.classList.remove("hidden");
}

function showError(msg) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА:", msg);
    document.body.innerHTML = `<div style="padding:50px;text-align:center;color:white;background:#d32f2f;">
        <h2>Ошибка</h2>
        <p style="font-size:18px;margin:30px 0;">${msg}</p>
        <button onclick="location.reload()" style="padding:15px 30px;font-size:17px;">Обновить</button>
    </div>`;
}

// Ждём vkBridge (обязательно для VK Mini Apps 2025) — С ЛОГИРОВАНИЕМ
async function waitForVkBridge() {
    console.log("Ожидание VK Bridge...");
    return new Promise(resolve => {
        if (window.vkBridge) {
            console.log("VK Bridge найден сразу");
            return resolve(vkBridge);
        }
        const timer = setInterval(() => {
            if (window.vkBridge) {
                console.log("VK Bridge найден через таймер");
                clearInterval(timer);
                resolve(window.vkBridge);
            }
        }, 50);
        setTimeout(() => { 
            clearInterval(timer); 
            console.warn("VK Bridge не найден за 4 секунды, возвращаем null");
            resolve(null); 
        }, 4000);
    });
}

// Поиск пользователя — СУПЕР-ЛОГИРОВАНИЕ
async function findUser(id) {
    console.log("Поиск пользователя по tg-id:", id);

    // Попытка 1 — обычный TG
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${id})`, { 
        headers: { "xc-token": API_KEY } 
    });
    let data = await res.json();
    console.log("Ответ NocoDB (TG):", data);

    if (data.list?.length > 0 && data.list[0].Id != null) {
        console.log("НАЙДЕН TG-пользователь! Id =", data.list[0].Id);
        return { recordId: Number(data.list[0].Id), platform: 'tg' };
    }

    // Попытка 2 — VK
    const vkVal = id + "_VK";
    console.log("Не нашли по TG, пробуем VK-значение:", vkVal);
    res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkVal})`, { 
        headers: { "xc-token": API_KEY } 
    });
    data = await res.json();
    console.log("Ответ NocoDB (VK):", data);

    if (data.list?.length > 0 && data.list[0].Id != null) {
        console.log("НАЙДЕН VK-пользователь! Id =", data.list[0].Id);
        return { recordId: Number(data.list[0].Id), platform: 'vk' };
    }

    console.warn("ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН НИ ПО ТГ, НИ ПО VK");
    return null;
}

// Загрузка файла — ВСЁ ЛОГИРУЕТСЯ
async function uploadFile(recordId, fieldId, file, extra = {}) {
    console.log("Начало загрузки файла. recordId =", recordId, "fieldId =", fieldId);
    console.log("Файл:", file.name, file.size, "байт,", file.type);

    // 1. Загрузка в storage
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    console.log("Отправляем файл на", FILE_UPLOAD_ENDPOINT);
    const up = await fetch(FILE_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { "xc-token": API_KEY },
        body: form
    });

    if (!up.ok) {
        const text = await up.text();
        console.error("ОШИБКА загрузки файла в storage:", up.status, text);
        throw new Error("Не удалось загрузить файл в хранилище");
    }

    const info = await up.json();
    console.log("Файл загружен в storage, ответ:", info);

    const url = Array.isArray(info) ? (info[0].url || `${BASE_URL}/${info[0].path}`) : info.url;
    console.log("Прямая ссылка на файл:", url);

    const fileObj = {
        title: file.name,
        url: url,
        mimetype: file.type || "application/octet-stream",
        size: file.size
    };

    // 2. PATCH в NocoDB
    const patchBody = {
        Id: recordId,
        [fieldId]: [fileObj],
        ...extra
    };

    console.log("Отправляем PATCH на", RECORDS_ENDPOINT);
    console.log("Тело PATCH-запроса:", JSON.stringify(patchBody, null, 2));

    const patch = await fetch(RECORDS_ENDPOINT, {
        method: "PATCH",
        headers: {
            "xc-token": API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(patchBody)
    });

    if (!patch.ok) {
        const err = await patch.text();
        console.error("ОШИБКА PATCH:", patch.status, err);
        throw new Error("Ошибка сохранения в базу: " + err);
    }

    console.log("УСПЕХ! Файл прикреплён к записи", recordId);
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
        console.log("Запуск приложения...");

        const bridge = await waitForVkBridge();
        if (bridge) {
            await bridge.send("VKWebAppInit");
            const info = await bridge.send("VKWebAppGetUserInfo");
            rawUserId = info.id;
            userPlatform = "vk";
            console.log("Определён VK-пользователь, id:", rawUserId);
        }
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = tg.initDataUnsafe.user.id;
            userPlatform = "tg";
            console.log("Определён Telegram-пользователь, id:", rawUserId);
        }
        else {
            throw new Error("Платформа не определена");
        }

        console.log("Ищем пользователя в базе по id:", rawUserId);
        const user = await findUser(rawUserId);

        if (!user || !user.recordId || user.recordId <= 0) {
            console.error("КРИТИЧЕСКАЯ ОШИБКА: recordId невалидный!", user);
            throw new Error("Не удалось найти вашу запись в базе. Обратитесь в поддержку.");
        }

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        console.log("УСПЕШНО! currentRecordId =", currentRecordId, "platform =", userPlatform);
        showScreen("welcome");

    } catch (err) {
        console.error("Фатальная ошибка при запуске:", err);
        showError(err.message || "Неизвестная ошибка");
    }
})();

// ======================= КНОПКИ =======================
document.getElementById("startUpload")?.addEventListener("click", () => {
    console.log("Кнопка 'Начать загрузку' нажата");
    showScreen("upload1");
});

async function handleUpload(num, fieldId, nextScreen = null) {
    console.log(`Нажата кнопка загрузки файла #${num}`);

    if (!currentRecordId) {
        console.error("currentRecordId пустой! Загрузка невозможна.");
        return;
    }

    const input = document.getElementById(`fileInput${num}`);
    const file = input.files[0];

    if (!file) {
        console.warn("Файл не выбран");
        return document.getElementById(`error${num}`).textContent = "Выберите файл", 
               document.getElementById(`error${num}`).classList.remove("hidden");
    }

    try {
        await showProgress(`progress${num}`, `status${num}`);
        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        console.log("Доп. поля (extra):", extra);

        await uploadFile(currentRecordId, fieldId, file, extra);
        console.log(`Файл #${num} успешно загружен!`);

        nextScreen ? showScreen(nextScreen) : showScreen("result");
    } catch (e) {
        console.error(`Ошибка при загрузке файла #${num}:`, e);
        document.getElementById(`error${num}`).textContent = e.message || "Ошибка загрузки";
        document.getElementById(`error${num}`).classList.remove("hidden");
    }
}

// Привязка кнопок
["1", "2", "3"].forEach(n => {
    document.getElementById(`submitFile${n}`)?.addEventListener("click", () => {
        console.log(`Кнопка 'Отправить файл ${n}' нажата`);
        handleUpload(n, SOLUTION_FIELDS[`solution${n}`], n === "1" ? "upload2" : n === "2" ? "upload3" : null);
    });
});

document.getElementById("skipFile2")?.addEventListener("click", () => console.log("Пропуск файла 2") || showScreen("result"));
document.getElementById("skipFile3")?.addEventListener("click", () => console.log("Пропуск файла 3") || showScreen("result"));

document.getElementById("closeApp")?.addEventListener("click", () => {
    console.log("Закрытие приложения");
    if (userPlatform === "vk" && window.vkBridge) vkBridge.send("VKWebAppClose", {status: "success"});
    else if (window.Telegram?.WebApp) window.Telegram.WebApp.close();
});