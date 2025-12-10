let gameEngine;
let eventManager;
let adviceService;
let hustleCardInstances = {};

document.addEventListener('DOMContentLoaded', async () => {
    checkForExistingSave();
    setupWelcomeScreen();
});

// Make this function globally accessible
window.checkForExistingSave = checkForExistingSave;

function checkForExistingSave() {
    const hasSave = localStorage.getItem('streetHustleSave_v1');
    const continueButton = document.getElementById('load-game');
    if (hasSave && continueButton) {
        continueButton.style.display = 'block';
        console.log('Continue button shown - save found');
    }
}

function setupWelcomeScreen() {
    document.body.classList.add('show-welcome');
    document.getElementById('start-game').addEventListener('click', () => {
        localStorage.removeItem('streetHustleSave_v1'); // Start fresh
        startGame();
    });
    
    document.getElementById('load-game').addEventListener('click', () => {
        startGame();
    });
}

async function startGame() {
    // Hide welcome screen and show game
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    document.body.classList.remove('show-welcome');
    
    // Initialize game engine FIRST
    gameEngine = new GameEngine();
    
    // THEN initialize PlayFab
    console.log("Setting up PlayFab...");
    await gameEngine.initializePlayFab();
    
    // Continue with normal initialization
    await gameEngine.init();
    
    eventManager = new EventManager(gameEngine);
    adviceService = new AdviceService(gameEngine);
    
    createAllHustleCards();
    setupEventListeners();
    
    eventManager.start();
    gameEngine.startGameLoop(renderUI);
    
    // Show tutorial for new players
    if (!localStorage.getItem('streetHustleSave_v1')) {
        setTimeout(() => {
            showTutorial();
        }, 1000);
    }
}

function showTutorial() {
    Swal.fire({
        title: 'Welcome to Street Hustle! 💰',
        html: `
            <div style="text-align: left;">
                <p><strong>How to Play:</strong></p>
                <p>💪 <strong>Manual Hustle:</strong> Click "Hustle" button to earn money manually</p>
                <p>⬆️ <strong>Upgrade:</strong> Use money to level up your hustles for more income</p>
                <p>🔓 <strong>Unlock New Hustles:</strong> Get your current hustle to <strong>level 5</strong> to unlock the next one</p>
                <p>🤖 <strong>Automate:</strong> High-level hustles run automatically</p>
                <p>ℹ️ <strong>Details:</strong> Click "Details" to learn about each hustle</p>
                <hr>
                <p style="color: #FFC700; font-weight: bold;">🎯 Start by upgrading "Wash Clothes" to level 5 to unlock "Sell Airtime"!</p>
            </div>
        `,
        confirmButtonText: 'Let\'s Get Rich!',
        confirmButtonColor: '#4CAF50',
        width: '90%'
    });
}

function createAllHustleCards() {
    const hustleGrid = document.getElementById('hustle-grid');
    hustleGrid.innerHTML = '';
    gameEngine.hustleConfig.forEach(hustleInfo => {
        hustleCardInstances[hustleInfo.id] = new HustleCard(hustleInfo.id, gameEngine);
        hustleGrid.appendChild(hustleCardInstances[hustleInfo.id].element);
    });
}

function setupEventListeners() {
    // Direct button event listeners
    document.getElementById('reset-game').addEventListener('click', () => gameEngine.resetGame());
    document.getElementById('get-advice').addEventListener('click', () => adviceService.getAdvice());
    document.getElementById('total-earnings').addEventListener('click', () => gameEngine.showEarningsStats());
    document.getElementById('exit-game').addEventListener('click', () => gameEngine.exitGame());
}

function renderUI() {
    // Update top bar
    document.getElementById('money-display').textContent = `UGX ${gameEngine.formatMoney(gameEngine.gameState.money)}`;
    document.getElementById('income-display').textContent = `UGX ${gameEngine.formatMoney(gameEngine.calculateIncomePerSecond())}/s`;
    document.getElementById('total-earnings-display').textContent = `UGX ${gameEngine.formatMoney(gameEngine.gameState.totalEarnings)}`;

    // Re-render all hustle cards
    for (const id in hustleCardInstances) {
        hustleCardInstances[id].render();
    }
}

// Make key functions globally accessible for exitGame()
window.createAllHustleCards = createAllHustleCards;
window.renderUI = renderUI;
window.EventManager = EventManager;
window.AdviceService = AdviceService;