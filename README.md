[dspp](https://github.com/131/dspp) is a **d**ocker **s**tack **p**re**p**rocessor

[![Build Status](https://github.com/131/docker-dspp/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/131/docker-dspp/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/131/docker-dspp/badge.svg?branch=master)](https://coveralls.io/github/131/docker-dspp?branch=master)
[![Version](https://img.shields.io/npm/v/dspp.svg)](https://www.npmjs.com/package/dspp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)


# Docker usage example

```
cd /your/stack/path
docker run -it --rm  -v .:/app 131hub/dspp production.yml
```

# Motivation
Complex docker stack will be composed out of dozen/hundreds of microservices, volumes, and config.
Wrapping all of them in a single compose file is tedious, and lacks flexibility.

dspp allows you to split your compose file, define YAML macros/anchor, use services as metadata references, inline configuration contents, use directories as provided. 


# Features


# Use cases



# Usage sample
```
dspp production.yml
dspp production.yml --ir://run=parse
dspp production.yml --ir://run=plan --commit --ir://run=apply
```



# Change a global macro
```
=> interactive session
dspp production.yml
=> verify all update
dspp production.yml --ir://run=parse
=> deploy full stack
dspp production.yml --ir://run=plan --commit --ir://run=apply
```


# Reconfigure a service
```
=> verify local update
dspp production.yml service_name --ir://run=parse
=> deploy service only
dspp production.yml service_name --ir://run=plan --commit --ir://run=apply
```




# Installation instruction
```

# Install using npm
sudo npm -g dspp


# requires most colordiff

apt-get install most colordiff


# Install npm using 

# default is 2.15.5
# export npm_install=7.11.2

curl -L https://131.github.io/docker-dspp/install-npm.sh |  sh

```

# Credits
* [131](https://github.com/131)


