[file name]: app.js
[file content begin]
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

// Поиск пользователя в NocoDB - ОБНОВЛЕННАЯ ВЕРСИЯ
async function findUser(id) {
    console.log("=== НАЧАЛО ПОИСКА ПОЛЬЗОВАТЕЛЯ ===");
    console.log("Ищем пользователя с ID:", id, "тип:", typeof id);
    
    // Вариант 1: Ищем по точному совпадению tg-id
    console.log("1. Ищу по tg-id =", id);
    let res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${id})`, { 
        headers: { "xc-token": API_KEY } 
    });
    let data = await res.json();
    console.log("Результат по tg-id:", data);
    
    if (data.list?.length > 0) {
        const recordId = data.list[0].Id || data.list[0].id;
        console.log("✅ Найден по tg-id! Record ID:", recordId);
        return { recordId: recordId, platform: 'tg' };
    }

    // Вариант 2: Ищем по VK варианту (ID_VK)
    const vkVal = String(id) + "_VK";
    console.log("2. Ищу по tg-id =", vkVal);
    res = await fetch(`${RECORDS_ENDPOINT}?where=(tg-id,eq,${vkVal})`, { 
        headers: { "xc-token": API_KEY } 
    });
    data = await res.json();
    console.log("Результат по VK варианту:", data);
    
    if (data.list?.length > 0) {
        const recordId = data.list[0].Id || data.list[0].id;
        console.log("✅ Найден по VK варианту! Record ID:", recordId);
        return { recordId: recordId, platform: 'vk' };
    }

    // Вариант 3: Ищем по полю vk-id (если такое есть)
    console.log("3. Ищу по vk-id =", id);
    res = await fetch(`${RECORDS_ENDPOINT}?where=(vk-id,eq,${id})`, { 
        headers: { "xc-token": API_KEY } 
    });
    data = await res.json();
    console.log("Результат по vk-id:", data);
    
    if (data.list?.length > 0) {
        const recordId = data.list[0].Id || data.list[0].id;
        console.log("✅ Найден по vk-id! Record ID:", recordId);
        return { recordId: recordId, platform: 'vk' };
    }

    // Вариант 4: Попробуем поиск по всем записям для отладки
    console.log("4. Просмотр всех записей для отладки (первые 5):");
    res = await fetch(`${RECORDS_ENDPOINT}?limit=5`, { 
        headers: { "xc-token": API_KEY } 
    });
    data = await res.json();
    console.log("Первые 5 записей:", data.list);

    console.log("❌ Пользователь не найден");
    return null;
}

// Загрузка файла (с проверкой recordId)
async function uploadFile(recordId, fieldId, file, extra = {}) {
    // ПРОВЕРКА: recordId не должен быть null
    if (!recordId || recordId === "null") {
        throw new Error("Не удалось определить запись пользователя. Пожалуйста, зарегистрируйтесь.");
    }

    const form = new FormData();
    form.append("file", file);
    form.append("path", "solutions");

    console.log("Загружаю файл на сервер...");
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
    const url = Array.isArray(info) ? (info[0].url || `${BASE_URL}/${info[0].path}`) : info.url;
    console.log("Файл загружен, URL:", url);

    // ИСПРАВЛЕНИЕ: Используем правильный URL для обновления записи
    const UPDATE_ENDPOINT = `${RECORDS_ENDPOINT}/${recordId}`;
    
    const body = { 
        [fieldId]: [{ 
            title: file.name, 
            url, 
            mimetype: file.type, 
            size: file.size 
        }], 
        ...extra 
    };

    console.log("Обновляю запись:", UPDATE_ENDPOINT);
    console.log("Тело запроса:", JSON.stringify(body));

    const patch = await fetch(UPDATE_ENDPOINT, {
        method: "PATCH",
        headers: { 
            "xc-token": API_KEY, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify(body)
    });
    
    if (!patch.ok) {
        const errorText = await patch.text();
        console.error("Ошибка обновления записи:", errorText);
        throw new Error("Ошибка сохранения в базу данных. Status: " + patch.status);
    }
    
    const result = await patch.json();
    console.log("Запись успешно обновлена:", result);
    return result;
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
        console.log("1. Проверяем платформу...");
        const bridge = await waitForVkBridge();

        if (bridge) {
            console.log("Обнаружена платформа VK");
            await bridge.send("VKWebAppInit");
            const info = await bridge.send("VKWebAppGetUserInfo");
            rawUserId = info.id;
            userPlatform = "vk";
            console.log("VK пользователь ID:", rawUserId, "тип:", typeof rawUserId);
        }
        // 2. Если не VK — значит Telegram
        else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            console.log("Обнаружена платформа Telegram");
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            rawUserId = tg.initDataUnsafe.user.id;
            userPlatform = "tg";
            console.log("Telegram пользователь ID:", rawUserId, "тип:", typeof rawUserId);
        }
        else {
            console.log("Платформа не определена, работаю в тестовом режиме");
            // Для тестирования можно задать тестовые данные
            rawUserId = "test_user_123";
            userPlatform = "tg";
        }

        console.log("=== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ===");
        console.log("Platform:", userPlatform);
        console.log("Raw User ID:", rawUserId);
        console.log("Type of Raw User ID:", typeof rawUserId);

        // 3. Ищем пользователя в базе
        console.log("3. Ищу пользователя в базе...");
        const user = await findUser(rawUserId);
        
        console.log("Результат findUser:", user);
        
        if (!user) {
            // Если пользователь не найден, показываем ошибку
            const errorMsg = `Пользователь с ID ${rawUserId} не найден в базе данных. Пожалуйста, зарегистрируйтесь через бота.`;
            console.error(errorMsg);
            
            // Вместо throw, показываем понятное сообщение
            document.body.innerHTML = `
                <div style="padding: 40px; text-align: center; color: white; font-family: sans-serif;">
                    <h2>🚫 Пользователь не найден</h2>
                    <p style="font-size: 18px; margin: 20px 0;">Ваш ID: <strong>${rawUserId}</strong></p>
                    <p style="font-size: 16px; margin: 20px 0; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
                        Чтобы использовать приложение, нужно сначала зарегистрироваться.<br>
                        Пожалуйста, напишите нашему боту для регистрации.
                    </p>
                    <button onclick="location.reload()" style="padding: 15px 30px; font-size: 17px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        Обновить
                    </button>
                </div>
            `;
            return;
        }

        currentRecordId = user.recordId;
        userPlatform = user.platform;

        console.log("=== УСТАНОВЛЕННЫЕ ЗНАЧЕНИЯ ===");
        console.log("currentRecordId:", currentRecordId);
        console.log("userPlatform:", userPlatform);
        console.log("Тип currentRecordId:", typeof currentRecordId);

        // 4. Показываем приветственный экран
        console.log("4. Показываю welcome экран");
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
    console.log(`=== ОБРАБОТКА ЗАГРУЗКИ ${num} ===`);
    
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

    console.log("Файл для загрузки:", file.name, "размер:", file.size, "тип:", file.type);
    console.log("currentRecordId перед загрузкой:", currentRecordId);
    
    // ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА
    if (!currentRecordId) {
        err.textContent = "Ошибка: не удалось определить вашу запись. Пожалуйста, перезагрузите приложение.";
        err.classList.remove("hidden");
        return;
    }

    try {
        await showProgress(`progress${num}`, `status${num}`);
        const extra = num === 1 ? { [DATE_FIELD_ID]: new Date().toISOString().split('T')[0] } : {};
        console.log("Extra данные:", extra);
        
        await uploadFile(currentRecordId, fieldId, file, extra);
        console.log(`Файл ${num} успешно загружен`);
        
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
    } else {
        alert("Загрузка завершена! Можно закрыть вкладку.");
    }
});
[file content end]