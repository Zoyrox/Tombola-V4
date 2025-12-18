// Admin Tombola Natalizia
document.addEventListener('DOMContentLoaded', function() {
    // Controlla se l'utente è autenticato
    const adminToken = localStorage.getItem('adminToken');
    const adminContent = document.getElementById('admin-content');
    const accessDenied = document.getElementById('access-denied');
    
    if (!adminToken) {
        accessDenied.style.display = 'block';
        adminContent.style.display = 'none';
        return;
    }
    
    // Se autenticato, mostra il pannello
    adminContent.style.display = 'block';
    
    // Imposta anno corrente
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Socket.io
    let socket = io();
    let currentRoom = null;
    let extractedNumbers = [];
    let lastExtractedNumber = null;
    let autoExtractInterval = null;
    let players = [];
    let winHistory = [];
    
    // Elementi DOM
    const logoutBtn = document.getElementById('logout-btn');
    const messageDiv = document.getElementById('message');
    const createRoomBtn = document.getElementById('create-room-btn');
    const extractBtn = document.getElementById('extract-btn');
    const resetExtractionBtn = document.getElementById('reset-extraction-btn');
    const autoExtractBtn = document.getElementById('auto-extract-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    
    // Inizializza la griglia semplice dei numeri
    initSimpleNumbersGrid();
    
    // Gestione logout
    logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('adminToken');
        window.location.href = 'admin-login.html';
    });
    
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
    socket.on('extraction-reset-admin', handleExtractionReset);
    socket.on('admin-room-data', handleAdminRoomData);
    socket.on('extraction-error', handleExtractionError);
    socket.on('win-detected', handleWinDetected);
    socket.on('player-won', handlePlayerWon);
    socket.on('shared-win', handleSharedWin);
    socket.on('game-finished', handleGameFinished);

    function handleWinDetected(data) {
        winHistory.push({
            ...data,
            timestamp: new Date().toISOString()
        });
        updateWinHistory();
        
        // Notifica admin
        const winMessages = {
            'ambo': 'Ambo',
            'terna': 'Terna',
            'quaterna': 'Quaterna',
            'cinquina': 'Cinquina',
            'tombola': 'TOMBOLA'
        };
        
        showMessage(`${data.playerName} ha fatto ${winMessages[data.type]}!`, 'success');
    }
        
    function handlePlayerWon(data) {
        winHistory.push({
            ...data,
            timestamp: new Date().toISOString()
        });
        updateWinHistory();
        
        showMessage(`🎉 ${data.playerName} HA FATTO TOMBOLA! 🎉`, 'success');
    }
    
    function handleSharedWin(data) {
        winHistory.push({
            ...data,
            timestamp: new Date().toISOString(),
            shared: true
        });
        updateWinHistory();
        
        showMessage(data.message, 'success');
    }
    
    function handleGameFinished(data) {
        showMessage(data.message, 'success');
        
        // Disabilita il pulsante di estrazione
        const extractBtn = document.getElementById('extract-btn');
        if (extractBtn) {
            extractBtn.disabled = true;
            extractBtn.textContent = 'Gioco Terminato';
        }
        
        // Ferma l'estrazione automatica se attiva
        if (autoExtractInterval) {
            clearInterval(autoExtractInterval);
            autoExtractInterval = null;
            autoExtractBtn.innerHTML = '<i class="fas fa-play"></i> Auto Estrazione (5s)';
        }
    }
    
    // Funzione per aggiornare storico vincite
    function updateWinHistory() {
        const winsContainer = document.getElementById('wins-history');
        if (!winsContainer) return;
        
        if (winHistory.length === 0) {
            winsContainer.innerHTML = '<p style="color: #c9e4c5; text-align: center; font-style: italic;">Ancora nessuna vincita...</p>';
            return;
        }
        
        // Ordina per timestamp (più recenti prima)
        const sortedWins = [...winHistory].sort((a, b) => {
            return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
        });
        
        winsContainer.innerHTML = '';
        
        sortedWins.slice(0, 15).forEach(win => {
            const winItem = document.createElement('div');
            winItem.style.padding = '10px';
            winItem.style.marginBottom = '8px';
            winItem.style.background = 'rgba(255,255,255,0.05)';
            winItem.style.borderRadius = '6px';
            winItem.style.borderLeft = '4px solid';
            
            // Colore in base al tipo di vincita
            const borderColors = {
                'tombola': '#ff0000',
                'cinquina': '#ff9900',
                'quaterna': '#ffe66d',
                'terna': '#ff6b6b',
                'ambo': '#4ecdc4'
            };
            
            winItem.style.borderLeftColor = borderColors[win.type] || '#ffcc00';
            
            const time = win.timestamp ? new Date(win.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ora';
            
            let winText = '';
            if (win.shared) {
                winText = `<strong style="color: #ffcc00;">${win.playerName}</strong> hanno fatto <span style="color: ${borderColors[win.type]}; font-weight: bold;">${win.type.toUpperCase()}</span> insieme!`;
            } else if (win.type === 'tombola') {
                winText = `<strong style="color: #ffcc00;">${win.playerName}</strong> ha fatto <span style="color: #ff0000; font-weight: bold;">TOMBOLA</span>!`;
            } else {
                winText = `<strong style="color: #ffcc00;">${win.playerName}</strong> ha fatto <span style="color: ${borderColors[win.type]}; font-weight: bold;">${win.type.toUpperCase()}</span>`;
                if (win.cardIndex !== undefined && win.rowIndex !== undefined) {
                    winText += ` (Cartella ${win.cardIndex + 1}, Riga ${win.rowIndex + 1})`;
                }
            }
            
            winItem.innerHTML = `
                <div style="font-size: 0.8rem; color: #c9e4c5; margin-bottom: 2px;">${time}</div>
                <div>${winText}</div>
            `;
            
            winsContainer.appendChild(winItem);
        });
    }
    
    // Aggiungi anche al handleAdminRoomData:
    function handleAdminRoomData(data) {
        players = data.players || [];
        extractedNumbers = data.extractedNumbers || [];
        lastExtractedNumber = data.lastNumber;
        winHistory = data.winHistory || [];
        
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        updatePlayersList();
        updateWinHistory();
        
        if (data.lastNumber) {
            updateExtractedNumberDisplay(data.lastNumber);
        }
    }
    
    // Aggiungi al handleExtractionReset:
    function handleExtractionReset() {
        extractedNumbers = [];
        lastExtractedNumber = null;
        winHistory = [];
        
        updateExtractedNumberDisplay('--');
        updateExtractedNumbersGrid();
        updateExtractionProgress();
        updateWinHistory();
        showMessage('Estrazione resettata', 'info');
    }
    
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
        
        socket.emit('extract-number', currentRoom.roomCode);
    }
    
    // Gestione errore estrazione
    function handleExtractionError(error) {
        showMessage(error, 'error');
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
        // Crea un div per il messaggio se non esiste
        let msgDiv = messageDiv;
        if (!msgDiv) {
            msgDiv = document.createElement('div');
            msgDiv.id = 'message';
            document.querySelector('.container').insertBefore(msgDiv, document.getElementById('admin-panel'));
        }
        
        msgDiv.textContent = text;
        msgDiv.className = `message ${type}`;
        msgDiv.style.display = 'block';
        
        setTimeout(() => {
            msgDiv.style.display = 'none';
        }, 5000);
    }
    
    // Funzione per inizializzare la griglia semplice
    function initSimpleNumbersGrid() {
        const grid = document.getElementById('extracted-numbers');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        for (let i = 1; i <= 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'simple-cell';
            cell.id = `number-${i}`;
            cell.textContent = i;
            grid.appendChild(cell);
        }
    }
    
    // Aggiorna il display del numero estratto
    function updateExtractedNumberDisplay(number) {
        const display = document.getElementById('extracted-number');
        if (!display) return;
        
        display.textContent = number;
        
        // Effetto animazione
        display.style.transform = 'scale(1.2)';
        setTimeout(() => {
            display.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Aggiorna la griglia con effetto lampeggiante per il nuovo numero
    function updateExtractedNumbersGridWithEffect(newNumber) {
        // Aggiorna tutte le celle
        for (let i = 1; i <= 90; i++) {
            const cell = document.getElementById(`number-${i}`);
            if (cell) {
                cell.classList.remove('extracted', 'just-extracted');
                
                if (extractedNumbers.includes(i)) {
                    if (i === newNumber) {
                        // Per il numero appena estratto, aggiungi l'effetto lampeggiante
                        cell.classList.add('just-extracted');
                    } else {
                        // Per i numeri estratti precedentemente, colore rosso fisso
                        cell.classList.add('extracted');
                    }
                }
            }
        }
        
        // Aggiorna il conteggio
        const countElement = document.getElementById('extracted-count');
        if (countElement) {
            countElement.textContent = extractedNumbers.length;
        }
    }
    
    // Aggiorna la griglia normalmente (senza effetti speciali)
    function updateExtractedNumbersGrid() {
        // Aggiorna tutte le celle
        for (let i = 1; i <= 90; i++) {
            const cell = document.getElementById(`number-${i}`);
            if (cell) {
                cell.classList.remove('extracted', 'just-extracted');
                
                if (extractedNumbers.includes(i)) {
                    cell.classList.add('extracted');
                }
            }
        }
        
        // Aggiorna il conteggio
        const countElement = document.getElementById('extracted-count');
        if (countElement) {
            countElement.textContent = extractedNumbers.length;
        }
    }
    
    function updateExtractionProgress() {
        const progressBar = document.getElementById('extraction-progress');
        if (!progressBar) return;
        
        const progress = (extractedNumbers.length / 90) * 100;
        progressBar.style.width = `${progress}%`;
    }
    
    function updatePlayersList() {
        const playersList = document.getElementById('players-list');
        const countElement = document.getElementById('players-count');
        const totalElement = document.getElementById('players-total');
        
        if (!playersList) return;
        
        if (players.length === 0) {
            playersList.innerHTML = '<p style="color: #c9e4c5; text-align: center;">Nessun giocatore connesso</p>';
            if (countElement) countElement.textContent = '0';
            if (totalElement) totalElement.textContent = '0';
            return;
        }
        
        playersList.innerHTML = '';
        if (countElement) countElement.textContent = players.length;
        if (totalElement) totalElement.textContent = players.length;
        
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.style.padding = '12px';
            playerElement.style.marginBottom = '10px';
            playerElement.style.background = 'rgba(255,255,255,0.05)';
            playerElement.style.borderRadius = '8px';
            playerElement.style.display = 'flex';
            playerElement.style.alignItems = 'center';
            playerElement.style.gap = '12px';
            
            // Calcola percentuale
            const totalNumbers = 15 * player.cardsCount;
            const percentage = player.markedCount ? Math.round((player.markedCount / totalNumbers) * 100) : 0;
            
            // Determina stato
            let status = '';
            if (player.markedCount >= 2) {
                status = '<div style="font-size: 0.8rem; color: #4ecdc4;"><i class="fas fa-gamepad"></i> In gioco</div>';
            }
            if (player.markedCount === totalNumbers) {
                status = '<div style="font-size: 0.8rem; color: #ff0000; font-weight: bold;"><i class="fas fa-crown"></i> TOMBOLA!</div>';
            } else if (player.markedCount >= 10) {
                status = '<div style="font-size: 0.8rem; color: #ff9900;"><i class="fas fa-fire"></i> In vantaggio</div>';
            }
            
            playerElement.innerHTML = `
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #4ecdc4); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.2rem;">
                    <i class="fas fa-user"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 1.1rem;">${player.name}</div>
                    <div style="font-size: 0.9rem; color: #c9e4c5;">
                        <i class="fas fa-table"></i> ${player.cardsCount} cartella${player.cardsCount > 1 ? 'e' : ''}
                    </div>
                    ${status}
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.2rem; font-weight: bold; color: #ffcc00;">${player.markedCount || 0}</div>
                    <div style="font-size: 0.8rem; color: #c9e4c5;">${percentage}%</div>
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
