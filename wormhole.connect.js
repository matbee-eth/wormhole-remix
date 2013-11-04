(function () {
	var module = {}, socket, io = module.exports = window.gnio = {};
	var customTransports;
	(function () {
		THISSTRINGISTHESOCKETIOSCRIPTLOL;
	})();
	if (io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER']) {
		socket = io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER'];
		socket.connect({
			reconnect: false,
			'try multiple transports': true
		});
	} else {
		var socketOptions = {
			reconnect: false,
			'try multiple transports': true
		};
		if (customTransports) {
			socketOptions = customTransports;
		}
		socket = io.connect('THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/THISISTHENAMESPACEFORSOCKETIO', socketOptions);
	}
	var theFunctionToDo = function () {
		REPLACETHISSTRINGOKAY
	};
	if (!window.wh) {
		var wh = new wormhole(socket);
		window.io = io;
		wh.ready(theFunctionToDo);
		wh.setPath('THISISTHEHOSTNAMEOFTHESCRIPTSERVER');
		window.wh = wh;
	} else {
		console.log("Wormhole exists!");
		window.wh.setSocket(socket);
		window.wh.setupSocket(socket);
		window.wh.ready(theFunctionToDo);
	}
}());