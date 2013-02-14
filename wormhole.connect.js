(function() {
	var socket;
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
	var wh = new wormhole(socket);
	wh.ready(function () {
		REPLACETHISSTRINGOKAY;
	});
	
	window.wh = wh;
}());