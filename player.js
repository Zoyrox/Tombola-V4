// Giocatore Tombola Natalizia
document.addEventListener('DOMContentLoaded', function() {
    // Imposta anno corrente
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Socket.io
    let socket = io();
    let player = {
        name: '',
        roomCode: '',
        cardsCount: 1,
        cards: [],
        isConnected: false
    };
    
    let room = {
        name: '',
        players: [],
        lastNumber: null
    };
    
    // Elementi DOM
    const joinSection = document.getElementById('join-section');
    const gameSection = document.getElementById('game-section');
    const messageDiv = document.getElementById('message');
    const joinBtn = document.getElementById('join-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const checkWinnerBtn = document.getElementById('check-winner-btn');
    
    // Se c'è una stanza suggerita nel localStorage, precompila il campo
    const suggestedRoom = localStorage.getItem('suggestedRoom');
    if (suggestedRoom) {
        document.getElementById('room-code').value = suggestedRoom;
    }
    
    // Gestione eventi
    joinBtn.addEventListener('click', joinRoom);
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', leaveRoom);
    }
    checkWinnerBtn.addEventListener('click', checkWinner);
    
    // Join con Enter
    document.getElementById('room-code').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') joinRoom();
    });
    
    // Socket event handlers
    socket.on('joined-room', handleJoinedRoom);
    socket.on('join-error', handleJoinError);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('number-extracted', handleNumberExtracted);
    socket.on('player-won', handlePlayerWon);
    socket.on('player-cinquina', handlePlayerCinquina);
    socket.on('win-detected', handleWinDetected);
    socket.on('extraction-reset', handleExtractionReset);
    
    // Funzione per unirsi a una stanza
    async function joinRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
        const cardsCount = parseInt(document.getElementById('cards-count').value);
        
        // Validazione
        if (!playerName) {
            showMessage('Inserisci il tuo nome', 'error');
            return;
        }
        
        if (!roomCode || roomCode.length !== 6) {
            showMessage('Il codice stanza deve essere di 6 caratteri', 'error');
            return;
        }
        
        // Verifica se la stanza esiste
        try {
            const response = await fetch(`/api/room/${roomCode}`);
            const data = await response.json();
            
            if (!data.exists) {
                showMessage('Stanza non trovata', 'error');
                return;
            }
            
            if (data.players >= data.maxPlayers) {
                showMessage('Stanza piena', 'error');
                return;
            }
            
            // Unisciti alla stanza via socket
            socket.emit('join-room', {
                roomCode,
                playerName,
                cardsCount
            });
            
            player.name = playerName;
            player.roomCode = roomCode;
            player.cardsCount = cardsCount;
            
        } catch (error) {
            console.error('Join error:', error);
            showMessage('Errore di connessione al server', 'error');
        }
    }
    
    // Gestione join riuscito
    function handleJoinedRoom(data) {
        player.isConnected = true;
        room.name = data.roomName;
        room.players = data.players;
        room.lastNumber = data.lastNumber;
        
        // Salva le cartelle dal server
        player.cards = data.cards || [];
        
        // Mostra l'area di gioco
        joinSection.style.display = 'none';
        gameSection.style.display = 'block';
        if (leaveRoomBtn) {
            leaveRoomBtn.style.display = 'inline-block';
        }
        
        // Aggiorna le informazioni
        updateRoomInfo();
        
        // Genera le cartelle visuali
        generatePlayerCards();
        
        showMessage(`Benvenuto ${player.name}! Ti sei unito alla stanza ${player.roomCode}`, 'success');
    }
    
    // Gestione errore join
    function handleJoinError(error) {
        showMessage(error, 'error');
    }
    
    // Funzione per lasciare la stanza
    function leaveRoom() {
        if (confirm('Sei sicuro di voler lasciare la stanza?')) {
            socket.emit('leave-room', player.roomCode);
            
            player.isConnected = false;
            room = {
                name: '',
                players: [],
                lastNumber: null
            };
            
            gameSection.style.display = 'none';
            joinSection.style.display = 'block';
            if (leaveRoomBtn) {
                leaveRoomBtn.style.display = 'none';
            }
            
            showMessage('Hai lasciato la stanza', 'info');
        }
    }
    
    // Gestione nuovo giocatore
    function handlePlayerJoined(data) {
        room.players.push({
            id: data.id,
            name: data.name,
            cardsCount: data.cardsCount,
            markedCount: 0
        });
        
        updateRoomInfo();
    }
    
    // Gestione giocatore uscito
    function handlePlayerLeft(data) {
        room.players = room.players.filter(p => p.id !== data.playerId);
        updateRoomInfo();
    }
    
    // Gestione numero estratto
    function handleNumberExtracted(data) {
        room.lastNumber = data.number;
        
        // Aggiorna il numero visualizzato
        const numberDisplay = document.getElementById('last-number-display');
        numberDisplay.textContent = data.number;
        
        // Effetto visivo per il nuovo numero
        numberDisplay.style.animation = 'pulse 1s';
        setTimeout(() => {
            numberDisplay.style.animation = '';
        }, 1000);
        
        // Aggiorna le cartelle - i numeri vengono segnati automaticamente dal server
        // Qui aggiorniamo solo la visualizzazione
        updateAllCardsDisplay();
        
        showMessage(`Numero ${data.number} estratto!`, 'info');
    }
    
    // Gestione reset estrazione
    function handleExtractionReset() {
        room.lastNumber = null;
        
        // Reset cartelle
        player.cards.forEach(card => {
            card.numbers.forEach(num => num.marked = false);
        });
        
        updateRoomInfo();
        generatePlayerCards(); // Rigenera le cartelle visive
        showMessage('Estrazione resettata dall\'amministratore', 'info');
    }
    
    // Gestione vincita di un giocatore
    function handlePlayerWon(data) {
        if (data.playerName === player.name) {
            showMessage(`🎉 COMPLIMENTI! HAI FATTO TOMBOLA! Cartella ${data.cardIndex + 1} completata! 🎉`, 'success');
            
            // Evidenzia la cartella vincente
            const cardElement = document.querySelector(`#card-${data.cardIndex}`).closest('.tombola-card');
            if (cardElement) {
                cardElement.classList.add('card-complete');
                cardElement.style.animation = 'pulse 1s infinite';
                setTimeout(() => {
                    cardElement.style.animation = '';
                }, 5000);
            }
        } else {
            showMessage(`🎉 ${data.playerName} HA FATTO TOMBOLA! 🎉`, 'success');
        }
    }
    
    // Gestione cinquina di altri giocatori
    function handlePlayerCinquina(data) {
        if (data.playerName !== player.name) {
            showMessage(`🎉 ${data.playerName} ha fatto CINQUINA!`, 'info');
        }
    }
    
    // Gestione rilevamento vincite
    function handleWinDetected(data) {
        const winMessages = {
            'ambo': 'Ambo! 2 numeri su una riga!',
            'terna': 'Terna! 3 numeri su una riga!',
            'quaterna': 'Quaterna! 4 numeri su una riga!',
            'cinquina': 'CINQUINA! Riga completata!'
        };
        
        if (winMessages[data.type]) {
            const message = data.type === 'cinquina' && data.playerName === player.name 
                ? `🎉 HAI FATTO ${winMessages[data.type].toUpperCase()}!` 
                : `🎉 ${winMessages[data.type]}`;
            
            showMessage(message, 'success');
            
            // Evidenzia la riga vincente
            highlightWinningRow(data.cardIndex, data.row, data.type);
        }
    }
    
    // Funzione per evidenziare la riga vincente
    function highlightWinningRow(cardIndex, rowIndex, winType) {
        const grid = document.getElementById(`card-${cardIndex}`);
        if (!grid) return;
        
        const cells = grid.querySelectorAll('.sheet-cell');
        const startIndex = rowIndex * 9;
        
        for (let i = startIndex; i < startIndex + 9; i++) {
            if (cells[i] && !cells[i].classList.contains('empty')) {
                // Aggiungi classe in base al tipo di vincita
                cells[i].classList.add(`win-${winType}`);
                cells[i].style.animation = 'winning-pulse 2s';
                
                // Rimuovi dopo 3 secondi
                setTimeout(() => {
                    cells[i].classList.remove(`win-${winType}`);
                    cells[i].style.animation = '';
                }, 3000);
            }
        }
    }
    
    // Funzione per controllare vincita
    function checkWinner() {
        if (!player.isConnected) {
            showMessage('Non sei connesso a una stanza', 'error');
            return;
        }
        
        let totalMarked = 0;
        const wins = {
            ambo: [],
            terna: [],
            quaterna: [],
            cinquina: [],
            tombola: []
        };
        
        player.cards.forEach((card, cardIndex) => {
            // Controlla tombola
            const cardMarked = card.numbers.filter(num => num.marked).length;
            totalMarked += cardMarked;
            
            if (cardMarked === 15) {
                wins.tombola.push(cardIndex + 1);
            }
            
            // Controlla vincite per riga
            if (card.rows) {
                card.rows.forEach((row, rowIndex) => {
                    const markedInRow = row.filter(cell => cell && cell.marked).length;
                    
                    if (markedInRow >= 2) {
                        if (markedInRow === 2) wins.ambo.push({card: cardIndex + 1, row: rowIndex + 1});
                        if (markedInRow === 3) wins.terna.push({card: cardIndex + 1, row: rowIndex + 1});
                        if (markedInRow === 4) wins.quaterna.push({card: cardIndex + 1, row: rowIndex + 1});
                        if (markedInRow === 5) wins.cinquina.push({card: cardIndex + 1, row: rowIndex + 1});
                    }
                });
            }
        });
        
        // Costruisci messaggio
        let message = '';
        
        if (wins.tombola.length > 0) {
            message += `🎉 TOMBOLA! Cartelle: ${wins.tombola.join(', ')}\n`;
        }
        
        if (wins.cinquina.length > 0) {
            message += `🎯 Cinquina: ${wins.cinquina.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
        }
        
        if (wins.quaterna.length > 0) {
            message += `⭐ Quaterna: ${wins.quaterna.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
        }
        
        if (wins.terna.length > 0) {
            message += `🔶 Terna: ${wins.terna.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
        }
        
        if (wins.ambo.length > 0) {
            message += `🔹 Ambo: ${wins.ambo.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
        }
        
        if (message) {
            showMessage(message, 'success');
        } else {
            showMessage(`Hai segnato ${totalMarked} numeri su ${15 * player.cardsCount}`, 'info');
        }
    }
    
    // Funzione per generare le cartelle visuali
    function generatePlayerCards() {
        const container = document.getElementById('tombola-cards-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!player.cards || player.cards.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #c9e4c5; padding: 20px;">Caricamento cartelle...</p>';
            return;
        }
        
        player.cards.forEach((card, cardIndex) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'tombola-card';
            cardElement.innerHTML = `
                <h3><i class="fas fa-table"></i> Cartella ${cardIndex + 1}</h3>
                <div class="tombola-sheet" id="card-${cardIndex}">
                    <!-- La griglia verrà popolata da initCardGrid -->
                </div>
                <div class="row-counters" id="row-counters-${cardIndex}">
                    <!-- I contatori per riga verranno aggiunti qui -->
                </div>
                <div style="margin-top: 15px; text-align: center;">
                    <span style="color: #c9e4c5;">Numeri segnati: </span>
                    <span id="card-${cardIndex}-count" style="color: #ffcc00; font-weight: bold;">0</span>/15
                </div>
            `;
            
            container.appendChild(cardElement);
            initCardGrid(cardIndex);
        });
    }
    
    // Funzione per inizializzare la griglia di una cartella
    function initCardGrid(cardIndex) {
        const grid = document.getElementById(`card-${cardIndex}`);
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (!player.cards[cardIndex] || !player.cards[cardIndex].rows) {
            grid.innerHTML = '<div style="grid-column: span 9; text-align: center; color: #c9e4c5;">Errore nel caricamento</div>';
            return;
        }
        
        const cardData = player.cards[cardIndex];
        
        // Crea la griglia 3x9
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = 'sheet-cell';
                
                const cellData = cardData.rows[row][col];
                if (cellData) {
                    cell.textContent = cellData.number;
                    cell.id = `card-${cardIndex}-num-${cellData.number}`;
                    
                    if (cellData.marked) {
                        cell.classList.add('marked');
                    }
                } else {
                    cell.classList.add('empty');
                    cell.textContent = '';
                }
                
                grid.appendChild(cell);
            }
        }
        
        // Aggiungi contatori per riga
        addRowCounters(cardIndex);
        updateCardCount(cardIndex);
    }
    
    // Funzione per aggiungere i contatori per riga
    function addRowCounters(cardIndex) {
        const countersContainer = document.getElementById(`row-counters-${cardIndex}`);
        if (!countersContainer) return;
        
        countersContainer.innerHTML = '';
        
        for (let row = 0; row < 3; row++) {
            const counter = document.createElement('div');
            counter.className = 'row-counter-item';
            counter.innerHTML = `
                <div class="row-counter-label">Riga ${row + 1}</div>
                <div id="card-${cardIndex}-row-${row}" class="row-counter-value">0</div>
                <div class="row-counter-max">/5</div>
            `;
            countersContainer.appendChild(counter);
        }
    }
    
    // Aggiorna tutti i display delle cartelle
    function updateAllCardsDisplay() {
        if (!player.cards) return;
        
        player.cards.forEach((card, cardIndex) => {
            updateCardCount(cardIndex);
        });
    }
    
    // Aggiorna il conteggio per una cartella
    function updateCardCount(cardIndex) {
        if (!player.cards[cardIndex]) return;
        
        const cardData = player.cards[cardIndex];
        let totalMarked = 0;
        const rowCounts = [0, 0, 0];
        
        // Aggiorna visualizzazione celle e conta
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cellData = cardData.rows[row][col];
                if (cellData) {
                    const cell = document.getElementById(`card-${cardIndex}-num-${cellData.number}`);
                    if (cell) {
                        if (cellData.marked && !cell.classList.contains('marked')) {
                            cell.classList.add('marked');
                        } else if (!cellData.marked && cell.classList.contains('marked')) {
                            cell.classList.remove('marked');
                        }
                    }
                    
                    if (cellData.marked) {
                        totalMarked++;
                        rowCounts[row]++;
                    }
                }
            }
        }
        
        // Aggiorna contatori
        for (let row = 0; row < 3; row++) {
            const rowCounter = document.getElementById(`card-${cardIndex}-row-${row}`);
            if (rowCounter) {
                rowCounter.textContent = rowCounts[row];
                if (rowCounts[row] === 5) {
                    rowCounter.style.color = '#ff9900';
                    rowCounter.style.fontWeight = 'bold';
                } else {
                    rowCounter.style.color = '#ffcc00';
                    rowCounter.style.fontWeight = 'normal';
                }
            }
        }
        
        const countElement = document.getElementById(`card-${cardIndex}-count`);
        if (countElement) {
            countElement.textContent = totalMarked;
            if (totalMarked === 15) {
                countElement.style.color = '#ff0000';
                countElement.style.fontWeight = 'bold';
            } else {
                countElement.style.color = '#ffcc00';
                countElement.style.fontWeight = 'normal';
            }
        }
    }
    
    // Funzione per aggiornare le informazioni della stanza
    function updateRoomInfo() {
        const roomNameDisplay = document.getElementById('room-name-display');
        const roomCodeDisplay = document.getElementById('room-code-display');
        const playerNameDisplay = document.getElementById('player-name-display');
        const roomPlayersDisplay = document.getElementById('room-players');
        const lastNumberDisplay = document.getElementById('last-number-display');
        
        if (roomNameDisplay) roomNameDisplay.textContent = room.name;
        if (roomCodeDisplay) roomCodeDisplay.textContent = player.roomCode;
        if (playerNameDisplay) playerNameDisplay.textContent = player.name;
        if (roomPlayersDisplay) roomPlayersDisplay.textContent = room.players.length;
        if (lastNumberDisplay) lastNumberDisplay.textContent = room.lastNumber || '--';
    }
    
    // Funzione per mostrare messaggi
    function showMessage(text, type) {
        if (!messageDiv) return;
        
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        // Scrolla il messaggio in vista
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    // Aggiungi stili CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        @keyframes winning-pulse {
            0%, 100% { 
                box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7);
                background: #009933;
            }
            50% { 
                box-shadow: 0 0 15px rgba(255, 204, 0, 0.9);
                background: #ffcc00;
                color: #000;
            }
        }
        
        .win-ambo { background: #4ecdc4 !important; }
        .win-terna { background: #ff6b6b !important; }
        .win-quaterna { background: #ffe66d !important; color: #000 !important; }
        .win-cinquina { background: #ff9900 !important; }
        
        .card-complete {
            border: 3px solid #ff0000 !important;
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.5) !important;
            position: relative;
        }
        
        .card-complete::before {
            content: '🎉 TOMBOLA!';
            position: absolute;
            top: -12px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff0000;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.8rem;
            font-weight: bold;
            z-index: 10;
        }
    `;
    document.head.appendChild(style);
});
