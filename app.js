// ===================================================================
// FIREBASE-KONFIGURATION (ersetze mit deinen Daten)
// ===================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAeNB6gEFnKRPicGn0UYgrjG1m6lHllAOA", // Beispiel - durch eigene ersetzen
  authDomain: "skyjo-multiplayer.firebaseapp.com", // Beispiel - durch eigene ersetzen
  projectId: "skyjo-multiplayer", // Beispiel - durch eigene ersetzen
  storageBucket: "skyjo-multiplayer.appspot.com", // Beispiel - durch eigene ersetzen
  messagingSenderId: "514693348398", // Beispiel - durch eigene ersetzen
  appId: "1:514693348398:web:279883b9c88fc33e82b3bf" // Beispiel - durch eigene ersetzen
  // measurementId: "G-XXXXXXXXXX" // Optional
};
const appId = firebaseConfig.projectId; // Nutzt die projectId als App-ID für den Pfad
// ===================================================================


// Firebase-Module importieren
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc,
    onSnapshot, 
    collection, 
    query, 
    where, 
    writeBatch,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    enableNetwork // HINZUGEFÜGT: Für Reconnect-Versuch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Globale Variablen
let db, auth, userId;
let currentGameId = null;
let unsubscribeGameListener = null;
let aiTurnTimeoutId = null; // Für KI-Zug Timeout
let actionInProgress = false; // Sperrt Aktionen während Verarbeitung

// DOM-Elemente
const loaderEl = document.getElementById('loader');
const loaderTextEl = document.getElementById('loader-text');
const lobbyScreenEl = document.getElementById('lobby-screen');
const lobbyStartEl = document.getElementById('lobby-start');
const lobbyWaitEl = document.getElementById('lobby-wait');
const createGameButtonEl = document.getElementById('create-game-button');
const gameIdInputEl = document.getElementById('game-id-input');
const joinGameButtonEl = document.getElementById('join-game-button');
const joinErrorEl = document.getElementById('join-error');
const gameIdDisplayEl = document.getElementById('game-id-display');
const copyGameIdButtonEl = document.getElementById('copy-game-id-button');
const playerListEl = document.getElementById('player-list');
const startGameButtonEl = document.getElementById('start-game-button');
const backToLobbyButtonEl = document.getElementById('back-to-lobby-button');
const settingGoalScoreEl = document.getElementById('setting-goal-score');
const settingFlippedCardsEl = document.getElementById('setting-flipped-cards');
const settingNumAiEl = document.getElementById('setting-num-ai');
const settingAiDifficultyEl = document.getElementById('setting-ai-difficulty');
const allSettingsInputs = document.querySelectorAll('.setting-input');
const gameContainerEl = document.getElementById('game-container');
const opponentsAreaEl = document.getElementById('opponents-area');
const deckPileEl = document.getElementById('deck-pile');
const drawnCardAreaEl = document.getElementById('drawn-card-area');
const discardPileEl = document.getElementById('discard-pile');
const playerAreaEl = document.getElementById('player-area');
const turnIndicatorEl = document.getElementById('turn-indicator');
const playerGridEl = document.getElementById('player-grid');
const playerScoreEl = document.getElementById('player-score');
const messageEl = document.getElementById('message-area');
const previousScoreDisplayEl = document.getElementById('previous-score-display');
const previousScoresListEl = document.getElementById('previous-scores-list');
const modalEl = document.getElementById('modal');
const modalTitleEl = document.getElementById('modal-title');
const modalScoresContainerEl = document.getElementById('modal-scores-container');
const modalWinnerEl = document.getElementById('modal-winner');
const nextRoundButtonEl = document.getElementById('next-round-button');
const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toast-message');
const leaveGameButtonEl = document.getElementById('leave-game-button');
const leaveConfirmModalEl = document.getElementById('leave-confirm-modal');
const leaveConfirmCancelButtonEl = document.getElementById('leave-confirm-cancel-button');
const leaveConfirmConfirmButtonEl = document.getElementById('leave-confirm-confirm-button');
const infoButtonEl = document.getElementById('info-button');
const rulesModalEl = document.getElementById('rules-modal');
const closeRulesButtonEl = document.getElementById('close-rules-button');

// Sound-Elemente
const sounds = {
    draw: document.getElementById('sound-draw'),
    place: document.getElementById('sound-place'),
    flip: document.getElementById('sound-flip'),
    clear: document.getElementById('sound-clear'),
    roundEnd: document.getElementById('sound-round-end'),
};

// Sound-Manager
const soundManager = {
    play: (soundName) => {
        const sound = sounds[soundName];
        if (sound) {
            sound.currentTime = 0; 
            sound.play().catch(e => console.warn("Sound-Wiedergabe evtl. blockiert:", e));
        } else {
            console.warn(`Sound "${soundName}" nicht gefunden.`);
        }
    }
};

// KI-Konstanten
const AI_DIFFICULTY = {
    EASY: { DISCARD_TAKE_THRESHOLD: 2, DECK_SWAP_GOOD_CARD_THRESHOLD: 2, ASSUMED_FACEDOWN_VALUE: 8 },
    MEDIUM: { DISCARD_TAKE_THRESHOLD: 4, DECK_SWAP_GOOD_CARD_THRESHOLD: 3, ASSUMED_FACEDOWN_VALUE: 6 },
    HARD: { DISCARD_TAKE_THRESHOLD: 3, DECK_SWAP_GOOD_CARD_THRESHOLD: 1, ASSUMED_FACEDOWN_VALUE: 5 }
};

// Sammlungspfad-Funktion
const getGameCollectionPath = () => `/artifacts/${appId}/public/data/skyjoGames`;

// --- UI Hilfsfunktionen ---
function showToast(message, isError = false) {
    if (!toastEl || !toastMessageEl) return; 
    toastMessageEl.textContent = message;
    toastEl.className = `fixed top-4 left-1/2 -translate-x-1/2 text-white py-3 px-6 rounded-lg shadow-lg z-50 ${isError ? 'bg-red-600' : 'bg-green-600'}`;
    toastEl.classList.add('show');
    setTimeout(() => toastEl?.classList.remove('show'), 3000); 
}

function setMessage(msg) {
    if (messageEl) {
        messageEl.textContent = msg;
    }
}

// --- Event Listener Setup ---
function setupLobbyListeners() {
    createGameButtonEl?.addEventListener('click', createNewGame);
    joinGameButtonEl?.addEventListener('click', joinGame);
    startGameButtonEl?.addEventListener('click', startGame);
    copyGameIdButtonEl?.addEventListener('click', () => {
        if (!gameIdDisplayEl) return;
        gameIdDisplayEl.select();
        try { document.execCommand('copy'); showToast("Spiel-ID kopiert!"); } 
        catch (err) { console.error("Kopieren fehlgeschlagen:", err); showToast("Kopieren fehlgeschlagen", true); }
    });
    allSettingsInputs?.forEach(input => input.addEventListener('change', updateGameSettings));
    backToLobbyButtonEl?.addEventListener('click', () => {
        lobbyStartEl?.classList.remove('hidden');
        lobbyWaitEl?.classList.add('hidden');
    });
    leaveGameButtonEl?.addEventListener('click', () => {
        leaveConfirmModalEl?.classList.remove('hidden');
        leaveConfirmModalEl?.classList.add('flex');
    });
    leaveConfirmCancelButtonEl?.addEventListener('click', () => {
        leaveConfirmModalEl?.classList.add('hidden');
        leaveConfirmModalEl?.classList.remove('flex');
    });
    leaveConfirmConfirmButtonEl?.addEventListener('click', leaveGame);
    nextRoundButtonEl?.addEventListener('click', startNextRound);
    infoButtonEl?.addEventListener('click', () => {
        rulesModalEl?.classList.remove('hidden');
        rulesModalEl?.classList.add('flex');
    });
    closeRulesButtonEl?.addEventListener('click', () => {
        rulesModalEl?.classList.add('hidden');
        rulesModalEl?.classList.remove('flex');
    });
    rulesModalEl?.addEventListener('click', (event) => {
        if (event.target === rulesModalEl) {
             rulesModalEl?.classList.add('hidden');
             rulesModalEl?.classList.remove('flex');
        }
    });
}

function setupGameListeners() {
    deckPileEl?.addEventListener('click', onDeckDraw);
    discardPileEl?.addEventListener('click', onDiscardPileClick);
    drawnCardAreaEl?.addEventListener('click', onDrawnCardClick);
}

// --- Firebase Initialisierung & Authentifizierung ---
async function initFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        try { await enableNetwork(db); } catch (e) { console.warn("Netzwerk konnte nicht explizit aktiviert werden.", e); }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                const savedGameId = localStorage.getItem('skyjoGameId');
                if (savedGameId) {
                    if (loaderTextEl) loaderTextEl.textContent = "Verbinde mit letztem Spiel...";
                    if (!(await subscribeToGame(savedGameId))) {
                        resetToLobby(true); 
                    }
                } else {
                    resetToLobby(); 
                }
            } else {
                try {
                     await signInAnonymously(auth);
                } catch (signInError) {
                     console.error("Anonymer Login fehlgeschlagen:", signInError);
                     if(loaderTextEl) loaderTextEl.textContent = "Login fehlgeschlagen. Bitte neu laden.";
                     showToast("Anonymer Login fehlgeschlagen!", true);
                }
            }
        });
    } catch (error) {
        console.error("Firebase Init Fehler:", error);
        if(loaderTextEl) loaderTextEl.textContent = "Server-Fehler. Bitte neu laden.";
        showToast("Verbindung fehlgeschlagen!", true);
        resetToLobby(); 
    }
}

// --- Lobby & Spiel Beitritt/Erstellung/Verlassen ---
async function createNewGame() {
    if (loaderEl) loaderEl.classList.remove('hidden'); 
    if (loaderTextEl) loaderTextEl.textContent = "Erstelle Spiel...";
    const settings = {
        goalScore: parseInt(settingGoalScoreEl?.value || '100', 10),
        flippedCards: parseInt(settingFlippedCardsEl?.value || '2', 10),
        numAI: parseInt(settingNumAiEl?.value || '0', 10),
        aiDifficulty: settingAiDifficultyEl?.value || 'MEDIUM'
    };
    try {
        const player = { id: userId, name: `Spieler ${Math.floor(Math.random() * 1000)}`, isHost: true, isAI: false, grid: [], score: 0, totalScore: 0 };
        const gameDoc = { hostId: userId, players: [player], status: "lobby", deck: [], discardPile: [], currentPlayerIndex: 0, turnPhase: 'DRAW', selectedCard: null, lastRoundTriggered: false, playerWhoEndedRoundId: null, settings: settings, createdAt: serverTimestamp(), lastRoundScores: [] };
        const docRef = await addDoc(collection(db, getGameCollectionPath()), gameDoc);
        await subscribeToGame(docRef.id);
    } catch (error) { 
        console.error("Fehler beim Erstellen:", error); 
        loaderEl?.classList.add('hidden'); 
        showToast("Spielerstellung fehlgeschlagen!", true); 
    }
}

