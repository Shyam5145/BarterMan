import { createServer } from 'node:http';
import { env } from './src/config/env.js';
import { connectDatabase } from './src/config/db.js';
import { app } from './src/app.js';
import { initSocketServer } from './src/realtime/socket.js';

try {
  await connectDatabase(env.mongodbUri, { dnsServers: env.dnsServers });
} catch (error) {
  console.error(`MongoDB connection failed: ${error.message}`);
  console.error('Check MONGODB_URI in server/.env and that your IP is allowed in Atlas Network Access.');
  process.exit(1);
}

// Express and Socket.IO share one HTTP server (and port), so Render needs no extra setup.
const server = createServer(app);
initSocketServer(server);

server.listen(env.port, () => {
  console.log(`Barterman API running on http://localhost:${env.port} (real-time chat enabled)`);
});
