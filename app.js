// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Конфигурация NocoDB API
const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "m6tyxd3346dlhco";
const VIEW_ID = "vwy5xmvdj8cuwwcx";

// Добавим ID поля для даты загрузки
const DATE_FIELD_ID = "ceasp9wcrd0ch0m";

// Эндпоинты для работы с записями
const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

// ID полей для загрузки решений
const SOLUTION_FIELDS = {
    solution1: "ciqdqkdc7frd7kr", // Загрузите решение 1
    solution2: "civhqu1url55ef7", // Загрузите решение 2
    solution3: "ck7de0z75mrtzt6"  // Загрузите решение 3
};

// Ключ 
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

// Элементы интерфейса
const screens = {
    welcome: document.getElementById("welcomeScreen"),
    upload1: document.getElementById("uploadScreen1"),
    upload2: document.getElementById("uploadScreen2"),
    upload3: document.getElementById("uploadScreen3"),
    result: document.getElementById("resultScreen")
};

let currentRecordId = null;
let uploadedFiles = [null, null, null];

// Функция аутентификации по tg-id
function getTelegramUserId() {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      return user.id;
    }
  }
  return null;
}


document.addEventListener("DOMContentLoaded", async () => {
  let userId = null;
  let platform = null;

  // Сначала проверяем VK — у него есть vkBridge
  if (typeof vkBridge !== 'undefined' && window.location.href.includes('vk.com')) {
    platform = 'vk';
    window.platform = platform;

    try {
      await vkBridge.send('VKWebAppInit');
      const u = await vkBridge.send('VKWebAppGetUserInfo');
      userId = u.id;
      window.vkUserId = userId;
      console.log("vk-id:", userId);
    } catch (err) {
      console.error('VK init error:', err);
      showErrorScreen('Ошибка VK: ' + err.message);
      return;
    }
  }
  // Потом Telegram — только если VK не определился
  else if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    platform = 'tg';
    window.platform = platform;

    userId = tg.initDataUnsafe.user.id;
    window.tgUserId = userId;
    console.log("tg-id:", userId);
  }

  // Если ни одна платформа не дала ID
  if (!userId || !platform) {
    showErrorScreen('Не удалось определить платформу или пользователя');
    return;
  }

  // Дальше всё как было
  try {
    const userRecord = await findUserByPlatformId(platform, userId);

    if (!userRecord) {
      showErrorScreen("Пользователь не найден в базе. Напишите нам в боте @…");
      return;
    }

    currentRecordId = userRecord.id || userRecord.Id;
    showScreen("welcome");

  } catch (error) {
    console.error(error);
    showErrorScreen('Ошибка сервера: ' + error.message);
  }
});

// Функция для показа ошибок
function showErrorScreen(message) {
    // Создаем элементы для отображения ошибки
    const errorScreen = document.createElement("div");
    errorScreen.className = "screen";
    errorScreen.innerHTML = `
        <h2>Произошла ошибка</h2>
        <div class="error-message">${message}</div>
        <button id="closeApp">Закрыть приложение</button>
    `;
    document.body.appendChild(errorScreen);
    
    // Добавляем обработчик закрытия
    const closeFunc = () => {
        if (window.platform === 'tg') {
            tg.close();
        } else if (window.platform === 'vk') {
            vkBridge.send('VKWebAppClose');
        }
    };
    document.getElementById("closeApp").addEventListener("click", closeFunc);
}

// Функции для работы с NocoDB API

/**
    * Поиск пользователя по email в базе NocoDB
    * @param {string} email - Адрес электронной почты
    * @returns {Promise<Object|null>} - Найденная запись или null
    */
