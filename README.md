[dspp](https://github.com/131/dspp) is a **d**ocker **s**tack **p**re**p**rocessor

[![Version](https://img.shields.io/npm/v/docker-dspp.svg)](https://www.npmjs.com/package/dspp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)


# Usage sample
```
dspp -f production.yml compile
dspp -f production.yml deploy

```
# Installation instruction
```

# Install using npm
sudo npm -g dsppp


# requires yq > 4.6
export  VERSION=v4.6.0 BINARY=yq_linux_amd64
sudo wget https://github.com/mikefarah/yq/releases/download/${VERSION}/${BINARY} -O /usr/bin/yq
sudo chmod +x /usr/bin/yq


# requires most colordiff

apt-get install most colordiff


# Install npm using 

# default is 2.15.5
# export npm_install=7.11.2

curl -L https://131.github.io/docker-dspp/install-npm.sh |  sh

```

# Credits
* [131](https://github.com/131)


