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
    socket.on('shared-win', handleSharedWin);
    socket.on('game-finished', handleGameFinished);
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
    
    // Gestione rilevamento vincite (ambo/terna/quaterna/cinquina) - ora gestita localmente
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
        
        // Mostra solo se è un altro giocatore
        if (data.playerName !== player.name) {
            showMessage(`🎉 ${data.playerName} ha fatto ${winNames[data.type]}!`, 'info');
        }
    }
    
    // Gestione errore segnatura
    function handleMarkError(error) {
        showMessage(error, 'error');
    }
    
    // Gestione vincita condivisa
    function handleSharedWin(data) {
        showMessage(data.message, 'success');
        
        // Aggiungi allo storico
        const winItem = {
            type: data.winType,
            playerName: data.players.join(' e '),
            timestamp: new Date().toISOString(),
            shared: true
        };
        
        room.winHistory.push(winItem);
        updateWinHistory();
    }
    
    // Gestione fine gioco
    function handleGameFinished(data) {
        showMessage(data.message, 'success');
        
        // Disabilita i pulsanti di gioco
        const checkWinnerBtn = document.getElementById('check-winner-btn');
        if (checkWinnerBtn) {
            checkWinnerBtn.disabled = true;
            checkWinnerBtn.textContent = 'Gioco Terminato';
        }
        
        // Disabilita i numeri cliccabili
        const cells = document.querySelectorAll('.sheet-cell');
        cells.forEach(cell => {
            cell.style.pointerEvents = 'none';
            cell.style.opacity = '0.6';
        });
    }
    
    // Funzione per evidenziare la riga vincente SOLO con numeri cliccati
    function highlightWinningRowClicked(cardIndex, rowIndex, winType) {
        const grid = document.getElementById(`card-${cardIndex}`);
        if (!grid) return;
        
        const cells = grid.querySelectorAll('.sheet-cell');
        const startIndex = rowIndex * 9;
        const markedCells = [];
        
        // Prima identifica tutte le celle segnate nella riga
        for (let i = startIndex; i < startIndex + 9; i++) {
            if (cells[i] && !cells[i].classList.contains('empty') && cells[i].classList.contains('marked')) {
                markedCells.push(cells[i]);
            }
        }
        
        // Evidenzia solo le celle segnate
        markedCells.forEach((cell, index) => {
            cell.classList.add(`win-${winType}`);
            cell.style.animation = 'winning-pulse 2s';
            
            // Rimuovi dopo 3 secondi
            setTimeout(() => {
                cell.classList.remove(`win-${winType}`);
                cell.style.animation = '';
            }, 3000);
        });
        
        // Debug: mostra quante celle sono state evidenziate
        console.log(`Evidenziate ${markedCells.length} celle per ${winType} sulla riga ${rowIndex + 1}`);
    }
    
        function checkWinner() {
        if (!player.isConnected) {
            showMessage('Non sei connesso a una stanza', 'error');
            return;
        }
        
        let totalMarked = 0;
        let possibleWins = [];
        
        player.cards.forEach((card, cardIndex) => {
            // Controlla tombola
            const cardMarked = card.numbers.filter(num => num.marked).length;
            totalMarked += cardMarked;
            
            if (cardMarked === 15) {
                possibleWins.push(`🎉 Cartella ${cardIndex + 1}: TOMBOLA!`);
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
                        // Controlla se questa vincita è già stata fatta da qualcuno
                        const alreadyMade = room.winHistory.some(win => win.type === winTypes[markedInRow].toLowerCase());
                        
                        if (!alreadyMade) {
                            possibleWins.push(`✅ Cartella ${cardIndex + 1}, Riga ${rowIndex + 1}: ${winTypes[markedInRow]} possibile`);
                        }
                    }
                }
            });
        });
        
        if (possibleWins.length > 0) {
            let message = 'Situazione attuale:\n\n';
            message += possibleWins.join('\n');
            
            // Aggiungi info sulle vincite già fatte
            const madeWins = room.winHistory.filter(win => win.playerName === player.name);
            if (madeWins.length > 0) {
                message += '\n\n🎯 Vincite che hai già fatto:';
                madeWins.forEach(win => {
                    if (win.type === 'tombola') {
                        message += `\n• ${win.type.toUpperCase()} (Cartella ${win.cardIndex + 1})`;
                    } else {
                        message += `\n• ${win.type.toUpperCase()} (Cartella ${win.cardIndex + 1}, Riga ${win.rowIndex + 1})`;
                    }
                });
            }
            
            showMessage(message, 'info');
        } else {
            showMessage(`Hai segnato ${totalMarked} numeri su ${15 * player.cardsCount}. Continua così!`, 'info');
        }
    }
    
    // Aggiorna storico vincite (ottimizzato)
    function updateWinHistory() {
        const winsList = document.getElementById('wins-history-list');
        if (!winsList) return;
        
        if (room.winHistory.length === 0) {
            winsList.innerHTML = '<p style="color: #c9e4c5; text-align: center; font-style: italic;">Ancora nessuna vincita...</p>';
            return;
        }
        
        // Usa requestAnimationFrame per aggiornamenti più fluidi
        requestAnimationFrame(() => {
            // Ordina per timestamp (più recenti prima)
            const sortedWins = [...room.winHistory].sort((a, b) => {
                return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
            });
            
            // Crea HTML in un'unica operazione per ridurre i reflows
            const winNames = {
                'ambo': 'AMBO',
                'terna': 'TERNA',
                'quaterna': 'QUATERNA',
                'cinquina': 'CINQUINA',
                'tombola': 'TOMBOLA'
            };
            
            const winsHTML = sortedWins.slice(0, 20).map(win => {
                const time = win.timestamp ? new Date(win.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Ora';
                
                if (win.shared) {
                    return `
                        <div class="win-item ${win.type}">
                            <div style="font-size: 0.9rem; color: #c9e4c5; margin-bottom: 3px;">${time}</div>
                            <div><span class="win-player">${win.playerName}</span> hanno fatto <span class="win-type win-${win.type}">${winNames[win.type]}</span> insieme!</div>
                        </div>
                    `;
                } else if (win.type === 'tombola') {
                    return `
                        <div class="win-item ${win.type}">
                            <div style="font-size: 0.9rem; color: #c9e4c5; margin-bottom: 3px;">${time}</div>
                            <div><span class="win-player">${win.playerName}</span> ha fatto <span class="win-type win-tombola">${winNames[win.type]}</span>!</div>
                        </div>
                    `;
                } else {
                    const extraInfo = win.cardIndex !== undefined && win.rowIndex !== undefined
                        ? ` (Cartella ${win.cardIndex + 1}, Riga ${win.rowIndex + 1})`
                        : '';
                    return `
                        <div class="win-item ${win.type}">
                            <div style="font-size: 0.9rem; color: #c9e4c5; margin-bottom: 3px;">${time}</div>
                            <div><span class="win-player">${win.playerName}</span> ha fatto <span class="win-type win-${win.type}">${winNames[win.type]}</span>${extraInfo}</div>
                        </div>
                    `;
                }
            }).join('');
            
            winsList.innerHTML = winsHTML;
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
                <div style="text-align: center; margin-top: 10px; color: #c9e4c5; font-size: 0.9rem;">
                    <i class="fas fa-mouse-pointer"></i> Click su un numero per segnarlo
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
                    
                    // Aggiungi evento per segnare manualmente (click singolo)
                    cell.addEventListener('click', function(e) {
                        if (e.detail === 1) { // Click singolo
                            markNumberManual(cardIndex, cellData.number);
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
                
                // Controlla se c'è una vincita con i numeri cliccati
                checkWinAfterManualMark(cardIndex);
            }
            
        } catch (error) {
            console.error('Error checking number:', error);
            showMessage('Errore di connessione al server', 'error');
        }
    }
    
    // Funzione per controllare le vincite dopo aver segnato un numero manualmente
    function checkWinAfterManualMark(cardIndex) {
        const card = player.cards[cardIndex];
        if (!card || !card.rows) return;
        
        // Controlla ogni riga per vedere se c'è una vincita
        for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
            const row = card.rows[rowIndex];
            const markedInRow = row.filter(cell => cell && cell.marked).length;
            
            if (markedInRow >= 2) {
                const winTypes = {
                    2: 'ambo',
                    3: 'terna',
                    4: 'quaterna',
                    5: 'cinquina'
                };
                
                if (winTypes[markedInRow]) {
                    // Evidenzia solo i numeri cliccati nella riga
                    highlightWinningRowClicked(cardIndex, rowIndex, winTypes[markedInRow]);
                    
                    // Invia al server che il giocatore ha fatto una vincita
                    socket.emit('player-win', {
                        roomCode: player.roomCode,
                        playerName: player.name,
                        cardIndex: cardIndex,
                        rowIndex: rowIndex,
                        type: winTypes[markedInRow]
                    });
                    
                    // Mostra messaggio locale
                    const winNames = {
                        'ambo': 'AMBO',
                        'terna': 'TERNA',
                        'quaterna': 'QUATERNA',
                        'cinquina': 'CINQUINA'
                    };
                    showMessage(`🎉 HAI FATTO ${winNames[winTypes[markedInRow]]} sulla riga ${rowIndex + 1}!`, 'success');
                }
            }
        }
    }
    
    // Gestione evento quando il server conferma che un numero è stato segnato
    socket.on('number-marked', function(data) {
        if (data.success) {
            // Il numero è già stato segnato dal server, non serve fare nulla
            console.log(`Numero ${data.number} segnato con successo`);
        }
    });
    
    // Gestione vincite automatiche rilevate dal server (solo per altri giocatori)
    socket.on('win-detected', function(data) {
        // Aggiungi allo storico
        room.winHistory.push(data);
        updateWinHistory();
        
        const winMessages = {
            'ambo': 'AMBO',
            'terna': 'TERNA',
            'quaterna': 'QUATERNA',
            'cinquina': 'CINQUINA'
        };
        
        // Se la vincita è di un altro giocatore, mostra il messaggio
        if (data.playerName !== player.name) {
            showMessage(`🎉 ${data.playerName} ha fatto ${winMessages[data.type]}!`, 'info');
        }
    });
    
    socket.on('player-won', function(data) {
        // Aggiungi allo storico
        room.winHistory.push(data);
        updateWinHistory();
        
        if (data.playerName === player.name) {
            showMessage(`🎉 COMPLIMENTI! HAI FATTO TOMBOLA! 🎉`, 'success');
            
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
    });
        
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
    
    
    
    // Aggiorna il conteggio per una cartella (ottimizzato)
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
                    }
                }
            }
        }
        
        // Aggiorna contatori riga (batch update)
        for (let row = 0; row < 3; row++) {
            const rowCounter = document.getElementById(`card-${cardIndex}-row-${row}`);
            if (rowCounter) {
                const isComplete = rowCounts[row] === 5;
                rowCounter.textContent = rowCounts[row];
                rowCounter.style.color = isComplete ? '#ff9900' : '#ffcc00';
                rowCounter.style.fontWeight = isComplete ? 'bold' : 'normal';
            }
        }
        
        // Aggiorna contatore totale (batch update)
        const countElement = document.getElementById(`card-${cardIndex}-count`);
        if (countElement) {
            const isComplete = totalMarked === 15;
            countElement.textContent = totalMarked;
            countElement.style.color = isComplete ? '#ff0000' : '#ffcc00';
            countElement.style.fontWeight = isComplete ? 'bold' : 'normal';
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
    
    // Funzione per mostrare messaggi (ottimizzato)
    function showMessage(text, type) {
        if (!messageDiv) return;
        
        // Usa requestAnimationFrame per aggiornamenti più fluidi
        requestAnimationFrame(() => {
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Riduci frequenza di scroll
            if (!messageDiv.scrolling) {
                messageDiv.scrolling = true;
                messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                setTimeout(() => {
                    messageDiv.scrolling = false;
                }, 1000);
            }
            
            // Timeout per nascondere il messaggio
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 5000);
        });
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
