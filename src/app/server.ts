import http from "node:http";

import { resolveServiceConfig } from "../config.js";

const config = resolveServiceConfig();

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok" }));
});

server.listen(config.port, config.host, () => {
  console.log(`developer-memory-os listening on http://${config.host}:${config.port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
