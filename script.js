// --- НАСТРОЙКИ ---
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Инициализация
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let myName = "";
let localStream;
let peer;
let currentCall;
let savedContacts = JSON.parse(localStorage.getItem('contacts')) || ['Мама', 'Сестра'];

// --- ЛОГИКА ВХОДА ---
function login() {
    const input = document.getElementById('username-input').value.trim();
    if (!input) return alert("Введите имя!");
    
    myName = input;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    
    startCamera();
    initPeer();
    renderContacts();
}

// 1. Доступ к камере
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('localVideo').srcObject = localStream;
    } catch (err) {
        alert("Ошибка камеры: " + err);
    }
}

// 2. Настройка P2P и Базы Данных
function initPeer() {
    // Создаем Peer. Если ID не указан, облако даст нам случайный
    // Внутри функции initPeer()
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
        
        // Сохраняем в базу: Имя -> PeerID. 
        // Чтобы Мама знала, какой у меня сейчас технический ID.
        database.ref('users/' + myName).set({
            peerId: id,
            status: 'online',
            lastSeen: Date.now()
        });

        // При выходе удаляем статус (не работает на моб при закрытии вкладки, но полезно)
        window.addEventListener('beforeunload', () => {
            database.ref('users/' + myName).remove();
        });
    });

    // Обработка ВХОДЯЩЕГО звонка
    peer.on('call', (call) => {
        currentCall = call;
        document.getElementById('incoming-call').style.display = 'flex';
        // Тут можно проиграть звук рингтона
    });
}

// --- ЗВОНКИ ---

// Ответить на звонок
function answerCall() {
    document.getElementById('incoming-call').style.display = 'none';
    document.getElementById('hangup-btn').style.display = 'block';
    
    currentCall.answer(localStream);
    currentCall.on('stream', showRemoteVideo);
    currentCall.on('close', resetCallUI);
}

// Сбросить
function rejectCall() {
    if(currentCall) currentCall.close();
    document.getElementById('incoming-call').style.display = 'none';
}

// Позвонить кому-то
function makeCall(targetName) {
    console.log("Пытаюсь позвонить:", targetName);
    
    // Читаем базу данных
    database.ref('users/' + targetName).once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            console.log("Данные абонента:", data);

            if (data && data.peerId) {
                // Проверяем, жив ли Peer
                if (peer.disconnected) {
                    peer.reconnect();
                }

                alert(`Звоним ${targetName}...`);
                
                // ЗВОНОК
                const call = peer.call(data.peerId, localStream);
                
                // Ловим ошибки самого звонка
                call.on('error', (err) => {
                    console.error("Ошибка внутри звонка:", err);
                    alert("Ошибка соединения: " + err);
                });

                currentCall = call;
                document.getElementById('hangup-btn').style.display = 'block';
                
                call.on('stream', (remoteStream) => {
                    console.log("Получен видеопоток!");
                    showRemoteVideo(remoteStream);
                });
                
                call.on('close', resetCallUI);
            } else {
                alert(`Пользователь ${targetName} не найден в сети. Проверьте имя.`);
            }
        })
        .catch((error) => {
            console.error("Ошибка чтения базы:", error);
            alert("Ошибка базы данных");
        });
}

// Завершить звонок
function endCall() {
    if (currentCall) currentCall.close();
    resetCallUI();
}

// Вспомогательные функции UI
function showRemoteVideo(stream) {
    document.getElementById('remoteVideo').srcObject = stream;
}

function resetCallUI() {
    document.getElementById('remoteVideo').srcObject = null;
    document.getElementById('hangup-btn').style.display = 'none';
}

// --- КОНТАКТЫ ---
function renderContacts() {
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    
    savedContacts.forEach(contactName => {
        const div = document.createElement('div');
        div.className = 'contact-card';
        div.innerHTML = `<div>👤</div><div class="contact-name">${contactName}</div>`;
        div.onclick = () => makeCall(contactName);
        
        // Проверяем в базе, онлайн ли контакт прямо сейчас
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


