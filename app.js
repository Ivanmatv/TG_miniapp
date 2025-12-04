const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const API_KEY = "crDte8gB-CSZzNujzSsy9obQRqZYkY3SNp8wre88"; // ИСПРАВЛЕНО: Используем рабочий ключ

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

// Ждём vkBridge (обязательно для VK Mini Apps 2025)
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

// Поиск пользователя в NocoDB - ТОЧНО как у коллеги
async function findUser(tgId) {
    console.log("=== ПОИСК ПОЛЬЗОВАТЕЛЯ КАК В PYTHON ===");
    console.log("Ищем по tg-id:", tgId);
    
    const headers = { "xc-token": API_KEY };
    const params = `where=(tg-id,eq,${tgId})&limit=1`;
    
    console.log("GET →", `${RECORDS_ENDPOINT}?${params}`);
    
    const response = await fetch(`${RECORDS_ENDPOINT}?${params}`, { headers });
    console.log("STATUS:", response.status);
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("RAW RESPONSE:", errorText);
        return null;
    }
    
    const data = await response.json();
    console.log("Найдены записи:", data.list);
    
    if (!data.list || data.list.length === 0) {
        console.log("⚠️ Запись с таким tg-id не найдена");
        
        // Попробуем VK вариант
        const vkValue = `${tgId}_VK`;
        console.log("Пробуем VK вариант:", vkValue);
        
        const vkResponse = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkValue})&limit=1`, { headers });
        if (vkResponse.ok) {
            const vkData = await vkResponse.json();
            if (vkData.list && vkData.list.length > 0) {
                console.log("Найдена VK запись:", vkData.list[0]);
                const recordId = vkData.list[0].Id || vkData.list[0].id;
                console.log(`➡️ Используем record_id = ${recordId} для PATCH`);
                return { recordId, platform: 'vk' };
            }
        }
        
        return null;
    }
    
    const rec = data.list[0];
    console.log("\nНайдена запись:");
    console.log(JSON.stringify(rec, null, 2));
    
    const recordId = rec.Id || rec.id;
    if (!recordId) {
        throw new Error("Не нашли поле Id / id в записи");
    }
    
    console.log(`\n➡️ Используем record_id = ${recordId} для PATCH\n`);
    return { recordId, platform: 'tg' };
}

// Загрузка файла - ТОЧНО как у коллеги
async function uploadFile(recordId, fieldId, file, extra = {}) {
    console.log("=== ЗАГРУЗКА ФАЙЛА КАК В PYTHON ===");
    
    // 1. Загружаем файл в хранилище
    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");
    
    console.log("Загружаю файл:", file.name);
    
    const up = await fetch(FILE_UPLOAD_ENDPOINT, { 
        method: "POST", 
        headers: { "xc-token": API_KEY }, 
        body: form 
    });
    
    if (!up.ok) {
        const errorText = await up.text();
        console.error("Ошибка загрузки файла:", errorText);
        throw new Error("Не удалось загрузить файл на сервер");
    }
    
    const info = await up.json();
    console.log("Файл загружен, информация:", info);
    
    // Получаем URL как в Python коде
    let url;
    if (Array.isArray(info)) {
        url = info[0].url || `${BASE_URL}/${info[0].path}`;
    } else {
        url = info.url;
    }
    
    console.log("URL файла:", url);
    
    // 2. Обновляем запись - ВАЖНО: объект, а не массив!
    const fakeFile = {
        title: file.name,
        url: url,
        mimetype: file.type,
        size: file.size
    };
    
    // ВАЖНО: Id внутри body, а не в URL, и body - объект, не массив!
    const body = {
        Id: Number(recordId),  // ИСПРАВЛЕНО: Id с заглавной I
        [fieldId]: [fakeFile],
        ...extra
    };
    
    const headers = {
        "xc-token": API_KEY,
        "Content-Type": "application/json"
    };
    
    console.log("PATCH →", RECORDS_ENDPOINT);
    console.log("BODY →");
    console.log(JSON.stringify(body, null, 2));
    
    const patch = await fetch(RECORDS_ENDPOINT, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify(body)  // ИСПРАВЛЕНО: объект, не массив
    });
    
    console.log("\nSTATUS:", patch.status);
    
    if (!patch.ok) {
        const errorText = await patch.text();
        console.error("RESPONSE:", errorText);
        throw new Error(`Ошибка сохранения: ${patch.status}`);
    }
    
    const result = await patch.text();
    console.log("RESPONSE:", result);
    
    return JSON.parse(result || "{}");
}

// Прогресс-бар
async function showProgress(barId, statusId) {
    const bar = document.getElementById(barId);
    const status = document.getElementById(statusId);
    let p = 0;
    return new Promise(res => {
        const int = setInterval(() => {
            p += 15 + Math.random() * 25;
            if (p >= 100) { 
                p = 100; 
                clearInterval(int); 
                status.textContent = "Готово!"; 
                res(); 
            }
            bar.style.width = p + "%";
            status.textContent = `Загрузка ${Math.round(p)}%`;
        }, 100);
    });
}

// ======================= ЗАПУСК =======================
(async () => {
    try {
        console.log("=== НАЧАЛО РАБОТЫ ПРИЛОЖЕНИЯ ===");
        
        // 1. Ждём VK Bridge
        console.log("1. Определяем платформу...");
        const bridge = await waitForVkBridge();

        if (bridge) {
            console.log("Обнаружена платформа VK");
            await bridge.send("VKWebAppInit");
            const info = await bridge.send("VKWebAppGetUserInfo");
            rawUserId = Number(info.id);
            userPlatform = "vk";
            console.log("VK пользователь ID:", rawUserId);
        }
        // 2. Если не VK — значит Telegram
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            console.log("Обнаружена платформа Telegram");
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = Number(tg.initDataUnsafe.user.id);
            userPlatform = "tg";
            console.log("Telegram пользователь ID:", rawUserId);
        }
        else {
            // Для тестирования
            console.log("Платформа не определена, работаю в тестовом режиме");
            rawUserId = 391429444; // Тестовый ID из Python кода
            userPlatform = "tg";
        }

        // 3. Ищем пользователя в базе ТОЧНО как в Python
        console.log("\n3. Ищем пользователя в базе...");
        const user = await findUser(rawUserId);
        
        if (!user) {
            const errorMsg = `Вы не зарегистрированы (ID: ${rawUserId}). Напишите в бот.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        console.log("\n=== УСТАНОВЛЕННЫЕ ЗНАЧЕНИЯ ===");
        console.log("currentRecordId:", currentRecordId);
        console.log("userPlatform:", userPlatform);
        console.log("Тип currentRecordId:", typeof currentRecordId);

        // 4. Показываем приветственный экран
        console.log("\n4. Показываю welcome экран");
        showScreen("welcome");

    } catch (err) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА:", err);
        showError(err.message || "Ошибка приложения");
    }
})();

