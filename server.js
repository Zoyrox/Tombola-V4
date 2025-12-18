const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// Variabili ambiente
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tombola.it';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

// Database in memoria
const rooms = new Map();
const players = new Map();

// Storico vincite per stanza
const winHistory = new Map();

// Funzione per generare ID unici
function generateId(length = 6) {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length)
        .toUpperCase();
}

// Route per le pagine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/player.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// API per login admin
app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        res.json({ 
            success: true, 
            token: 'admin-token',
            user: { email, role: 'admin' }
        });
    } else {
        res.status(401).json({ success: false, error: 'Credenziali non valide' });
    }
});

// API per verificare stanza
app.get('/api/room/:code', (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const room = rooms.get(roomCode);
    
    if (room) {
        res.json({
            exists: true,
            name: room.name,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            extractedNumbers: room.extractedNumbers,
            lastNumber: room.lastNumber
        });
    } else {
        res.json({ exists: false });
    }
});

// API per ottenere stanze attive
app.get('/api/active-rooms', (req, res) => {
    const activeRooms = Array.from(rooms.values())
        .filter(room => room.isActive)
        .map(room => ({
            id: room.id,
            name: room.name,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt
        }));
    
    res.json(activeRooms);
});

// FUNZIONE PER GENERARE CARTELLE TOMBOLA CORRETTE (max 2 numeri per colonna)
function generateTombolaCard() {
    // Una cartella tombola ha 15 numeri distribuiti in 3 righe e 9 colonne
    // Regole: 
    // - Ogni riga ha esattamente 5 numeri (e 4 spazi vuoti)
    // - Ogni colonna può avere 1 o 2 numeri (mai 3)
    // - I numeri sono organizzati per decine
    
    const grid = Array(3).fill().map(() => Array(9).fill(null));
    
    // Contatori per righe e colonne
    const rowCounts = [0, 0, 0]; // Ogni riga deve avere esattamente 5 numeri
    const colCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0]; // Ogni colonna può avere 1 o 2 numeri
    
    // Generiamo i 15 numeri
    const numbers = [];
    
    // Prima determiniamo quali colonne avranno 2 numeri
    // Dobbiamo avere 15 numeri totali, se ogni colonna avesse 1 numero avremmo solo 9 numeri
    // Quindi 6 colonne devono avere 2 numeri e 3 colonne devono avere 1 numero (6*2 + 3*1 = 15)
    const twoNumberCols = [];
    while (twoNumberCols.length < 6) {
        const col = Math.floor(Math.random() * 9);
        if (!twoNumberCols.includes(col)) {
            twoNumberCols.push(col);
            colCounts[col] = 2; // Questa colonna avrà 2 numeri
        }
    }
    
    // Le altre colonne avranno 1 numero
    for (let col = 0; col < 9; col++) {
        if (colCounts[col] === 0) {
            colCounts[col] = 1;
        }
    }
    
    // Ora per ogni colonna, generiamo i numeri appropriati
    for (let col = 0; col < 9; col++) {
        const numbersInCol = colCounts[col];
        const min = col === 0 ? 1 : col * 10;
        const max = col === 8 ? 90 : (col + 1) * 10 - 1;
        
        // Genera numeri unici per questa colonna
        const colNumbers = [];
        while (colNumbers.length < numbersInCol) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNumbers.includes(num)) {
                colNumbers.push(num);
                numbers.push(num);
            }
        }
        
        // Ordina i numeri
        colNumbers.sort((a, b) => a - b);
        
        // Distribuisci i numeri nelle righe per questa colonna
        // Scegli le righe casualmente ma rispettando i limiti (max 5 numeri per riga)
        const availableRows = [0, 1, 2];
        
        // Per il primo numero della colonna
        if (numbersInCol >= 1) {
            let row;
            do {
                row = availableRows[Math.floor(Math.random() * availableRows.length)];
            } while (rowCounts[row] >= 5);
            
            grid[row][col] = { number: colNumbers[0], marked: false };
            rowCounts[row]++;
            
            // Rimuovi questa riga dalle disponibili per evitare di mettere entrambi i numeri nella stessa riga
            // (non obbligatorio ma meglio per distribuzione)
            const index = availableRows.indexOf(row);
            if (index > -1) availableRows.splice(index, 1);
        }
        
        // Per il secondo numero della colonna (se presente)
        if (numbersInCol >= 2) {
            let row;
            do {
                row = availableRows[Math.floor(Math.random() * availableRows.length)];
            } while (rowCounts[row] >= 5);
            
            grid[row][col] = { number: colNumbers[1], marked: false };
            rowCounts[row]++;
        }
    }
    
    // Verifica che ogni riga abbia esattamente 5 numeri
    // Se non è così, sistemiamo
    for (let row = 0; row < 3; row++) {
        while (rowCounts[row] < 5) {
            // Trova una riga con più di 5 numeri e sposta qui
            for (let otherRow = 0; otherRow < 3; otherRow++) {
                if (rowCounts[otherRow] > 5 && row !== otherRow) {
                    // Trova una colonna dove questa riga ha un numero e l'altra no
                    for (let col = 0; col < 9; col++) {
                        if (grid[otherRow][col] && !grid[row][col]) {
                            grid[row][col] = grid[otherRow][col];
                            grid[otherRow][col] = null;
                            rowCounts[row]++;
                            rowCounts[otherRow]--;
                            break;
                        }
                    }
                    break;
                }
            }
        }
    }
    
    // Converti in formato per il frontend
    const card = {
        numbers: [],
        rows: [[], [], []]
    };
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 9; col++) {
            if (grid[row][col]) {
                card.numbers.push(grid[row][col]);
                card.rows[row].push(grid[row][col]);
            } else {
                card.rows[row].push(null);
            }
        }
    }
    
    return card;
}

