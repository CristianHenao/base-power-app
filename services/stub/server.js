const http = require("node:http");

const port = Number(process.env.PORT || 4000);
const service = process.env.SERVICE_NAME || "stub";

// ponytail: liveness only. Talk to Postgres/Redis when a real handler exists.
const server = http.createServer((req, res) => {
  const path = req.url?.split("?")[0];
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service }));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, "0.0.0.0");
