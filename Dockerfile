FROM node:16-slim

COPY . .
RUN npm install --production
WORKDIR /app
ENTRYPOINT ["/stack.js"]
