const dns = require("node:dns");
const {
  parseDnsServers,
  configureDNS,
  extractHostFromMongoUri,
  verifyMongoSrvLookup,
} = require("../utils/dnsConfig");

describe("DNS Configuration & MongoDB SRV Lookup", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("parseDnsServers", () => {
    it("should safely parse, trim and validate IPv4 addresses", () => {
      const input = " 8.8.8.8 , 1.1.1.1  , 8.8.4.4 ";
      const result = parseDnsServers(input);
      expect(result).toEqual(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
    });

    it("should filter out invalid strings or malformed IPs", () => {
      const input = "8.8.8.8, invalid_ip, 999.999.999.999, 1.1.1.1";
      const result = parseDnsServers(input);
      expect(result).toEqual(["8.8.8.8", "1.1.1.1"]);
    });

    it("should return empty array for non-string or empty input", () => {
      expect(parseDnsServers("")).toEqual([]);
      expect(parseDnsServers(null)).toEqual([]);
      expect(parseDnsServers(undefined)).toEqual([]);
    });
  });

  describe("extractHostFromMongoUri", () => {
    it("should extract hostname without credentials from mongodb+srv URI", () => {
      const uri = "mongodb+srv://adminUser:secretPass123@cluster0.n3otreq.mongodb.net/orbit?retryWrites=true";
      const host = extractHostFromMongoUri(uri);
      expect(host).toBe("cluster0.n3otreq.mongodb.net");
    });

    it("should extract hostname from standard mongodb:// URI", () => {
      const uri = "mongodb://user:pass@127.0.0.1:27017/orbit";
      const host = extractHostFromMongoUri(uri);
      expect(host).toBe("127.0.0.1:27017");
    });

    it("should return null for invalid or missing URI", () => {
      expect(extractHostFromMongoUri("")).toBeNull();
      expect(extractHostFromMongoUri(null)).toBeNull();
    });
  });

  describe("configureDNS", () => {
    it("should not override DNS when ENABLE_DNS_OVERRIDE is not true", () => {
      process.env.ENABLE_DNS_OVERRIDE = "false";
      process.env.DNS_SERVERS = "8.8.8.8,1.1.1.1";

      const initialServers = dns.getServers();
      const result = configureDNS();

      expect(result.enabled).toBe(false);
      expect(dns.getServers()).toEqual(initialServers);
    });

    it("should configure custom DNS servers when ENABLE_DNS_OVERRIDE=true", () => {
      process.env.ENABLE_DNS_OVERRIDE = "true";
      process.env.DNS_SERVERS = "8.8.8.8, 1.1.1.1";

      const result = configureDNS();

      expect(result.enabled).toBe(true);
      expect(result.servers).toEqual(["8.8.8.8", "1.1.1.1"]);
      expect(dns.getServers()).toEqual(["8.8.8.8", "1.1.1.1"]);
    });

    it("should fall back to Google and Cloudflare DNS if DNS_SERVERS is empty but override enabled", () => {
      process.env.ENABLE_DNS_OVERRIDE = "true";
      delete process.env.DNS_SERVERS;

      const result = configureDNS();

      expect(result.enabled).toBe(true);
      expect(result.servers).toEqual(["8.8.8.8", "1.1.1.1"]);
    });
  });

  describe("verifyMongoSrvLookup", () => {
    it("should return true for standard non-SRV URIs without performing DNS lookup", async () => {
      const result = await verifyMongoSrvLookup("mongodb://localhost:27017/orbit");
      expect(result).toBe(true);
    });

    it("should successfully resolve real MongoDB Atlas cluster SRV records using overridden DNS", async () => {
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
      const uri = "mongodb+srv://dummyUser:dummyPass@cluster0.n3otreq.mongodb.net/orbit";
      const result = await verifyMongoSrvLookup(uri);
      expect(result).toBe(true);
    });
  });
});