// ======================= КНОПКИ =======================
document.getElementById("startUpload")?.addEventListener("click", () => {
    console.log("Нажата кнопка 'Начать загрузку'");
    showScreen("upload1");
});

async function handleUpload(num, fieldId, nextScreen = null) {
    console.log(`\n=== ОБРАБОТКА ЗАГРУЗКИ ${num} ===`);
    console.log("currentRecordId:", currentRecordId);
    
    const input = document.getElementById(`fileInput${num}`);
    const err = document.getElementById(`error${num}`);
    const file = input.files[0];
    err.classList.add("hidden");

    if (!file) {
        console.log("Файл не выбран");
        err.textContent = "Выберите файл";
        err.classList.remove("hidden");
        return;
    }
    
    if (file.size > 15*1024*1024) {
        console.log("Файл слишком большой:", file.size);
        err.textContent = "Файл больше 15 МБ";
        err.classList.remove("hidden");
        return;
    }

    console.log("Файл:", file.name, "размер:", file.size, "тип:", file.type);
    
    if (!currentRecordId) {
        console.error("currentRecordId равен null!");
        err.textContent = "Ошибка: не удалось определить вашу запись в базе.";
        err.classList.remove("hidden");
        return;
    }

    try {
        await showProgress(`progress${num}`, `status${num}`);
        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        console.log("Extra данные:", extra);
        
        await uploadFile(currentRecordId, fieldId, file, extra);
        console.log(`✅ Файл ${num} успешно загружен`);
        
        nextScreen ? showScreen(nextScreen) : showScreen("result");
    } catch (e) {
        console.error("Ошибка при загрузке:", e);
        err.textContent = e.message || "Ошибка загрузки";
        err.classList.remove("hidden");
    }
}

document.getElementById("submitFile1")?.addEventListener("click", () => handleUpload(1, SOLUTION_FIELDS.solution1, "upload2"));
document.getElementById("submitFile2")?.addEventListener("click", () => handleUpload(2, SOLUTION_FIELDS.solution2, "upload3"));
document.getElementById("submitFile3")?.addEventListener("click", () => handleUpload(3, SOLUTION_FIELDS.solution3));

document.getElementById("skipFile2")?.addEventListener("click", () => {
    console.log("Пользователь пропустил файл 2");
    showScreen("result");
});
document.getElementById("skipFile3")?.addEventListener("click", () => {
    console.log("Пользователь завершил загрузку");
    showScreen("result");
});

document.getElementById("closeApp")?.addEventListener("click", () => {
    console.log("Закрытие приложения");
    if (userPlatform === "vk" && window.vkBridge) {
        vkBridge.send("VKWebAppClose", {status: "success"});
    } else if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.close();
    }
});