async function findUserByPlatformId(platform, userId) {
    try {
        // Формируем запрос с фильтром по email
        const response = await fetch(`${RECORDS_ENDPOINT}?where=(${platform}-id,eq,${userId})`, {
            method: 'GET',
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("User search response:", data); // Для отладки
        
        if (data.list && data.list.length > 0) {
            const record = data.list[0];
            
            // Добавляем проверку для "Id" (с большой I и маленькой d)
            const recordId = record.id || record.Id || record.ID || record.recordId;
            
            if (!recordId) {
                console.error("ID записи не найден в объекте:", record);
                throw new Error("ID записи не найден");
            }
            
            return {
                id: recordId,
                ...record
            };
        }
        
        return null;
    } catch (error) {
        console.error("Ошибка при поиске пользователя:", error);
        throw new Error("Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.");
    }
}

/**
    * Обновление записи в базе NocoDB
    * @param {string} recordId - ID записи
    * @param {string} fieldId - ID поля для обновления
    * @param {File} file - Файл для загрузки
    * @returns {Promise<boolean>} - Успешно ли обновление
    */
async function updateRecord(recordId, fieldId, file, extraData = {}) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'solutions');
        
        const uploadResponse = await fetch(FILE_UPLOAD_ENDPOINT, {
            method: 'POST',
            headers: { "xc-token": API_KEY },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error("Ошибка загрузки файла:", uploadResponse.status, errorText);
            throw new Error(`Ошибка загрузки файла: ${uploadResponse.status}`);
        }
        
        let uploadData = await uploadResponse.json();
        
        if (!Array.isArray(uploadData)) {
            uploadData = [uploadData];
        }
        
        // ФИКС: Обновленная проверка URL
        if (!uploadData.length || !(uploadData[0]?.url || uploadData[0]?.path)) {
            console.error("Не получен url или path в ответе:", uploadData);
            throw new Error("Не удалось получить информацию о файле");
        }
        
        const firstItem = uploadData[0];
        const fileName = firstItem.title || file.name;
        const fileType = file.type;
        const fileSize = file.size;
        
        // ФИКС: Получаем корректный URL
        const fileUrl = firstItem.url 
            ? firstItem.url 
            : `${BASE_URL}/${firstItem.path}`;
        
        const getFileIcon = (mimeType) => {
            if (mimeType.includes("pdf")) return "mdi-file-pdf-outline";
            if (mimeType.includes("word")) return "mdi-file-word-outline";
            if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "mdi-file-excel-outline";
            if (mimeType.includes("png")) return "mdi-file-image-outline";
            return "mdi-file-outline";
        };
        
        const attachmentData = [
            {
                mimetype: fileType,
                size: fileSize,
                title: fileName,
                url: fileUrl, // ФИКС: Используем корректный URL
                icon: getFileIcon(fileType)
            }
        ];
        
        const updateData = Object.assign(
            {
                Id: Number(recordId),
                [fieldId]: attachmentData
            },
            extraData
        );
        
        console.log("Отправка данных для обновления:", updateData);
        
        const updateResponse = await fetch(RECORDS_ENDPOINT, {
            method: "PATCH",
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify(updateData)
        });
        
        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error("Ошибка обновления записи:", updateResponse.status, errorText);
            throw new Error(`Ошибка обновления записи: ${updateResponse.status}`);
        }
        
        const updateResult = await updateResponse.json();
        console.log("Результат обновления записи:", updateResult);
        
        return true;
        
    } catch (error) {
        console.error("Ошибка при обновлении записи:", error);
        throw new Error("Не удалось сохранить файл. Пожалуйста, попробуйте позже.");
    }
}

// Функции для работы с файлами

/**
    * Валидация файла перед загрузкой
    * @param {File} file - Файл для проверки
    * @returns {string|null} - Сообщение об ошибке или null, если файл валиден
    */
function validateFile(file) {
    if (file.size > 15 * 1024 * 1024) {
        return "Файл слишком большой (макс. 5MB)";
    }
    
    const validTypes = [
        // Документы
        "application/pdf", 
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
        // Таблицы
        "application/vnd.ms-excel", // XLS
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
        "application/vnd.ms-excel.sheet.macroEnabled.12", // XLSM
        "application/vnd.ms-excel.addin.macroEnabled.12",  // XLAM
        // Изображения
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp"
    ];
    
    if (!validTypes.includes(file.type)) {
        return "Неподдерживаемый формат файла";
    }
    
    return null;
}

