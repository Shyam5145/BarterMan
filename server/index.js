import { env } from './src/config/env.js';
import { connectDatabase } from './src/config/db.js';
import { app } from './src/app.js';

try {
  await connectDatabase(env.mongodbUri, { dnsServers: env.dnsServers });
} catch (error) {
  console.error(`MongoDB connection failed: ${error.message}`);
  console.error('Check MONGODB_URI in server/.env and that your IP is allowed in Atlas Network Access.');
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`Barterman API running on http://localhost:${env.port}`);
});
