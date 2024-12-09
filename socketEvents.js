import { generateGameGrid } from "./gridControllerjs";

let users = [];
const gameRooms = {};

const socketEvents = (io) => {
    io.on('connection', (socket) => {
        console.log('a user connected');

        // User provides nickname when joining the server
        socket.on("join server", (nickname) => {
            const user = {
                nickname,
                id: socket.id,
            };
            console.log(`${nickname} with id ${socket.id} joined server`);
            users.push(user);
            io.emit("new user", users);
        });

        // User joining or creating a room
        socket.on("join room", (roomName, nickname, cb) => {
            socket.join(roomName);
            console.log(`${nickname} with id ${socket.id} joined room ${roomName}`);

            // Creates room if no room exists
            if (!gameRooms[roomName]) {
                gameRooms[roomName] = {
                    users: [],
                    gameLog: [],
                    teamRed: [],
                    teamBlue: [],
                    spectators: [],
                    teamColors: {
                        red: {
                            limit: 5,
                            spymaster: null
                        },
                        blue: {
                            limit: 5,
                            spymaster: null
                        }
                    }
                };
            }

            const room = gameRooms[roomName];

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

            // Allow user to see previous game log history if exists
            cb(room.gameLog, {
                success: true,
                users: room.users,
                spectators: room.spectators,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue,
                existingUserRole,
                existingMemberRole
            });

            // Notify the room that a new user has joined
            io.to(roomName).emit("user joined", {
                nickname,
                users: room.users,
                spectators: room.spectators,
            });

            console.log(`${nickname} rejoined room ${roomName}`);

            // User choosing a role on a team
            socket.on("select role", (roomName, nickname, teamColor, roleType, cb) => {
                const room = gameRooms[roomName];
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
        });

        // Add start game event handler
        socket.on("start game", (roomName, cb) => {
            const room = gameRooms[roomName];
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
            room.currentTurn = Math.random() < 0.5 ? 'red' : 'blue'; // Randomly choose starting team

            // Broadcast game start to room
            io.to(roomName).emit("game started", {
                success: true,
                gameGrid: gameGrid,
                currentTurn: room.currentTurn,
                teamRed: room.teamRed,
                teamBlue: room.teamBlue
            });

            // Optional: Add to game log
            room.gameLog.push({
                type: 'game_start',
                timestamp: new Date(),
                startingTeam: room.currentTurn
            });

            // Callback for additional client-side handling if needed
            cb({
                success: true,
                gameGrid: gameGrid,
                currentTurn: room.currentTurn
            });
        });
    });
};

export default socketEvents;