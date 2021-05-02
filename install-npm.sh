#!/bin/sh


debug=0
npm_config_loglevel="error"
export npm_config_loglevel

ret=0
tar=`which tar 2>&1`
curl=`which curl 2>&1`
node=`which node 2>&1`


# set the temp dir
TMP="${TMPDIR}"
if [ "x$TMP" = "x" ]; then
  TMP="/tmp"
fi
TMP="${TMP}/npm.$$"
rm -rf "$TMP" || true
mkdir "$TMP"
if [ $? -ne 0 ]; then
  echo "failed to mkdir $TMP" >&2
  exit 1
fi

BACK="$PWD"

t="${npm_install:-2.15.5}"


url="https://registry.npmjs.org/npm/-/npm-$t.tgz"
echo "fetching: $url" >&2

cd "$TMP" \
  && curl -SsL -o npm.tgz "$url" \
  && $tar -xzf npm.tgz \
  && cd "$TMP"/package \
  && echo "removing existing npm" \
  && "$node" bin/npm-cli.js rm npm -gf \
  && echo "installing npm@$t" \
  && "$node" bin/npm-cli.js install -gf "$TMP"/npm.tgz \
  && cd "$BACK" \
  && rm -rf "$TMP" \
  && echo "successfully installed npm@$t"

ret=$?
if [ $ret -ne 0 ]; then
  echo "failed!" >&2
fi
exit $ret
