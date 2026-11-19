FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    ROADFORGE_MCP_PORT=8787 \
    ROADFORGE_MCP_HOST=0.0.0.0

RUN addgroup --system --gid 1001 mcp \
  && adduser --system --uid 1001 mcp

COPY packages/roadforge-mcp/package.json ./package.json
COPY packages/roadforge-mcp/bin ./bin
COPY packages/roadforge-mcp/src ./src

RUN chown -R mcp:mcp /app

USER mcp

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.ROADFORGE_MCP_PORT || 8787) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "bin/roadforge-mcp.mjs", "serve-http"]
