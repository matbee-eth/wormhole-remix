(function (scope) {
	if (!scope) {
		scope = window;
	}
	var module = {}, socket, io = module.exports = scope.gnio = {};
	(function () {
		THISSTRINGISTHESOCKETIOSCRIPTLOL;
	})();
	if (io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER']) {
		socket = io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER'];
		socket.connect();
	} else {
		socket = io.connect('THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/THISISTHENAMESPACEFORSOCKETIO', {
			reconnect: false,
			'try multiple transports': true
		});
	}
	var theFunctionToDo = function () {
		REPLACETHISSTRINGOKAY
	};
	if (!scope.wh) {
		var wh = new wormhole(socket);
		wh.ready(theFunctionToDo);
		scope.wh = wh;
	} else {
		scope.wh.setSocket(socket);
		scope.wh.setupSocket(socket);
		scope.wh.ready(theFunctionToDo);
	}
}());