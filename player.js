// Giocatore Tombola Natalizia - Versione corretta per cartelle 3x9
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
    socket.on('extraction-reset', handleExtractionReset);
    socket.on('mark-error', handleMarkError);
    socket.on('win-detected', handleWinDetected);
    socket.on('player-cinquina', handlePlayerCinquina);
    
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
        
        // Genera le cartelle visuali (ora correttamente)
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
        
        // Verifica se il numero è nelle tue cartelle
        player.cards.forEach((card, cardIndex) => {
            const numberObj = card.find(num => num.number === data.number);
            if (numberObj && !numberObj.marked) {
                // Segna automaticamente il numero
                numberObj.marked = true;
                
                // Aggiorna la visualizzazione della cartella
                const cell = document.getElementById(`card-${cardIndex}-num-${numberObj.number}`);
                if (cell) {
                    cell.classList.add('marked');
                    cell.style.animation = 'pulse 0.5s';
                    setTimeout(() => {
                        cell.style.animation = '';
                    }, 500);
                }
                
                // Aggiorna il conteggio
                updateCardCount(cardIndex);
            }
        });
        
        showMessage(`Numero ${data.number} estratto!`, 'info');
    }
    
    // Gestione reset estrazione
    function handleExtractionReset() {
        room.lastNumber = null;
        
        // Reset cartelle
        player.cards.forEach(card => {
            card.forEach(num => num.marked = false);
        });
        
        updateRoomInfo();
        generatePlayerCards(); // Rigenera le cartelle visive
        showMessage('Estrazione resettata dall\'amministratore', 'info');
    }
    
    // Funzione per controllare vincita
    function checkWinner() {
        if (!player.isConnected) {
            showMessage('Non sei connesso a una stanza', 'error');
            return;
        }
        
        let totalMarked = 0;
        let winningCards = [];
        
        player.cards.forEach((card, index) => {
            const markedInCard = card.filter(num => num.marked).length;
            totalMarked += markedInCard;
            
            if (markedInCard === 15) {
                winningCards.push(index + 1);
            }
        });
        
        const totalNumbers = 15 * player.cardsCount;
        
        if (winningCards.length > 0) {
            showMessage(`🎉 COMPLIMENTI! Hai completato la cartella ${winningCards.join(', ')}! HAI VINTO! 🎉`, 'success');
            
            // Effetto speciale
            document.getElementById('game-section').style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                document.getElementById('game-section').style.animation = '';
            }, 5000);
        } else {
            showMessage(`Hai segnato ${totalMarked} numeri su ${totalNumbers}. Continua così!`, 'info');
        }
    }
    
    // Gestione vincita di un giocatore
    function handlePlayerWon(data) {
        if (data.playerName === player.name) {
            showMessage(`🎉 COMPLIMENTI! Hai completato la cartella ${data.cardIndex + 1}! HAI VINTO! 🎉`, 'success');
            
            document.getElementById('game-section').style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                document.getElementById('game-section').style.animation = '';
            }, 5000);
        } else {
            showMessage(`🎉 ${data.playerName} HA VINTO completando una cartella! 🎉`, 'success');
        }
    }
    
    // Gestione errore segnatura
    function handleMarkError(error) {
        showMessage(error, 'error');
    }
    
    // Funzione per generare le cartelle visuali CORRETTE (griglia 3x9)
    function generatePlayerCards() {
        const container = document.getElementById('tombola-cards-container');
        container.innerHTML = '';
        
        if (!player.cards || player.cards.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #c9e4c5;">Caricamento cartelle...</p>';
            return;
        }
        
        player.cards.forEach((card, cardIndex) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'tombola-card';
            cardElement.innerHTML = `
                <h3><i class="fas fa-table"></i> Cartella ${cardIndex + 1}</h3>
                <div class="tombola-sheet" id="card-${cardIndex}">
                    <!-- I numeri della cartella appariranno qui in griglia 3x9 -->
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
    
    // Funzione per inizializzare la griglia 3x9 di una cartella CORRETTAMENTE
    function initCardGrid(cardIndex) {
        const grid = document.getElementById(`card-${cardIndex}`);
        grid.innerHTML = '';
        
        if (!player.cards[cardIndex]) return;
        
        // Creiamo una griglia 3x9 vuota
        const gridCells = Array(3).fill().map(() => Array(9).fill(null));
        
        // Per ogni numero nella cartella, troviamo la sua colonna corretta
        player.cards[cardIndex].forEach(numObj => {
            const num = numObj.number;
            let column;
            
            // Determina la colonna in base al range del numero
            if (num <= 9) column = 0;
            else if (num <= 19) column = 1;
            else if (num <= 29) column = 2;
            else if (num <= 39) column = 3;
            else if (num <= 49) column = 4;
            else if (num <= 59) column = 5;
            else if (num <= 69) column = 6;
            else if (num <= 79) column = 7;
            else column = 8; // 80-90
            
            // Trova la prima riga vuota in questa colonna
            for (let row = 0; row < 3; row++) {
                if (gridCells[row][column] === null) {
                    gridCells[row][column] = {
                        number: num,
                        marked: numObj.marked
                    };
                    break;
                }
            }
        });
        
        // Ora creiamo la griglia HTML
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = 'sheet-cell';
                
                const cellData = gridCells[row][col];
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
        
        updateCardCount(cardIndex);
    }
    
    // Funzione per aggiornare il conteggio
    function updateCardCount(cardIndex) {
        if (!player.cards[cardIndex]) return;
        
        const markedCount = player.cards[cardIndex].filter(num => num.marked).length;
        const countElement = document.getElementById(`card-${cardIndex}-count`);
        if (countElement) {
            countElement.textContent = markedCount;
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
        
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    // Aggiungi stili per l'animazione
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { 
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7);
            }
            50% { 
                transform: scale(1.1);
                box-shadow: 0 0 20px rgba(255, 204, 0, 0.9);
            }
            100% { 
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 204, 0, 0);
            }
        }
    `;
    document.head.appendChild(style);
});


