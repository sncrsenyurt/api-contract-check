# api-contract-check

I check a running HTTP API against an OpenAPI 3 spec. For each operation I build a request from the examples and parameters, send it, and compare the response with the contract: the status is documented, the content type matches, and the body fits the schema. I print one line per operation, then a totals line, and I write `report.json`.

A clean run exits 0. Drift exits 2. A bad spec, a filter that matches nothing, or a host I can't reach exits 1.

```bash
npm install
npm run build
npm test
node demo/server.mjs
```

The demo listens on `127.0.0.1:4010`. Its spec is `demo/openapi.yaml`. The server does not follow that spec: `GET /items` omits a required name and sends a string for a nested price, `GET /items/{id}` answers `text/plain`, and `POST /orders` returns 418.

```bash
node dist/contract-check.js demo/openapi.yaml \
  --base-url http://127.0.0.1:4010 \
  --header "X-Shop: demo" \
  --out /tmp/demo-out \
  --timeout 5000
```

That exited 2:

```
GET /health  getHealth  200  pass
GET /items  listItems  200  fail
GET /items/{id}  getItem  200  fail
POST /orders  createOrder  418  fail
1 pass, 3 fail, 0 errors
```

`--base-url` is where the API is running. `--header` is `name:value`, sent on every call, and can be repeated. `--out` is the directory for `report.json` (`./contract-out` if I leave it off). `--timeout` is milliseconds (30000 if I leave it off). `--only` and `--skip` take an operationId or `METHOD /path`, and both can be repeated.

```bash
node dist/contract-check.js demo/openapi.yaml \
  --base-url http://127.0.0.1:4010 \
  --only getHealth \
  --out /tmp/health-out \
  --timeout 5000
```

That exited 0:

```
GET /health  getHealth  200  pass
1 pass, 0 fail, 0 errors
```

The full run wrote this record. Durations are from that run.

```json
{
  "spec": "demo/openapi.yaml",
  "baseUrl": "http://127.0.0.1:4010",
  "openapi": "3.0.3",
  "startedAt": "2026-11-25T04:41:11.121Z",
  "durationMs": 28,
  "passed": 1,
  "failed": 3,
  "errors": 0,
  "operations": [
    {
      "method": "GET",
      "path": "/health",
      "operationId": "getHealth",
      "status": 200,
      "pass": true,
      "errors": [],
      "durationMs": 11
    },
    {
      "method": "GET",
      "path": "/items",
      "operationId": "listItems",
      "status": 200,
      "pass": false,
      "errors": [
        {
          "path": "body.items[0].name",
          "message": "missing required property \"name\""
        },
        {
          "path": "body.items[0].price",
          "message": "expected number, got string"
        }
      ],
      "durationMs": 3
    },
    {
      "method": "GET",
      "path": "/items/{id}",
      "operationId": "getItem",
      "status": 200,
      "pass": false,
      "errors": [
        {
          "path": "content-type",
          "message": "text/plain is not documented"
        }
      ],
      "durationMs": 2
    },
    {
      "method": "POST",
      "path": "/orders",
      "operationId": "createOrder",
      "status": 418,
      "pass": false,
      "errors": [
        {
          "path": "status",
          "message": "418 is not documented"
        }
      ],
      "durationMs": 3
    }
  ]
}
```

I diff two specs with `api-contract-check diff`. No breaks exits 0. Breaks exit 2.

```bash
node dist/contract-check.js diff test/fixtures/diff-old.yaml test/fixtures/diff-new.json
```

That exited 2:

```
GET /items
  param limit: type integer -> string
  param status: enum removed "hold"
  param region: now required
  response 200 body.status: enum added "archived"
  response 200 body.items[].price: type number -> string
  response 200 body.items[].sku: removed
POST /items
  request body.sku: now required
  request body.qty: type integer -> string
  request body.status: enum removed "hold"
DELETE /items/{id}
  removed
```
