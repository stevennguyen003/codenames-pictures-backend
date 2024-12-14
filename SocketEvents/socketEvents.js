import { generateGameGrid } from "../GridController/gridController.js";
import { v4 as uuidv4 } from 'uuid';

const socketEvents = (io, redisClient) => {
    // Helper function to serialize room data
    const serializeRoomData = (roomData) => {
        return {
            ...roomData,
            users: JSON.stringify(roomData.users || []),
            gameLog: JSON.stringify(roomData.gameLog || []),
            teamRed: JSON.stringify(roomData.teamRed || []),
            teamBlue: JSON.stringify(roomData.teamBlue || []),
            spectators: JSON.stringify(roomData.spectators || []),
            teamColors: JSON.stringify(roomData.teamColors || {
                red: { limit: 5, spymaster: null },
                blue: { limit: 5, spymaster: null }
            }),
            gameGrid: JSON.stringify(roomData.gameGrid || null),
            gameStarted: roomData.gameStarted ? 'true' : 'false'
        };
    };

    // Helper function to deserialize room data
    const deserializeRoomData = (serializedData) => {
        return {
            ...serializedData,
            users: JSON.parse(serializedData.users || '[]'),
            gameLog: JSON.parse(serializedData.gameLog || '[]'),
            teamRed: JSON.parse(serializedData.teamRed || '[]'),
            teamBlue: JSON.parse(serializedData.teamBlue || '[]'),
            spectators: JSON.parse(serializedData.spectators || '[]'),
            teamColors: JSON.parse(serializedData.teamColors || JSON.stringify({
                red: { limit: 5, spymaster: null },
                blue: { limit: 5, spymaster: null }
            })),
            gameGrid: serializedData.gameGrid ? JSON.parse(serializedData.gameGrid) : null,
            gameStarted: serializedData.gameStarted === 'true'
        };
    };

    // Room key generator
    const getRoomKey = (roomName) => `codenames:room:${roomName}`;

    // Create or update room in Redis
    const createOrUpdateRoom = async (roomName, roomData) => {
        const roomKey = getRoomKey(roomName);
        const serializedData = serializeRoomData(roomData);
        
        await redisClient.hSet(roomKey, serializedData);
        // Set expiration to 7 days
        await redisClient.expire(roomKey, 60 * 60 * 24 * 7);
    };

    // Retrieve room data from Redis
    const getRoomData = async (roomName) => {
        const roomKey = getRoomKey(roomName);
        const roomData = await redisClient.hGetAll(roomKey);
        
        return roomData ? deserializeRoomData(roomData) : null;
    };

    io.on('connection', (socket) => {
        console.log('a user connected');

        // Authenticate user session
        socket.on("authenticate", async (sessionId, cb) => {
            try {
                const sessionData = await redisClient.get(`codenames:session:${sessionId}`);
                
                if (sessionData) {
                    const parsedSession = JSON.parse(sessionData);
                    cb({
                        success: true,
                        nickname: parsedSession.nickname,
                        sessionId: sessionId
                    });
                } else {
                    const newSessionId = uuidv4();
                    cb({
                        success: false,
                        sessionId: newSessionId
                    });
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

            const user = {
                nickname,
                id: socket.id,
            };

            socket.nickname = nickname;
            socket.sessionId = sessionId;

            console.log(`${nickname} with id ${socket.id} joined server`);
        });

        // User joins room
        socket.on("join room", async (roomName, nickname, cb) => {
            socket.join(roomName);
            console.log(`${nickname} with id ${socket.id} joined room ${roomName}`);

            // Retrieve or create room data
            let room = await getRoomData(roomName);
            if (!room) {
                room = {
                    users: [],
                    gameLog: [],
                    teamRed: [],
                    teamBlue: [],
                    spectators: [],
                    gameStarted: false,
                    gameGrid: null,
                    teamColors: {
                        red: { limit: 5, spymaster: null },
                        blue: { limit: 5, spymaster: null }
                    }
                };
            }

            // Check if user already exists in the room
            const existingUserInRoom = [
                ...room.teamRed,
                ...room.teamBlue,
                ...room.spectators
            ].find(user => user.nickname === nickname);

            let existingUserRole = 'spectator';
            let existingMemberRole = 'spectator';

            if (existingUserInRoom) {
                // Determine existing team and role
                const redTeamMember = room.teamRed.find(member => member.nickname === nickname);
                const blueTeamMember = room.teamBlue.find(member => member.nickname === nickname);

                if (redTeamMember) {
                    existingUserRole = 'red';
                    existingMemberRole = redTeamMember.role;
                } else if (blueTeamMember) {
                    existingUserRole = 'blue';
                    existingMemberRole = blueTeamMember.role;
                }

                // Update the existing user's socket ID
                if (redTeamMember) redTeamMember.id = socket.id;
                if (blueTeamMember) blueTeamMember.id = socket.id;
            } else {
                // User joins room as spectator by default
                const newUser = { nickname, id: socket.id, role: 'spectator' };
                room.spectators.push(newUser);
            }

            // Update room in Redis
            await createOrUpdateRoom(roomName, room);

            // Callback with room information
            cb(room.gameLog, {
                success: true,
                users: room.users,
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue,
                existingUserRole,
                existingMemberRole,
                gameStarted: room.gameStarted,
                gameGrid: room.gameStarted ? room.gameGrid : null,
                currentTurn: room.currentTurn
            });

            // Notify the room that a new user has joined
            io.to(roomName).emit("user joined", {
                nickname,
                users: room.users,
                spectators: room.spectators,
            });
        });

        // User selecting a role
        socket.on("select role", async (roomName, nickname, teamColor, roleType, cb) => {
            // Retrieve room data
            let room = await getRoomData(roomName);
            if (!room) {
                return cb({ success: false, error: "Room does not exist" });
            }

            // Remove user from spectators and other teams
            room.spectators = room.spectators.filter(user => user.nickname !== nickname);
            room.teamRed = room.teamRed.filter(user => user.nickname !== nickname);
            room.teamBlue = room.teamBlue.filter(user => user.nickname !== nickname);

            // Check if existing spymaster
            const teamArray = teamColor === 'red' ? room.teamRed : room.teamBlue;
            const existingSpymaster = teamArray.find(user => user.role === 'spymaster');
            if (roleType === 'spymaster' && existingSpymaster) {
                return cb({
                    success: false,
                    error: `${teamColor} team already has a spymaster`
                });
            }

            // Create new team member with selected role
            const teamMember = {
                nickname,
                id: socket.id,
                role: roleType
            };

            // Add to team
            if (teamColor === 'red') {
                room.teamRed.push(teamMember);
            } else {
                room.teamBlue.push(teamMember);
            }

            // Update room in Redis
            await createOrUpdateRoom(roomName, room);

            // Broadcast updated team information to the room
            io.to(roomName).emit("team updated", {
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue
            });

            cb({
                success: true,
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue
            });
        });

        // Start game event
        socket.on("start game", async (roomName, cb) => {
            // Retrieve room data
            let room = await getRoomData(roomName);
            if (!room) {
                return cb({ success: false, error: "Room does not exist" });
            }

            // Validate team compositions
            const redSpymasters = room.teamRed.filter(member => member.role === 'spymaster');
            const redOperators = room.teamRed.filter(member => member.role === 'operator');
            const blueSpymasters = room.teamBlue.filter(member => member.role === 'spymaster');
            const blueOperators = room.teamBlue.filter(member => member.role === 'operator');

            if (
                redSpymasters.length < 1 ||
                redOperators.length < 1 ||
                blueSpymasters.length < 1 ||
                blueOperators.length < 1
            ) {
                return cb({
                    success: false,
                    error: "Each team must have at least one spymaster and one operator"
                });
            }

            // Generate game grid
            const gameGrid = generateGameGrid();

            // Update room with game state
            room.gameStarted = true;
            room.gameGrid = gameGrid;
            room.currentTurn = Math.random() < 0.5 ? 'red' : 'blue';

            // Add game start to game log
            room.gameLog.push({
                type: 'game_start',
                timestamp: new Date(),
                startingTeam: room.currentTurn
            });

            // Update room in Redis
            await createOrUpdateRoom(roomName, room);

            // Broadcast game start to room
            io.to(roomName).emit("game started", {
                success: true,
                gameGrid: gameGrid,
                currentTurn: room.currentTurn,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue
            });

            // Callback for additional client-side handling
            cb({
                success: true,
                gameGrid: gameGrid,
                currentTurn: room.currentTurn
            });
        });

        // Resets game grid
        socket.on("reset game", async (roomName, cb) => {
            let room = await getRoomData(roomName);
            if (!room) {
                return cb({ success: false, error: "Room does not exist" });
            }
    
            // Reset game state
            room.gameStarted = false;
            room.gameGrid = null;
            room.currentTurn = null;
            room.gameLog.push({
                type: 'game_reset',
                timestamp: new Date()
            });
    
            // Update room in Redis
            await createOrUpdateRoom(roomName, room);
    
            // Broadcast game reset to room
            io.to(roomName).emit("game reset", {
                success: true
            });
    
            cb({ success: true });
        });
    });
};

export default socketEvents;