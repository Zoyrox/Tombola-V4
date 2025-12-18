// Admin Tombola Natalizia
document.addEventListener('DOMContentLoaded', function() {
    // Imposta anno corrente nel footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Credenziali admin (nel progetto reale queste dovrebbero essere sul server)
    const ADMIN_EMAIL = 'admin@tombola.it';
    const ADMIN_PASSWORD = 'password123';
    
    // Stato dell'applicazione
    let currentRoom = null;
    let extractedNumbers = [];
    let autoExtractInterval = null;
    let players = [];
    
    // Elementi DOM
    const loginSection = document.getElementById('login-section');
    const adminPanel = document.getElementById('admin-panel');
    const messageDiv = document.getElementById('message');
    const loginBtn = document.getElementById('login-btn');
    const createRoomBtn = document.getElementById('create-room-btn');
    const extractBtn = document.getElementById('extract-btn');
    const resetExtractionBtn = document.getElementById('reset-extraction-btn');
    const autoExtractBtn = document.getElementById('auto-extract-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    
    // Inizializza la griglia dei numeri
    initNumbersGrid();
    
    // Gestione login
    loginBtn.addEventListener('click', handleLogin);
    
    // Gestione creazione stanza
    createRoomBtn.addEventListener('click', createRoom);
    
    // Gestione estrazione numeri
    extractBtn.addEventListener('click', extractNumber);
    resetExtractionBtn.addEventListener('click', resetExtraction);
    autoExtractBtn.addEventListener('click', toggleAutoExtraction);
    
    // Gestione copia codice
    copyCodeBtn.addEventListener('click', copyRoomCode);
    
    // Permetti login con Enter
    document.getElementById('admin-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
    
    // Funzione di login
    function handleLogin() {
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        
        if (!email || !password) {
            showMessage('Inserisci email e password', 'error');
            return;
        }
        
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            // Login riuscito
            loginSection.style.display = 'none';
            adminPanel.style.display = 'grid';
            showMessage('Accesso effettuato con successo!', 'success');
        } else {
            showMessage('Credenziali non valide', 'error');
        }
    }
    
    // Funzione per creare una stanza
    function createRoom() {
        const roomName = document.getElementById('room-name').value;
        const maxPlayers = document.getElementById('max-players').value;
        
        if (!roomName) {
            showMessage('Inserisci un nome per la stanza', 'error');
            return;
        }
        
        // Genera un ID stanza univoco (6 caratteri)
        const roomId = generateRoomCode();
        
        // Crea l'oggetto stanza
        currentRoom = {
            id: roomId,
            name: roomName,
            maxPlayers: parseInt(maxPlayers),
            createdAt: new Date().toISOString(),
            isActive: true
        };
        
        // Mostra informazioni stanza
        document.getElementById('room-id').textContent = roomId;
        document.getElementById('room-name-display').textContent = roomName;
        document.getElementById('room-code-share').value = roomId;
        document.getElementById('room-info').style.display = 'block';
        
        // Reset estrazione per la nuova stanza
        resetExtraction();
        
        // Aggiorna lista giocatori
        updatePlayersList();
        
        showMessage(`Stanza "${roomName}" creata con successo!`, 'success');
        
        // Simula connessione giocatori (per demo)
        simulatePlayers();
    }
    
    // Funzione per estrarre un numero
    function extractNumber() {
        if (!currentRoom) {
            showMessage('Crea prima una stanza!', 'error');
            return;
        }
        
        if (extractedNumbers.length >= 90) {
            showMessage('Tutti i numeri sono già stati estratti!', 'info');
            return;
        }
        
        let newNumber;
        // Estrai un numero non ancora estratto
        do {
            newNumber = Math.floor(Math.random() * 90) + 1;
        } while (extractedNumbers.includes(newNumber));
        
        // Aggiungi alla lista
        extractedNumbers.push(newNumber);
        
        // Aggiorna l'interfaccia
        updateExtractedNumberDisplay(newNumber);
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        
        // In un'app reale, qui invieresti il numero ai giocatori via WebSocket
        simulatePlayerUpdates(newNumber);
        
        showMessage(`Numero ${newNumber} estratto!`, 'success');
    }
    
    // Funzione per resettare l'estrazione
    function resetExtraction() {
        if (!currentRoom && extractedNumbers.length === 0) {
            return;
        }
        
        if (confirm('Vuoi resettare l\'estrazione? Tutti i numeri estratti verranno cancellati.')) {
            extractedNumbers = [];
            updateExtractedNumberDisplay('--');
            updateExtractedNumbersGrid();
            updateExtractionProgress();
            showMessage('Estrazione resettata', 'info');
        }
    }
    
    // Funzione per attivare/disattivare l'auto-estrazione
    function toggleAutoExtraction() {
        if (!currentRoom) {
            showMessage('Crea prima una stanza!', 'error');
            return;
        }
        
        if (autoExtractInterval) {
            // Ferma l'auto-estrazione
            clearInterval(autoExtractInterval);
            autoExtractInterval = null;
            autoExtractBtn.innerHTML = '<i class="fas fa-play"></i> Auto Estrazione (5s)';
            extractBtn.disabled = false;
            showMessage('Auto-estrazione interrotta', 'info');
        } else {
            // Avvia l'auto-estrazione
            autoExtractInterval = setInterval(extractNumber, 5000);
            autoExtractBtn.innerHTML = '<i class="fas fa-stop"></i> Ferma Auto Estrazione';
            extractBtn.disabled = true;
            showMessage('Auto-estrazione avviata (ogni 5 secondi)', 'success');
        }
    }
    
    // Funzione per copiare il codice stanza
    function copyRoomCode() {
        const roomCodeInput = document.getElementById('room-code-share');
        roomCodeInput.select();
        roomCodeInput.setSelectionRange(0, 99999); // Per dispositivi mobili
        
        try {
            navigator.clipboard.writeText(roomCodeInput.value);
            showMessage('Codice copiato negli appunti!', 'success');
        } catch (err) {
            // Fallback per browser più vecchi
            document.execCommand('copy');
            showMessage('Codice copiato!', 'success');
        }
    }
    
    // Funzioni di utilità
    function generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        // Nascondi il messaggio dopo 5 secondi
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    function initNumbersGrid() {
        const grid = document.getElementById('extracted-numbers');
        grid.innerHTML = '';
        
        for (let i = 1; i <= 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'number-cell';
            cell.id = `number-${i}`;
            cell.textContent = i;
            grid.appendChild(cell);
        }
    }
    
    function updateExtractedNumberDisplay(number) {
        const display = document.getElementById('extracted-number');
        display.textContent = number;
        
        // Animazione
        display.style.transform = 'scale(1.2)';
        setTimeout(() => {
            display.style.transform = 'scale(1)';
        }, 300);
    }
    
    function updateExtractedNumbersGrid() {
        // Rimuovi tutte le classi "extracted"
        document.querySelectorAll('.number-cell').forEach(cell => {
            cell.classList.remove('extracted');
        });
        
        // Aggiungi la classe ai numeri estratti
        extractedNumbers.forEach(number => {
            const cell = document.getElementById(`number-${number}`);
            if (cell) {
                cell.classList.add('extracted');
            }
        });
        
        // Aggiorna conteggio
        document.getElementById('extracted-count').textContent = extractedNumbers.length;
    }
    
    function updateExtractionProgress() {
        const progress = (extractedNumbers.length / 90) * 100;
        document.getElementById('extraction-progress').style.width = `${progress}%`;
    }
    
    function updatePlayersList() {
        const playersList = document.getElementById('players-list');
        const countElement = document.getElementById('players-count');
        
        if (players.length === 0) {
            playersList.innerHTML = '<p style="color: #c9e4c5; text-align: center;">Nessun giocatore connesso</p>';
            countElement.textContent = '0';
            return;
        }
        
        playersList.innerHTML = '';
        countElement.textContent = players.length;
        
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.style.padding = '10px';
            playerElement.style.marginBottom = '8px';
            playerElement.style.background = 'rgba(255,255,255,0.05)';
            playerElement.style.borderRadius = '8px';
            playerElement.style.display = 'flex';
            playerElement.style.alignItems = 'center';
            playerElement.style.gap = '10px';
            
            playerElement.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${player.color}; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user"></i>
                </div>
                <div>
                    <div style="font-weight: bold;">${player.name}</div>
                    <div style="font-size: 0.8rem; color: #c9e4c5;">Cartelle: ${player.cards}</div>
                </div>
                <div style="margin-left: auto; font-size: 0.9rem;">
                    <span style="color: #ffcc00;">${player.markedCount}</span>/15
                </div>
            `;
            
            playersList.appendChild(playerElement);
        });
    }
    
    // Funzioni di simulazione (per demo)
    function simulatePlayers() {
        if (!currentRoom) return;
        
        // Aggiungi alcuni giocatori fittizi
        const fakePlayers = [
            { name: 'Marco', color: '#ff6b6b', cards: 1, markedCount: 0 },
            { name: 'Anna', color: '#4ecdc4', cards: 2, markedCount: 0 },
            { name: 'Luca', color: '#ffe66d', cards: 1, markedCount: 0 },
            { name: 'Sofia', color: '#95e1d3', cards: 1, markedCount: 0 }
        ];
        
        players = [...fakePlayers];
        updatePlayersList();
        
        // Simula connessioni/riconnessioni occasionali
        setInterval(() => {
            if (Math.random() > 0.7 && players.length < currentRoom.maxPlayers) {
                const newPlayer = {
                    name: `Giocatore${players.length + 1}`,
                    color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                    cards: Math.floor(Math.random() * 2) + 1,
                    markedCount: 0
                };
                players.push(newPlayer);
                updatePlayersList();
            }
        }, 10000);
    }
    
    function simulatePlayerUpdates(number) {
        // Simula che alcuni giocatori abbiano segnato il numero estratto
        players.forEach(player => {
            if (Math.random() > 0.5) {
                player.markedCount = Math.min(player.markedCount + 1, 15);
            }
        });
        
        updatePlayersList();
    }
    
    // Pulizia quando la pagina viene chiusa
    window.addEventListener('beforeunload', function() {
        if (autoExtractInterval) {
            clearInterval(autoExtractInterval);
        }
    });
});
