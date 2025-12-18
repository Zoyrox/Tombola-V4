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

// Storico vincite globali per stanza - ogni tipo può essere fatto solo una volta
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

// API per verificare se un numero è stato estratto in una stanza
app.get('/api/room/:code/check-number/:number', (req, res) => {
    const roomCode = req.params.code.toUpperCase();
    const number = parseInt(req.params.number);
    const room = rooms.get(roomCode);
    
    if (!room) {
        return res.json({ exists: false, extracted: false });
    }
    
    const extracted = room.extractedNumbers.includes(number);
    res.json({
        exists: true,
        extracted: extracted,
        lastNumber: room.lastNumber
    });
});

// FUNZIONE PER GENERARE CARTELLE TOMBOLA CORRETTE
function generateTombolaCard() {
    const grid = Array(3).fill().map(() => Array(9).fill(null));
    const rowCounts = [0, 0, 0];
    const colCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    // Distribuzione: 6 colonne con 2 numeri, 3 colonne con 1 numero
    const twoNumCols = [];
    while (twoNumCols.length < 6) {
        const col = Math.floor(Math.random() * 9);
        if (!twoNumCols.includes(col)) {
            twoNumCols.push(col);
        }
    }
    
    // Imposta contatori colonne
    for (let col = 0; col < 9; col++) {
        colCounts[col] = twoNumCols.includes(col) ? 2 : 1;
    }
    
    // Per ogni colonna, genera i numeri
    for (let col = 0; col < 9; col++) {
        const numbersNeeded = colCounts[col];
        const min = col === 0 ? 1 : col * 10;
        const max = col === 8 ? 90 : (col + 1) * 10 - 1;
        
        // Genera numeri unici per questa colonna
        const colNumbers = [];
        while (colNumbers.length < numbersNeeded) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNumbers.includes(num)) {
                colNumbers.push(num);
            }
        }
        
        colNumbers.sort((a, b) => a - b);
        
        // Distribuisci nelle righe
        const availableRows = [0, 1, 2];
        
        for (let i = 0; i < numbersNeeded; i++) {
            let row;
            let attempts = 0;
            do {
                row = availableRows[Math.floor(Math.random() * availableRows.length)];
                attempts++;
                if (attempts > 10) {
                    for (let r = 0; r < 3; r++) {
                        if (rowCounts[r] < 5 && !grid[r][col]) {
                            row = r;
                            break;
                        }
                    }
                }
            } while (rowCounts[row] >= 5 || grid[row][col]);
            
            grid[row][col] = { number: colNumbers[i], marked: false };
            rowCounts[row]++;
            
            const index = availableRows.indexOf(row);
            if (index > -1) availableRows.splice(index, 1);
        }
    }
    
    // Sistema distribuzione se necessario
    for (let row = 0; row < 3; row++) {
        while (rowCounts[row] < 5) {
            for (let col = 0; col < 9; col++) {
                if (!grid[row][col]) {
                    for (let otherRow = 0; otherRow < 3; otherRow++) {
                        if (otherRow !== row && grid[otherRow][col] && rowCounts[otherRow] > 5) {
                            grid[row][col] = grid[otherRow][col];
                            grid[otherRow][col] = null;
                            rowCounts[row]++;
                            rowCounts[otherRow]--;
                            break;
                        }
                    }
                    if (rowCounts[row] === 5) break;
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

// Controlla se una vincita di un certo tipo è già stata fatta nella stanza
function hasWinTypeBeenMade(roomCode, winType) {
    const history = winHistory.get(roomCode);
    if (!history) return false;
    
    return history.some(win => win.type === winType);
}

// Registra una vincita (solo se è la prima di quel tipo)
function recordWin(roomCode, winData) {
    if (!winHistory.has(roomCode)) {
        winHistory.set(roomCode, []);
    }
    
    const history = winHistory.get(roomCode);
    
    // Controlla se questa vincita è già stata fatta
    const alreadyMade = hasWinTypeBeenMade(roomCode, winData.type);
    
    if (!alreadyMade) {
        winData.timestamp = new Date().toISOString();
        history.push(winData);
        return true; // Vincita registrata
    }
    
    return false; // Vincita già fatta
}

// Controlla tutte le possibili vincite per un giocatore
function checkAllPossibleWins(player, roomCode) {
    const newWins = [];
    
    player.cards.forEach((card, cardIndex) => {
        // Controlla TOMBOLA (tutta la cartella)
        const totalMarked = card.numbers.filter(num => num.marked).length;
        if (totalMarked === 15 && !hasWinTypeBeenMade(roomCode, 'tombola')) {
            const winData = {
                playerName: player.name,
                playerId: player.id,
                type: 'tombola',
                cardIndex: cardIndex,
                timestamp: new Date().toISOString()
            };
            
            if (recordWin(roomCode, winData)) {
                newWins.push(winData);
            }
        }
        
        // Controlla ogni riga per ambo/terna/quaterna/cinquina
        card.rows.forEach((row, rowIndex) => {
            const markedInRow = row.filter(cell => cell && cell.marked).length;
            
            if (markedInRow >= 2) {
                const winTypes = {
                    2: 'ambo',
                    3: 'terna', 
                    4: 'quaterna',
                    5: 'cinquina'
                };
                
                const winType = winTypes[markedInRow];
                if (winType && !hasWinTypeBeenMade(roomCode, winType)) {
                    const winData = {
                        playerName: player.name,
                        playerId: player.id,
                        type: winType,
                        cardIndex: cardIndex,
                        rowIndex: rowIndex,
                        timestamp: new Date().toISOString()
                    };
                    
                    if (recordWin(roomCode, winData)) {
                        newWins.push(winData);
                    }
                }
            }
        });
    });
    
    return newWins;
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
            joinedAt: new Date().toISOString()
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
            extractedNumbers: room.extractedNumbers.length,
            winHistory: winHistory.get(roomCode) || []
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
        
        // Segna il numero su tutte le cartelle dei giocatori
        room.players.forEach(player => {
            player.cards.forEach(card => {
                card.numbers.forEach(numObj => {
                    if (numObj.number === newNumber) {
                        numObj.marked = true;
                    }
                });
            });
            player.markedCount = countMarkedNumbers(player);
        });
        
        // Controlla se qualcuno ha fatto una vincita con questo numero
        const allWins = [];
        room.players.forEach(player => {
            const playerWins = checkAllPossibleWins(player, roomCode);
            allWins.push(...playerWins);
        });
        
        // Invia a tutti nella stanza SOLO il numero corrente
        io.to(roomCode).emit('number-extracted', {
            number: newNumber,
            extractedCount: room.extractedNumbers.length
        });
        
        // Notifica vincite (se ci sono nuove vincite)
        allWins.forEach(win => {
            if (win.type === 'tombola') {
                io.to(roomCode).emit('player-won', win);
                io.to(`admin-${roomCode}`).emit('player-won', win);
            } else {
                io.to(roomCode).emit('win-detected', win);
                io.to(`admin-${roomCode}`).emit('win-detected', win);
            }
        });
        
        // Aggiorna admin
        io.to(`admin-${roomCode}`).emit('number-extracted-admin', {
            number: newNumber,
            extractedNumbers: room.extractedNumbers,
            winHistory: winHistory.get(roomCode) || []
        });
        
        console.log(`Numero ${newNumber} estratto nella stanza ${roomCode}`);
    });
    
    // Giocatore segna manualmente un numero
    socket.on('mark-number-manual', (data) => {
        const { roomCode, cardIndex, number } = data;
        const player = players.get(socket.id);
        const room = rooms.get(roomCode);
        
        if (!player || !room) {
            socket.emit('mark-error', 'Errore: giocatore o stanza non trovati');
            return;
        }
        
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
            
            // Controlla se con questo numero il giocatore ha fatto una vincita
            const newWins = checkAllPossibleWins(player, roomCode);
            
            // Notifica vincite (se ci sono nuove vincite)
            newWins.forEach(win => {
                if (win.type === 'tombola') {
                    io.to(roomCode).emit('player-won', win);
                    io.to(`admin-${roomCode}`).emit('player-won', win);
                } else {
                    io.to(roomCode).emit('win-detected', win);
                    io.to(`admin-${roomCode}`).emit('win-detected', win);
                }
            });
            
            // Aggiorna admin
            io.to(`admin-${roomCode}`).emit('player-updated', {
                playerId: socket.id,
                markedCount: player.markedCount,
                name: player.name
            });
            
            socket.emit('number-marked', {
                cardIndex: cardIndex,
                number: number,
                success: true
            });
        } else {
            socket.emit('mark-error', 'Numero non trovato o già segnato');
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
        });
        
        // Resetta storico vincite
        winHistory.set(roomCode, []);
        
        // Notifica a tutti
        io.to(roomCode).emit('extraction-reset');
        io.to(`admin-${roomCode}`).emit('extraction-reset-admin', {
            winHistory: []
        });
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
                    extractedNumbers: room.extractedNumbers.length,
                    winHistory: winHistory.get(roomCode) || []
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
