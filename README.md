Graceful tools
================

Gracefully shuts down an ExpressJS server. Returns 502 responses during shutdown for a load balancer to stop routing traffic.

## Usage

```js
import express from 'express';
import { createGraceful } from '@entva/express-graceful';

const app = express();

const { middleware, start } = createGraceful({
  host: process.env.HOST,           // bind to a specific host, defaults to undefined
  port: parseInt(process.env.PORT, 10) || 3000, // defaults to 3000
  timeout: 10000,                   // ms before forceful exit, defaults to 10000
  logger: console.log,              // optional log function
  onReady: () => {},                // called when server is listening
  onShutdown: (event) => {},        // called when shutdown begins (SIGTERM / SIGINT)
});

// Add as early as possible — drops requests during shutdown
app.use(middleware);

// ...register routes...

start(app);
```
