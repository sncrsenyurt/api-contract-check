# api-contract-check

I point this at an OpenAPI 3 spec and a running API. It walks each operation, builds a request from the examples and parameters in the spec, sends it, and checks the live response against the contract: the status is documented, the content type matches, and the body fits the response schema. When something drifts I write a JSON record, print a short summary, and exit 2. A bad spec or a host I can't reach exits 1. A clean run exits 0. I diff two specs with `api-contract-check diff old.yaml new.yaml`, and exit 2 when something breaks.

```bash
api-contract-check ./openapi.yaml --base-url https://api.example.com
```

The spec is a local YAML or JSON file, or an http(s) url. `--header` is `name:value` and can be repeated. `--out` is the report directory (`./contract-out` if I leave it off); I write `report.json` there. `--timeout` is milliseconds (30000 if I leave it off). `--only` and `--skip` take an operationId or `METHOD /path`, and both can be repeated.

```bash
api-contract-check ./openapi.yaml \
  --base-url https://api.example.com \
  --header "Authorization: Bearer $TOKEN" \
  --out ./contract-out \
  --timeout 15000
```

```bash
npm install
npm run build
npm test
npm start -- ./openapi.yaml --base-url https://api.example.com
```

Each line is the method, path, id, status, and pass or fail, then a totals line. The same calls, with path-style errors and how long they took, are in the JSON record.
