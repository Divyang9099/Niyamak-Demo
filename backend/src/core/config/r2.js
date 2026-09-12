const { S3Client } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const https = require("https");
const env = require("./env");

if (!env.r2.accountId || !env.r2.accessKey || !env.r2.secretKey) {
  const msg = '❌ R2 configuration is incomplete — file operations (KML upload/download) will fail.';
  console.error(msg);
  if (env.nodeEnv === 'production') throw new Error(msg);
}

// Keep-alive agent so repeated uploads/downloads reuse the same TLS connection
// instead of paying a fresh handshake each time (a big win on high-latency links).
const agent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.r2.accessKey,
    secretAccessKey: env.r2.secretKey,
  },
  maxAttempts: 5, // retry transient resets (ECONNRESET) instead of failing the request
  requestHandler: new NodeHttpHandler({
    httpsAgent: agent,
    // Fail fast if a connection can't be established (e.g. a dead IPv6 route) so
    // the request falls back / retries quickly instead of hanging. No request
    // timeout — large uploads on slow links are allowed to finish.
    connectionTimeout: 8000,
  }),
});

module.exports = r2;
