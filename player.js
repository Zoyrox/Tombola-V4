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
        lastNumber: null,
        extractedCount: 0,
        winHistory: []
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
    socket.on('win-detected', handleWinDetected);
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
        room.extractedCount = data.extractedCount || 0;
        room.winHistory = data.winHistory || [];
        
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
        
        // Aggiorna storico vincite
        updateWinHistory();
        
        // Aggiorna lista giocatori
        updatePlayersList();
        
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
                lastNumber: null,
                extractedCount: 0,
                winHistory: []
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
        
        updatePlayersList();
    }
    
    // Gestione giocatore uscito
    function handlePlayerLeft(data) {
        room.players = room.players.filter(p => p.id !== data.playerId);
        updatePlayersList();
    }
    
    // Gestione numero estratto
    function handleNumberExtracted(data) {
        room.lastNumber = data.number;
        room.extractedCount = data.extractedCount || 0;
        
        // Aggiorna il numero visualizzato
        const numberDisplay = document.getElementById('last-number-display');
        numberDisplay.textContent = data.number;
        
        // Effetto visivo per il nuovo numero
        numberDisplay.style.animation = 'pulse 1s';
        setTimeout(() => {
            numberDisplay.style.animation = '';
        }, 1000);
        
        // Aggiorna conteggio numeri estratti
        document.getElementById('extracted-count-display').textContent = data.extractedCount;
        
        // Aggiorna le cartelle - i numeri vengono segnati automaticamente dal server
        updateAllCardsDisplay();
        
        showMessage(`Numero ${data.number} estratto!`, 'info');
    }
    
    // Gestione reset estrazione
    function handleExtractionReset() {
        room.lastNumber = null;
        room.extractedCount = 0;
        room.winHistory = [];
        
        // Reset cartelle
        player.cards.forEach(card => {
            card.numbers.forEach(num => num.marked = false);
        });
        
        updateRoomInfo();
        updateWinHistory();
        generatePlayerCards(); // Rigenera le cartelle visive
        showMessage('Estrazione resettata dall\'amministratore', 'info');
    }
    
    // Gestione vincita TOMBOLA
    function handlePlayerWon(data) {
        // Aggiungi allo storico
        room.winHistory.push(data);
        updateWinHistory();
        
        if (data.playerName === player.name) {
            showMessage(`🎉 COMPLIMENTI! HAI FATTO TOMBOLA! Cartella ${data.cardIndex + 1} completata! 🎉`, 'success');
            
            // Evidenzia la cartella vincente
            const cardElement = document.querySelector(`#card-${data.cardIndex}`).closest('.tombola-card');
            if (cardElement) {
                cardElement.classList.add('card-complete');
                cardElement.style.animation = 'tombola-pulse 1s infinite';
                setTimeout(() => {
                    cardElement.style.animation = '';
                }, 5000);
            }
        } else {
            showMessage(`🎉 ${data.playerName} HA FATTO TOMBOLA! 🎉`, 'success');
        }
    }
    
    // Gestione rilevamento vincite (ambo/terna/quaterna/cinquina)
    function handleWinDetected(data) {
        // Aggiungi allo storico
        room.winHistory.push(data);
        updateWinHistory();
        
        const winNames = {
            'ambo': 'AMBO',
            'terna': 'TERNA',
            'quaterna': 'QUATERNA',
            'cinquina': 'CINQUINA'
        };
        
        if (data.playerName === player.name) {
            const message = `🎉 HAI FATTO ${winNames[data.type]}! Cartella ${data.cardIndex + 1}, Riga ${data.rowIndex + 1}`;
            showMessage(message, 'success');
            
            // Evidenzia la riga vincente
            highlightWinningRow(data.cardIndex, data.rowIndex, data.type);
        } else {
            showMessage(`🎉 ${data.playerName} ha fatto ${winNames[data.type]}!`, 'info');
        }
    }
    
    // Gestione errore segnatura
    function handleMarkError(error) {
        showMessage(error, 'error');
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
    
    function checkWinner() {
    if (!player.isConnected) {
        showMessage('Non sei connesso a una stanza', 'error');
        return;
    }
    
    let message = 'Controlla le tue cartelle:\n\n';
    let hasWins = false;
    
    player.cards.forEach((card, cardIndex) => {
        // Controlla tombola
        const totalMarked = card.numbers.filter(num => num.marked).length;
        if (totalMarked === 15) {
            message += `🎉 Cartella ${cardIndex + 1}: TOMBOLA possibile!\n`;
            hasWins = true;
        }
        
        // Controlla ogni riga
        card.rows.forEach((row, rowIndex) => {
            const markedInRow = row.filter(cell => cell && cell.marked).length;
            
            if (markedInRow >= 2) {
                const winTypes = {
                    2: 'Ambo',
                    3: 'Terna',
                    4: 'Quaterna',
                    5: 'Cinquina'
                };
                
                if (winTypes[markedInRow]) {
                    message += `✅ Cartella ${cardIndex + 1}, Riga ${rowIndex + 1}: ${winTypes[markedInRow]} possibile (${markedInRow}/5 numeri)\n`;
                    hasWins = true;
                }
            }
        });
    });
    
    if (hasWins) {
        message += '\n⚠️ Usa i pulsanti sotto ogni cartella per dichiarare le vincite!';
        showMessage(message, 'info');
    } else {
        showMessage('Nessuna vincita possibile al momento. Continua a giocare!', 'info');
    }
}
    
    // Aggiorna storico vincite
    function updateWinHistory() {
        const winsList = document.getElementById('wins-history-list');
        if (!winsList) return;
        
        if (room.winHistory.length === 0) {
            winsList.innerHTML = '<p style="color: #c9e4c5; text-align: center; font-style: italic;">Ancora nessuna vincita...</p>';
            return;
        }
        
        // Ordina per timestamp (più recenti prima)
        const sortedWins = [...room.winHistory].sort((a, b) => {
            return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
        });
        
        winsList.innerHTML = '';
        
        sortedWins.slice(0, 20).forEach(win => {
            const winItem = document.createElement('div');
            winItem.className = `win-item ${win.type}`;
            
            const time = win.timestamp ? new Date(win.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ora';
            let winText = '';
            
            const winNames = {
                'ambo': 'AMBO',
                'terna': 'TERNA',
                'quaterna': 'QUATERNA',
                'cinquina': 'CINQUINA',
                'tombola': 'TOMBOLA'
            };
            
            if (win.type === 'tombola') {
                winText = `<span class="win-player">${win.playerName}</span> ha fatto <span class="win-type win-tombola">${winNames[win.type]}</span>!`;
            } else {
                winText = `<span class="win-player">${win.playerName}</span> ha fatto <span class="win-type win-${win.type}">${winNames[win.type]}</span>`;
                if (win.cardIndex !== undefined && win.rowIndex !== undefined) {
                    winText += ` (Cartella ${win.cardIndex + 1}, Riga ${win.rowIndex + 1})`;
                }
            }
            
            winItem.innerHTML = `
                <div style="font-size: 0.9rem; color: #c9e4c5; margin-bottom: 3px;">${time}</div>
                <div>${winText}</div>
            `;
            
            winsList.appendChild(winItem);
        });
    }
    
    // Aggiorna lista giocatori
    function updatePlayersList() {
        const playersList = document.getElementById('players-list');
        const playersCount = document.getElementById('players-count');
        
        if (!playersList) return;
        
        if (room.players.length === 0) {
            playersList.innerHTML = '<p style="color: #c9e4c5; text-align: center;">Nessun giocatore</p>';
            if (playersCount) playersCount.textContent = '0';
            return;
        }
        
        playersList.innerHTML = '';
        if (playersCount) playersCount.textContent = room.players.length;
        
        room.players.forEach(p => {
            const playerItem = document.createElement('div');
            playerItem.style.padding = '10px';
            playerItem.style.marginBottom = '8px';
            playerItem.style.background = 'rgba(255,255,255,0.05)';
            playerItem.style.borderRadius = '6px';
            playerItem.style.display = 'flex';
            playerItem.style.alignItems = 'center';
            playerItem.style.gap = '10px';
            
            const isYou = p.name === player.name;
            
            playerItem.innerHTML = `
                <div style="width: 35px; height: 35px; border-radius: 50%; background: ${isYou ? '#ffcc00' : '#4ecdc4'}; display: flex; align-items: center; justify-content: center; color: ${isYou ? '#000' : 'white'};">
                    <i class="fas fa-user"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: ${isYou ? '#ffcc00' : 'white'};">${p.name}${isYou ? ' (Tu)' : ''}</div>
                    <div style="font-size: 0.8rem; color: #c9e4c5;">${p.cardsCount} cartella${p.cardsCount > 1 ? 'e' : ''}</div>
                </div>
            `;
            
            playersList.appendChild(playerItem);
        });
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
                    cell.dataset.number = cellData.number;
                    cell.dataset.cardIndex = cardIndex;
                    
                    // Aggiungi evento per segnare manualmente (doppio click)
                    let clickTimer;
                    cell.addEventListener('click', function(e) {
                        if (e.detail === 2) { // Doppio click
                            markNumberManual(cardIndex, cellData.number);
                        }
                    });
                    
                    // Singolo click mostra info
                    cell.addEventListener('click', function(e) {
                        if (e.detail === 1) {
                            clearTimeout(clickTimer);
                            clickTimer = setTimeout(() => {
                                // Non possiamo sapere se il numero è stato estratto
                                // senza conoscere tutti i numeri estratti
                                if (cellData.marked) {
                                    showMessage(`Numero ${cellData.number} già segnato`, 'info');
                                } else {
                                    showMessage(`Numero ${cellData.number} non ancora segnato`, 'info');
                                }
                            }, 300);
                        }
                    });
                    
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
    
    // Funzione per segnare manualmente un numero
    // Sostituisci la funzione markNumberManual con questa:

    // Funzione per segnare manualmente un numero
    async function markNumberManual(cardIndex, number) {
        if (!player.isConnected) return;
        
        // Prima verifica se il numero è stato estratto
        try {
            const response = await fetch(`/api/room/${player.roomCode}/check-number/${number}`);
            const data = await response.json();
            
            if (!data.exists) {
                showMessage('Errore: stanza non trovata', 'error');
                return;
            }
            
            if (!data.extracted) {
                showMessage(`Il numero ${number} non è ancora stato estratto!`, 'error');
                return;
            }
            
            // Il numero è stato estratto, invia la richiesta al server
            socket.emit('mark-number-manual', {
                roomCode: player.roomCode,
                cardIndex: cardIndex,
                number: number
            });
            
            // Aggiorna localmente per feedback immediato
            const cell = document.getElementById(`card-${cardIndex}-num-${number}`);
            if (cell && !cell.classList.contains('marked')) {
                cell.classList.add('marked');
                
                // Trova il numero nella struttura dati e segnalo
                const card = player.cards[cardIndex];
                if (card && card.numbers) {
                    const numObj = card.numbers.find(n => n.number === number);
                    if (numObj) {
                        numObj.marked = true;
                    }
                }
                
                // Aggiorna conteggi
                updateCardCount(cardIndex);
                
                showMessage(`Numero ${number} segnato!`, 'success');
            }
            
        } catch (error) {
            console.error('Error checking number:', error);
            showMessage('Errore di connessione al server', 'error');
        }
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

    
        // Aggiungi queste funzioni al player.js:
    
    // Funzione per dichiarare una vincita
    function declareWin(winType, cardIndex, rowIndex) {
        if (!player.isConnected) return;
        
        socket.emit('declare-win', {
            roomCode: player.roomCode,
            winType: winType,
            cardIndex: cardIndex,
            rowIndex: rowIndex
        });
    }
    
    // Gestione risposta dichiarazione vincita
    socket.on('win-declared', handleWinDeclared);
    socket.on('win-error', handleWinError);
    
    function handleWinDeclared(data) {
        if (data.playerName === player.name) {
            const winMessages = {
                'ambo': 'AMBO',
                'terna': 'TERNA',
                'quaterna': 'QUATERNA',
                'cinquina': 'CINQUINA',
                'tombola': 'TOMBOLA'
            };
            
            showMessage(`🎉 HAI FATTO ${winMessages[data.type]}! Sei il primo! 🎉`, 'success');
            
            // Evidenzia la riga/cartella vincente
            if (data.type === 'tombola') {
                const cardElement = document.querySelector(`#card-${data.cardIndex}`).closest('.tombola-card');
                if (cardElement) {
                    cardElement.classList.add('card-complete');
                    cardElement.style.animation = 'tombola-pulse 1s infinite';
                    setTimeout(() => {
                        cardElement.style.animation = '';
                    }, 5000);
                }
            } else {
                highlightWinningRow(data.cardIndex, data.rowIndex, data.type);
            }
        } else {
            showMessage(`🎉 ${data.playerName} ha fatto ${data.type.toUpperCase()}!`, 'info');
        }
        
        // Aggiorna storico vincite
        room.winHistory.push(data);
        updateWinHistory();
    }
    
    function handleWinError(error) {
        showMessage(error, 'error');
    }
    
    // Aggiungi bottoni per dichiarare vincite
    function addWinButtons(cardIndex) {
        const cardElement = document.querySelector(`#card-${cardIndex}`).closest('.tombola-card');
        if (!cardElement) return;
        
        // Rimuovi bottoni esistenti
        const existingButtons = cardElement.querySelectorAll('.win-button');
        existingButtons.forEach(btn => btn.remove());
        
        // Crea container per bottoni
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'win-buttons-container';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.flexWrap = 'wrap';
        
        // Bottoni per ogni riga
        for (let row = 0; row < 3; row++) {
            const rowContainer = document.createElement('div');
            rowContainer.style.textAlign = 'center';
            rowContainer.style.marginBottom = '10px';
            
            const rowLabel = document.createElement('div');
            rowLabel.textContent = `Riga ${row + 1}:`;
            rowLabel.style.color = '#c9e4c5';
            rowLabel.style.marginBottom = '5px';
            rowLabel.style.fontSize = '0.9rem';
            
            const buttonRow = document.createElement('div');
            buttonRow.style.display = 'flex';
            buttonRow.style.gap = '5px';
            buttonRow.style.justifyContent = 'center';
            
            // Bottoni per ogni tipo di vincita
            const winTypes = ['ambo', 'terna', 'quaterna', 'cinquina'];
            winTypes.forEach(winType => {
                const btn = document.createElement('button');
                btn.className = `win-button btn btn-${winType}`;
                btn.textContent = winType.toUpperCase();
                btn.style.padding = '5px 10px';
                btn.style.fontSize = '0.8rem';
                btn.style.borderRadius = '15px';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
                btn.style.fontWeight = 'bold';
                
                // Stili diversi per ogni tipo
                const btnStyles = {
                    'ambo': { background: '#4ecdc4', color: 'white' },
                    'terna': { background: '#ff6b6b', color: 'white' },
                    'quaterna': { background: '#ffe66d', color: '#333' },
                    'cinquina': { background: '#ff9900', color: 'white' }
                };
                
                Object.assign(btn.style, btnStyles[winType]);
                
                btn.addEventListener('click', () => {
                    if (confirm(`Vuoi dichiarare ${winType.toUpperCase()} sulla riga ${row + 1}?`)) {
                        declareWin(winType, cardIndex, row);
                    }
                });
                
                buttonRow.appendChild(btn);
            });
            
            rowContainer.appendChild(rowLabel);
            rowContainer.appendChild(buttonRow);
            buttonContainer.appendChild(rowContainer);
        }
        
        // Bottone per tombola
        const tombolaContainer = document.createElement('div');
        tombolaContainer.style.textAlign = 'center';
        tombolaContainer.style.marginTop = '10px';
        
        const tombolaBtn = document.createElement('button');
        tombolaBtn.className = 'win-button btn';
        tombolaBtn.textContent = 'TOMBOLA';
        tombolaBtn.style.padding = '8px 20px';
        tombolaBtn.style.fontSize = '1rem';
        tombolaBtn.style.borderRadius = '20px';
        tombolaBtn.style.border = 'none';
        tombolaBtn.style.cursor = 'pointer';
        tombolaBtn.style.fontWeight = 'bold';
        tombolaBtn.style.background = '#ff0000';
        tombolaBtn.style.color = 'white';
        tombolaBtn.style.marginTop = '5px';
        
        tombolaBtn.addEventListener('click', () => {
            if (confirm('Vuoi dichiarare TOMBOLA per tutta la cartella?')) {
                declareWin('tombola', cardIndex, 0);
            }
        });
        
        tombolaContainer.appendChild(tombolaBtn);
        buttonContainer.appendChild(tombolaContainer);
        
        cardElement.appendChild(buttonContainer);
    }
    
    // Chiama questa funzione quando generi le cartelle
    // Modifica generatePlayerCards:
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
            
            // Aggiungi bottoni per dichiarare vincite
            setTimeout(() => {
                addWinButtons(cardIndex);
            }, 100);
        });
    }
    
    // Aggiorna il conteggio per una cartella
    function updateCardCount(cardIndex) {
        if (!player.cards[cardIndex]) return;
        
        const cardData = player.cards[cardIndex];
        let totalMarked = 0;
        const rowCounts = [0, 0, 0];
        
        // Conta numeri segnati
        if (cardData.rows) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 9; col++) {
                    const cellData = cardData.rows[row][col];
                    if (cellData && cellData.marked) {
                        totalMarked++;
                        rowCounts[row]++;
                        
                        // Aggiorna visualizzazione cella
                        const cell = document.getElementById(`card-${cardIndex}-num-${cellData.number}`);
                        if (cell && !cell.classList.contains('marked')) {
                            cell.classList.add('marked');
                        }
                    }
                }
            }
        }
        
        // Aggiorna contatori riga
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
        
        // Aggiorna contatore totale
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
        
        // Aggiorna conteggio numeri estratti
        const extractedCountDisplay = document.getElementById('extracted-count-display');
        if (extractedCountDisplay) {
            extractedCountDisplay.textContent = room.extractedCount;
        }
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
        
        @keyframes tombola-pulse {
            0%, 100% { 
                box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7);
            }
            50% { 
                box-shadow: 0 0 30px rgba(255, 0, 0, 0.9);
            }
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
            position: relative;
        }
        
        .sheet-cell {
            cursor: pointer;
            user-select: none;
        }
        
        .sheet-cell.marked {
            background: #009933;
            color: white;
        }
        
        .card-complete::before {
            content: '🎉 TOMBOLA!';
            position: absolute;
            top: -15px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff0000;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9rem;
            z-index: 10;
        }
    `;
    document.head.appendChild(style);
});
