(function () {
	var module = {}, socket, io = module.exports = window.gnio = {};
	(function () {
		THISSTRINGISTHESOCKETIOSCRIPTLOL;
	})();
	console.log("Socket.io Loaded and namespaced");
	if (io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER']) {
		socket = io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER'];
		socket.connect();
	} else {
		socket = io.connect('THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/THISISTHENAMESPACEFORSOCKETIO', {
			'reconnect': true,
			'reconnection delay': 500,
			'max reconnection attempts': 4,
			'try multiple transports': true
		});
	}
	var theFunctionToDo = function () {
		REPLACETHISSTRINGOKAY
	};
	if (!window.wh) {
		var wh = new wormhole(socket);
		wh.ready(theFunctionToDo);

		window.wh = wh;
	} else {
		window.wh.setSocket(socket);
		window.wh.setupSocket(socket);
		window.wh.ready(theFunctionToDo);
	}
}());