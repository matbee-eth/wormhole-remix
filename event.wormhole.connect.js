var wormholeConnect = function () {
	var module = {}, socket, io = module.exports = window.gnio = {};
	THISSTRINGISTHESOCKETIOSCRIPTLOL;
	this.io = io;
};
wormholeConnect.prototype.ready = function() {
	var readyFunc = new Function(REPLACETHISSTRINGOKAY);
	readyFunc();
};
wormholeConnect.prototype.connect = function(THISISTHECONNECTOBJECTOVERRIDE) {
	THISISTHECONNECTOBJECTOVERRIDE = THISISTHECONNECTOBJECTOVERRIDE || {
		reconnect: false,
		'try multiple transports': true
	};
	if (this.io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER']) {
		socket = this.io.sockets['THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER'];
		socket.connect(THISISTHECONNECTOBJECTOVERRIDE);
	} else {
		socket = this.io.connect('THISSTRINGSHOULDCONTAINTHERIGHTHOSTNAMEOFTHISSERVER/THISISTHENAMESPACEFORSOCKETIO', THISISTHECONNECTOBJECTOVERRIDE);
	}
	
	if (!window.wh) {
		var wh = new wormhole(socket);
		wh.ready(this.ready);
		wh.setPath('THISISTHEHOSTNAMEOFTHESCRIPTSERVER');
		window.wh = wh;
	} else {
		console.log("Wormhole exists!");
		window.wh.setSocket(socket);
		window.wh.setupSocket(socket);
		window.wh.ready(this.ready);
	}
};

(function (connectArgs) {
	var connect = new wormholeConnect();
	connect.connect(connectArgs);
})(ThisIsTheConnectOverrideArgs);