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

// Database in memoria (in produzione usa un database vero)
const rooms = new Map();
const players = new Map();

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
    // In una app reale, qui controlleresti l'autenticazione
    // Per semplicità, permettiamo l'accesso diretto
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
        .filter(room => room.isActive && room.players.size > 0)
        .map(room => ({
            id: room.id,
            name: room.name,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            createdAt: room.createdAt
        }));
    
    res.json(activeRooms);
});

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
        
        // Genera le cartelle per il giocatore
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
            cards: cards, // Invia le cartelle generate
            extractedNumbers: room.extractedNumbers,
            lastNumber: room.lastNumber
        });
        
        // Notifica agli altri nella stanza
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
                lastNumber: room.lastNumber
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
        if (!room) return;
        
        if (room.extractedNumbers.length >= 90) {
            socket.emit('extraction-error', 'Tutti i numeri sono già stati estratti');
            return;
        }
        
        let newNumber;
        do {
            newNumber = Math.floor(Math.random() * 90) + 1;
        } while (room.extractedNumbers.includes(newNumber));
        
        room.extractedNumbers.push(newNumber);
        room.lastNumber = newNumber;
        
        // Invia a tutti nella stanza
        io.to(roomCode).emit('number-extracted', {
            number: newNumber,
            extractedCount: room.extractedNumbers.length,
            extractedNumbers: room.extractedNumbers
        });
        
        // Aggiorna admin
        io.to(`admin-${roomCode}`).emit('number-extracted-admin', {
            number: newNumber,
            extractedNumbers: room.extractedNumbers
        });
        
        // Verifica vincite
        checkWinners(roomCode, newNumber);
    });
    
    // Giocatore segna un numero
    socket.on('mark-number', (data) => {
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
        const card = player.cards[cardIndex];
        const numberObj = card.find(n => n.number === number);
        
        if (numberObj && !numberObj.marked) {
            numberObj.marked = true;
            player.markedCount = countMarkedNumbers(player);
            
            // Aggiorna admin
            io.to(`admin-${roomCode}`).emit('player-updated', {
                playerId: socket.id,
                markedCount: player.markedCount,
                name: player.name
            });
            
            // Verifica se ha vinto
            if (player.markedCount === 15 * player.cardsCount) {
                io.to(roomCode).emit('player-won', {
                    playerName: player.name,
                    cardIndex
                });
            }
        }
    });
    
    // Giocatore lascia la stanza
    socket.on('leave-room', (roomCode) => {
        const player = players.get(socket.id);
        const room = rooms.get(roomCode);
        
        if (player && room) {
            room.players.delete(socket.id);
            players.delete(socket.id);
            
            // Notifica agli altri
            socket.to(roomCode).emit('player-left', {
                playerId: socket.id,
                playerName: player.name
            });
            
            // Aggiorna admin
            io.to(`admin-${roomCode}`).emit('room-update', {
                players: Array.from(room.players.values()),
                extractedNumbers: room.extractedNumbers.length
            });
        }
        
        socket.leave(roomCode);
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
                card.forEach(num => num.marked = false);
            });
            player.markedCount = 0;
        });
        
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

// Funzioni helper per generare cartelle corrette 3x9
function generateCards(count) {
    const cards = [];
    
    for (let i = 0; i < count; i++) {
        const card = generateTombolaCard();
        cards.push(card);
    }
    
    return cards;
}

// Sostituisci la funzione generateTombolaCard() nel server.js con questa:

