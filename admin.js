// Admin Tombola Natalizia - Con effetto lampeggiante per i numeri
document.addEventListener('DOMContentLoaded', function() {
    // Imposta anno corrente
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Socket.io
    let socket = io();
    let currentRoom = null;
    let extractedNumbers = [];
    let lastExtractedNumber = null;
    let autoExtractInterval = null;
    let players = [];
    
    // Elementi DOM
    const adminPanel = document.getElementById('admin-panel');
    const messageDiv = document.getElementById('message');
    const createRoomBtn = document.getElementById('create-room-btn');
    const extractBtn = document.getElementById('extract-btn');
    const resetExtractionBtn = document.getElementById('reset-extraction-btn');
    const autoExtractBtn = document.getElementById('auto-extract-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    
    // Inizializza la griglia dei numeri divisa per decine
    initNumbersGrid();
    
    // Gestione creazione stanza
    createRoomBtn.addEventListener('click', createRoom);
    
    // Gestione estrazione numeri
    extractBtn.addEventListener('click', extractNumber);
    resetExtractionBtn.addEventListener('click', resetExtraction);
    autoExtractBtn.addEventListener('click', toggleAutoExtraction);
    
    // Gestione copia codice
    copyCodeBtn.addEventListener('click', copyRoomCode);
    
    // Socket event handlers
    socket.on('room-created', handleRoomCreated);
    socket.on('number-extracted-admin', handleNumberExtracted);
    socket.on('room-update', handleRoomUpdate);
    socket.on('player-updated', handlePlayerUpdated);
    socket.on('extraction-reset-admin', handleExtractionReset);
    socket.on('admin-room-data', handleAdminRoomData);
    
    // Funzione per creare una stanza
    function createRoom() {
        const roomName = document.getElementById('room-name').value;
        const maxPlayers = document.getElementById('max-players').value;
        
        if (!roomName) {
            showMessage('Inserisci un nome per la stanza', 'error');
            return;
        }
        
        socket.emit('create-room', {
            name: roomName,
            maxPlayers: parseInt(maxPlayers)
        });
    }
    
    // Gestione creazione stanza
    function handleRoomCreated(data) {
        currentRoom = data;
        
        // Mostra informazioni stanza
        document.getElementById('room-id').textContent = data.roomCode;
        document.getElementById('room-name-display').textContent = data.name;
        document.getElementById('room-code-share').value = data.roomCode;
        document.getElementById('room-info').style.display = 'block';
        
        // Reset estrazione
        extractedNumbers = [];
        lastExtractedNumber = null;
        players = [];
        updateExtractedNumberDisplay('--');
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        updatePlayersList();
        
        // Connetti admin alla stanza
        socket.emit('admin-join', data.roomCode);
        
        showMessage(`Stanza "${data.name}" creata con successo!`, 'success');
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
        
        socket.emit('extract-number', currentRoom.roomCode);
    }
    
    // Gestione numero estratto (con effetto lampeggiante)
    function handleNumberExtracted(data) {
        // Rimuovi l'effetto lampeggiante dal numero precedente
        if (lastExtractedNumber) {
            const prevCell = document.getElementById(`number-${lastExtractedNumber}`);
            if (prevCell) {
                prevCell.classList.remove('just-extracted');
                prevCell.classList.add('extracted');
            }
        }
        
        // Aggiorna i dati
        extractedNumbers = data.extractedNumbers;
        lastExtractedNumber = data.number;
        
        // Aggiorna il display del numero corrente
        updateExtractedNumberDisplay(data.number);
        
        // Aggiorna la griglia con effetto lampeggiante per il nuovo numero
        updateExtractedNumbersGridWithEffect(data.number);
        
        // Aggiorna il progresso
        updateExtractionProgress();
        
        showMessage(`Numero ${data.number} estratto!`, 'success');
    }
    
    // Funzione per resettare l'estrazione
    function resetExtraction() {
        if (!currentRoom) {
            showMessage('Crea prima una stanza!', 'error');
            return;
        }
        
        if (extractedNumbers.length === 0) {
            showMessage('Non ci sono numeri estratti da resettare', 'info');
            return;
        }
        
        if (confirm('Vuoi resettare l\'estrazione? Tutti i numeri estratti verranno cancellati.')) {
            socket.emit('reset-extraction', currentRoom.roomCode);
        }
    }
    
    // Gestione reset estrazione
    function handleExtractionReset() {
        extractedNumbers = [];
        lastExtractedNumber = null;
        updateExtractedNumberDisplay('--');
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        showMessage('Estrazione resettata', 'info');
    }
    
    // Funzione per auto-estrazione
    function toggleAutoExtraction() {
        if (!currentRoom) {
            showMessage('Crea prima una stanza!', 'error');
            return;
        }
        
        if (autoExtractInterval) {
            clearInterval(autoExtractInterval);
            autoExtractInterval = null;
            autoExtractBtn.innerHTML = '<i class="fas fa-play"></i> Auto Estrazione (5s)';
            extractBtn.disabled = false;
            showMessage('Auto-estrazione interrotta', 'info');
        } else {
            autoExtractInterval = setInterval(extractNumber, 5000);
            autoExtractBtn.innerHTML = '<i class="fas fa-stop"></i> Ferma Auto Estrazione';
            extractBtn.disabled = true;
            showMessage('Auto-estrazione avviata (ogni 5 secondi)', 'success');
        }
    }
    
    // Gestione aggiornamento stanza
    function handleRoomUpdate(data) {
        players = data.players || [];
        updatePlayersList();
    }
    
    // Gestione aggiornamento giocatore
    function handlePlayerUpdated(data) {
        const playerIndex = players.findIndex(p => p.id === data.playerId);
        if (playerIndex !== -1) {
            players[playerIndex].markedCount = data.markedCount;
            updatePlayersList();
        }
    }
    
    // Gestione dati stanza per admin
    function handleAdminRoomData(data) {
        players = data.players || [];
        extractedNumbers = data.extractedNumbers || [];
        lastExtractedNumber = data.lastNumber;
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        updatePlayersList();
        
        if (data.lastNumber) {
            updateExtractedNumberDisplay(data.lastNumber);
        }
    }
    
    // Funzione per copiare il codice stanza
    function copyRoomCode() {
        const roomCodeInput = document.getElementById('room-code-share');
        roomCodeInput.select();
        roomCodeInput.setSelectionRange(0, 99999);
        
        try {
            navigator.clipboard.writeText(roomCodeInput.value);
            showMessage('Codice copiato negli appunti!', 'success');
        } catch (err) {
            document.execCommand('copy');
            showMessage('Codice copiato!', 'success');
        }
    }
    
    // Funzioni di utilità
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    // Funzione per inizializzare la griglia divisa per decine
    function initNumbersGrid() {
        const grid = document.getElementById('extracted-numbers');
        grid.innerHTML = '';
        
        // Aggiungi header per decine
        for (let decade = 0; decade < 9; decade++) {
            const header = document.createElement('div');
            header.className = 'decade-header';
            header.textContent = `${decade}1-${decade+1}0`;
            if (decade === 8) header.textContent = '81-90';
            grid.appendChild(header);
            
            // Aggiungi celle per questa decade
            const start = decade * 10 + 1;
            const end = decade === 8 ? 90 : (decade + 1) * 10;
            
            for (let i = start; i <= end; i++) {
                const cell = document.createElement('div');
                cell.className = 'extracted-cell';
                cell.id = `number-${i}`;
                cell.textContent = i;
                grid.appendChild(cell);
            }
            
            // Aggiungi celle vuote se necessario per completare la riga
            if (decade === 8) {
                for (let i = 91; i <= 100; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'extracted-cell empty';
                    grid.appendChild(cell);
                }
            }
        }
    }
    
    // Aggiorna il display del numero estratto
    function updateExtractedNumberDisplay(number) {
        const display = document.getElementById('extracted-number');
        display.textContent = number;
        
        // Effetto animazione
        display.style.transform = 'scale(1.2)';
        setTimeout(() => {
            display.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Aggiorna la griglia con effetto lampeggiante per il nuovo numero
    function updateExtractedNumbersGridWithEffect(newNumber) {
        // Rimuovi tutte le classi "extracted" e "just-extracted"
        document.querySelectorAll('.extracted-cell').forEach(cell => {
            cell.classList.remove('extracted', 'just-extracted');
        });
        
        // Aggiungi la classe ai numeri estratti
        extractedNumbers.forEach(number => {
            const cell = document.getElementById(`number-${number}`);
            if (cell) {
                if (number === newNumber) {
                    // Per il numero appena estratto, aggiungi l'effetto lampeggiante
                    cell.classList.add('just-extracted');
                } else {
                    // Per i numeri estratti precedentemente, colore rosso fisso
                    cell.classList.add('extracted');
                }
            }
        });
        
        // Aggiorna il conteggio
        document.getElementById('extracted-count').textContent = extractedNumbers.length;
    }
    
    // Aggiorna la griglia normalmente (senza effetti speciali)
    function updateExtractedNumbersGrid() {
        // Rimuovi tutte le classi
        document.querySelectorAll('.extracted-cell').forEach(cell => {
            cell.classList.remove('extracted', 'just-extracted');
        });
        
        // Aggiungi la classe ai numeri estratti
        extractedNumbers.forEach(number => {
            const cell = document.getElementById(`number-${number}`);
            if (cell) {
                cell.classList.add('extracted');
            }
        });
        
        // Aggiorna il conteggio
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
            
            // Genera colore basato sull'ID
            const hash = player.id.split('').reduce((acc, char) => {
                return char.charCodeAt(0) + ((acc << 5) - acc);
            }, 0);
            const color = `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
            
            playerElement.innerHTML = `
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white;">
                    <i class="fas fa-user"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: bold;">${player.name}</div>
                    <div style="font-size: 0.8rem; color: #c9e4c5;">Cartelle: ${player.cardsCount}</div>
                </div>
                <div style="font-size: 0.9rem;">
                    <span style="color: #ffcc00;">${player.markedCount || 0}</span>/${15 * player.cardsCount}
                </div>
            `;
            
            playersList.appendChild(playerElement);
        });
    }
    
    // Pulizia
    window.addEventListener('beforeunload', function() {
        if (autoExtractInterval) clearInterval(autoExtractInterval);
    });
});