/**
    * Отслеживание прогресса загрузки файла
    * @param {File} file - Файл для загрузки
    * @param {string} progressId - ID элемента прогресса
    * @param {string} statusId - ID элемента статуса
    * @returns {Promise<void>}
    */
function trackUploadProgress(file, progressId, statusId) {
    return new Promise((resolve) => {
        const progress = document.getElementById(progressId);
        const status = document.getElementById(statusId);
        
        status.textContent = "Подготовка к загрузке...";
        progress.style.width = "0%";
        
        // Имитация прогресса для демонстрации
        let progressValue = 0;
        const interval = setInterval(() => {
            progressValue += Math.random() * 15;
            if (progressValue >= 100) {
                progressValue = 100;
                clearInterval(interval);
                status.textContent = "Файл загружен!";
                resolve();
            } else {
                progress.style.width = `${progressValue}%`;
                status.textContent = `Загружено ${Math.round(progressValue)}%`;
            }
        }, 200);
    });
}

// Функции управления интерфейсом

/**
    * Переключение между экранами приложения
    * @param {string} toScreen - ID экрана для отображения
    */
function showScreen(toScreen) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add("hidden");
    });
    
    // Показываем только целевой экран
    if (screens[toScreen]) {
        screens[toScreen].classList.remove("hidden");
    }
}

/**
    * Отображение сообщения об ошибке
    * @param {HTMLElement} element - Элемент для отображения ошибки
    * @param {string} message - Текст ошибки
    */
function showError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
}

// Обработчики событий

// Обработка загрузки файлов

/**
    * Обработчик загрузки файла
    * @param {number} fileNumber - Номер файла (1, 2 или 3)
    * @param {string} fieldId - ID поля в базе данных
    * @param {string} nextScreen - Следующий экран
    */
async function handleFileUpload(fileNumber, fieldId, nextScreen) {
    const fileInput = document.getElementById(`fileInput${fileNumber}`);
    const errorElement = document.getElementById(`error${fileNumber}`);
    const file = fileInput.files[0];
    
    errorElement.classList.add("hidden");
    
    if (!file) {
        showError(errorElement, "Выберите файл для загрузки");
        return;
    }
    
    // Валидация файла
    const validationError = validateFile(file);
    if (validationError) {
        showError(errorElement, validationError);
        return;
    }
    
    try {
        // Показать прогресс загрузки
        await trackUploadProgress(
            file, 
            `progress${fileNumber}`, 
            `status${fileNumber}`
        );
        
        // Формируем дополнительные данные для обновления
        let extraData = {};
        
        // Если это первый файл, добавляем дату загрузки
        if (fileNumber === 1) {
            const today = new Date();
            // Форматируем дату в YYYY-MM-DD (ISO 8601)
            const formattedDate = today.toISOString().split('T')[0];
            extraData[DATE_FIELD_ID] = formattedDate;
        }
        
        // Обновление записи в базе данных с дополнительными данными
        await updateRecord(currentRecordId, fieldId, file, extraData);
        
        uploadedFiles[fileNumber - 1] = file;
        
        if (nextScreen) {
            showScreen(nextScreen);
        } else {
            showScreen("result");
        }
    } catch (error) {
        showError(errorElement, error.message);
    }
}

// Назначение обработчиков для кнопок загрузки файлов
document.getElementById("startUpload").addEventListener("click", () => {
    showScreen("upload1");
});

document.getElementById("submitFile1").addEventListener("click", () => {
    handleFileUpload(1, SOLUTION_FIELDS.solution1, "upload2");
});

document.getElementById("submitFile2").addEventListener("click", () => {
    handleFileUpload(2, SOLUTION_FIELDS.solution2, "upload3");
});

document.getElementById("submitFile3").addEventListener("click", () => {
    handleFileUpload(3, SOLUTION_FIELDS.solution3);
});

// Обработка пропуска загрузки
document.getElementById("skipFile2").addEventListener("click", () => {
    showScreen("result");
});

document.getElementById("skipFile3").addEventListener("click", () => {
    showScreen("result");
});

// Закрытие приложения
document.getElementById("closeApp").addEventListener("click", () => {
    tg.close();
});
