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

// FUNZIONE PER GENERARE CARTELLE TOMBOLA CORRETTE
function generateTombolaCard() {
    // Creiamo una griglia 3x9 vuota
    const grid = Array(3).fill().map(() => Array(9).fill(null));
    
    // Numeri da distribuire: 15 numeri totali
    let numbersToPlace = 15;
    
    // Per ogni colonna, decidiamo quanti numeri mettere (1, 2 o 3)
    const numbersPerColumn = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    // Distribuiamo 15 numeri tra 9 colonne
    for (let i = 0; i < 15; i++) {
        // Scegli una colonna casuale che non abbia già 3 numeri
        let col;
        do {
            col = Math.floor(Math.random() * 9);
        } while (numbersPerColumn[col] >= 3);
        
        numbersPerColumn[col]++;
    }
    
    // Per ogni colonna, generiamo i numeri appropriati
    for (let col = 0; col < 9; col++) {
        const count = numbersPerColumn[col];
        if (count === 0) continue;
        
        // Range per questa colonna
        const min = col === 0 ? 1 : col * 10;
        const max = col === 8 ? 90 : (col + 1) * 10 - 1;
        
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
        
        // Scegli le righe dove mettere questi numeri
        const availableRows = [0, 1, 2];
        // Mescola le righe
        for (let i = availableRows.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableRows[i], availableRows[j]] = [availableRows[j], availableRows[i]];
        }
        
        // Posiziona i numeri nelle righe selezionate
        for (let i = 0; i < count; i++) {
            const row = availableRows[i];
            grid[row][col] = {
                number: columnNumbers[i],
                marked: false
            };
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

function checkWinsForPlayer(player, roomCode) {
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
                    // Invia notifica al giocatore
                    io.to(player.socketId).emit('win-detected', {
                        type: winTypes[markedInRow],
                        row: rowIndex,
                        cardIndex: cardIndex
                    });
                    
                    // Notifica a tutti per la cinquina
                    if (markedInRow === 5) {
                        io.to(roomCode).emit('player-cinquina', {
                            playerName: player.name,
                            cardIndex: cardIndex,
                            row: rowIndex + 1
                        });
                    }
                }
            }
        });
        
        // Controlla tombola (tutta la cartella)
        const totalMarked = card.numbers.filter(num => num.marked).length;
        if (totalMarked === 15) {
            io.to(roomCode).emit('player-won', {
                playerName: player.name,
                cardIndex: cardIndex,
                type: 'tombola'
            });
        }
    });
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
            lastNumber: room.lastNumber
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
            checkWinsForPlayer(player, roomCode);
        });
        
        // Invia a tutti nella stanza
        io.to(roomCode).emit('number-extracted', {
            number: newNumber,
            extractedCount: room.extractedNumbers.length
        });
        
        // Aggiorna admin
        io.to(`admin-${roomCode}`).emit('number-extracted-admin', {
            number: newNumber,
            extractedNumbers: room.extractedNumbers
        });
        
        console.log(`Numero ${newNumber} estratto nella stanza ${roomCode}`);
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
