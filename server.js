const express = require('express')
const http = require('http')
const cors = require('cors')
const bodyParser = require('body-parser')
const xss = require("xss")
const socketIo = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

app.use(cors())
app.use(bodyParser.json())

if(process.env.NODE_ENV==='production'){
	app.use(express.static(__dirname+"/build"))
	app.get("*", (req, res) => {
		res.sendFile(path.join(__dirname+"/build/index.html"))
	})
}
app.set('port', (process.env.PORT || 4001))

sanitizeString = (str) => {
	return xss(str)
}

connections = {}
messages = {}
timeOnline = {}
const usernames = {};
io.on('connection', (socket) => {

	socket.on('join-call', (path, username) => {
		usernames[socket.id] = username;
		if (connections[path] === undefined) {
		  connections[path] = [];
		}
	  
		// Verificar si el socket ya está en la sala
		if (!connections[path].includes(socket.id)) {
		  connections[path].push(socket.id);
		}
	  
		timeOnline[socket.id] = new Date();
	  
		for (let a = 0; a < connections[path].length; ++a) {
			io.to(connections[path][a]).emit("user-joined", socket.id, connections[path], usernames);
		  }
	  
		if (messages[path] !== undefined) {
		  for (let a = 0; a < messages[path].length; ++a) {
			io.to(socket.id).emit("chat-message", messages[path][a]['data'], messages[path][a]['sender'], messages[path][a]['socket-id-sender']);
		  }
		}
	  
		console.log(path, connections[path]);
	  });

	socket.on('signal', (toId, message) => {
		io.to(toId).emit('signal', socket.id, message)
	})

	socket.on('chat-message', (messageData) => {
		const { text, sender, senderId, timestamp } = messageData;
		
		// Guardamos el mensaje en la sala correspondiente.
		for (let key in connections) {
		  for (let i = 0; i < connections[key].length; i++) {
			if (!messages[key]) messages[key] = [];
			messages[key].push({ data: text, sender, 'socket-id-sender': senderId });
			io.to(connections[key][i]).emit("chat-message", text, sender, senderId, timestamp);
		  }
		}
	  });
	  

	  socket.on('disconnect', () => {
		var diffTime = Math.abs(timeOnline[socket.id] - new Date());
		var key;
		delete usernames[socket.id];
		for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
		  var index = v.indexOf(socket.id);
		  if (index !== -1) {
			key = k;
			v.splice(index, 1);
			for (let a = 0; a < v.length; ++a) {
			  io.to(v[a]).emit("user-left", socket.id);
			}
			console.log(key, socket.id, Math.ceil(diffTime / 1000));
			if (v.length === 0) {
			  delete connections[key];
			}
			break;
		  }
		}
	  });
})

server.listen(app.get('port'), () => {
    console.log("listening on", app.get('port'))
})