async function joinGame() {
    const gameId = gameIdInputEl?.value?.trim();
    if (!gameId) { if(joinErrorEl) joinErrorEl.textContent = "Bitte eine ID eingeben."; return; }
    if(loaderEl) loaderEl.classList.remove('hidden'); 
    if(loaderTextEl) loaderTextEl.textContent = "Trete Spiel bei..."; 
    if(joinErrorEl) joinErrorEl.textContent = "";
    try {
        const gameDocRef = doc(db, getGameCollectionPath(), gameId);
        const gameDocSnap = await getDoc(gameDocRef);
        if (!gameDocSnap.exists()) throw new Error("Spiel nicht gefunden.");
        const game = gameDocSnap.data();
        if (!game || !game.players || !game.settings) throw new Error("Ungültige Spieldaten.");
        if (game.status !== 'lobby') throw new Error("Spiel läuft bereits.");
        
        const currentPlayers = game.players.filter(p => p); 
        const totalPlayers = currentPlayers.length + (game.settings.numAI || 0);
        if (totalPlayers >= 4) throw new Error("Spiel ist voll (max. 4 Spieler, inkl. KI).");
        
        if (!currentPlayers.some(p => p.id === userId)) { 
            const player = { id: userId, name: `Spieler ${Math.floor(Math.random() * 1000)}`, isHost: false, isAI: false, grid: [], score: 0, totalScore: 0 };
            await updateDoc(gameDocRef, { players: arrayUnion(player) });
        }
        await subscribeToGame(gameId);
    } catch (error) { 
        console.error("Fehler beim Beitreten:", error); 
        loaderEl?.classList.add('hidden'); 
        if(joinErrorEl) joinErrorEl.textContent = error.message; 
    }
}

async function updateGameSettings() {
    if (!currentGameId || !userId) return; 
    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    try {
        const gameSnap = await getDoc(gameDocRef);
        if (!gameSnap.exists()) return;
        const game = gameSnap.data();
        if (!game || !game.hostId || game.hostId !== userId) return; 
        const settings = {
            goalScore: parseInt(settingGoalScoreEl?.value || '100', 10),
            flippedCards: parseInt(settingFlippedCardsEl?.value || '2', 10),
            numAI: parseInt(settingNumAiEl?.value || '0', 10),
            aiDifficulty: settingAiDifficultyEl?.value || 'MEDIUM'
        };
        await updateDoc(gameDocRef, { settings: settings }); 
    }
    catch (error) { console.error("Einstellungs-Fehler:", error); showToast("Einstellungs-Fehler!", true); }
}

async function subscribeToGame(gameId) {
    if (!db) {
         console.error("subscribeToGame: Firestore DB ist nicht initialisiert.");
         showToast("Datenbankfehler!", true);
         resetToLobby(true);
         return Promise.resolve(false);
    }
    
    currentGameId = gameId; 
    localStorage.setItem('skyjoGameId', gameId);
    const gameDocRef = doc(db, getGameCollectionPath(), gameId);
    
    if (unsubscribeGameListener) {
        try { unsubscribeGameListener(); } catch (e) { console.warn("Fehler beim Beenden des alten Listeners:", e); }
        unsubscribeGameListener = null;
    }
    if (aiTurnTimeoutId) { clearTimeout(aiTurnTimeoutId); aiTurnTimeoutId = null; }

    return new Promise((resolve) => {
        unsubscribeGameListener = onSnapshot(gameDocRef, (docSnap) => {
            if (docSnap.exists()) { 
                const game = docSnap.data(); 
                game.id = docSnap.id; 
                // Disconnect-Check
                if (game.status !== 'lobby' && (!game.players || !game.players.some(p => p && p.id === userId))) {
                    console.warn("Ich bin nicht (mehr) im Spiel! Status:", game.status);
                    showToast("Du wurdest aus dem Spiel entfernt oder das Spiel endete.", true);
                    resetToLobby(true);
                    resolve(false); 
                } else {
                    handleGameUpdate(game); 
                    resolve(true); 
                }
            } 
            else { 
                console.log("Spiel existiert nicht (mehr):", gameId);
                if (currentGameId === gameId) { 
                    showToast("Das Spiel wurde beendet.", true); 
                    resetToLobby(true); 
                }
                resolve(false); 
            } 
        }, (error) => { 
            console.error("Fehler beim Abonnieren des Spiels:", error); 
            showToast("Verbindung zum Spiel verloren!", true); 
            enableNetwork(db).catch(e => console.warn("Wiederverbindung fehlgeschlagen:", e));
            resetToLobby(true); 
            resolve(false); 
        }); 
    });
}

async function leaveGame() {
    if(leaveConfirmModalEl) leaveConfirmModalEl.classList.add('hidden'); 
    if(leaveConfirmModalEl) leaveConfirmModalEl.classList.remove('flex');
    if (!currentGameId || !userId) return;
    if(loaderEl) loaderEl.classList.remove('hidden'); 
    if(loaderTextEl) loaderTextEl.textContent = "Verlasse Spiel...";
    
    const gameIdToLeave = currentGameId; 
    currentGameId = null; 

    if (unsubscribeGameListener) { 
        try { unsubscribeGameListener(); } catch(e) { console.warn("Fehler beim Beenden des Listeners:", e);}
        unsubscribeGameListener = null; 
    }
    if (aiTurnTimeoutId) { clearTimeout(aiTurnTimeoutId); aiTurnTimeoutId = null; }

    try {
        const gameDocRef = doc(db, getGameCollectionPath(), gameIdToLeave);
        const gameDocSnap = await getDoc(gameDocRef);
        if (gameDocSnap.exists()) {
            const game = gameDocSnap.data();
            if (!game || !game.players) { console.warn("leaveGame: Ungültige Spieldaten."); resetToLobby(true); return; }

            const playerToRemove = game.players.find(p => p && p.id === userId); 
            const humanPlayers = game.players.filter(p => p && !p.isAI); 

            if (humanPlayers.length === 1 && playerToRemove && !playerToRemove.isAI) { 
                console.log("Letzter Spieler verlässt, lösche Spiel:", gameIdToLeave);
                await deleteDoc(gameDocRef);
            } else if (playerToRemove) {
                if (playerToRemove.isHost && game.hostId === userId) { 
                    const newHost = humanPlayers.find(p => p.id !== userId); 
                    if (newHost) {
                        console.log("Host verlässt, neuer Host:", newHost.id);
                        newHost.isHost = true;
                        const updatedPlayers = game.players.filter(p => p && p.id !== userId).map(p => p.id === newHost.id ? newHost : p);
                        await updateDoc(gameDocRef, { players: updatedPlayers, hostId: newHost.id });
                    } else { 
                         console.log("Host verlässt, keine anderen Menschen/nur KIs, lösche Spiel:", gameIdToLeave);
                        await deleteDoc(gameDocRef);
                    }
                } else { 
                     console.log("Spieler verlässt:", userId);
                    const correctPlayerObject = game.players.find(p => p && p.id === userId);
                    if (correctPlayerObject) {
                        await updateDoc(gameDocRef, { players: arrayRemove(correctPlayerObject) });
                    } else {
                         console.warn("Spieler zum Entfernen nicht gefunden (leaveGame).");
                    }
                }
            } else {
                 console.log("Spieler war bereits nicht im Spiel (leaveGame)."); 
            }
        } else {
             console.log("Spiel existierte nicht mehr beim Verlassen (leaveGame)."); 
        }
    } catch (error) { 
        console.error("Fehler beim Verlassen:", error); 
        showToast("Fehler beim Verlassen!", true); 
    } 
    finally { 
        console.log("Resetting to lobby after attempting to leave game:", gameIdToLeave);
        resetToLobby(true); 
    }
}

function resetToLobby(clearLocalStorage = false) {
    console.log("Resetting to lobby, clear local storage:", clearLocalStorage);
    if (unsubscribeGameListener) { 
        try { 
            console.log("Unsubscribing game listener in resetToLobby.");
            unsubscribeGameListener(); 
        } catch(e){ console.warn("Fehler beim Beenden des Listeners in resetToLobby:", e); }
        unsubscribeGameListener = null; 
    }
    if (aiTurnTimeoutId) { 
        console.log("Clearing AI turn timeout in resetToLobby.");
        clearTimeout(aiTurnTimeoutId); 
        aiTurnTimeoutId = null; 
    }

    currentGameId = null; 
    if (clearLocalStorage) {
        localStorage.removeItem('skyjoGameId');
        console.log("Local storage cleared.");
    } else {
         console.log("Local storage not cleared.");
    }
    
    loaderEl?.classList.add('hidden');
    gameContainerEl?.classList.add('hidden');
    leaveGameButtonEl?.classList.add('hidden');
    infoButtonEl?.classList.add('hidden'); 
    modalEl?.classList.add('hidden');
    rulesModalEl?.classList.add('hidden'); 
    previousScoreDisplayEl?.classList.add('hidden');
    lobbyScreenEl?.classList.remove('hidden');
    lobbyStartEl?.classList.remove('hidden'); 
    lobbyWaitEl?.classList.add('hidden'); 
    if(gameIdInputEl) gameIdInputEl.value = "";
    if(joinErrorEl) joinErrorEl.textContent = "";
    document.querySelectorAll('.ai-thinking-spinner').forEach(spinner => spinner.classList.add('hidden'));
}

