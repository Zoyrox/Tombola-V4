// Giocatore Tombola Natalizia - Versione semplificata
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
    
    // Gestione eventi
    joinBtn.addEventListener('click', joinRoom);
    leaveRoomBtn.addEventListener('click', leaveRoom);
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
        leaveRoomBtn.style.display = 'inline-block';
        
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
            leaveRoomBtn.style.display = 'none';
            
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
    
    // Funzione per generare le cartelle visuali (griglia 3x9)
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
    
    // Funzione per inizializzare la griglia 3x9 di una cartella
    function initCardGrid(cardIndex) {
        const grid = document.getElementById(`card-${cardIndex}`);
        grid.innerHTML = '';
        
        if (!player.cards[cardIndex]) return;
        
        // Prepara i numeri in colonne (ogni colonna ha 3 numeri)
        const columns = [[], [], [], [], [], [], [], [], []];
        
        player.cards[cardIndex].forEach((numObj) => {
            const num = numObj.number;
            let colIndex;
            
            if (num >= 1 && num <= 9) colIndex = 0;
            else if (num >= 10 && num <= 19) colIndex = 1;
            else if (num >= 20 && num <= 29) colIndex = 2;
            else if (num >= 30 && num <= 39) colIndex = 3;
            else if (num >= 40 && num <= 49) colIndex = 4;
            else if (num >= 50 && num <= 59) colIndex = 5;
            else if (num >= 60 && num <= 69) colIndex = 6;
            else if (num >= 70 && num <= 79) colIndex = 7;
            else colIndex = 8; // 80-90
            
            // Trova la prima posizione vuota in questa colonna
            for (let row = 0; row < 3; row++) {
                if (!columns[colIndex][row]) {
                    columns[colIndex][row] = { number: num, marked: numObj.marked };
                    break;
                }
            }
        });
        
        // Crea la griglia 3x9
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = 'sheet-cell';
                
                if (columns[col][row]) {
                    const numData = columns[col][row];
                    cell.textContent = numData.number;
                    cell.id = `card-${cardIndex}-num-${numData.number}`;
                    if (numData.marked) cell.classList.add('marked');
                    
                    // Aggiungi evento click per segnare manualmente
                    cell.addEventListener('click', function() {
                        // I giocatori non possono più cliccare per segnare manualmente
                        // I numeri vengono segnati automaticamente quando estratti
                    });
                } else {
                    cell.classList.add('empty');
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
        document.getElementById(`card-${cardIndex}-count`).textContent = markedCount;
    }
    
    // Funzione per aggiornare le informazioni della stanza
    function updateRoomInfo() {
        document.getElementById('room-name-display').textContent = room.name;
        document.getElementById('room-code-display').textContent = player.roomCode;
        document.getElementById('player-name-display').textContent = player.name;
        document.getElementById('room-players').textContent = room.players.length;
        document.getElementById('last-number-display').textContent = room.lastNumber || '--';
    }
    
    // Funzione per mostrare messaggi
    function showMessage(text, type) {
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
