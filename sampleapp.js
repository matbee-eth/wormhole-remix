var wh = require('./server.js')(io);
wh.methods({
	hello: function () {
		this.return("world!");
		this.socket.get('wormhole').execute("rpcFunction", "one", "two", "three", function (parameter1) {
			// response
		});
	}
});
wh.clientMethods({
	rpcFunction: function (param1, param2, param3) {
		this.return("hello!!");
		socket.get('wormhole').execute("hello", "one", "two", "three", function (parameter1) {
			// response
		}); // Execute "Hello" method on server.
	}
});
io.on('connect', function (socket) {
	socket.get('wormhole').execute("rpcFunction", "one", "two", "three");
});