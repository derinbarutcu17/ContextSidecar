# HTTP Examples

## Local API health

```bash
./pnpm serve:api
bash examples/http/curl.sh
```

## Streamable HTTP MCP

Start the MCP HTTP server:

```bash
./pnpm exec synthkit serve mcp-http
```

Then POST an initialize request:

```bash
curl -s http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"curl","version":"0.1.0"}
    }
  }'
```

Use the returned `mcp-session-id` header on later requests like `tools/list`.