// --- Spielstatus-Update Handler ---
function handleGameUpdate(game) {
    if (!game || typeof game !== 'object') {
        console.error("handleGameUpdate: Ungültiges 'game' Objekt.", game);
        showToast("Fehlerhafte Spieldaten!", true);
        return;
    }
     console.log("Game update received, status:", game.status, "ID:", game.id);

    try {
        const currentPlayers = game.players?.filter(p => p).map(p => p.name) || []; 
        const lastKnownPlayers = JSON.parse(sessionStorage.getItem(`skyjoPlayers_${game.id}`) || '[]'); 
        if (currentPlayers.length > 0 && JSON.stringify(currentPlayers) !== JSON.stringify(lastKnownPlayers) && lastKnownPlayers.length > 0) {
            const joined = currentPlayers.filter(p => !lastKnownPlayers.includes(p));
            const left = lastKnownPlayers.filter(p => !currentPlayers.includes(p));
            // Zeige nur, wenn *andere* Spieler joinen/leaven
            if (joined.length > 0 && !joined.every(name => players.find(p=>p.name === name)?.id === userId)) showToast(`${joined.join(', ')} ist beigetreten!`);
            if (left.length > 0) showToast(`${left.join(', ')} hat das Spiel verlassen.`, true);
        }
        sessionStorage.setItem(`skyjoPlayers_${game.id}`, JSON.stringify(currentPlayers));
    } catch (e) {
        console.warn("Fehler bei Spieler-Toast:", e);
        sessionStorage.removeItem(`skyjoPlayers_${game.id}`); 
    }

    const status = game.status;
    const settings = game.settings || {}; 
    const players = game.players?.filter(p => p) || []; 
    const amIHost = game.hostId === userId;

    loaderEl?.classList.add('hidden'); 
    lobbyScreenEl?.classList.add('hidden'); 
    gameContainerEl?.classList.add('hidden'); 
    modalEl?.classList.add('hidden'); 
    rulesModalEl?.classList.add('hidden');
    leaveGameButtonEl?.classList.add('hidden'); 
    infoButtonEl?.classList.add('hidden'); 

    if (status === 'lobby') {
        lobbyScreenEl?.classList.remove('hidden'); 
        lobbyStartEl?.classList.add('hidden'); 
        lobbyWaitEl?.classList.remove('hidden');
        leaveGameButtonEl?.classList.remove('hidden'); 

        if(gameIdDisplayEl) gameIdDisplayEl.value = game.id || ''; 
        if(playerListEl) playerListEl.innerHTML = '';
        players.forEach(p => {
            const li = document.createElement('li');
            const hostLabel = p.isHost ? '<span class="text-yellow-400 font-semibold">(Host)</span>' : '';
            const youLabel = p.id === userId ? '<span class="text-blue-300 font-semibold">(Du)</span>' : '';
            const aiLabel = p.isAI ? '<span class="text-slate-400">(KI)</span>' : '';
            li.innerHTML = `${p.name || '??'} ${aiLabel} ${hostLabel} ${youLabel}`;
            playerListEl?.appendChild(li);
        });
        
        const settingsDiv = document.getElementById('game-settings');
        if(settingsDiv) settingsDiv.style.display = 'block'; 
        if(settingGoalScoreEl) settingGoalScoreEl.value = settings.goalScore || 100; 
        if(settingFlippedCardsEl) settingFlippedCardsEl.value = settings.flippedCards || 2; 
        if(settingNumAiEl) settingNumAiEl.value = settings.numAI || 0; 
        if(settingAiDifficultyEl) settingAiDifficultyEl.value = settings.aiDifficulty || 'MEDIUM'; 
        allSettingsInputs?.forEach(input => input.disabled = !amIHost);
        
        const humanPlayers = players.filter(p => !p.isAI).length;
        const aiPlayers = settings.numAI || 0;
        const totalPlayers = humanPlayers + aiPlayers;
        
        if(startGameButtonEl) {
             startGameButtonEl.style.display = amIHost ? 'block' : 'none';
             let startEnabled = totalPlayers >= 2 || (humanPlayers === 1 && aiPlayers >= 1);
             startGameButtonEl.disabled = !startEnabled;
             startGameButtonEl.textContent = startEnabled ? `Spiel starten (${totalPlayers} Spieler)` : `Warte auf Spieler (min. 2)...`;
        }

    } else if (status === 'playing') {
        gameContainerEl?.classList.remove('hidden'); 
        leaveGameButtonEl?.classList.remove('hidden'); 
        infoButtonEl?.classList.remove('hidden'); 
        
        if (game.lastRoundScores && game.lastRoundScores.length > 0) {
            if(previousScoresListEl) previousScoresListEl.innerHTML = '';
            game.lastRoundScores.forEach(s => {
                if (!s) return; 
                const scoreEntry = document.createElement('div');
                scoreEntry.className = `flex justify-between ${s.id === userId ? 'text-blue-300' : 'text-red-300'}`;
                scoreEntry.innerHTML = `<span>${s.name || '??'}:</span> <span class="font-bold">${s.score ?? '?'}</span>`; 
                previousScoresListEl?.appendChild(scoreEntry);
            });
            previousScoreDisplayEl?.classList.remove('hidden');
        } else { 
            previousScoreDisplayEl?.classList.add('hidden'); 
        }
        renderGame(game);

    } else if (status === 'round-over' || status === 'game-over') {
        infoButtonEl?.classList.remove('hidden'); 
        gameContainerEl?.classList.remove('hidden'); 
        leaveGameButtonEl?.classList.remove('hidden'); 
        renderGame(game); 
        showEndRoundModal(game); 
    } else {
        console.warn("Unbekannter Spielstatus:", status, game);
        resetToLobby(true); 
    }
}

// ===================================================================
// SPIEL-LOGIK (Rendern, Züge etc.)
// ===================================================================
function renderGame(game) {
    if (!game || !game.players || !userId) { 
        console.error("Render-Fehler: Ungültiges Spiel oder Spieler-ID.", game, userId); 
        return; 
    }
    const me = game.players.find(p => p && p.id === userId); 
    if (!me) { 
        console.warn("RenderGame: 'me' nicht gefunden.");
        return; 
    } 
    const opponents = game.players.filter(p => p && p.id !== userId); 

    // Gegner rendern
    if(opponentsAreaEl) opponentsAreaEl.innerHTML = '';
    opponents.forEach(opp => {
        if (!opp) return; 
        const oppContainer = document.createElement('div');
        oppContainer.className = 'flex flex-col items-center p-2 rounded-lg relative'; 
        const isCurrentPlayer = game.players[game.currentPlayerIndex]?.id === opp.id;
        if (isCurrentPlayer) oppContainer.classList.add('bg-red-900/50', 'shadow-lg');
        
        // KORREKTUR: justify-center für Gegner-Grids, kein max-w, kein mx-auto
        let gridHtml = `<div id="grid-${opp.id}" class="grid grid-cols-4 gap-2 justify-center mb-2">`; 
        (opp.grid || []).forEach(card => { 
            if (!card) gridHtml += `<div class="card placeholder"></div>`; 
            else if (card.discarded) gridHtml += `<div class="card discarded">X</div>`;
            else if (card.faceUp || game.status !== 'playing') gridHtml += `<div class="card face-up" data-value="${card.value}">${card.value ?? '?'}</div>`; 
            else gridHtml += `<div class="card face-down">SKYJO</div>`;
        });
        gridHtml += '</div>';
        
        const totalScoreDisplay = game.status === 'lobby' ? '' : `| Gesamt: ${opp.totalScore ?? 0}`; 
        const currentScore = (game.status === 'playing') ? calculateScore(opp.grid, true) : (opp.score ?? 0); 
        const aiLabel = opp.isAI ? `<span class="text-xs text-slate-400">(${opp.difficulty || 'N/A'})</span>` : ''; 
        const thinkingSpinner = opp.isAI ? `<div id="spinner-${opp.id}" class="ai-thinking-spinner rounded-full border-2 border-r-transparent border-b-transparent border-l-transparent hidden" role="status"></div>` : '';

        oppContainer.innerHTML = `<h2 class="text-md font-bold text-center text-red-400 flex items-center justify-center">${opp.name || 'Unbekannt'} ${aiLabel} ${thinkingSpinner}</h2>${gridHtml}<p class="text-center text-md font-semibold">Punkte: <span>${currentScore}</span> <span class="text-slate-400">${totalScoreDisplay}</span></p>`;
        opponentsAreaEl?.appendChild(oppContainer);
    });

    // Eigenes Feld rendern
    if(playerGridEl) playerGridEl.innerHTML = '';
    (me.grid || []).forEach((card, index) => { 
        const cardEl = document.createElement('div');
         if (!card) { 
             cardEl.className = 'card placeholder';
         } else {
            cardEl.className = `card ${card.discarded ? 'discarded' : (card.faceUp ? 'face-up' : 'face-down')}`;
            cardEl.textContent = card.discarded ? 'X' : (card.faceUp ? (card.value ?? '?') : 'SKYJO'); 
            if (card.faceUp) cardEl.setAttribute('data-value', card.value ?? ''); 
            
            const amICurrent = game.players[game.currentPlayerIndex]?.id === userId;
            const validPhase = game.turnPhase === 'DECK_DRAWN' || game.turnPhase === 'DISCARD_DRAWN' || game.turnPhase === 'FLIP_REQUIRED';
            if (!card.discarded && amICurrent && validPhase) {
                 cardEl.addEventListener('click', () => onPlayerCardClick(index));
            } else if (!card.discarded) {
                 cardEl.style.cursor = 'default'; 
            }
        }
        playerGridEl?.appendChild(cardEl);
    });
    const myCurrentScore = (game.status === 'playing') ? calculateScore(me.grid, true) : (me.score ?? 0); 
    if(playerScoreEl) playerScoreEl.textContent = `${myCurrentScore} | Gesamt: ${me.totalScore ?? 0}`; 

    renderDeck(game);
    updateHighlightsAndMessage(game);
}


