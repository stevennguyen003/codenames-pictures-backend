import { generateGameGrid } from "../GridController/gridController.js";
import { RoomData } from "./roomData.js"
import { v4 as uuidv4 } from 'uuid';

// Customized room key for saving to Redis
const getRoomKey = (roomName) => `codenames:room:${roomName}`;

// Handles all socket events
const socketEvents = (io, redisClient) => {

    // Used to update room data, including newly created rooms
    const createOrUpdateRoom = async (roomName, roomData) => {
        const roomKey = getRoomKey(roomName);
        const serializedData = roomData.serialize();
        // console.log(serializedData);
        await redisClient.hSet(roomKey, serializedData);
        await redisClient.expire(roomKey, 60 * 60 * 24 * 7); // Set expiration to 7 days
    };

    // Fetches room data, if no data was found, we create a new room
    const getRoomData = async (roomName) => {
        const roomKey = getRoomKey(roomName);
        const serializedData = await redisClient.hGetAll(roomKey);
        return serializedData ? RoomData.fromSerialized(serializedData) : new RoomData();
    };

    // Server connection
    io.on('connection', (socket) => {
        console.log('a user connected');

        // Attempts to find existing session on connection
        socket.on("authenticate", async (sessionId, cb) => {
            try {
                const sessionData = await redisClient.get(`codenames:session:${sessionId}`);
                if (sessionData) {
                    const parsedSession = JSON.parse(sessionData);
                    cb({ success: true, nickname: parsedSession.nickname, sessionId });
                } else {
                    const newSessionId = uuidv4();
                    cb({ success: false, sessionId: newSessionId });
                }
            } catch (error) {
                console.error('Authentication error:', error);
                cb({ success: false, error: 'Authentication failed' });
            }
        });

        // User joins server
        socket.on("join server", async (nickname, sessionId) => {
            // Store session in Redis
            await redisClient.set(`codenames:session:${sessionId}`, JSON.stringify({
                nickname,
                createdAt: Date.now()
            }), {
                EX: 60 * 60 * 24 * 7 // 1 week expiration
            });

            socket.nickname = nickname;
            socket.sessionId = sessionId;

            console.log(`${nickname} with id ${socket.id} joined server`);
        });

        // Joining a room, creates a room if not found
        socket.on("join room", async (roomName, nickname, cb) => {
            socket.join(roomName);
            console.log(`${nickname} with id ${socket.id} joined room ${roomName}`);

            // Fetch room data 
            let room = await getRoomData(roomName);

            // Verifies if the user was on a 'team'
            const existingUserInRoom = [
                ...room.teamRed,
                ...room.teamBlue,
                ...room.spectators
            ].find(user => user.nickname === nickname);

            // First time users get defaulted to spectator, need to update room
            if (!existingUserInRoom) {
                room.spectators.push({ nickname, id: socket.id, role: 'spectator' });
                await createOrUpdateRoom(roomName, room);
            }

            // console.log("Joining room: ", room);

            // Callback
            cb(room.gameLog, {
                success: true,
                users: room.users,
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue,
                gameStarted: room.gameStarted,
                gameGrid: room.gameStarted ? room.gameGrid : null,
                currentTurnData: room.currentTurnData ? room.currentTurnData : null,
                teamRedPoints: room.teamRedPoints ? room.teamRedPoints : null,
                teamBluePoints: room.teamBluePoints ? room.teamBluePoints : null
            });

            // Emitting back to all users in room
            io.to(roomName).emit("user joined", {
                nickname,
                users: room.users,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue,
                spectators: room.spectators
            });
        });

        // User trying to select a role
        socket.on("select role", async (roomName, nickname, teamColor, roleType, cb) => {
            // Retrieve room data
            let room = await getRoomData(roomName);
            if (!room) {
                return cb({ success: false, error: "Room does not exist" });
            }

            // Spymaster handling, only one allowed per team
            if (roleType === 'spymaster') {
                const teamArray = teamColor === 'red' ? room.teamRed : room.teamBlue;
                const existingSpymaster = teamArray.find(user => user.role === 'spymaster');

                // Not allowed to join as spymaster
                if (existingSpymaster) {
                    return cb({
                        success: false,
                        error: `${teamColor.toUpperCase()} team already has a spymaster`
                    });
                }
            }

            // Remove user from teams
            room.spectators = room.spectators.filter(user => user.nickname !== nickname);
            room.teamRed = room.teamRed.filter(user => user.nickname !== nickname);
            room.teamBlue = room.teamBlue.filter(user => user.nickname !== nickname);

            // Create team member object
            const teamMember = {
                nickname,
                id: socket.id,
                role: roleType
            };

            // Add to target team reference
            const targetTeam = teamColor === 'red' ? room.teamRed : room.teamBlue;
            targetTeam.push(teamMember);

            // Attempt to update the room
            try {
                await createOrUpdateRoom(roomName, room);

                // Broadcast team update
                io.to(roomName).emit("team updated", {
                    spectators: room.spectators,
                    teamRed: room.teamRed,
                    teamBlue: room.teamBlue
                });

                // Callback with success
                cb({
                    success: true,
                    spectators: room.spectators,
                    teamRed: room.teamRed,
                    teamBlue: room.teamBlue
                });
            } catch (error) {
                console.error('Error updating room:', error);
                cb({
                    success: false,
                    error: 'Failed to update room'
                });
            }
        });

        // Starting a game
        socket.on("start game", async (roomName, cb) => {
            let room = await getRoomData(roomName);
            if (!room) return cb({ success: false, error: "Room does not exist" });

            if (room.teamRed.length < 2 || room.teamBlue.length < 2) {
                return cb({ success: false, error: "Each team must have at least 2 members" });
            }

            // Initializing game info
            const { gameGrid, teamRedPoints, teamBluePoints } = generateGameGrid();
            room.gameStarted = true;
            room.gameGrid = gameGrid;
            room.teamRedPoints = teamRedPoints;
            room.teamBluePoints = teamBluePoints;

            // Initialize currentTurnData with starting team
            const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
            room.setCurrentTurn(startingTeam);

            console.log("Starting Game: ", room);

            // Update game log
            room.gameLog.push({ type: 'game_start', timestamp: new Date(), startingTeam });

            // Update room with new info
            try {
                await createOrUpdateRoom(roomName, room);
                io.to(roomName).emit("game started", {
                    success: true,
                    gameGrid: room.gameGrid,
                    currentTurnData: room.currentTurnData,
                    teamRedPoints: room.teamRedPoints,
                    teamBluePoints: room.teamBluePoints
                });

                cb({ success: true });
            } catch (error) {
                console.error('Error updating room:', error);
                cb({ success: false, error: 'Failed to update room' });
            }
        });

        socket.on("reset game", async (roomName, cb) => {
            let room = await getRoomData(roomName);
            if (!room) return cb({ success: false, error: "Room does not exist" });

            // Reset the game state
            room.gameStarted = false;
            room.gameGrid = null;
            room.teamRedPoints = null;
            room.teamBluePoints = null;
            room.currentTurnData = null;
            room.gameLog = []; // Clear the game log

            console.log("Resetting Game: ", room);

            // Add reset event to game log
            room.gameLog.push({
                type: 'game_reset',
                timestamp: new Date(),
            });

            // Update room with new info
            try {
                await createOrUpdateRoom(roomName, room);

                // Emit reset event with all necessary data
                io.to(roomName).emit("reset game", {
                    success: true,
                    gameGrid: room.gameGrid,
                    currentTurn: room.getCurrentTurn(),
                    teamRedPoints: room.teamRedPoints,
                    teamBluePoints: room.teamBluePoints,
                    teamRed: room.teamRed,
                    teamBlue: room.teamBlue,
                    gameLog: room.gameLog
                });

                cb({ success: true });
            } catch (error) {
                console.error('Error resetting room:', error);
                cb({ success: false, error: 'Failed to reset room' });
            }
        });

        // Function to handle club submission from spymaster
        socket.on("submit clue", async (roomName, clue, clueNumber, cb) => {
            let room = await getRoomData(roomName);

            // Verify arguments
            if (!room || !room.gameStarted) {
                return cb({ success: false, error: "Game not started or room does not exist" });
            }
            if (!clue || typeof clueNumber !== 'number' || clueNumber < 1) {
                return cb({ success: false, error: "Invalid clue or number" });
            }

            // Update current turn data with clue information
            room.currentTurnData = {
                ...room.currentTurnData,
                currentClue: clue,
                clueNumber: clueNumber,
                correctCardsClicked: 0,
                turnEnded: false
            };

            const team = room.getCurrentTurn();

            // Update game log
            room.gameLog.push({
                type: 'clue_submitted',
                timestamp: new Date(),
                clue: clue,
                clueNumber: clueNumber,
                team: room.getCurrentTurn()
            });

            console.log("Clue Submitted: ", room);

            // Update room with new info
            try {
                await createOrUpdateRoom(roomName, room);
                io.to(roomName).emit("clue submitted", {
                    currentTurnData: room.currentTurnData
                });

                cb({ success: true });
            } catch (error) {
                console.error('Error updating room:', error);
                cb({ success: false, error: 'Failed to submit clue' });
            }
        });

        // Card selection
        socket.on("card click", async (roomName, cardIndex, cb) => {
            // Retrieve room data
            let room = await getRoomData(roomName);
            if (!room || !room.gameStarted) {
                return cb({ success: false, error: "Game not started or room does not exist" });
            }

            // Validate card index
            if (cardIndex < 0 || cardIndex >= room.gameGrid.length) {
                return cb({ success: false, error: "Invalid card index" });
            }

            // Get the clicked card
            const clickedCard = room.gameGrid[cardIndex];

            // Prevent re-clicking revealed cards
            if (clickedCard.revealed) {
                return cb({ success: false, error: "Card already revealed" });
            }

            // Initialize turn tracking if not exists
            if (!room.currentTurnData) {
                room.setCurrentTurn(room.getCurrentTurn());
            }

            // Mark card as revealed
            clickedCard.revealed = true;

            // Game logic based on card type
            let gameOver = false;
            let winner = null;
            let turnEnded = false;
            let currentTurn = room.getCurrentTurn();

            console.log("Current Turn: ", currentTurn);

            let logEntry = {
                type: 'card_click',
                timestamp: new Date(),
                cardWord: clickedCard.image,
                cardType: clickedCard.type,
                team: currentTurn
            };

            // Determine if card click ends the turn
            let isCorrectColor = false;
            switch (clickedCard.type) {
                case 'red':
                    if (currentTurn === 'red') {
                        isCorrectColor = true;
                        room.currentTurnData.correctCardsClicked++;
                    } else {
                        room.currentTurnData.turnEnded = true;
                    }

                    // Win condition
                    if (room.teamRedPoints === 0) {
                        gameOver = true;
                        winner = 'red';
                    }

                    room.teamRedPoints--;
                    logEntry.pointsRemaining = room.teamRedPoints;
                    break;

                case 'blue':
                    if (currentTurn === 'blue') {
                        isCorrectColor = true;
                        room.currentTurnData.correctCardsClicked++;
                    } else {
                        room.currentTurnData.turnEnded = true;
                    }
                    room.teamBluePoints--;

                    // Win condition
                    if (room.teamBluePoints === 0) {
                        gameOver = true;
                        winner = 'blue';
                    }
                    logEntry.pointsRemaining = room.teamBluePoints;
                    break;

                case 'assassin':
                    gameOver = true;
                    winner = currentTurn === 'red' ? 'blue' : 'red';
                    logEntry.type = 'assassin_clicked';
                    room.currentTurnData.turnEnded = true;
                    break;

                case 'neutral':
                    room.currentTurnData.turnEnded = true;
                    break;
            }

            // Check if turn should end based on clue number or wrong card
            if (turnEnded || (isCorrectColor && room.currentTurnData.correctCardsClicked > room.currentTurnData.clueNumber)) {
                room.currentTurnData.turnEnded = true;
            }

            // Add log entry
            room.gameLog.push(logEntry);

            // Handle game over scenario
            if (gameOver) {
                room.gameStarted = false;
                room.winner = winner;
                room.gameLog.push({
                    type: 'game_over',
                    timestamp: new Date(),
                    winner: winner
                });
            }

            // Switch turns if turn ended
            if (room.currentTurnData.turnEnded && !gameOver) {
                const nextTeam = currentTurn === 'red' ? 'blue' : 'red';
                room.setCurrentTurn(nextTeam);
            }

            console.log("Card Clicked: ", room);

            try {
                await createOrUpdateRoom(roomName, room);

                // Updated emit with complete currentTurnData
                io.to(roomName).emit("card revealed", {
                    cardIndex,
                    cardType: clickedCard.type,
                    gameGrid: room.gameGrid,
                    teamRedPoints: room.teamRedPoints,
                    teamBluePoints: room.teamBluePoints,
                    gameStarted: room.gameStarted,
                    currentTurnData: {
                        currentTurn: room.currentTurnData.currentTurn,
                        currentClue: room.currentTurnData.currentClue,
                        clueNumber: room.currentTurnData.clueNumber,
                        correctCardsClicked: room.currentTurnData.correctCardsClicked,
                        turnEnded: room.currentTurnData.turnEnded
                    },
                    gameOver,
                    winner
                });

                // Updated callback with currentTurnData
                cb({
                    success: true,
                    cardType: clickedCard.type,
                    turnEnded,
                    gameOver,
                    winner,
                    currentTurnData: {
                        team: room.currentTurnData.currentTurn,
                        currentClue: room.currentTurnData.currentClue,
                        clueNumber: room.currentTurnData.clueNumber,
                        correctCardsClicked: room.currentTurnData.correctCardsClicked,
                        turnEnded: room.currentTurnData.turnEnded
                    }
                });
            } catch (error) {
                console.error('Error updating room:', error);
                cb({ success: false, error: 'Failed to update room' });
            }
        });

    });
};

export default socketEvents;