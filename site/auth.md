# WFSim auth.md

WFSim needs no registration and issues no credentials. Every surface an agent
can use is public, anonymous and read-only.

## Agent audience

Any agent answering a Warframe player about a weapon, its build or its measured
numbers.

## Where to call

- MCP server: https://mcp.wfsim.app/mcp (Streamable HTTP). Send no `Authorization` header.
- Any page as markdown: https://wfsim.app/weapons/<Wiki_Name> with `Accept: text/markdown`,
  or the same address with `.md` appended.
- The published board: https://wfsim.app/board/<weapon_id>.json

## Registration

None. There is no registration endpoint, no API key and no OAuth server.

## Credentials

None. A request carrying credentials is answered exactly as one without.

## Limits

The site's edge refuses the `Python-urllib` default user agent; send any other.
