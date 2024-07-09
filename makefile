gate:
	cd gateway/ && node --watch index.js

order:
	cd order-service/ && node --watch server.js

stock:
	cd stock-service/ && node --watch server.js

kitchen:
	cd kitchen-service/ && node --watch server.js

payment:
	cd payment-service/ && node --watch server.js
