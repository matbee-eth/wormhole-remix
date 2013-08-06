wormhole-remix Socket.IO RPC System
=================

Socket.IO driven event-based RPC system.

## Install
```bash
$ npm install wormhole-remix
```

## Dependencies
  - uglify-js
  - request
  - redis-sub
  - connect-redis-pubsub
## Usage

  - Options
    -
```javascript
	// Quick and dirty:
	var wormhole = require('wormhole-remix'),
		os = require('os'),
		sessionStore = require('connect-redis-pubsub'),
		port = 3000,
		wormholeExternalProtocol = "https", /* Socket.IO Protocol. */
		sessionSecret = process.env.sessionSecret || 'WORMHOLE.SECRET',
		sessionKey = process.env.sessionKey || 'express.sid',
		cookieParser = express.cookieParser(sessionSecret);

	var wh = new wormhole({
	  protocol: wormholeExternalProtocol,
	  hostname: os.hostname(),
	  port: wormholeExternalPort,
	  sessionStore: sessionStore,
	  cookieParser: cookieParser,
	  sessionKey: sessionKey
	});

	// Use this to specify which namespaces to support.
	// Function is optional - Will execute on the client, once connected.
	wh.addNamespace('/example', function (Arg1, Arg2, SoMany) {
		alert("Wormhole has loaded.");
		console.log(Arg1, Arg2, SoMany);
	}, "Argument1", "Argumen2", "So Many Arguments");

	wh.start({
      io: io,
      express: app
    }, function (err) {
      console.log("Wormhole setup!");
      wh.on("connection", function (traveller) {
      	// Also, traveller.socket exists, as well.
        console.log("Welcome to Wormhole, traveller!");
        traveller.rpc.getHostname(function (host, extra) {
          console.log("RPC Client HOSTNAME:", host, extra);
        });
      });
      wh.on("sessionUpdated", function (session) {
        console.log("Session Updated: Thanks, connect-redis-pubsub!", this, session);
      });
    });
```
```javascript
	// Server-side:
	var wormhole = require('wormhole-remix'),
		express = require('express'),
		http = require('http'),
		socketio = require('socket.io'),
		os = require('os'),
		wormholeExternalProtocol = "https", /* Socket.IO Protocol. */
		port = 3000,
		sessionStore = require('connect-redis-pubsub'),
		sessionSecret = process.env.sessionSecret || 'WORMHOLE.SECRET',
		sessionKey = process.env.sessionKey || 'express.sid',
		cookieParser = express.cookieParser(sessionSecret);

	var wh = new wormhole({
	  protocol: wormholeExternalProtocol,
	  hostname: os.hostname(),
	  port: wormholeExternalPort,
	  sessionStore: sessionStore,
	  cookieParser: cookieParser,
	  sessionKey: sessionKey
	});

	// Use this to specify which namespaces to support.
	// Function is optional - Will execute on the client, once connected.
	wh.addNamespace('/example', function (Arg1, Arg2, SoMany) {
		alert("Wormhole has loaded.");
		console.log(Arg1, Arg2, SoMany);
	}, "Argument1", "Argumen2", "So Many Arguments");

	var app = express();
	// Configuration
	app.configure(function(){
	  app.set('views', __dirname + '/views');
	  app.set('view engine', 'ejs');
	  app.use(express.bodyParser());
	  app.use(express.methodOverride());
	  app.use(express.cookieParser());
	  app.use(express.session({
	    secret: sessionSecret,
	    store: sessionStore,
	    cookie: { path: '/', httpOnly: false, maxAge: process.env.sessionMaxAge?parseInt(process.env.sessionMaxAge, 10):(1000 * 60 * 60 * 24 * 60), domain: process.env.cookieDomain || 'groupnotes.ca'},
	    key: sessionKey
	  }));
	  app.use(app.router);
	  app.use(express.static(__dirname + '/public'));
	});

	var server = http.createServer(app).listen(wormholeListenPort, function (err) {
		var io = require('socket.io').listen(server);
		wh.start({
	      io: io,
	      express: app
	    }, function (err) {
	      console.log("Wormhole setup!");
	      wh.on("connection", function (traveller) {
	      	// Also, traveller.socket exists, as well.
	        console.log("Welcome to Wormhole, traveller!");
	        traveller.rpc.getHostname(function (host, extra) {
	          console.log("RPC Client HOSTNAME:", host, extra);
	        });
	      });
	      wh.on("sessionUpdated", function (session) {
	        console.log("Session Updated: Thanks, connect-redis-pubsub!", this, session);
	      });
	    });
	});
```

## License (MIT)

Copyright 2013 Mathieu Gosbee

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.