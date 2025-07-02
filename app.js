// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.MainButton.hide();

// Конфигурация NocoDB API
const BASE_URL = "https://ndb.fut.ru";
const TABLE_ID = "maiff22q0tefj6t";
const VIEW_ID = "vwy5xmvdj8cuwwcx";

// Эндпоинты для работы с записями
const RECORDS_ENDPOINT = `${BASE_URL}/api/v2/tables/${TABLE_ID}/records`;
const FILE_UPLOAD_ENDPOINT = `${BASE_URL}/api/v2/storage/upload`;

// ID полей для загрузки решений
const SOLUTION_FIELDS = {
    solution1: "cqahcr20oaz950o", // Загрузите решение 1
    solution2: "cel4fwk74vwnrt8", // Загрузите решение 2
    solution3: "c7bnf9vndqjyzll"  // Загрузите решение 3
};

// Ключ 
const API_KEY = "N0eYiucuiiwSGIvPK5uIcOasZc_nJy6mBUihgaYQ";

// Элементы интерфейса
const screens = {
    email: document.getElementById("emailScreen"),
    upload1: document.getElementById("uploadScreen1"),
    upload2: document.getElementById("uploadScreen2"),
    upload3: document.getElementById("uploadScreen3"),
    result: document.getElementById("resultScreen")
};

const emailInput = document.getElementById("emailInput");
const emailError = document.getElementById("emailError");

let currentUserEmail = "";
let currentRecordId = null;
let uploadedFiles = [null, null, null];

// Функции для работы с NocoDB API

/**
    * Поиск пользователя по email в базе NocoDB
    * @param {string} email - Адрес электронной почты
    * @returns {Promise<Object|null>} - Найденная запись или null
    */
async function findUserByEmail(email) {
    try {
        // Формируем запрос с фильтром по email
        const response = await fetch(`${RECORDS_ENDPOINT}?where=(E-mail,eq,${encodeURIComponent(email)})`, {
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
            return {
                id: record.id || record.Id || record.ID,
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
async function updateRecord(recordId, fieldId, file) {
    try {
        // Создаем FormData для отправки файла
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', 'solutions'); // Опционально: папка для хранения
        
        // Шаг 1: Загружаем файл и получаем attachment_id
        const uploadResponse = await fetch(FILE_UPLOAD_ENDPOINT, {
            method: 'POST',
            headers: {
                "xc-token": API_KEY
            },
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error("Ошибка загрузки файла:", uploadResponse.status, errorText);
            throw new Error(`Ошибка загрузки файла: ${uploadResponse.status}`);
        }
        
        const uploadData = await uploadResponse.json();
        console.log("File upload response:", uploadData); // Для отладки

        if (!uploadData?.id) {
            console.error("Не получен ID вложения в ответе:", uploadData);
            throw new Error("Не получен ID вложения");
        }
        
        const attachmentPath = uploadData[0].path;
        const fileName = uploadData[0].title || file.name;
        
        // Шаг 2: Обновляем запись с помощью attachment_id
        const updateData = {
            [fieldId]: JSON.stringify([{
                path: attachmentPath,
                title: fileName,
                url: `${BASE_URL}/${attachmentPath}`,
                mimetype: file.type,
                size: file.size
            }])
        };
        
        console.log("Отправка данных для обновления:", updateData);
        const updateResponse = await fetch(`${RECORDS_ENDPOINT}/${recordId}`, {
            method: "PATCH",
            headers: {
                "xc-token": API_KEY,
                "Content-Type": "application/json"
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
    if (file.size > 5 * 1024 * 1024) {
        return "Файл слишком большой (макс. 5MB)";
    }
    
    const validTypes = [
        "application/pdf", 
        "application/msword", 
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
    Object.values(screens).forEach(screen => {
        screen.classList.add("hidden");
    });
    screens[toScreen].classList.remove("hidden");
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

// Обработка ввода email
document.getElementById("submitEmail").addEventListener("click", async () => {
    const email = emailInput.value.trim();
    emailError.classList.add("hidden");
    
    if (!email) {
        showError(emailError, "Введите адрес электронной почты");
        return;
    }
    
    try {
        const userRecord = await findUserByEmail(email);
        
        if (!userRecord) {
            showError(emailError, "Пользователь с таким email не найден");
            return;
        }
        
        currentUserEmail = email;
        currentRecordId = userRecord.id;
        showScreen("upload1");
    } catch (error) {
        showError(emailError, error.message);
    }
});

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
        
        // Обновление записи в базе данных
        await updateRecord(currentRecordId, fieldId, file);
        
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

// Обработка нажатия Enter в поле email
emailInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        document.getElementById("submitEmail").click();
    }
});