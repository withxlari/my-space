FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json index.html admin.html ./
COPY --chown=node:node css ./css
COPY --chown=node:node js ./js
COPY --chown=node:node assets ./assets
COPY --chown=node:node tools ./tools
RUN mkdir -p /var/lib/myspace && chown node:node /var/lib/myspace
ENV NODE_ENV=production PORT=3000 MYSPACE_DATA_DIR=/var/lib/myspace
USER node
EXPOSE 3000
CMD ["node", "tools/serve.mjs"]
