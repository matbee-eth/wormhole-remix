var wormholeConnect = function () {
	console.log("OLD GNIO WINDOW", window.gnio);
	var module = {}, socket, io = module.exports = window.gnio = {};
	console.log("NEW GNIO WINDOW", window.gnio);
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
		var wh = new wormhole(socket, {
			webrtc: {
                iceServers: [
                    { url: "stun:stun.l.google.com:19302" },
                    { url: 'turn:asdf@ec2-54-227-128-105.compute-1.amazonaws.com:3479', credential:'asdf' }
                ]
			}
		});
		// wh.io = this.io;
		window.io = this.io;
		wh.ready(this.ready);
		wh.setPath('THISISTHEHOSTNAMEOFTHESCRIPTSERVER');
		window.wh = wh;
	} else {
		console.log("Wormhole exists!");
		window.wh.setSocket(socket);
		window.wh.setupSocket(socket);
	}
};

(function (connectArgs) {
	var connect = new wormholeConnect();
	connect.connect(connectArgs);
})(ThisIsTheConnectOverrideArgs);