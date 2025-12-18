// Effetto neve natalizia
document.addEventListener('DOMContentLoaded', function() {
    const snowContainer = document.getElementById('snow-container');
    const snowflakesCount = 80;
    
    for (let i = 0; i < snowflakesCount; i++) {
        createSnowflake();
    }
    
    function createSnowflake() {
        const snowflake = document.createElement('div');
        snowflake.classList.add('snowflake');
        snowflake.innerHTML = '❄';
        
        // Posizione casuale
        const startX = Math.random() * 100;
        const startY = Math.random() * -20;
        
        // Dimensioni casuali
        const size = Math.random() * 20 + 10;
        const opacity = Math.random() * 0.5 + 0.3;
        
        // Durata e ritardo casuali
        const duration = Math.random() * 10 + 10;
        const delay = Math.random() * 5;
        
        // Applica stili
        snowflake.style.position = 'absolute';
        snowflake.style.left = `${startX}%`;
        snowflake.style.top = `${startY}%`;
        snowflake.style.fontSize = `${size}px`;
        snowflake.style.opacity = opacity;
        snowflake.style.color = 'white';
        snowflake.style.userSelect = 'none';
        snowflake.style.pointerEvents = 'none';
        snowflake.style.zIndex = '1';
        
        // Aggiungi animazione
        snowflake.style.animation = `fall ${duration}s linear ${delay}s infinite`;
        
        snowContainer.appendChild(snowflake);
    }
    
    // Aggiungi stili CSS per l'animazione
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fall {
            0% {
                transform: translateY(0) rotate(0deg);
                opacity: 0.8;
            }
            100% {
                transform: translateY(100vh) rotate(360deg);
                opacity: 0;
            }
        }
        
        .snowflake {
            position: absolute;
            top: -20px;
            z-index: 1;
            pointer-events: none;
            user-select: none;
        }
    `;
    
    document.head.appendChild(style);
});