function renderDeck(game) {
     if(!deckPileEl || !drawnCardAreaEl || !discardPileEl || !game || !game.players) return; 

    const amICurrent = game.players[game.currentPlayerIndex]?.id === userId;

    // Nachziehstapel
    const deckEmpty = !game.deck || game.deck.length === 0;
    deckPileEl.className = `card face-down deck-pile ${deckEmpty ? 'opacity-50 cursor-not-allowed' : ''}`; 
    deckPileEl.textContent = deckEmpty ? "LEER" : "SKYJO"; 
    if (!deckEmpty && amICurrent && game.turnPhase === 'DRAW') {
         deckPileEl.style.cursor = 'pointer';
    } else {
         deckPileEl.style.cursor = 'default';
    }

    // Gezogene Karte
    drawnCardAreaEl.className = 'card placeholder'; 
    drawnCardAreaEl.textContent = ''; 
    drawnCardAreaEl.removeAttribute('data-value');
    if (game.selectedCard && (game.turnPhase === 'DECK_DRAWN' || game.turnPhase === 'DISCARD_DRAWN')) {
        drawnCardAreaEl.className = 'card face-up highlight-player';
        drawnCardAreaEl.textContent = game.selectedCard.value ?? '?'; 
        drawnCardAreaEl.setAttribute('data-value', game.selectedCard.value ?? ''); 
        if (amICurrent && game.turnPhase === 'DECK_DRAWN') {
             drawnCardAreaEl.style.cursor = 'pointer'; 
        } else {
             drawnCardAreaEl.style.cursor = 'default';
        }
    } else {
         drawnCardAreaEl.style.cursor = 'default';
    }
    
    // Ablagestapel
    discardPileEl.className = 'card face-up'; 
    discardPileEl.textContent = ''; 
    discardPileEl.removeAttribute('data-value');
    const discardPileEmpty = !game.discardPile || game.discardPile.length === 0;
    if (!discardPileEmpty) { 
        const topDiscard = game.discardPile[game.discardPile.length - 1];
         if (typeof topDiscard !== 'undefined' && topDiscard !== null) {
            discardPileEl.textContent = topDiscard;
            discardPileEl.setAttribute('data-value', topDiscard);
            if (amICurrent && (game.turnPhase === 'DRAW' || game.turnPhase === 'DECK_DRAWN')) {
                 discardPileEl.style.cursor = 'pointer';
            } else {
                 discardPileEl.style.cursor = 'default';
            }
         } else {
             discardPileEl.className = 'card placeholder opacity-50 cursor-not-allowed'; 
             discardPileEl.style.cursor = 'default';
         }
    } else { 
        discardPileEl.className = 'card placeholder opacity-50 cursor-not-allowed'; 
        discardPileEl.style.cursor = 'default';
    }
}


function updateHighlightsAndMessage(game) {
    if (!game || !game.players) { setMessage("Warte auf Spieldaten..."); return; }
    const players = game.players.filter(p => p); 
    if (players.length === 0 || game.currentPlayerIndex < 0 || game.currentPlayerIndex >= players.length) {
         setMessage("Warte auf Spieler...");
         return; 
    }
    const currentPlayer = players[game.currentPlayerIndex];
    const amICurrentPlayer = currentPlayer && currentPlayer.id === userId; 
    
    playerGridEl?.classList.remove('highlight-grid');
    deckPileEl?.classList.remove('highlight-player');
    discardPileEl?.classList.remove('highlight-player');
    drawnCardAreaEl?.classList.remove('highlight-player');
    turnIndicatorEl?.classList.add('opacity-0', 'scale-90');
    document.querySelectorAll('.ai-thinking-spinner').forEach(spinner => spinner.classList.add('hidden'));

    if (!currentPlayer) { 
        setMessage("Warte auf Spieler..."); return;
    }
    
    if (currentPlayer.isAI) {
         const spinnerEl = document.getElementById(`spinner-${currentPlayer.id}`);
         if (spinnerEl) spinnerEl.classList.remove('hidden');
    }

    if (!amICurrentPlayer) {
        setMessage(`${currentPlayer.name || '??'} ist am Zug...`); return; 
    }
    
    turnIndicatorEl?.classList.remove('opacity-0', 'scale-90');
    switch (game.turnPhase) {
        case 'DRAW':
            setMessage("Du bist dran. Ziehe eine Karte.");
            if (game.deck && game.deck.length > 0) deckPileEl?.classList.add('highlight-player'); 
            if (game.discardPile && game.discardPile.length > 0) discardPileEl?.classList.add('highlight-player'); 
            break;
        case 'DECK_DRAWN':
            setMessage(`Gezogen: ${game.selectedCard?.value ?? '?'}. Tauschen (Karte klicken) oder Ablegen (Ablagestapel/Gezogene klicken)?`); 
            playerGridEl?.classList.add('highlight-grid');
            discardPileEl?.classList.add('highlight-player'); 
            drawnCardAreaEl?.classList.add('highlight-player'); 
            break;
        case 'DISCARD_DRAWN':
            setMessage("Du MUSST tauschen. Wähle eine deiner Karten.");
            playerGridEl?.classList.add('highlight-grid');
            drawnCardAreaEl?.classList.add('highlight-player'); 
            break;
        case 'FLIP_REQUIRED':
            setMessage("Du musst eine VERDECKTE Karte aufdecken.");
            playerGridEl?.classList.add('highlight-grid');
            break;
         default:
             setMessage("Warte auf Aktion..."); 
    }
}


function calculateScore(grid, visibleOnly = false) {
    if (!grid) return 0; 
    return grid.reduce((total, card) => {
        if (!card || card.discarded) return total; 
        if (visibleOnly && !card.faceUp) return total; 
        const value = typeof card.value === 'number' ? card.value : 0; 
        return total + value;
    }, 0);
}



function highlightCard(gridEl, index, playerType = 'player') {
    if (!gridEl || !gridEl.children || index < 0 || index >= gridEl.children.length || !gridEl.children[index]) return; 
    const cardEl = gridEl.children[index];
    if (cardEl && cardEl.classList) {
        const highlightClass = playerType === 'player' ? 'highlight-player' : 'highlight-ai';
        cardEl.classList.add(highlightClass);
        setTimeout(() => cardEl?.classList?.remove('highlight-player', 'highlight-ai'), 1000); 
    }
}

// ===================================================================
// SPIELZUG-FUNKTIONEN (Aktionen) 
// ===================================================================
async function onDeckDraw() {
    if (actionInProgress) { console.log("Aktion bereits im Gange (Deck Draw)"); return; }
    actionInProgress = true;
    deckPileEl?.classList.add('pointer-events-none'); 

    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let game; 
    try {
        const gameSnap = await getDoc(gameDocRef); 
        if (!gameSnap.exists()) { throw new Error("Spiel nicht gefunden."); }
        game = gameSnap.data(); 
        game.id = gameSnap.id; 

        if (!game || !game.players || game.players.length <= game.currentPlayerIndex || !game.players[game.currentPlayerIndex]) { throw new Error("Ungültige Spieldaten."); }
        if (game.status !== 'playing' || game.players[game.currentPlayerIndex].id !== userId || game.turnPhase !== 'DRAW') { console.log("Nicht dein Zug/Phase (Deck)."); return; } 
    
        soundManager.play('draw'); 
    
        let { deck, discardPile } = game;
        deck = deck || []; 
        discardPile = discardPile || []; 

        if (deck.length === 0) {
            if (discardPile.length <= 1) { throw new Error("Deck und Ablagestapel leer!"); }
            const topCard = discardPile.pop(); deck = shuffleDeck(discardPile); discardPile = [topCard];
        }
        
        if (deck.length === 0) { throw new Error("Deck konnte nicht neu gemischt werden!");}

        const drawnCard = deck.pop();
         if (typeof drawnCard === 'undefined' || drawnCard === null) {
              throw new Error("Ungültige Karte vom Deck gezogen.");
         }
        console.log("Deck gezogen, update DB: selectedCard=", drawnCard);
        await updateDoc(gameDocRef, { deck, discardPile, selectedCard: { value: drawnCard }, turnPhase: 'DECK_DRAWN' });
    
    } catch (error) {
        console.error("Fehler bei onDeckDraw:", error);
        showToast(error.message || "Fehler beim Ziehen!", true);
    } finally {
         deckPileEl?.classList.remove('pointer-events-none'); 
         actionInProgress = false; 
    }
}

async function onDiscardPileClick() {
    if (actionInProgress) { console.log("Aktion bereits im Gange (Discard Click)"); return; }
    actionInProgress = true;
    discardPileEl?.classList.add('pointer-events-none');

    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let game;
    try {
        const gameSnap = await getDoc(gameDocRef); 
        if (!gameSnap.exists()) { throw new Error("Spiel nicht gefunden."); }
        game = gameSnap.data(); game.id = gameSnap.id;
        
        if (!game || !game.players || game.players.length <= game.currentPlayerIndex || !game.players[game.currentPlayerIndex]) { throw new Error("Ungültige Spieldaten."); }
        if (game.status !== 'playing' || game.players[game.currentPlayerIndex].id !== userId) { console.log("Nicht dein Zug (Discard)."); return; }

        const me = game.players.find(p => p && p.id === userId); 
        if (!me) { throw new Error("Eigene Spielerdaten nicht gefunden."); }

        if (game.turnPhase === 'DRAW') {
            if (!game.discardPile || game.discardPile.length === 0) { console.log("Ablagestapel leer."); return; } 
            soundManager.play('draw'); 
            const discardPileCopy = [...game.discardPile]; 
            const drawnCard = discardPileCopy.pop();
             if (typeof drawnCard === 'undefined' || drawnCard === null) {
                  throw new Error("Ungültige Karte vom Ablagestapel.");
             }
             console.log("Discard gezogen, update DB: selectedCard=", drawnCard);
            await updateDoc(gameDocRef, { discardPile: discardPileCopy, selectedCard: { value: drawnCard }, turnPhase: 'DISCARD_DRAWN' });
        
        } else if (game.turnPhase === 'DECK_DRAWN') {
            if (!me.grid || !me.grid.some(card => card && !card.faceUp && !card.discarded)) { 
                showToast("Du musst tauschen (keine verdeckten Karten)!.", true); return; 
            }
             if (!game.selectedCard || typeof game.selectedCard.value === 'undefined') {
                 throw new Error("Keine gezogene Karte zum Ablegen.");
             }
            soundManager.play('place'); 
            const cardToDiscard = game.selectedCard.value;
            const discardPileCopy = [...(game.discardPile || []), cardToDiscard]; 
            console.log("Karte wird abgelegt (DiscardAndFlip mit index null)");
            await discardAndFlip(game, userId, null, discardPileCopy); 
        } else {
             console.log("Falsche Phase für Ablagestapel-Klick:", game.turnPhase);
        }
    } catch (error) {
        console.error("Fehler bei onDiscardPileClick:", error);
        showToast(error.message || "Fehler beim Ablagestapel!", true);
    } finally {
        discardPileEl?.classList.remove('pointer-events-none');
        actionInProgress = false;
    }
}


