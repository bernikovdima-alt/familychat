// --- НАСТРОЙКИ ---
const firebaseConfig = {
    apiKey: "AIzaSyAKmjFw7f2KfJ-iJh-5Xzf-xXCaynjQFD4",
    authDomain: "familychat-76391.firebaseapp.com",
    databaseURL: "https://familychat-76391-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "familychat-76391",
    storageBucket: "familychat-76391.firebasestorage.app",
    messagingSenderId: "207829772753",
    appId: "1:207829772753:web:f5d611ef2f0de87cc298f0",
    measurementId: "G-H900FNHEKT"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Глобальные переменные
let myName = "";
let localStream;
let peer;
let currentCall;
let savedContacts = JSON.parse(localStorage.getItem('contacts')) || ['Мама', 'Сестра'];

// --- ЛОГИКА ВХОДА ---
// Исправление: добавили async/await, чтобы сначала включилась камера, а потом P2P
async function login() {
    const input = document.getElementById('username-input').value.trim();
    if (!input) return alert("Введите имя!");
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    
    myName = input;

    // Сначала ждем камеру!
    await startCamera();
    // Только потом подключаемся к сети
    initPeer();
    renderContacts();
}

// 1. Доступ к камере
async function startCamera() {
    try {
        // Запрашиваем поток
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, // Просим хорошее качество
                height: { ideal: 720 },
                facingMode: "user"      // Фронтальная камера
            }, 
            audio: true 
        });
        document.getElementById('localVideo').srcObject = localStream;
        console.log("Камера запущена успешно");
    } catch (err) {
        console.error("Ошибка камеры:", err);
        alert("Ошибка доступа к камере! Проверьте разрешения браузера. " + err);
    }
}

// 2. Настройка P2P и Базы Данных
function initPeer() {
    // Создаем Peer с STUN серверами (для работы через мобильный интернет)
    peer = new Peer(null, {
        debug: 2,
        config: {
            'iceServers': [
                { url: 'stun:stun.l.google.com:19302' },
                { url: 'stun:stun1.l.google.com:19302' },
                { url: 'stun:stun2.l.google.com:19302' }
            ]
        }
    });

    peer.on('open', (id) => {
        document.getElementById('my-status').innerText = `Онлайн (Я: ${myName})`;
        console.log("Мой Peer ID:", id);
        
        // Сохраняем себя в базу
        database.ref('users/' + myName).set({
            peerId: id,
            status: 'online',
            lastSeen: Date.now()
        });

        // При закрытии страницы удаляем себя из базы
        window.addEventListener('beforeunload', () => {
            database.ref('users/' + myName).remove();
        });
    });

    peer.on('error', (err) => {
        console.error("Ошибка PeerJS:", err);
        alert("Ошибка сети P2P: " + err.type);
    });

    // Обработка ВХОДЯЩЕГО звонка
    peer.on('call', (call) => {
        console.log("Входящий звонок от...", call.peer);
        currentCall = call;
        document.getElementById('incoming-call').style.display = 'flex';
        document.getElementById('caller-name').innerText = "Вам звонят!";
    });
}

// --- ЗВОНКИ ---

// Ответить на звонок
function answerCall() {
    if (!localStream) {
        alert("Камера еще не готова! Попробуйте еще раз.");
        return;
    }

    document.getElementById('incoming-call').style.display = 'none';
    document.getElementById('hangup-btn').style.display = 'block';
    
    // Отправляем свой поток
    currentCall.answer(localStream);
    
    // Ждем поток собеседника
    currentCall.on('stream', (remoteStream) => {
        console.log("Поток собеседника получен (при ответе)");
        showRemoteVideo(remoteStream);
    });

    // Обработка ошибок при ответе
    currentCall.on('error', (err) => {
        console.error("Ошибка в звонке:", err);
        resetCallUI();
    });

    currentCall.on('close', resetCallUI);
}

// Сбросить входящий
function rejectCall() {
    if(currentCall) currentCall.close();
    document.getElementById('incoming-call').style.display = 'none';
}

// Позвонить кому-то (ИСХОДЯЩИЙ)
function makeCall(targetName) {
    console.log("Ищем контакт:", targetName);
    
    database.ref('users/' + targetName).once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            
            if (data && data.peerId) {
                // Если соединение разорвано - пробуем переподключить
                if (peer.disconnected) peer.reconnect();

                alert(`Звоним ${targetName}...`);
                
                const call = peer.call(data.peerId, localStream);
                currentCall = call;
                
                document.getElementById('hangup-btn').style.display = 'block';
                
                call.on('stream', (remoteStream) => {
                    console.log("Поток собеседника получен (исходящий)");
                    showRemoteVideo(remoteStream);
                });
                
                call.on('error', (err) => {
                    console.error("Ошибка звонка:", err);
                    alert("Срыв звонка: " + err);
                });

                call.on('close', resetCallUI);
            } else {
                alert(`Пользователь ${targetName} не найден в сети. Пусть он откроет сайт.`);
            }
        })
        .catch((error) => {
            console.error("Ошибка базы:", error);
        });
}

// Завершить текущий звонок
function endCall() {
    if (currentCall) currentCall.close();
    resetCallUI();
}

// UI функции
function showRemoteVideo(stream) {
    const video = document.getElementById('remoteVideo');
    video.srcObject = stream;
    // Иногда браузеры блокируют автоплей, пинаем его вручную
    video.play().catch(e => console.log("Autoplay error:", e));
}

function resetCallUI() {
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('hangup-btn').style.display = 'none';
    currentCall = null;
}

// --- СПИСОК КОНТАКТОВ ---
function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    
    savedContacts.forEach(contactName => {
        const div = document.createElement('div');
        div.className = 'contact-card';
        div.innerHTML = `<div>👤</div><div class="contact-name">${contactName}</div>`;
        div.onclick = () => makeCall(contactName);
        
        // Слушаем статус в реальном времени
        database.ref('users/' + contactName).on('value', (snap) => {
            if(snap.exists()) {
                div.classList.add('online');
            } else {
                div.classList.remove('online');
            }
        });
        
        list.appendChild(div);
    });
}

function addContact() {
    const name = document.getElementById('new-contact').value.trim();
    if(name && !savedContacts.includes(name)) {
        savedContacts.push(name);
        localStorage.setItem('contacts', JSON.stringify(savedContacts));
        renderContacts();
        document.getElementById('new-contact').value = '';
    }
}