// Aggiungi queste funzioni al player.js:

// Gestione rilevamento vincite
function handleWinDetected(data) {
    const winMessages = {
        'ambo': 'Ambo! Hai fatto 2 numeri su una riga!',
        'terna': 'Terna! Hai fatto 3 numeri su una riga!',
        'quaterna': 'Quaterna! Hai fatto 4 numeri su una riga!',
        'cinquina': 'Cinquina! Hai completato una riga intera!'
    };
    
    if (winMessages[data.type]) {
        showMessage(`🎉 ${winMessages[data.type]}`, 'success');
        
        // Effetto visivo sulla riga vincente
        highlightWinningRow(data.cardIndex, data.row);
    }
}

// Gestione cinquina di altri giocatori
function handlePlayerCinquina(data) {
    if (data.playerName !== player.name) {
        showMessage(`🎉 ${data.playerName} ha fatto CINQUINA nella cartella ${data.cardIndex + 1}!`, 'info');
    }
}

// Funzione per evidenziare la riga vincente
function highlightWinningRow(cardIndex, rowIndex) {
    const grid = document.getElementById(`card-${cardIndex}`);
    if (!grid) return;
    
    const cells = grid.querySelectorAll('.sheet-cell');
    // Ogni riga ha 9 celle, quindi:
    const startIndex = rowIndex * 9;
    const endIndex = startIndex + 9;
    
    for (let i = startIndex; i < endIndex; i++) {
        if (cells[i] && !cells[i].classList.contains('empty')) {
            cells[i].style.animation = 'winning-pulse 2s';
            setTimeout(() => {
                if (cells[i]) cells[i].style.animation = '';
            }, 2000);
        }
    }
}