function generateCards(count) {
    const cards = [];
    for (let i = 0; i < count; i++) {
        cards.push(generateTombolaCard());
    }
    return cards;
}

function countMarkedNumbers(player) {
    let total = 0;
    player.cards.forEach(card => {
        card.numbers.forEach(num => {
            if (num.marked) total++;
        });
    });
    return total;
}

// Funzione per registrare una vincita nello storico
function recordWin(roomCode, winData) {
    if (!winHistory.has(roomCode)) {
        winHistory.set(roomCode, []);
    }
    
    const history = winHistory.get(roomCode);
    winData.timestamp = new Date().toISOString();
    history.push(winData);
    
    // Mantieni solo le ultime 50 vincite
    if (history.length > 50) {
        history.shift();
    }
}

// Controlla vincite per un giocatore
function checkWinsForPlayer(player, roomCode, newNumber) {
    const wins = [];
    
    player.cards.forEach((card, cardIndex) => {
        // Controlla ogni riga
        card.rows.forEach((row, rowIndex) => {
            const markedInRow = row.filter(cell => cell && cell.marked).length;
            
            if (markedInRow >= 2) {
                const winTypes = {
                    2: 'ambo',
                    3: 'terna', 
                    4: 'quaterna',
                    5: 'cinquina'
                };
                
                if (winTypes[markedInRow]) {
                    // Controlla se questa vincita è già stata registrata per questa riga
                    const winKey = `${player.id}-${cardIndex}-${rowIndex}-${winTypes[markedInRow]}`;
                    if (!player.winHistory) player.winHistory = new Set();
                    
                    if (!player.winHistory.has(winKey)) {
                        player.winHistory.add(winKey);
                        
                        const winData = {
                            playerName: player.name,
                            playerId: player.id,
                            type: winTypes[markedInRow],
                            cardIndex: cardIndex,
                            rowIndex: rowIndex,
                            number: newNumber
                        };
                        
                        wins.push(winData);
                        recordWin(roomCode, winData);
                    }
                }
            }
        });
        
        // Controlla tombola (tutta la cartella)
        const totalMarked = card.numbers.filter(num => num.marked).length;
        if (totalMarked === 15) {
            const winKey = `${player.id}-${cardIndex}-tombola`;
            if (!player.winHistory.has(winKey)) {
                player.winHistory.add(winKey);
                
                const winData = {
                    playerName: player.name,
                    playerId: player.id,
                    type: 'tombola',
                    cardIndex: cardIndex,
                    number: newNumber
                };
                
                wins.push(winData);
                recordWin(roomCode, winData);
            }
        }
    });
    
    return wins;
}