function onDrawnCardClick() { 
    console.log("Gezogene Karte geklickt -> löst Ablegen aus.");
    onDiscardPileClick(); 
} 

async function onPlayerCardClick(index) {
     if (actionInProgress) { console.log("Aktion bereits im Gange (Card Click)"); return; }
     actionInProgress = true;
     const clickedCardEl = playerGridEl?.children[index];
     clickedCardEl?.classList.add('pointer-events-none'); 

    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let game;
    try {
        const gameSnap = await getDoc(gameDocRef); 
        if (!gameSnap.exists()) { throw new Error("Spiel nicht gefunden."); }
        game = gameSnap.data(); game.id = gameSnap.id;

        if (!game || !game.players || game.players.length <= game.currentPlayerIndex || !game.players[game.currentPlayerIndex]) { throw new Error("Ungültige Spieldaten."); }

        const me = game.players.find(p => p && p.id === userId); 
        if (game.status !== 'playing' || !me || game.players[game.currentPlayerIndex].id !== userId) { console.log("Nicht dein Zug/Phase (Karte)."); return; }
        
        if (!me.grid || index < 0 || index >= me.grid.length) { throw new Error("Ungültiger Kartenindex."); } 
        
        const clickedCard = me.grid[index];
        if (!clickedCard || clickedCard.discarded) { console.log("Verworfene Karte."); return; } 

        if (game.turnPhase === 'DECK_DRAWN' || game.turnPhase === 'DISCARD_DRAWN') {
            if (!game.selectedCard || typeof game.selectedCard.value === 'undefined') {
                throw new Error("Keine Karte zum Tauschen ausgewählt.");
            }
            soundManager.play('place'); 
            console.log("Karte wird getauscht (swapCard)");
            await swapCard(game, userId, index, game.selectedCard.value, game.deck, game.discardPile);
        
        } else if (game.turnPhase === 'FLIP_REQUIRED') {
            if (clickedCard.faceUp) { showToast("Wähle eine VERDECKTE Karte.", true); return; }
            soundManager.play('flip'); 
            console.log("Karte wird aufgedeckt (DiscardAndFlip mit index)");
            await discardAndFlip(game, userId, index, game.discardPile); 
        } else {
            console.log("Falsche Phase für Kartenklick:", game.turnPhase);
        }
    } catch (error) {
        console.error("Fehler bei onPlayerCardClick:", error);
        showToast(error.message || "Fehler bei Kartenauswahl!", true);
    } finally {
         clickedCardEl?.classList.remove('pointer-events-none');
         actionInProgress = false;
    }
}



async function swapCard(game, playerId, index, newCardValue, updatedDeck, updatedDiscardPile) {
    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let updatedPlayers; 
    let nextGameState; 
    try {
        if (!game || !game.players) { throw new Error("swapCard: Ungültiges Spiel."); }

        const playerIndex = game.players.findIndex(p => p && p.id === playerId); 
        if (playerIndex === -1) { throw new Error(`swapCard: Spieler ${playerId} nicht gefunden.`); }
        
        updatedPlayers = JSON.parse(JSON.stringify(game.players)); 
        const player = updatedPlayers[playerIndex];
        
        if (!player.grid || index < 0 || index >= player.grid.length || !player.grid[index]) {
             throw new Error(`Ungültiger Index ${index} für ${playerId}`);
        }

        const oldCard = player.grid[index];
        player.grid[index] = { value: newCardValue, faceUp: true, discarded: false };
        const discardPile = [...(updatedDiscardPile || game.discardPile || [])]; 
        const deck = [...(updatedDeck || game.deck || [])]; 
        
        if (oldCard && typeof oldCard.value === 'number') { 
            discardPile.push(oldCard.value);
        } else {
             console.warn("Alte Karte war undefiniert/keine Zahl beim Tauschen (swapCard):", oldCard);
        }

        const clearedIndices = checkAndClearColumn(player.grid, index);
        if (clearedIndices.length > 0) {
            soundManager.play('clear'); 
            clearedIndices.forEach(i => {
                 if (player.grid && player.grid[i] && !player.grid[i].discarded && typeof player.grid[i].value === 'number') { 
                    discardPile.push(player.grid[i].value); 
                    player.grid[i].discarded = true; 
                 }
            });
        }
        const roundEndTriggered = triggerEndRoundCheck({ ...game, players: updatedPlayers }, player); 
        
        console.log("Update DB nach Tausch.");
        await updateDoc(gameDocRef, { players: updatedPlayers, discardPile, deck, selectedCard: null, turnPhase: 'DRAW' }); 
        
        const playerType = player.isAI ? 'ai' : (playerId === userId ? 'player' : 'other'); 
        if (playerType !== 'other') {
            const gridEl = (playerType === 'player') ? playerGridEl : document.getElementById(`grid-${player.id}`);
            if (gridEl) {
                highlightCard(gridEl, index, playerType);
                if (clearedIndices.length > 0) {
                    setTimeout(() => clearedIndices.forEach(i => highlightCard(gridEl, i, playerType)), 100); 
                }
            }
        }

        nextGameState = { ...game, players: updatedPlayers, discardPile, deck, selectedCard: null, turnPhase: 'DRAW', 
                          lastRoundTriggered: game.lastRoundTriggered || roundEndTriggered, 
                          playerWhoEndedRoundId: roundEndTriggered ? playerId : game.playerWhoEndedRoundId };
        console.log("Rufe endTurn nach Tausch auf.");
        await endTurn(gameDocRef, nextGameState, roundEndTriggered); 

    } catch (error) {
        console.error("Fehler bei swapCard:", error);
        showToast(error.message || "Fehler beim Tauschen!", true);
        actionInProgress = false; 
    }
}


async function discardAndFlip(game, playerId, index, updatedDiscardPile) {
    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let updatedPlayers;
    let nextGameState;
    try {
        if (!game || !game.players) { throw new Error("discardAndFlip: Ungültiges Spiel."); }

        const playerIndex = game.players.findIndex(p => p && p.id === playerId); 
        if (playerIndex === -1) { throw new Error(`discardAndFlip: Spieler ${playerId} nicht gefunden.`); }
        updatedPlayers = JSON.parse(JSON.stringify(game.players));
        const player = updatedPlayers[playerIndex];
        const discardPile = [...(updatedDiscardPile || game.discardPile || [])]; 
        let roundEndTriggered = false; 
        let clearedIndices = [];

        if (index !== null) { 
             if (!player.grid || index < 0 || index >= player.grid.length || !player.grid[index]) {
                 throw new Error(`Ungültiger Index ${index} zum Aufdecken für ${playerId}`);
            }
            player.grid[index].faceUp = true;
            clearedIndices = checkAndClearColumn(player.grid, index);
            if (clearedIndices.length > 0) {
                soundManager.play('clear'); 
                clearedIndices.forEach(i => {
                     if (player.grid && player.grid[i] && !player.grid[i].discarded && typeof player.grid[i].value === 'number') { 
                        discardPile.push(player.grid[i].value); 
                        player.grid[i].discarded = true; 
                     }
                });
            }
            roundEndTriggered = triggerEndRoundCheck({ ...game, players: updatedPlayers }, player); 
        
        } 

        console.log("Update DB nach Ablegen/Aufdecken.");
        await updateDoc(gameDocRef, { players: updatedPlayers, discardPile, selectedCard: null, turnPhase: 'DRAW' }); 
        
        if (index !== null) {
            const playerType = player.isAI ? 'ai' : (playerId === userId ? 'player' : 'other');
            if (playerType !== 'other') {
                const gridEl = (playerType === 'player') ? playerGridEl : document.getElementById(`grid-${player.id}`);
                if (gridEl) {
                    highlightCard(gridEl, index, playerType);
                    if (clearedIndices.length > 0) {
                        setTimeout(() => clearedIndices.forEach(i => highlightCard(gridEl, i, playerType)), 100);
                    }
                }
            }
        }
        
        nextGameState = { ...game, players: updatedPlayers, discardPile, selectedCard: null, turnPhase: 'DRAW',
                           lastRoundTriggered: game.lastRoundTriggered || roundEndTriggered, 
                           playerWhoEndedRoundId: roundEndTriggered ? playerId : game.playerWhoEndedRoundId };
        console.log("Rufe endTurn nach Ablegen/Aufdecken auf.");
        await endTurn(gameDocRef, nextGameState, roundEndTriggered); 

    } catch (error) {
        console.error("Fehler bei discardAndFlip:", error);
        showToast(error.message || "Fehler beim Aufdecken/Ablegen!", true);
        actionInProgress = false; 
    }
}



function checkAndClearColumn(grid, changedIndex) {
    if (!grid || typeof changedIndex !== 'number' || changedIndex < 0) return []; 
    const col = changedIndex % 4; 
    const colIndices = [col, col + 4, col + 8];
    if (colIndices.some(i => i >= grid.length || !grid[i])) return []; 
    
    const cards = colIndices.map(i => grid[i]);
    if (cards.some(c => !c.faceUp || c.discarded)) return [];
    
    const firstValue = cards[0].value;
    if (typeof firstValue !== 'number') return []; 
    
    if (cards.every(c => typeof c.value === 'number' && c.value === firstValue)) return colIndices; 
    return [];
}


function triggerEndRoundCheck(game, player) {
    if (!game || game.lastRoundTriggered) return false; 
    if (!player || !player.grid) return false; 
    return player.grid.every(card => !card || card.faceUp || card.discarded); 
}


