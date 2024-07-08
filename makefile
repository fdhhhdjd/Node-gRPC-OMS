gate:
	cd gateway/ && node index.js

order:
	cd order-service/ && node --watch server.js

stock:
	cd stock-service/ && node --watch server.js