FROM node:16-slim
RUN apt-get update \
    && apt-get install -y -qq colordiff most git \
    && rm -rf /var/lib/apt/lists
COPY . .
RUN npm install --production
WORKDIR /app
ENTRYPOINT ["/stack.js"]
LABEL "org.opencontainers.image.version"="5.3.3"
