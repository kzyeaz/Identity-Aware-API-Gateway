FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/console/package.json apps/console/package.json
COPY packages/sdk/package.json packages/sdk/package.json
RUN npm ci
COPY apps/console apps/console
RUN npm run build --workspace=@identity/console

FROM node:22-alpine
WORKDIR /app
# The standalone server needs only Node. Omit unused package managers and their dependency trees.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /workspace/apps/console/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/console/.next/static ./apps/console/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/console/server.js"]
