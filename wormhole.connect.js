var adsasdasasdfadsf = $ || LOLO;
adsasdasasdfadsf(function () {
	var wormholeIO;
	var module = {};
	var io = wormholeIO = module.exports = {};
	var sockjs;
	var multiplexer;
	var _multiplexer;
	var define = function (scriptName, blah, func) {
		sockjs = func();
	};
	define.amd = "lol";
	adsasdasasdfadsf.getJSON("THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/wormhole/socket.io.js" + "?callback=?", null, function(script) {
		eval("(function(){"+script+";multiplexer = WebSocketMultiplex})()");
		if (multiplexer) {
			cbSock();
		} else {
			cbIO();
		}
	});
	var theFunctionToDo = function () {
		REPLACETHISSTRINGOKAY
	};
    var cbIO = function () {
		console.log("Socket.io Loaded and namespaced");
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
		if (!window.wh) {
			var wh = new wormhole(socket);
			wh.ready(theFunctionToDo);
			window.wh = wh;
		} else {
			window.wh.setSocket(socket);
			window.wh.setupSocket(socket);
			window.wh.ready(theFunctionToDo);
		}
    }
    var cbSock = function () {
		console.log("SockJS Loaded and namespaced");
		var sockjs_url = 'THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/multiplex';
        var sockjs = new SockJS(sockjs_url);
		_multiplexer = new multiplexer(sockjs);
        socket  = _multiplexer.channel('THISISTHENAMESPACEFORSOCKETIO');

		if (!window.wh) {
			var wh = new wormhole(socket);
			wh.ready(theFunctionToDo);
			window.wh = wh;
		} else {
			window.wh.setSocket(socket);
			window.wh.setupSocket(socket);
			window.wh.ready(theFunctionToDo);
		}
    }
});