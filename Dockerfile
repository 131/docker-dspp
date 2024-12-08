FROM alpine AS builder
# install most for aline
ADD https://www.jedsoft.org/snapshots/most-5.2.0.tar.gz .
RUN apk add make g++ ncurses-terminfo slang-dev
RUN tar -xzf most-5.2.0.tar.gz \
    && cd most-5.2.0 \
    && ./configure \
    && make && make install

FROM docker:23-git
RUN apk add nodejs npm colordiff slang
COPY --from=builder  /usr/local/bin/most /usr/bin/most
COPY . .
RUN npm install --production
WORKDIR /app
ENTRYPOINT ["/stack.js"]
LABEL "org.opencontainers.image.version"="10.4.0"
LABEL "org.opencontainers.image.source"="git@github.com:131/docker-dspp.git"