// Modifica la funzione initCardGrid per gestire la griglia 3x9 correttamente:
function initCardGrid(cardIndex) {
    const grid = document.getElementById(`card-${cardIndex}`);
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (!player.cards[cardIndex] || !player.cards[cardIndex].rows) {
        grid.innerHTML = '<div style="grid-column: span 9; text-align: center; color: #c9e4c5;">Caricamento...</div>';
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
                cell.dataset.row = row;
                cell.dataset.col = col;
                
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
    const cardElement = document.querySelector(`#card-${cardIndex}`).closest('.tombola-card');
    if (!cardElement) return;
    
    // Rimuovi contatori esistenti
    const existingCounters = cardElement.querySelectorAll('.row-counter');
    existingCounters.forEach(counter => counter.remove());
    
    // Crea contatori per ogni riga
    const rowCounters = document.createElement('div');
    rowCounters.style.display = 'flex';
    rowCounters.style.justifyContent = 'space-around';
    rowCounters.style.marginTop = '10px';
    rowCounters.style.padding = '0 20px';
    
    for (let row = 0; row < 3; row++) {
        const counter = document.createElement('div');
        counter.className = 'row-counter';
        counter.innerHTML = `
            <div style="text-align: center;">
                <div style="color: #c9e4c5; font-size: 0.8rem;">Riga ${row + 1}</div>
                <div id="card-${cardIndex}-row-${row}-count" style="color: #ffcc00; font-weight: bold; font-size: 1.2rem;">0</div>
                <div style="color: #c9e4c5; font-size: 0.7rem;">/5</div>
            </div>
        `;
        rowCounters.appendChild(counter);
    }
    
    cardElement.querySelector('.tombola-sheet').insertAdjacentElement('afterend', rowCounters);
}

// Aggiorna la funzione updateCardCount per contare anche per riga
function updateCardCount(cardIndex) {
    if (!player.cards[cardIndex]) return;
    
    const cardData = player.cards[cardIndex];
    let totalMarked = 0;
    const rowCounts = [0, 0, 0];
    
    // Conta numeri segnati totali e per riga
    cardData.rows.forEach((row, rowIndex) => {
        const markedInRow = row.filter(cell => cell && cell.marked).length;
        rowCounts[rowIndex] = markedInRow;
        totalMarked += markedInRow;
        
        // Aggiorna contatore riga
        const rowCounter = document.getElementById(`card-${cardIndex}-row-${rowIndex}-count`);
        if (rowCounter) {
            rowCounter.textContent = markedInRow;
            
            // Evidenzia se la riga è completa (cinquina)
            if (markedInRow === 5) {
                rowCounter.style.color = '#ff0000';
                rowCounter.style.fontWeight = 'bold';
                rowCounter.innerHTML = `<span style="color: #ff0000;">${markedInRow} ✓</span>`;
            }
        }
    });
    
    // Aggiorna contatore totale
    const countElement = document.getElementById(`card-${cardIndex}-count`);
    if (countElement) {
        countElement.textContent = totalMarked;
        
        // Evidenzia se tombola (tutti i 15 numeri)
        if (totalMarked === 15) {
            countElement.style.color = '#ff0000';
            countElement.style.fontWeight = 'bold';
            countElement.innerHTML = `<span style="color: #ff0000;">${totalMarked} 🎉 TOMBOLA!</span>`;
        }
    }
}

// Modifica la funzione checkWinner per mostrare tutte le vincite
function checkWinner() {
    if (!player.isConnected) {
        showMessage('Non sei connesso a una stanza', 'error');
        return;
    }
    
    let totalMarked = 0;
    let winningCards = [];
    let winningRows = {
        ambo: [],
        terna: [],
        quaterna: [],
        cinquina: [],
        tombola: []
    };
    
    player.cards.forEach((card, cardIndex) => {
        const cardData = player.cards[cardIndex];
        if (!cardData || !cardData.rows) return;
        
        let cardMarked = 0;
        
        // Controlla ogni riga
        cardData.rows.forEach((row, rowIndex) => {
            const markedInRow = row.filter(cell => cell && cell.marked).length;
            cardMarked += markedInRow;
            
            // Rileva le vincite per riga
            if (markedInRow >= 2) {
                if (markedInRow === 2) {
                    winningRows.ambo.push({ card: cardIndex + 1, row: rowIndex + 1 });
                }
                if (markedInRow === 3) {
                    winningRows.terna.push({ card: cardIndex + 1, row: rowIndex + 1 });
                }
                if (markedInRow === 4) {
                    winningRows.quaterna.push({ card: cardIndex + 1, row: rowIndex + 1 });
                }
                if (markedInRow === 5) {
                    winningRows.cinquina.push({ card: cardIndex + 1, row: rowIndex + 1 });
                }
            }
        });
        
        totalMarked += cardMarked;
        
        // Controlla tombola (tutta la cartella)
        if (cardMarked === 15) {
            winningRows.tombola.push(cardIndex + 1);
            winningCards.push(cardIndex + 1);
        }
    });
    
    const totalNumbers = 15 * player.cardsCount;
    
    // Crea messaggio con tutte le vincite
    let winMessage = '';
    
    if (winningRows.tombola.length > 0) {
        winMessage += `🎉 TOMBOLA! Hai completato le cartelle: ${winningRows.tombola.join(', ')}!\n`;
    }
    
    if (winningRows.cinquina.length > 0) {
        winMessage += `🎯 Cinquina nelle cartelle: ${winningRows.cinquina.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
    }
    
    if (winningRows.quaterna.length > 0) {
        winMessage += `⭐ Quaterna nelle cartelle: ${winningRows.quaterna.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
    }
    
    if (winningRows.terna.length > 0) {
        winMessage += `🔶 Terna nelle cartelle: ${winningRows.terna.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
    }
    
    if (winningRows.ambo.length > 0) {
        winMessage += `🔹 Ambo nelle cartelle: ${winningRows.ambo.map(w => `C${w.card}R${w.row}`).join(', ')}\n`;
    }
    
    if (winMessage) {
        showMessage(winMessage, 'success');
        
        // Effetto speciale per vincite importanti
        if (winningRows.tombola.length > 0 || winningRows.cinquina.length > 0) {
            document.getElementById('game-section').style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                document.getElementById('game-section').style.animation = '';
            }, 5000);
        }
    } else {
        showMessage(`Hai segnato ${totalMarked} numeri su ${totalNumbers}. Continua così!`, 'info');
    }
}

// Aggiungi questo stile CSS per le animazioni
const winStyle = document.createElement('style');
winStyle.textContent = `
    @keyframes winning-pulse {
        0%, 100% { 
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7);
        }
        50% { 
            transform: scale(1.1);
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.9);
            background: linear-gradient(135deg, #ffd700, #ffed4e);
        }
    }
    
    .sheet-cell.marked.winning {
        background: linear-gradient(135deg, #ffd700, #ffed4e) !important;
        color: #000 !important;
        font-weight: bold;
        animation: winning-pulse 2s infinite;
    }
    
    .row-counter div:first-child {
        font-size: 0.8rem;
        margin-bottom: 2px;
    }
    
    .row-counter div:nth-child(2) {
        font-size: 1.3rem;
        font-weight: bold;
    }
`;
document.head.appendChild(winStyle);
