import dns from 'node:dns';
import mongoose from 'mongoose';

export async function connectDatabase(uri, { dnsServers = [] } = {}) {
  // mongodb+srv:// needs an SRV lookup; some Windows setups make Node's resolver refuse it.
  if (dnsServers.length) dns.setServers(dnsServers);

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected (database: ${mongoose.connection.name})`);
}
