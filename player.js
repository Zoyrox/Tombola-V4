// Giocatore Tombola Natalizia
document.addEventListener('DOMContentLoaded', function() {
    // Imposta anno corrente nel footer
    document.getElementById('current-year').textContent = new Date().getFullYear();
    
    // Stato del giocatore
    let player = {
        name: '',
        roomCode: '',
        cardsCount: 1,
        cards: [],
        isConnected: false
    };
    
    // Stato della stanza
    let room = {
        name: '',
        playersCount: 0,
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
    
    // Permetti join con Enter
    document.getElementById('room-code').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });
    
    // Funzione per unirsi a una stanza
    function joinRoom() {
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
        
        // Nel progetto reale, qui verificheresti con il server se la stanza esiste
        // Per ora simuliamo una connessione riuscita
        player.name = playerName;
        player.roomCode = roomCode;
        player.cardsCount = cardsCount;
        
        // Simula una risposta dal server
        simulateRoomJoin();
        
        // Crea le cartelle per il giocatore
        generatePlayerCards();
        
        // Mostra l'area di gioco
        joinSection.style.display = 'none';
        gameSection.style.display = 'block';
        
        // Aggiorna le informazioni della stanza
        updateRoomInfo();
        
        showMessage(`Benvenuto ${playerName}! Ti sei unito alla stanza ${roomCode}`, 'success');
        
        // Simula aggiornamenti dalla stanza
        startRoomUpdates();
    }
    
    // Funzione per lasciare la stanza
    function leaveRoom() {
        if (confirm('Sei sicuro di voler lasciare la stanza?')) {
            // Reset dello stato
            player.isConnected = false;
            room.extractedNumbers = [];
            room.lastNumber = null;
            
            // Torna alla schermata di join
            gameSection.style.display = 'none';
            joinSection.style.display = 'block';
            
            showMessage('Hai lasciato la stanza', 'info');
        }
    }
    
    // Funzione per controllare se il giocatore ha vinto
    function checkWinner() {
        if (!player.isConnected) {
            showMessage('Non sei connesso a una stanza', 'error');
            return;
        }
        
        let hasWinningCard = false;
        let winningCardIndex = -1;
        
        // Controlla ogni cartella
        player.cards.forEach((card, cardIndex) => {
            const markedNumbers = card.filter(num => num.marked).length;
            if (markedNumbers === 15) {
                hasWinningCard = true;
                winningCardIndex = cardIndex;
            }
        });
        
        if (hasWinningCard) {
            showMessage(`🎉 COMPLIMENTI! Hai completato la cartella ${winningCardIndex + 1}! HAI VINTO! 🎉`, 'success');
            
            // Effetto speciale per la vittoria
            document.getElementById('game-section').style.animation = 'pulse 1s infinite';
            setTimeout(() => {
                document.getElementById('game-section').style.animation = '';
            }, 5000);
        } else {
            // Mostra il progresso
            let totalMarked = 0;
            player.cards.forEach(card => {
                totalMarked += card.filter(num => num.marked).length;
            });
            
            showMessage(`Hai segnato ${totalMarked} numeri su ${15 * player.cardsCount}. Continua così!`, 'info');
        }
    }
    
    // Funzione per generare le cartelle del giocatore
    function generatePlayerCards() {
        player.cards = [];
        const container = document.getElementById('tombola-cards-container');
        container.innerHTML = '';
        
        for (let cardIndex = 0; cardIndex < player.cardsCount; cardIndex++) {
            // Crea una cartella con 15 numeri univoci (1-90)
            const cardNumbers = [];
            const numbersSet = new Set();
            
            while (numbersSet.size < 15) {
                const num = Math.floor(Math.random() * 90) + 1;
                numbersSet.add(num);
            }
            
            const sortedNumbers = Array.from(numbersSet).sort((a, b) => a - b);
            
            // Crea l'oggetto cartella
            const card = sortedNumbers.map(num => ({
                number: num,
                marked: false
            }));
            
            player.cards.push(card);
            
            // Crea l'elemento HTML per la cartella
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
            
            // Inizializza la griglia dei numeri per questa cartella
            initCardGrid(cardIndex);
        }
    }
    
    // Funzione per inizializzare la griglia di una cartella
    function initCardGrid(cardIndex) {
        const grid = document.getElementById(`card-${cardIndex}`);
        grid.innerHTML = '';
        
        player.cards[cardIndex].forEach((numObj, index) => {
            const cell = document.createElement('div');
            cell.className = 'card-number';
            cell.id = `card-${cardIndex}-num-${numObj.number}`;
            cell.textContent = numObj.number;
            cell.dataset.cardIndex = cardIndex;
            cell.dataset.number = numObj.number;
            
            cell.addEventListener('click', function() {
                toggleNumberMark(cardIndex, numObj.number);
            });
            
            grid.appendChild(cell);
        });
    }
    
    // Funzione per segnare/togliere il segno da un numero
    function toggleNumberMark(cardIndex, number) {
        if (!player.isConnected) return;
        
        const numObj = player.cards[cardIndex].find(num => num.number === number);
        if (!numObj) return;
        
        // Controlla se il numero è stato estratto
        if (!room.extractedNumbers.includes(number)) {
            showMessage(`Il numero ${number} non è ancora stato estratto!`, 'error');
            return;
        }
        
        // Segna/togli il segno
        numObj.marked = !numObj.marked;
        
        // Aggiorna l'interfaccia
        const cell = document.getElementById(`card-${cardIndex}-num-${number}`);
        if (numObj.marked) {
            cell.classList.add('marked');
        } else {
            cell.classList.remove('marked');
        }
        
        // Aggiorna il conteggio
        updateCardCount(cardIndex);
    }
    
    // Funzione per aggiornare il conteggio numeri segnati di una cartella
    function updateCardCount(cardIndex) {
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
        document.getElementById('room-players').textContent = room.playersCount;
        document.getElementById('player-name-display').textContent = player.name;
        document.getElementById('extracted-count-display').textContent = room.extractedNumbers.length;
        document.getElementById('last-number-display').textContent = room.lastNumber || '--';
        
        // Aggiorna la griglia dei numeri estratti
        updateExtractedNumbersGrid();
    }
    
    // Funzione per aggiornare la griglia dei numeri estratti
    function updateExtractedNumbersGrid() {
        // Rimuovi tutte le classi "extracted"
        document.querySelectorAll('#player-extracted-numbers .number-cell').forEach(cell => {
            cell.classList.remove('extracted');
        });
        
        // Aggiungi la classe ai numeri estratti
        room.extractedNumbers.forEach(number => {
            const cell = document.getElementById(`player-number-${number}`);
            if (cell) {
                cell.classList.add('extracted');
            }
        });
    }
    
    // Funzione per mostrare messaggi
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
        
        // Nascondi il messaggio dopo 5 secondi
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }
    
    // Funzioni di simulazione (per demo)
    function simulateRoomJoin() {
        player.isConnected = true;
        
        // Simula dati della stanza
        room.name = `Tombola di Natale ${new Date().getFullYear()}`;
        room.playersCount = Math.floor(Math.random() * 15) + 4;
        room.extractedNumbers = [];
        room.lastNumber = null;
        
        // Simula alcuni numeri già estratti
        for (let i = 0; i < 5; i++) {
            let num;
            do {
                num = Math.floor(Math.random() * 90) + 1;
            } while (room.extractedNumbers.includes(num));
            room.extractedNumbers.push(num);
        }
        
        room.lastNumber = room.extractedNumbers[room.extractedNumbers.length - 1];
    }
    
    function startRoomUpdates() {
        // Simula aggiornamenti periodici dalla stanza
        setInterval(() => {
            if (!player.isConnected) return;
            
            // Simula occasionalmente un nuovo numero estratto
            if (Math.random() > 0.7 && room.extractedNumbers.length < 90) {
                let newNumber;
                do {
                    newNumber = Math.floor(Math.random() * 90) + 1;
                } while (room.extractedNumbers.includes(newNumber));
                
                room.extractedNumbers.push(newNumber);
                room.lastNumber = newNumber;
                
                // Aggiorna l'interfaccia
                updateRoomInfo();
                
                // Mostra notifica
                showMessage(`È stato estratto il numero ${newNumber}!`, 'info');
                
                // Effetto visivo
                const lastNumberDisplay = document.getElementById('last-number-display');
                lastNumberDisplay.style.transform = 'scale(1.3)';
                lastNumberDisplay.style.color = '#ff0000';
                setTimeout(() => {
                    lastNumberDisplay.style.transform = 'scale(1)';
                    lastNumberDisplay.style.color = '';
                }, 500);
            }
            
            // Simula cambiamenti nel numero di giocatori
            if (Math.random() > 0.8) {
                const change = Math.random() > 0.5 ? 1 : -1;
                room.playersCount = Math.max(1, room.playersCount + change);
                updateRoomInfo();
            }
        }, 3000);
    }
    
    // Aggiungi stili per l'animazione di vittoria
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
