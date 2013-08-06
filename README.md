wormhole-remix RPC
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
    - io: - Mandatory - Socket.IO instance
    - express: - Mandatory - Express instance
	- sessionStore: - Mandatory - for PubSub Sessions.
	    - redisPubClient: -optional if connect-redis-pubsub sessionStore supplied-, for PubSub across servers.
		- redisSubClient: -optional if connect-redis-pubsub sessionStore supplied-, for PubSub across servers.
	- cookieParser: - Mandatory - To read session cookies.
	- sessionKey: - Mandatory - To decrypt express sessions.
	- port: - Mandatory - To Pass to client for socket.io connection.
	- hostname: - Mandatory - To Pass to client for socket.io connection.
	- protocol: - Mandatory - To Pass to client for socket.io connection.

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

	wh.clientMethods({
		getWebsite: function (cb) {
			cb(window.location.href);
		}
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
        traveller.rpc.getWebsite(function (url) {
          console.log("Current RPC Client Website:", url);
        });
      });
      wh.on("sessionUpdated", function (session) {
        console.log("Session Updated: Thanks, connect-redis-pubsub!", this, session);
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