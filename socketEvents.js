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

      // User joins room as spectator by default
      const newUser = { nickname, id: socket.id, role: 'spectator' };
      gameRooms[roomName].spectators.push(newUser);

      // Allow user to see previous game log history if exists
      cb(gameRooms[roomName].gameLog, {
        success: true,
        users: gameRooms[roomName].users,
        spectators: gameRooms[roomName].spectators,
        teamRed: gameRooms[roomName].teamRed,
        teamBlue: gameRooms[roomName].teamBlue
      });

      // Notify the room that a new user has joined
      io.to(roomName).emit("user joined", {
        nickname,
        users: gameRooms[roomName].users,
        spectators: gameRooms[roomName].spectators,
      });

      console.log(`${nickname} joined room ${roomName} as a spectator`);

      // User choosing a role on a team
      socket.on("select role", (roomName, nickname, teamColor, roleType, cb) => {
        const room = gameRooms[roomName];
        if (!room) {
          return cb({ success: false, error: "Room does not exist" });
        }

        // Remove user from spectators
        room.spectators = room.spectators.filter(user => user.id !== socket.id);

        // Remove the user from existing teams first
        room.teamRed = room.teamRed.filter(user => user.id !== socket.id);
        room.teamBlue = room.teamBlue.filter(user => user.id !== socket.id);

        // Determine the correct team array
        const teamArray = teamColor === 'red' ? room.teamRed : room.teamBlue;

        // Check if existing spymaster
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
          room.teamRed = [...room.teamRed, teamMember];
        } else {
          room.teamBlue = [...room.teamBlue, teamMember];
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
  });
};

export default socketEvents;
