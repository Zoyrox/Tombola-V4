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
        extractedNumbers: [],
        lastNumber: null
    };
    
    // Elementi DOM
    const joinSection = document.getElementById('join-section');
    const gameSection = document.getElementById('game-section');
    const messageDiv = document.getElementById('message');
    const joinBtn = document.getElementById('join-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const checkWinnerBtn = document.getElementById('check-winner-btn');
    
    // Inizializza la griglia dei numeri
    initNumbersGrid();
    
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
        room.extractedNumbers = data.extractedNumbers || [];
        room.lastNumber = data.lastNumber;
        
        // Salva le cartelle dal server
        player.cards = data.cards || [];
        
        // Mostra l'area di gioco
        joinSection.style.display = 'none';
        gameSection.style.display = 'block';
        
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
                extractedNumbers: [],
                lastNumber: null
            };
            
            gameSection.style.display = 'none';
            joinSection.style.display = 'block';
            
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
        showMessage(`${data.name} si è unito alla stanza!`, 'info');
    }
    
    // Gestione giocatore uscito
    function handlePlayerLeft(data) {
        room.players = room.players.filter(p => p.id !== data.playerId);
        updateRoomInfo();
        showMessage(`${data.playerName} ha lasciato la stanza`, 'info');
    }
    
    // Gestione numero estratto
    function handleNumberExtracted(data) {
        room.extractedNumbers = data.extractedNumbers;
        room.lastNumber = data.number;
        
        updateRoomInfo();
        showMessage(`È stato estratto il numero ${data.number}!`, 'info');
        
        // Effetto visivo
        const lastNumberDisplay = document.getElementById('last-number-display');
        lastNumberDisplay.textContent = data.number;
        lastNumberDisplay.style.transform = 'scale(1.3)';
        lastNumberDisplay.style.color = '#ff0000';
        
        setTimeout(() => {
            lastNumberDisplay.style.transform = 'scale(1)';
            lastNumberDisplay.style.color = '';
        }, 500);
        
        // Verifica se il numero è nelle tue cartelle
        player.cards.forEach((card, cardIndex) => {
            card.forEach(num => {
                if (num.number === data.number && !num.marked) {
                    const cell = document.getElementById(`card-${cardIndex}-num-${num.number}`);
                    if (cell) {
                        cell.style.animation = 'pulse 1s';
                        setTimeout(() => {
                            cell.style.animation = '';
                        }, 1000);
                    }
                }
            });
        });
    }
    
    // Gestione reset estrazione
    function handleExtractionReset() {
        room.extractedNumbers = [];
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
        player.cards.forEach(card => {
            card.forEach(num => {
                if (num.marked) totalMarked++;
            });
        });
        
        const totalNumbers = 15 * player.cardsCount;
        
        if (totalMarked === totalNumbers) {
            showMessage(`🎉 COMPLIMENTI! Hai completato tutte le cartelle! HAI VINTO! 🎉`, 'success');
            
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
    
    // Funzione per generare le cartelle visuali
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
                <div class="numbers-card" id="card-${cardIndex}">
                    <!-- I numeri della cartella appariranno qui -->
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
        grid.innerHTML = '';
        
        if (!player.cards[cardIndex]) return;
        
        player.cards[cardIndex].forEach((numObj) => {
            const cell = document.createElement('div');
            cell.className = 'card-number';
            if (numObj.marked) cell.classList.add('marked');
            cell.id = `card-${cardIndex}-num-${numObj.number}`;
            cell.textContent = numObj.number;
            cell.dataset.cardIndex = cardIndex;
            cell.dataset.number = numObj.number;
            
            cell.addEventListener('click', function() {
                markNumber(cardIndex, numObj.number);
            });
            
            grid.appendChild(cell);
        });
        
        updateCardCount(cardIndex);
    }
    
    // Funzione per segnare un numero
    function markNumber(cardIndex, number) {
        if (!player.isConnected) return;
        
        socket.emit('mark-number', {
            roomCode: player.roomCode,
            cardIndex,
            number
        });
    }
    
    // Funzione per aggiornare il conteggio
    function updateCardCount(cardIndex) {
        if (!player.cards[cardIndex]) return;
        
        const markedCount = player.cards[cardIndex].filter(num => num.marked).length;
        document.getElementById(`card-${cardIndex}-count`).textContent = markedCount;
    }
    
    // Funzione per inizializzare la griglia dei numeri estratti
    function initNumbersGrid() {
        const grid = document.getElementById('player-extracted-numbers');
        grid.innerHTML = '';
        
        for (let i = 1; i <= 90; i++) {
            const cell = document.createElement('div');
            cell.className = 'number-cell';
            cell.id = `player-number-${i}`;
            cell.textContent = i;
            grid.appendChild(cell);
        }
    }
    
    // Funzione per aggiornare le informazioni della stanza
    function updateRoomInfo() {
        document.getElementById('room-name-display').textContent = room.name;
        document.getElementById('room-code-display').textContent = player.roomCode;
        document.getElementById('room-players').textContent = room.players.length;
        document.getElementById('player-name-display').textContent = player.name;
        document.getElementById('extracted-count-display').textContent = room.extractedNumbers.length;
        document.getElementById('last-number-display').textContent = room.lastNumber || '--';
        
        updateExtractedNumbersGrid();
    }
    
    // Funzione per aggiornare la griglia dei numeri estratti
    function updateExtractedNumbersGrid() {
        document.querySelectorAll('#player-extracted-numbers .number-cell').forEach(cell => {
            cell.classList.remove('extracted');
        });
        
        room.extractedNumbers.forEach(number => {
            const cell = document.getElementById(`player-number-${number}`);
            if (cell) cell.classList.add('extracted');
        });
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
            0% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
            70% { box-shadow: 0 0 0 20px rgba(255, 204, 0, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
        }
    `;
    document.head.appendChild(style);
});
