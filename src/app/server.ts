import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import {
  resolveServiceConfig,
  type ServiceConfig,
} from "../config.js";

export function createOperatorServer(
  config: ServiceConfig = resolveServiceConfig(),
) {
  return http.createServer(
    (_request: IncomingMessage, response: ServerResponse) => {
      if (_request.url === "/healthz") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: true,
            host: config.host,
            port: config.port,
          }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
    },
  );
}

export function startOperatorServer(
  config: ServiceConfig = resolveServiceConfig(),
) {
  const server = createOperatorServer(config);

  server.listen(config.port, config.host, () => {
    console.log(
      `developer-memory-os listening on http://${config.host}:${config.port}`,
    );
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startOperatorServer();
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
