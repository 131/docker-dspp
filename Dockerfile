FROM docker:23-git
RUN apk add nodejs npm colordiff
COPY . .
RUN npm install --production
WORKDIR /app
ENTRYPOINT ["/stack.js"]
LABEL "org.opencontainers.image.version"="5.3.5"