async function endTurn(gameDocRef, game, roundEndTriggered) {
    if (aiTurnTimeoutId) { clearTimeout(aiTurnTimeoutId); aiTurnTimeoutId = null; }

    try {
        if (!gameDocRef || !game || !game.players || typeof game.currentPlayerIndex !== 'number' || !game.settings ) {
             throw new Error("endTurn: Ungültige Eingabedaten.");
        }

        let { currentPlayerIndex, lastRoundTriggered, playerWhoEndedRoundId, players, hostId } = game;
        players = players.filter(p => p); 
        const playerCount = players.length;
        if (playerCount === 0) { console.warn("endTurn: Keine Spieler mehr."); return; }

        currentPlayerIndex = currentPlayerIndex % playerCount; 
        const currentPlayer = players[currentPlayerIndex]; 
        
        const nextPlayerIndexUnvalidated = (currentPlayerIndex + 1); 
        const nextPlayerIndex = nextPlayerIndexUnvalidated % playerCount;
        const nextPlayer = players[nextPlayerIndex];
        
        if (!nextPlayer) {
             throw new Error(`endTurn: Nächster Spieler (Index ${nextPlayerIndex}) ungültig.`);
        }

        let updateData = { currentPlayerIndex: nextPlayerIndex };

        if (roundEndTriggered && !lastRoundTriggered && currentPlayer) {
            console.log(`Runde wird durch ${currentPlayer.name} ausgelöst.`);
            updateData.lastRoundTriggered = true; 
            updateData.playerWhoEndedRoundId = currentPlayer.id;
            lastRoundTriggered = true; 
            playerWhoEndedRoundId = currentPlayer.id; 
            setMessage(`${currentPlayer.name} deckt letzte Karte auf! Jeder noch 1x.`);
        } 
        else if (lastRoundTriggered && nextPlayer.id === playerWhoEndedRoundId) {
            console.log(`Letzter Zug von ${currentPlayer?.name}. ${nextPlayer.name} (Auslöser) wäre dran -> Rundenende.`);
            document.querySelectorAll('.ai-thinking-spinner').forEach(spinner => spinner.classList.add('hidden'));
            await calculateFinalScores(gameDocRef, game); 
            return; 
        }
        
        if (currentPlayer && currentPlayer.isAI) {
            const currentSpinnerEl = document.getElementById(`spinner-${currentPlayer.id}`);
            if (currentSpinnerEl) currentSpinnerEl.classList.add('hidden');
        }

        console.log(`Zug beendet von ${currentPlayer?.name}. Nächster: ${nextPlayer.name} (Index ${nextPlayerIndex})`);
        await updateDoc(gameDocRef, updateData);

        if (nextPlayer.isAI && hostId === userId) {
            const nextSpinnerEl = document.getElementById(`spinner-${nextPlayer.id}`);
            if (nextSpinnerEl) nextSpinnerEl.classList.remove('hidden');

            console.log(`Starte KI-Zug für ${nextPlayer.name} in 1.5s`);
            aiTurnTimeoutId = setTimeout(async () => {
                const currentTimeoutId = aiTurnTimeoutId; 
                aiTurnTimeoutId = null; 
                console.log(`Timeout ausgelöst für ${nextPlayer.name}.`);
                try {
                    if (currentTimeoutId === null) { 
                        console.log(`KI-Zug für ${nextPlayer.name} abgebrochen (neuer Timeout).`);
                        return;
                    }

                    const freshGameSnap = await getDoc(gameDocRef); 
                    if (!freshGameSnap.exists()) { throw new Error("Spiel existiert nicht mehr (KI Timeout)."); }
                        
                    const freshGame = freshGameSnap.data();
                    freshGame.id = freshGameSnap.id; 

                    if (freshGame.players && freshGame.players.length > freshGame.currentPlayerIndex && 
                        freshGame.players[freshGame.currentPlayerIndex]?.id === nextPlayer.id && 
                        freshGame.status === 'playing') { 
                        console.log(`Führe KI-Zug für ${nextPlayer.name} aus.`);
                        await runAITurn(freshGame, nextPlayer); 
                    } else {
                        console.log(`KI-Zug für ${nextPlayer.name} übersprungen (Timeout), Zustand nicht passend: Aktuell dran: ${freshGame.players[freshGame.currentPlayerIndex]?.id}, Status: ${freshGame.status}`);
                        if (nextSpinnerEl) nextSpinnerEl.classList.add('hidden'); 
                    }
                } catch (error) {
                    console.error(`Fehler beim Starten des KI-Zugs (${nextPlayer.name}) (Timeout):`, error);
                    showToast(`Fehler bei ${nextPlayer.name}!`, true);
                     if (nextSpinnerEl) nextSpinnerEl.classList.add('hidden'); 
                }
            }, 1500); 
        }
    } catch (error) {
        console.error("Schwerer Fehler in endTurn:", error);
        showToast("Fehler beim Beenden des Zuges!", true);
         document.querySelectorAll('.ai-thinking-spinner').forEach(spinner => spinner.classList.add('hidden'));
         if (aiTurnTimeoutId) { clearTimeout(aiTurnTimeoutId); aiTurnTimeoutId = null; }
    } 
}




// ===================================================================
// KI-SPIEL-LOGIK (Wird nur vom Host ausgeführt) 
// ===================================================================
async function runAITurn(game, aiPlayer) {
     const spinnerEl = document.getElementById(`spinner-${aiPlayer?.id}`); 
     actionInProgress = true; 
     console.log(`KI ${aiPlayer?.name} beginnt Zug.`);

     try {
         if (!game || !game.players || !aiPlayer || game.status !== 'playing' || !game.id) {
             throw new Error(`KI-Zug abgebrochen: Ungültige Basisdaten.`);
         }
         if (game.currentPlayerIndex < 0 || game.currentPlayerIndex >= game.players.length || 
             !game.players[game.currentPlayerIndex] || game.players[game.currentPlayerIndex].id !== aiPlayer.id) {
            console.log(`KI-Zug für ${aiPlayer.name} abgebrochen: Nicht (mehr) dran.`);
            actionInProgress = false; 
            return; 
        }

        const gameDocRef = doc(db, getGameCollectionPath(), game.id);
        const difficulty = AI_DIFFICULTY[aiPlayer.difficulty || 'MEDIUM']; 
        const discardPile = game.discardPile || [];
        const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null; 
        const bestSwapDiscard = findBestAISwap(aiPlayer.grid, topDiscard, difficulty);

        let deckCopy = [...(game.deck || [])]; 
        let discardPileCopy = [...discardPile]; 

        const takeDiscard = topDiscard !== null && typeof topDiscard === 'number' && bestSwapDiscard && bestSwapDiscard.benefit > difficulty.DISCARD_TAKE_THRESHOLD;

        // IMMER aktuellen Spielstand holen VOR der Aktion
        const currentSnap = await getDoc(gameDocRef);
        if (!currentSnap.exists()) throw new Error("Spiel verschwunden vor KI-Aktion.");
        const currentGameData = currentSnap.data();
        currentGameData.id = currentSnap.id;
        // Erneute Prüfung
        if (!currentGameData.players || currentGameData.players.length <= currentGameData.currentPlayerIndex || currentGameData.players[currentGameData.currentPlayerIndex]?.id !== aiPlayer.id || currentGameData.status !== 'playing') {
            console.log(`KI-Zug für ${aiPlayer.name} abgebrochen: Zustand änderte sich vor Aktion.`);
            actionInProgress = false;
            return;
        }


        if (takeDiscard) {
            soundManager.play('draw'); 
            const drawnCard = discardPileCopy.pop(); 
            setMessage(`${aiPlayer.name} nimmt ${drawnCard} vom Ablagestapel.`);
            console.log(`KI ${aiPlayer.name} nimmt ${drawnCard} von Ablage, tauscht bei Index ${bestSwapDiscard.index}`);
            // Wichtig: Übergebe den FRISCHEN Spielstand an swapCard
            await swapCard(currentGameData, aiPlayer.id, bestSwapDiscard.index, drawnCard, deckCopy, discardPileCopy);
        
        } else {
            soundManager.play('draw'); 
            if (deckCopy.length === 0) { 
                if (discardPileCopy.length <= 1) { 
                    setMessage(`${aiPlayer.name} kann nicht ziehen (Deck leer).`);
                    await endTurn(gameDocRef, currentGameData, false); 
                    actionInProgress = false; return; 
                }
                const topCard = discardPileCopy.pop(); deckCopy = shuffleDeck(discardPileCopy); discardPileCopy = [topCard];
            }
             if (deckCopy.length === 0) {
                 setMessage(`${aiPlayer.name} kann nicht ziehen (Deck leer).`);
                 await endTurn(gameDocRef, currentGameData, false); 
                 actionInProgress = false; return;
             }

            const drawnCard = deckCopy.pop();
             if (typeof drawnCard !== 'number') {
                  throw new Error(`Ungültige Karte ${drawnCard} vom Deck (KI).`);
             }

            const bestSwapDeck = findBestAISwap(aiPlayer.grid, drawnCard, difficulty);
            const hasFaceDown = aiPlayer.grid && aiPlayer.grid.some(c => c && !c.faceUp && !c.discarded); 
            let discardAndFlipMode = hasFaceDown && (!bestSwapDeck || bestSwapDeck.benefit < difficulty.DECK_SWAP_GOOD_CARD_THRESHOLD);

            // Wichtig: Übergebe den FRISCHEN Spielstand an die nächste Aktion
            if (discardAndFlipMode) {
                soundManager.play('place'); 
                setMessage(`${aiPlayer.name} legt ${drawnCard} ab.`);
                discardPileCopy.push(drawnCard); 
                const flipIndex = aiPlayer.grid.findIndex(c => c && !c.faceUp && !c.discarded); 
                if (flipIndex !== -1) {
                    soundManager.play('flip'); 
                    console.log(`KI ${aiPlayer.name} legt ${drawnCard} ab, deckt Index ${flipIndex} auf.`);
                    await discardAndFlip(currentGameData, aiPlayer.id, flipIndex, discardPileCopy);
                } else { 
                    const swapIndex = bestSwapDeck ? bestSwapDeck.index : findWorstCardIndex(aiPlayer.grid, drawnCard);
                    if (swapIndex === -1) throw new Error("Kein gültiger Tauschindex (Fallback).");
                    setMessage(`${aiPlayer.name} muss ${drawnCard} tauschen (Fallback).`);
                     console.log(`KI ${aiPlayer.name} legt ${drawnCard} ab, MUSS tauschen bei Index ${swapIndex} (Fallback).`);
                    await swapCard(currentGameData, aiPlayer.id, swapIndex, drawnCard, deckCopy, discardPileCopy);
                }
            } else { 
                soundManager.play('place'); 
                const swapIndex = bestSwapDeck ? bestSwapDeck.index : findWorstCardIndex(aiPlayer.grid, drawnCard);
                 if (swapIndex === -1) {
                      throw new Error(`Kein gültiger Tauschindex für ${aiPlayer.name}.`);
                 }
                 const swapTargetCard = aiPlayer.grid[swapIndex];
                 const swapTargetDesc = swapTargetCard ? (swapTargetCard.faceUp ? swapTargetCard.value : 'verdeckt') : '??';
                 setMessage(`${aiPlayer.name} tauscht ${drawnCard} gegen ${swapTargetDesc}.`);
                 console.log(`KI ${aiPlayer.name} tauscht ${drawnCard} bei Index ${swapIndex}.`);
                await swapCard(currentGameData, aiPlayer.id, swapIndex, drawnCard, deckCopy, discardPileCopy);
            }
        }
    } catch (error) {
        console.error(`Schwerer Fehler im KI-Zug für ${aiPlayer?.name || 'Unbekannt'}:`, error);
        showToast(`Fehler bei ${aiPlayer?.name || 'KI'}!`, true);
        try {
            if (currentGameId && game && game.players[game.currentPlayerIndex]?.id === aiPlayer?.id) {
                 const currentDocRef = doc(db, getGameCollectionPath(), game.id);
                 const currentSnap = await getDoc(currentDocRef);
                 if (currentSnap.exists()) {
                     const currentState = currentSnap.data();
                     currentState.id = currentSnap.id;
                     if (currentState.players && currentState.players.length > currentState.currentPlayerIndex && currentState.players[currentState.currentPlayerIndex]?.id === aiPlayer?.id) {
                        console.log(`Versuche, Zug nach KI-Fehler weiterzugeben...`);
                        await endTurn(currentDocRef, currentState, false); 
                     }
                 }
            }
        } catch (endTurnError) {
            console.error("Konnte Zug nach KI-Fehler nicht beenden:", endTurnError);
            resetToLobby(true); 
        }
    } finally {
         if (spinnerEl) spinnerEl.classList.add('hidden'); 
         actionInProgress = false; 
         console.log(`KI ${aiPlayer?.name} beendet Zug.`);
    }
}