function generateTombolaCard() {
    // Una cartella tombola ufficiale ha 15 numeri in una griglia 3x9
    // Regole:
    // 1. Ogni riga ha esattamente 5 numeri
    // 2. Ogni colonna ha da 1 a 3 numeri
    // 3. I numeri sono organizzati per decine nelle colonne:
    //    Col1: 1-9, Col2: 10-19, Col3: 20-29, ..., Col9: 80-90
    
    const card = {
        numbers: [], // Array di oggetti {number, marked}
        rows: [[], [], []] // Per memorizzare la struttura 3x9
    };
    
    // Inizializza la griglia 3x9 con celle vuote
    const grid = Array(3).fill().map(() => Array(9).fill(null));
    
    // Per ogni colonna (1-9), determina quanti numeri mettere (1, 2 o 3)
    const numbersPerColumn = Array(9).fill(0);
    
    // Distribuisci i 15 numeri tra le 9 colonne
    let remainingNumbers = 15;
    for (let col = 0; col < 9; col++) {
        if (col === 8) { // Ultima colonna prende i rimanenti
            numbersPerColumn[col] = remainingNumbers;
        } else {
            // Determina casualmente 1, 2 o 3 numeri per questa colonna
            // Assicurati che ci siano abbastanza colonne rimanenti per i numeri rimasti
            const maxForThisCol = Math.min(3, remainingNumbers - (8 - col));
            const minForThisCol = Math.max(1, remainingNumbers - (3 * (8 - col)));
            const count = Math.floor(Math.random() * (maxForThisCol - minForThisCol + 1)) + minForThisCol;
            
            numbersPerColumn[col] = count;
            remainingNumbers -= count;
        }
    }
    
    // Mescola l'ordine delle colonne per varietà
    for (let i = numbersPerColumn.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbersPerColumn[i], numbersPerColumn[j]] = [numbersPerColumn[j], numbersPerColumn[i]];
    }
    
    // Per ogni colonna, genera i numeri e posizionali nelle righe
    for (let col = 0; col < 9; col++) {
        const count = numbersPerColumn[col];
        
        // Determina il range per questa colonna
        const min = col * 10 + 1;
        const max = col === 8 ? 90 : (col + 1) * 10;
        
        // Genera 'count' numeri unici per questa colonna
        const columnNumbers = [];
        while (columnNumbers.length < count) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!columnNumbers.includes(num)) {
                columnNumbers.push(num);
            }
        }
        
        // Ordina i numeri
        columnNumbers.sort((a, b) => a - b);
        
        // Determina in quali righe posizionare questi numeri
        const rowIndices = [0, 1, 2];
        // Mescola le righe per posizionamento casuale
        for (let i = rowIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rowIndices[i], rowIndices[j]] = [rowIndices[j], rowIndices[i]];
        }
        
        // Posiziona i numeri nelle prime 'count' righe dell'array mescolato
        for (let i = 0; i < count; i++) {
            const row = rowIndices[i];
            grid[row][col] = {
                number: columnNumbers[i],
                marked: false
            };
        }
    }
    
    // Converti la griglia in array lineare per il frontend
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

// Modifica la funzione checkWinners per controllare ambo, terna, etc.
function checkWinners(roomCode, newNumber) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.players.forEach(player => {
        player.cards.forEach((card, cardIndex) => {
            // Controlla per ogni riga della cartella
            card.rows.forEach((row, rowIndex) => {
                const markedInRow = row.filter(cell => cell && cell.marked).length;
                
                // Controlla le varie vincite
                if (markedInRow >= 2) {
                    // Ambo (2 numeri)
                    if (markedInRow === 2) {
                        io.to(player.socketId).emit('win-detected', {
                            type: 'ambo',
                            row: rowIndex,
                            cardIndex: cardIndex
                        });
                    }
                    // Terna (3 numeri)
                    if (markedInRow === 3) {
                        io.to(player.socketId).emit('win-detected', {
                            type: 'terna',
                            row: rowIndex,
                            cardIndex: cardIndex
                        });
                    }
                    // Quaterna (4 numeri)
                    if (markedInRow === 4) {
                        io.to(player.socketId).emit('win-detected', {
                            type: 'quaterna',
                            row: rowIndex,
                            cardIndex: cardIndex
                        });
                    }
                    // Cinquina (5 numeri) - riga completa
                    if (markedInRow === 5) {
                        io.to(player.socketId).emit('win-detected', {
                            type: 'cinquina',
                            row: rowIndex,
                            cardIndex: cardIndex
                        });
                        
                        // Notifica a tutti che qualcuno ha fatto cinquina
                        io.to(roomCode).emit('player-cinquina', {
                            playerName: player.name,
                            cardIndex: cardIndex,
                            row: rowIndex + 1
                        });
                    }
                }
            });
            
            // Controlla Tombola (tutti i 15 numeri della cartella)
            const totalMarked = card.numbers.filter(num => num.marked).length;
            if (totalMarked === 15) {
                io.to(roomCode).emit('player-won', {
                    playerName: player.name,
                    cardIndex: cardIndex,
                    type: 'tombola'
                });
            }
        });
    });
}

// Modifica anche la funzione countMarkedNumbers per contare per riga
function countMarkedNumbers(player) {
    let total = 0;
    let byRow = [0, 0, 0];
    
    player.cards.forEach(card => {
        card.numbers.forEach(num => {
            if (num.marked) total++;
        });
        
        // Conta anche per riga
        if (card.rows) {
            card.rows.forEach((row, index) => {
                const markedInRow = row.filter(cell => cell && cell.marked).length;
                byRow[index] += markedInRow;
            });
        }
    });
    
    return { total, byRow };
}
function countMarkedNumbers(player) {
    let total = 0;
    player.cards.forEach(card => {
        card.forEach(num => {
            if (num.marked) total++;
        });
    });
    return total;
}

function checkWinners(roomCode, newNumber) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.players.forEach(player => {
        player.cards.forEach((card, cardIndex) => {
            const markedInCard = card.filter(num => num.marked).length;
            if (markedInCard === 15) {
                io.to(roomCode).emit('player-won', {
                    playerName: player.name,
                    cardIndex
                });
            }
        });
    });
}

// Avvia server
server.listen(PORT, () => {
    console.log(`Server Tombola Natalizia in esecuzione sulla porta ${PORT}`);
    console.log(`Admin email: ${ADMIN_EMAIL}`);
});
