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
                room.users.push({ id: socket.id });
                room.spectators.push({ nickname, id: socket.id, role: 'spectator' });
                await createOrUpdateRoom(roomName, room);
            }

            // Callback
            cb(room.gameLog, {
                success: true,
                users: room.users,
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue,
                gameStarted: room.gameStarted,
                gameGrid: room.gameStarted ? room.gameGrid : null,
                currentTurn: room.currentTurn
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
            // Error checking
            let room = await getRoomData(roomName);
            if (!room) return cb({ success: false, error: "Room does not exist" });

            if (room.teamRed.length < 2 || room.teamBlue.length < 2) {
                return cb({ success: false, error: "Each team must have at least 2 members" });
            }

            const { gameGrid, teamRedPoints, teamBluePoints } = generateGameGrid();
            room.gameStarted = true;
            room.gameGrid = gameGrid;
            room.teamRedPoints = teamRedPoints;
            room.teamBluePoints = teamBluePoints;
            room.currentTurn = Math.random() < 0.5 ? 'red' : 'blue';
            room.gameLog.push({ type: 'game_start', timestamp: new Date(), startingTeam: room.currentTurn });

            await createOrUpdateRoom(roomName, room);

            io.to(roomName).emit("game started", {
                success: true,
                gameGrid: room.gameGrid,
                currentTurn: room.currentTurn,
                teamRedPoints: room.teamRedPoints,
                teamBluePoints: room.teamBluePoints
            });

            cb({ success: true });
        });
    });
};

export default socketEvents;