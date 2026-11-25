import { createServer } from "node:http";

const port = Number(process.env.PORT) || 4010;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  drain(req).then(() => route(req.method ?? "GET", url.pathname, res));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`demo listening on ${port}`);
});

function route(method, path, res) {
  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (method === "GET" && path === "/items") {
    sendJson(res, 200, { items: [{ id: "mug", price: "4.50" }] });
    return;
  }

  if (method === "GET" && path === "/items/mug") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("mug");
    return;
  }

  if (method === "POST" && path === "/orders") {
    sendJson(res, 418, { error: "nope" });
    return;
  }

  sendJson(res, 404, { missing: true });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function drain(req) {
  return new Promise((resolve) => {
    req.on("data", () => {});
    req.on("end", resolve);
    req.on("error", resolve);
  });
}
