const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Servi i file statici
app.use(express.static(__dirname));

// Route per le pagine principali
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'player.html'));
});

// API endpoint (semplici, per demo)
app.get('/api/check-room/:code', (req, res) => {
    // In un'app reale, controlleresti se la stanza esiste nel database
    const roomCode = req.params.code;
    
    // Simula una risposta
    res.json({
        exists: true,
        name: `Tombola di Natale ${new Date().getFullYear()}`,
        players: Math.floor(Math.random() * 15) + 1,
        maxPlayers: 20
    });
});

// Avvia il server
app.listen(PORT, () => {
    console.log(`Server Tombola Natalizia in esecuzione sulla porta ${PORT}`);
});
