FROM node:16-slim

COPY . .
RUN npm install --production
WORKDIR /app
ENTRYPOINT ["/stack.js"]
LABEL "org.opencontainers.image.version"="5.3.2"
