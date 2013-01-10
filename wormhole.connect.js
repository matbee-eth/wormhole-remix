(function() {
	var socket;
	if (io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER']) {
		socket = io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER'];
		socket.connect();
	} else {
		socket = io.connect('THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER', {
			'reconnect': true,
			'reconnection delay': 500,
			'max reconnection attempts': 2,
			'try multiple transports': false
		});
	}
	var wh = new wormhole(socket);
	wh.ready(function () {
		REPLACETHISSTRINGOKAY;
	});
	window.wh = wh;
}());