function findBestAISwap(grid, newCardValue, difficulty) {
     if (newCardValue === null || typeof newCardValue !== 'number' || !grid || !difficulty) return null; 
    let bestIdx = -1; let maxBenefit = -Infinity;
    for (let i = 0; i < grid.length; i++) {
        const card = grid[i];
         if (card && card.faceUp && !card.discarded) {
             const cardValue = typeof card.value === 'number' ? card.value : difficulty.ASSUMED_FACEDOWN_VALUE; 
            const benefit = cardValue - newCardValue;
            if (benefit > maxBenefit) { maxBenefit = benefit; bestIdx = i; }
        }
    }
    const benefitVsFaceDown = difficulty.ASSUMED_FACEDOWN_VALUE - newCardValue;
    if (benefitVsFaceDown > maxBenefit) {
        const faceDownIdx = grid.findIndex(c => c && !c.faceUp && !c.discarded); 
        if (faceDownIdx !== -1) { maxBenefit = benefitVsFaceDown; bestIdx = faceDownIdx; }
    }
    if (bestIdx === -1) return null; 
    if (bestIdx < 0 || bestIdx >= grid.length) return null; 
    return { index: bestIdx, benefit: maxBenefit };
}

function findWorstCardIndex(grid, newCardValue) {
     if (newCardValue === null || typeof newCardValue !== 'number' || !grid) {
          const firstValid = grid ? grid.findIndex(c => c && !c.discarded) : -1;
          return firstValid === -1 ? 0 : firstValid; 
     }
    let worstIdx = -1; let minBenefit = Infinity;
    for (let i = 0; i < grid.length; i++) {
        const card = grid[i];
         if (card && card.faceUp && !card.discarded) {
             const cardValue = typeof card.value === 'number' ? card.value : -Infinity; 
            const benefit = cardValue - newCardValue;
            if (benefit < minBenefit) { minBenefit = benefit; worstIdx = i; }
        }
    }
     const fallbackIndex = grid.findIndex(c => c && !c.discarded);
    const resultIndex = worstIdx === -1 ? fallbackIndex : worstIdx;
    return (resultIndex >= 0 && resultIndex < grid.length) ? resultIndex : -1; 
}



