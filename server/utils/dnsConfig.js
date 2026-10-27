const dns = require("node:dns");

/**
 * Safely parses and validates an array of DNS IP server addresses.
 * Supports IPv4 and IPv6 string addresses.
 * @param {string} serversStr - Comma-separated list of DNS IPs
 * @returns {string[]} Validated array of IP strings
 */
function parseDnsServers(serversStr) {
  if (!serversStr || typeof serversStr !== "string") {
    return [];
  }

  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:)+[0-9a-fA-F]{1,4}$/;

  return serversStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (ipv4Regex.test(s) || ipv6Regex.test(s) || s === "127.0.0.1"));
}

/**
 * Configures Node's DNS resolvers when ENABLE_DNS_OVERRIDE is enabled.
 * Logs a safe diagnostic without exposing credentials or sensitive connection strings.
 * @returns {{ enabled: boolean, servers: string[] }}
 */
function configureDNS() {
  const isOverrideRequested = process.env.ENABLE_DNS_OVERRIDE === "true";

  if (!isOverrideRequested) {
    if (process.env.NODE_ENV !== "test") {
      console.log("[DNS] DNS override disabled. Using system default resolvers.");
    }
    return { enabled: false, servers: dns.getServers() };
  }

  const parsedServers = parseDnsServers(process.env.DNS_SERVERS);
  const serversToApply = parsedServers.length > 0 ? parsedServers : ["8.8.8.8", "1.1.1.1"];

  try {
    dns.setServers(serversToApply);
    const activeServers = dns.getServers();
    if (process.env.NODE_ENV !== "test") {
      console.log(`[DNS] Override enabled. Configured resolvers: ${activeServers.join(", ")}`);
    }
    return { enabled: true, servers: activeServers };
  } catch (err) {
    console.warn(`[DNS] Failed to set custom DNS servers (${serversToApply.join(", ")}): ${err.message}`);
    return { enabled: false, servers: dns.getServers() };
  }
}

/**
 * Extracts only the hostname from a MongoDB connection URI safely.
 * Never returns or logs credentials or query params.
 * @param {string} uri
 * @returns {string|null}
 */
function extractHostFromMongoUri(uri) {
  if (!uri || typeof uri !== "string") return null;
  const match = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?#]+)/i);
  return match ? match[1] : null;
}

/**
 * Performs a diagnostic SRV resolution check before connecting to MongoDB Atlas.
 * Logs only the target hostname and record count, never any credentials.
 * @param {string} mongoUri
 * @returns {Promise<boolean>}
 */
async function verifyMongoSrvLookup(mongoUri) {
  if (!mongoUri || !mongoUri.startsWith("mongodb+srv://")) {
    return true; // Not an SRV URI, no SRV check needed
  }

  const host = extractHostFromMongoUri(mongoUri);
  if (!host) {
    return false;
  }

  const srvName = `_mongodb._tcp.${host}`;
  try {
    const records = await dns.promises.resolveSrv(srvName);
    if (process.env.NODE_ENV !== "test") {
      console.log(`[DNS] Diagnostic SRV lookup for ${host} succeeded (${records.length} records found).`);
    }
    return true;
  } catch (err) {
    console.warn(`[DNS] Diagnostic SRV lookup for ${host} failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  parseDnsServers,
  configureDNS,
  extractHostFromMongoUri,
  verifyMongoSrvLookup,
};