// WebSocket
io.on('connection', (socket) => {
    console.log('Nuova connessione:', socket.id);
    
    // Giocatore si unisce a una stanza
    socket.on('join-room', (data) => {
        const { roomCode, playerName, cardsCount } = data;
        const room = rooms.get(roomCode);
        
        if (!room) {
            socket.emit('join-error', 'Stanza non trovata');
            return;
        }
        
        if (room.players.size >= room.maxPlayers) {
            socket.emit('join-error', 'Stanza piena');
            return;
        }
        
        // Genera le cartelle
        const cards = generateCards(cardsCount);
        
        // Crea il giocatore
        const player = {
            id: socket.id,
            name: playerName,
            roomCode,
            cardsCount,
            cards: cards,
            markedCount: 0,
            socketId: socket.id,
            joinedAt: new Date().toISOString(),
            winHistory: new Set()
        };
        
        // Aggiungi alla stanza
        room.players.set(socket.id, player);
        players.set(socket.id, player);
        
        // Inizializza storico vincite per la stanza se non esiste
        if (!winHistory.has(roomCode)) {
            winHistory.set(roomCode, []);
        }
        
        // Unisciti alla room socket
        socket.join(roomCode);
        
        // Invia dati al giocatore
        socket.emit('joined-room', {
            roomName: room.name,
            players: Array.from(room.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                cardsCount: p.cardsCount,
                markedCount: p.markedCount
            })),
            cards: cards,
            extractedNumbers: room.extractedNumbers,
            lastNumber: room.lastNumber,
            winHistory: winHistory.get(roomCode) || []
        });
        
        // Notifica agli altri
        socket.to(roomCode).emit('player-joined', {
            id: socket.id,
            name: playerName,
            cardsCount
        });
        
        // Aggiorna admin
        io.to(`admin-${roomCode}`).emit('room-update', {
            players: Array.from(room.players.values()),
            extractedNumbers: room.extractedNumbers.length
        });
        
        console.log(`Giocatore ${playerName} si è unito alla stanza ${roomCode}`);
    });
    
    // Admin si connette a una stanza
    socket.on('admin-join', (roomCode) => {
        const room = rooms.get(roomCode);
        if (room) {
            socket.join(`admin-${roomCode}`);
            socket.emit('admin-room-data', {
                players: Array.from(room.players.values()),
                extractedNumbers: room.extractedNumbers,
                lastNumber: room.lastNumber,
                winHistory: winHistory.get(roomCode) || []
            });
        }
    });
    
    // Admin crea una stanza
    socket.on('create-room', (data) => {
        const roomCode = generateId(6);
        const room = {
            id: roomCode,
            name: data.name,
            maxPlayers: data.maxPlayers,
            createdAt: new Date().toISOString(),
            isActive: true,
            extractedNumbers: [],
            lastNumber: null,
            players: new Map(),
            adminSocketId: socket.id
        };
        
        rooms.set(roomCode, room);
        socket.join(`admin-${roomCode}`);
        
        socket.emit('room-created', {
            roomCode,
            name: data.name,
            maxPlayers: data.maxPlayers
        });
        
        console.log(`Stanza ${roomCode} creata da admin`);
    });
    
    // Admin estrae un numero
    socket.on('extract-number', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('extraction-error', 'Stanza non trovata');
            return;
        }
        
        if (room.extractedNumbers.length >= 90) {
            socket.emit('extraction-error', 'Tutti i numeri sono già stati estratti');
            return;
        }
        
        let newNumber;
        let attempts = 0;
        
        // Trova un numero non estratto
        do {
            newNumber = Math.floor(Math.random() * 90) + 1;
            attempts++;
            if (attempts > 1000) {
                socket.emit('extraction-error', 'Impossibile trovare un numero non estratto');
                return;
            }
        } while (room.extractedNumbers.includes(newNumber));
        
        room.extractedNumbers.push(newNumber);
        room.lastNumber = newNumber;
        
        // Aggiorna tutti i giocatori segnando i numeri
        const allWins = [];
        
        room.players.forEach(player => {
            player.cards.forEach(card => {
                card.numbers.forEach(numObj => {
                    if (numObj.number === newNumber) {
                        numObj.marked = true;
                    }
                });
            });
            player.markedCount = countMarkedNumbers(player);
            
            // Controlla vincite per questo giocatore
            const playerWins = checkWinsForPlayer(player, roomCode, newNumber);
            allWins.push(...playerWins);
        });
        
        // Invia a tutti nella stanza
        io.to(roomCode).emit('number-extracted', {
            number: newNumber,
            extractedCount: room.extractedNumbers.length,
            extractedNumbers: room.extractedNumbers
        });
        
        // Notifica vincite
        allWins.forEach(win => {
            if (win.type === 'tombola') {
                io.to(roomCode).emit('player-won', win);
                io.to(`admin-${roomCode}`).emit('player-won', win);
            } else {
                // Per ambo/terna/quaterna/cinquina, invia solo al giocatore e admin
                io.to(win.playerId).emit('win-detected', win);
                io.to(`admin-${roomCode}`).emit('win-detected', win);
                
                // Se è cinquina, notifica anche gli altri giocatori
                if (win.type === 'cinquina') {
                    socket.to(roomCode).emit('player-cinquina', {
                        playerName: win.playerName,
                        cardIndex: win.cardIndex,
                        row: win.rowIndex + 1
                    });
                }
            }
        });
        
        // Aggiorna admin con il numero estratto
        io.to(`admin-${roomCode}`).emit('number-extracted-admin', {
            number: newNumber,
            extractedNumbers: room.extractedNumbers
        });
        
        console.log(`Numero ${newNumber} estratto nella stanza ${roomCode}`);
    });
    
    // Giocatore segna manualmente un numero (doppio click per sicurezza)
    socket.on('mark-number-manual', (data) => {
        const { roomCode, cardIndex, number } = data;
        const player = players.get(socket.id);
        const room = rooms.get(roomCode);
        
        if (!player || !room) return;
        
        // Verifica che il numero sia stato estratto
        if (!room.extractedNumbers.includes(number)) {
            socket.emit('mark-error', 'Numero non ancora estratto');
            return;
        }
        
        // Trova e segna il numero nella cartella
        let found = false;
        player.cards[cardIndex].numbers.forEach(numObj => {
            if (numObj.number === number && !numObj.marked) {
                numObj.marked = true;
                found = true;
            }
        });
        
        if (found) {
            player.markedCount = countMarkedNumbers(player);
            
            // Controlla vincite
            const wins = checkWinsForPlayer(player, roomCode, number);
            
            // Notifica vincite
            wins.forEach(win => {
                if (win.type === 'tombola') {
                    io.to(roomCode).emit('player-won', win);
                    io.to(`admin-${roomCode}`).emit('player-won', win);
                } else {
                    socket.emit('win-detected', win);
                    io.to(`admin-${roomCode}`).emit('win-detected', win);
                    
                    if (win.type === 'cinquina') {
                        socket.to(roomCode).emit('player-cinquina', {
                            playerName: win.playerName,
                            cardIndex: win.cardIndex,
                            row: win.rowIndex + 1
                        });
                    }
                }
            });
            
            // Aggiorna admin
            io.to(`admin-${roomCode}`).emit('player-updated', {
                playerId: socket.id,
                markedCount: player.markedCount,
                name: player.name
            });
        }
    });
    
    // Admin resetta estrazione
    socket.on('reset-extraction', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        
        room.extractedNumbers = [];
        room.lastNumber = null;
        
        // Reset numeri segnati per tutti i giocatori
        room.players.forEach(player => {
            player.cards.forEach(card => {
                card.numbers.forEach(num => num.marked = false);
            });
            player.markedCount = 0;
            player.winHistory = new Set();
        });
        
        // Resetta storico vincite
        winHistory.set(roomCode, []);
        
        // Notifica a tutti
        io.to(roomCode).emit('extraction-reset');
        io.to(`admin-${roomCode}`).emit('extraction-reset-admin');
    });
    
    // Disconnessione
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            const room = rooms.get(player.roomCode);
            if (room) {
                room.players.delete(socket.id);
                
                // Notifica agli altri
                io.to(player.roomCode).emit('player-left', {
                    playerId: socket.id,
                    playerName: player.name
                });
                
                // Aggiorna admin
                io.to(`admin-${player.roomCode}`).emit('room-update', {
                    players: Array.from(room.players.values()),
                    extractedNumbers: room.extractedNumbers.length
                });
            }
            players.delete(socket.id);
        }
        
        console.log('Disconnessione:', socket.id);
    });
});

// Avvia server
server.listen(PORT, () => {
    console.log(`Server Tombola Natalizia in esecuzione sulla porta ${PORT}`);
});