// ===================================================================
// SPIEL-MANAGEMENT (Start, Rundenende, Spielende) 
// ===================================================================
async function startGame() {
    if (actionInProgress || startGameButtonEl?.disabled) return;
    actionInProgress = true;
    if(startGameButtonEl) startGameButtonEl.disabled = true;

    if(loaderEl) loaderEl.classList.remove('hidden'); 
    if(loaderTextEl) loaderTextEl.textContent = "Starte Spiel...";
    try {
        const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
        const gameSnap = await getDoc(gameDocRef);
        if (!gameSnap.exists()) throw new Error("Spiel nicht gefunden.");
        const game = gameSnap.data();
         if (!game || !game.players || !game.settings) throw new Error("Ungültige Spieldaten.");
        if (game.hostId !== userId) throw new Error("Nur Host kann starten.");
        
        const humanPlayers = game.players.filter(p => p && !p.isAI); 
        const aiPlayers = []; 
        const numAI = game.settings.numAI || 0;
        const aiDifficulty = (game.settings.aiDifficulty || 'MEDIUM').toUpperCase(); 

        for (let i = 0; i < numAI && humanPlayers.length + aiPlayers.length < 4; i++) {
            const aiId = `ai_${i + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            aiPlayers.push({ id: aiId, name: `KI ${i + 1}`, isHost: false, isAI: true, difficulty: aiDifficulty, grid: [], score: 0, totalScore: 0 });
        }
        const allPlayers = [...humanPlayers, ...aiPlayers];
        let deck = createDeck(); deck = shuffleDeck(deck);
        allPlayers.forEach(p => {
            if (!p) return; 
            p.grid = [];
            for (let i = 0; i < 12 && deck.length > 0; i++) p.grid.push({ value: deck.pop(), faceUp: false, discarded: false });
            flipRandomCards(p.grid, game.settings.flippedCards); p.score = 0; 
        });
        const discardPile = (deck.length > 0) ? [deck.pop()] : [0]; 
        console.log("Starte Spiel, Update DB: status='playing'");
        await updateDoc(gameDocRef, { status: 'playing', players: allPlayers, deck, discardPile, currentPlayerIndex: 0, turnPhase: 'DRAW', lastRoundTriggered: false, playerWhoEndedRoundId: null, lastRoundScores: [] });
    } catch (error) { 
        console.error("Fehler beim Spielstart:", error); 
        loaderEl?.classList.add('hidden'); 
        showToast(error.message || "Fehler beim Spielstart!", true); 
         if(startGameButtonEl) startGameButtonEl.disabled = false; 
    } finally {
         actionInProgress = false; 
    }
}

function flipRandomCards(grid, count) {
    if (!grid) return; 
    const faceDownIndices = grid.reduce((acc, card, index) => (card && !card.faceUp) ? [...acc, index] : acc, []); 
    const shuffledIndices = shuffleDeck(faceDownIndices); 
    const indicesToFlip = shuffledIndices.slice(0, count); 
    indicesToFlip.forEach(idx => {
         if (grid[idx]) {
             grid[idx].faceUp = true;
         }
    });
}


function shuffleDeck(deck) {
     if (!deck) return [];
    let d = [...deck]; 
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d;
}

function createDeck() {
    const d = []; 
    d.push(...Array(5).fill(-2));
    d.push(...Array(10).fill(-1));
    d.push(...Array(15).fill(0));
    for (let v = 1; v <= 12; v++) d.push(...Array(10).fill(v)); 
    console.log("Deck erstellt, Kartenanzahl:", d.length); 
    return d; 
}

async function calculateFinalScores(gameDocRef, game) {
    console.log("Berechne finale Punkte...");
    soundManager.play('roundEnd'); 
    
     if (!gameDocRef || !game || !game.players || !game.settings) {
         console.error("calculateFinalScores: Ungültige Spieldaten.");
         showToast("Fehler beim Berechnen der Punkte!", true);
         return; 
    }

    try {
        let updatedPlayers = JSON.parse(JSON.stringify(game.players));
        updatedPlayers = updatedPlayers.filter(p => p); 

        let roundScores = {}; 
        updatedPlayers.forEach(player => {
            if (!player || !player.grid) return;
            player.grid.forEach(card => { if(card) card.faceUp = true }); 
            for (let col = 0; col < 4; col++) { 
                const cleared = checkAndClearColumn(player.grid, col); 
                 if (cleared.length > 0) {
                     console.log(`Spalte ${col+1} für ${player.name} abgeräumt.`);
                     cleared.forEach(i => { if(player.grid[i]) player.grid[i].discarded = true }); 
                 }
            }
            player.score = calculateScore(player.grid); 
            roundScores[player.id] = player.score; 
        });
        
        const endingPlayerId = game.playerWhoEndedRoundId;
        const endingPlayerIndex = endingPlayerId ? updatedPlayers.findIndex(p => p && p.id === endingPlayerId) : -1; 
        
        const scoresOnly = Object.values(roundScores).filter(s => typeof s === 'number');
        const lowestRoundScore = scoresOnly.length > 0 ? Math.min(...scoresOnly) : Infinity;

        if (endingPlayerIndex !== -1) {
            const endingP = updatedPlayers[endingPlayerIndex];
            if (typeof endingP.score === 'number' && endingP.score > lowestRoundScore && endingP.score > 0) {
                console.log(`Strafe für ${endingP.name}: ${endingP.score} -> ${endingP.score * 2}`);
                endingP.score *= 2;
                roundScores[endingP.id] = endingP.score; 
            }
        }
        
        let gameOver = false; 
        updatedPlayers.forEach(p => { 
            if (!p) return; 
            p.totalScore = (p.totalScore || 0) + (p.score || 0); 
            if (p.totalScore >= (game.settings.goalScore || 100)) gameOver = true; 
        });
        
        const lastRoundScoresForDisplay = updatedPlayers.map(p => ({ id: p.id, name: p.name || '??', score: p.score ?? 0 })); 
        
        const finalStatus = gameOver ? 'game-over' : 'round-over';
        console.log(`Finale Punkte berechnet. Neuer Status: ${finalStatus}`);
        await updateDoc(gameDocRef, { status: finalStatus, players: updatedPlayers, lastRoundScores: lastRoundScoresForDisplay });

    } catch (error) {
        console.error("Fehler beim Speichern der finalen Punkte:", error);
        showToast("Fehler beim Rundenabschluss!", true);
    }
}


function showEndRoundModal(game) {
     if (!game || !game.players || !modalEl) { console.error("showEndRoundModal: Ungültige Daten."); return;}

    if(modalScoresContainerEl) modalScoresContainerEl.innerHTML = '';
    const validPlayers = game.players.filter(p => p); 
    const sortedPlayersForDisplay = [...validPlayers].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)); 
    
    sortedPlayersForDisplay.forEach(p => {
        const scoreDiv = document.createElement('div');
        const nameLabel = p.isAI ? `${p.name || 'KI'} (${p.difficulty || 'N/A'})` : (p.name || 'Spieler'); 
        const colorClass = p.isAI ? 'bg-slate-700' : (p.id === userId ? 'bg-blue-900/50' : 'bg-red-900/50');
        const textColorClass = p.isAI ? 'text-slate-300' : (p.id === userId ? 'text-blue-300' : 'text-red-300');
        let penaltyIndicator = '';
        // Überprüfe gegen lastRoundScores, da p.score die Strafe schon enthält
        if (p.id === game.playerWhoEndedRoundId && game.lastRoundScores) {
             const originalScoreObj = game.lastRoundScores.find(s => s.id === p.id);
             // Finde den niedrigsten Score in lastRoundScores
             const scoresFromLastRound = game.lastRoundScores.map(s => s.score).filter(s => typeof s === 'number');
             const lowestFromLast = scoresFromLastRound.length > 0 ? Math.min(...scoresFromLastRound) : Infinity;
             
             if (originalScoreObj && typeof originalScoreObj.score === 'number' && originalScoreObj.score > lowestFromLast && originalScoreObj.score > 0) {
                 penaltyIndicator = '<span class="text-red-400 font-bold ml-2">(x2 Strafe!)</span>';
             }
        }

        scoreDiv.className = `p-3 rounded-lg ${colorClass}`;
        scoreDiv.innerHTML = `<p class="font-semibold text-lg ${textColorClass}">${nameLabel}</p><p>Runde: <span class="font-bold text-xl">${p.score ?? '?'}</span>${penaltyIndicator}</p><p>Gesamt: <span class="font-bold text-xl">${p.totalScore ?? '?'}</span></p>`; 
        modalScoresContainerEl?.appendChild(scoreDiv);
    });

    const status = game.status;
    if (status === 'game-over') {
        if(modalTitleEl) modalTitleEl.textContent = "Spiel beendet!";
        const winner = [...validPlayers].sort((a, b) => (a.totalScore ?? Infinity) - (b.totalScore ?? Infinity))[0]; 
        if (winner) {
            const winners = validPlayers.filter(p => p.totalScore === winner.totalScore);
            const winnerText = winners.length > 1 ? "Unentschieden!" : `${winner.name || '??'} gewinnt das Spiel!`;
            const winnerColor = winners.length > 1 ? 'text-yellow-400' : (winner.id === userId ? 'text-blue-400' : 'text-red-400'); 
            if(modalWinnerEl) modalWinnerEl.textContent = winnerText;
            if(modalWinnerEl) modalWinnerEl.className = `text-2xl font-semibold mb-8 ${winnerColor}`;
        } else {
             if(modalWinnerEl) modalWinnerEl.textContent = "Fehler";
             if(modalWinnerEl) modalWinnerEl.className = 'text-2xl font-semibold mb-8 text-red-400';
        }
        if(nextRoundButtonEl) nextRoundButtonEl.textContent = "Neues Spiel (Lobby)";
    } else { // round-over
        if(modalTitleEl) modalTitleEl.textContent = "Runde beendet!";
        const winner = sortedPlayersForDisplay[0]; 
         if (winner) {
             const winners = sortedPlayersForDisplay.filter(p => p.score === winner.score);
             const winnerText = winners.length > 1 ? "Runde Unentschieden!" : `${winner.name || '??'} gewinnt die Runde!`;
             const winnerColor = winners.length > 1 ? 'text-yellow-400' : (winner.id === userId ? 'text-blue-400' : 'text-red-400'); 
             if(modalWinnerEl) modalWinnerEl.textContent = winnerText;
             if(modalWinnerEl) modalWinnerEl.className = `text-2xl font-semibold mb-8 ${winnerColor}`;
         } else {
             if(modalWinnerEl) modalWinnerEl.textContent = "Fehler";
             if(modalWinnerEl) modalWinnerEl.className = 'text-2xl font-semibold mb-8 text-red-400';
         }
        if(nextRoundButtonEl) nextRoundButtonEl.textContent = "Nächste Runde";
    }
    if(nextRoundButtonEl) nextRoundButtonEl.style.display = game.hostId === userId ? 'block' : 'none';
    
    modalEl.classList.remove('hidden'); 
    modalEl.classList.add('flex');
}



async function startNextRound() {
    if (actionInProgress || nextRoundButtonEl?.disabled) return;
    actionInProgress = true;
    if(nextRoundButtonEl) nextRoundButtonEl.disabled = true;

    const gameDocRef = doc(db, getGameCollectionPath(), currentGameId);
    let game; 
    try {
        const gameSnap = await getDoc(gameDocRef);
        if (!gameSnap.exists()) { throw new Error("Spiel nicht gefunden."); }
        game = gameSnap.data(); 
        game.id = gameSnap.id; 

        if (!game || !game.players || !game.settings) {
            throw new Error("startNextRound: Ungültige Daten.");
        }
        if (game.hostId !== userId) { throw new Error("Nur Host kann starten."); }

        if (game.status === 'game-over') {
            console.log("Setze Spiel von Game Over zur Lobby zurück...");
            const humanPlayers = game.players.filter(p => p && !p.isAI); 
            humanPlayers.forEach(p => { if(p) { p.grid = []; p.score = 0; p.totalScore = 0; } });
            
            await updateDoc(gameDocRef, {
                status: 'lobby',
                players: humanPlayers.filter(p => p), 
                lastRoundScores: [], lastRoundTriggered: false, playerWhoEndedRoundId: null, 
                deck: [], discardPile: [], currentPlayerIndex: 0, turnPhase: 'DRAW', selectedCard: null
            });

        } else { 
            if(loaderEl) loaderEl.classList.remove('hidden'); 
            if(loaderTextEl) loaderTextEl.textContent = "Starte nächste Runde...";
            
            let deck = createDeck(); deck = shuffleDeck(deck);
            
            let updatedPlayers = JSON.parse(JSON.stringify(game.players));
            updatedPlayers = updatedPlayers.filter(p => p); 

            updatedPlayers.forEach(p => {
                if (!p) return; 
                p.grid = []; 
                for (let i = 0; i < 12 && deck.length > 0; i++) p.grid.push({ value: deck.pop(), faceUp: false, discarded: false });
                flipRandomCards(p.grid, game.settings.flippedCards); 
                p.score = 0; 
            });
            
            const discardPile = (deck.length > 0) ? [deck.pop()] : [0]; 
            const playerCount = updatedPlayers.length;
             // Gewinner der letzten Runde beginnt
             const sortedLastRound = [...(game.lastRoundScores || [])].sort((a,b) => (a.score ?? Infinity) - (b.score ?? Infinity));
             const winnerId = sortedLastRound[0]?.id;
             let startingPlayerIndex = winnerId ? updatedPlayers.findIndex(p => p.id === winnerId) : -1;
             // Fallback
             if (startingPlayerIndex === -1) {
                 const hostIndex = updatedPlayers.findIndex(p => p.id === game.hostId);
                 startingPlayerIndex = playerCount > 0 ? (hostIndex + 1) % playerCount : 0;
             }


            console.log("Starte nächste Runde, Update DB: status='playing'");
            await updateDoc(gameDocRef, { 
                status: 'playing', 
                players: updatedPlayers, 
                deck, 
                discardPile, 
                currentPlayerIndex: startingPlayerIndex, 
                turnPhase: 'DRAW', 
                lastRoundTriggered: false, 
                playerWhoEndedRoundId: null, 
                selectedCard: null 
            });
        }
    } catch (error) {
        console.error("Fehler bei startNextRound/Reset:", error);
        showToast(error.message || "Fehler beim Rundenstart/Reset!", true);
        if (game && game.status !== 'game-over' && loaderEl) loaderEl.classList.add('hidden'); 
        resetToLobby(true); 
    } finally {
         if(nextRoundButtonEl) nextRoundButtonEl.disabled = false; 
         actionInProgress = false; 
    }
}


// --- Initialisierung ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM geladen, Initialisierung startet.");
     const requiredElements = { loaderEl, loaderTextEl, lobbyScreenEl, lobbyStartEl, lobbyWaitEl, createGameButtonEl, gameIdInputEl, joinGameButtonEl, joinErrorEl, gameIdDisplayEl, copyGameIdButtonEl, playerListEl, startGameButtonEl, backToLobbyButtonEl, settingGoalScoreEl, settingFlippedCardsEl, settingNumAiEl, settingAiDifficultyEl, gameContainerEl, opponentsAreaEl, deckPileEl, drawnCardAreaEl, discardPileEl, playerAreaEl, turnIndicatorEl, playerGridEl, playerScoreEl, messageEl, previousScoreDisplayEl, previousScoresListEl, modalEl, modalTitleEl, modalScoresContainerEl, modalWinnerEl, nextRoundButtonEl, toastEl, toastMessageEl, leaveGameButtonEl, leaveConfirmModalEl, leaveConfirmCancelButtonEl, leaveConfirmConfirmButtonEl, infoButtonEl, rulesModalEl, closeRulesButtonEl };
     let missingElement = false;
     let missingKeys = [];
     for (const key in requiredElements) {
         if (!requiredElements[key]) {
             console.error(`DOM-Element nicht gefunden: ${key}`);
             missingElement = true;
             missingKeys.push(key);
         }
     }
     
     if(missingElement) {
         document.body.innerHTML = `<div style="color: red; font-size: 1.5em; text-align: center; padding: 20px; border: 2px solid red; margin: 20px; background-color: #330000;">Fehler: Wichtige Seitenelemente konnten nicht geladen werden.<br>Fehlende Elemente: ${missingKeys.join(', ')}<br>Bitte versuche, die Seite neu zu laden.</div>`;
         return; 
     }

    try {
        setupLobbyListeners();
        setupGameListeners();
        initFirebase();
        console.log("Initialisierung erfolgreich abgeschlossen.");
    } catch (initError) {
         console.error("Schwerer Fehler während der Initialisierung:", initError);
          document.body.innerHTML = `<div style="color: red; font-size: 1.5em; text-align: center; padding: 20px; border: 2px solid red; margin: 20px; background-color: #330000;">Ein schwerer Initialisierungsfehler ist aufgetreten: ${initError.message}. Bitte laden Sie die Seite neu.</div>`;
    }
});

