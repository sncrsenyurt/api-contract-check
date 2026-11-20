# api-contract-check

I point this at an OpenAPI 3 spec and a running API. It walks each operation, builds a request from the examples and parameters in the spec, sends it, and checks the live response against the contract: the status is documented, the content type matches, and the body fits the response schema. When something drifts I want a JSON record, a short summary, and a non-zero exit. Later I also want a diff of two spec versions for breaking changes.

```bash
api-contract-check ./openapi.yaml --base-url https://api.example.com
```

The spec is a local YAML or JSON file, or an http(s) url. `--header` is `name:value` and can be repeated. `--out` is the report directory (`./contract-out` if I leave it off). `--timeout` is milliseconds (30000 if I leave it off).

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

Right now I load the spec, follow local refs, and print each operation. The live checks are not in yet.
