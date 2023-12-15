[dspp](https://github.com/131/dspp) is a **d**ocker **s**tack **p**re**p**rocessor

[![Build Status](https://github.com/131/docker-dspp/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/131/docker-dspp/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/131/docker-dspp/badge.svg?branch=master)](https://coveralls.io/github/131/docker-dspp?branch=master)
[![Version](https://img.shields.io/npm/v/dspp.svg)](https://www.npmjs.com/package/dspp)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)



# Motivation
Complex docker stack will be composed out of dozen/hundreds of microservices, volumes, and config.
Wrapping all of them in a single compose file is tedious, and lacks flexibility.

dspp allows you to split your compose file, define YAML macros/anchor, use services as metadata references, inline configuration contents, use directories as provided.


# Features

* Write your Docker stack as individual YAML service files, use dspp to compile it
* Deploy an entire stack or filtered by service name
* Availability of YAML macros
* Each YAML file is parsed as a JavaScript literal: they can have embedded JS code
* Configs can be written as files, directories, bundles, embedded YAML converted to JSON on the fly, or other formats


# Usage

`production.yml`
```yaml
version: "3.3"

name: my-stack

services:
  service1:
    image: httpd:2.4
```

On the entire stack:
```bash
# interactive session
dspp production.yml
# verify all updates
dspp production.yml --ir://run=parse
# deploy full stack
dspp production.yml --ir://run=plan --commit --ir://run=apply
# alternatively
dspp production.yml --ir://raw --ir://run=parse --write | docker stack deploy --compose-file - my-stack
```

On a specific service in the stack:
```bash
# interactive session
dspp production.yml service1
# verify local update
dspp production.yml service1 --ir://run=parse
# deploy service only
dspp production.yml service1 --ir://run=plan --commit --ir://run=apply
```

See all available commands in [Commands docs](./docs/CLI_COMMANDS.md).


# Installation instructions
```bash

# requires git, most & colordiff
apt-get install git most colordiff

npx dspp my-stack.yml
```


# The dspp stack file: syntax and examples

The [dspp stack file](./docs/SYNTAX_STACK_FILE.md) is a meta file written in YAML and describing how to compile the stack. It is in fact just a list of YAML files to merge.

To add [configs](./docs/SYNTAX_CONFIGS.md) and other native Compose Spec elements to your services, follow the same rules as the services. Split them into individual files, reference them in your dspp stack file, and redeploy.


# Advanced usage

[Interpolating JavaScript variables in plain YAML files](./docs/ADVANCED_INTERPOLATE.md)

[Reusable snippets with YAML macros](./docs/ADVANCED_MACROS.md)

[Command-line flags](./docs/CLI_FLAGS.md)

[YAML object merging: overrides, or how to set up qa/staging/local alternate stacks](./docs/ADVANCED_MERGING.md)



# Troubleshooting

## The stack file lists a file that isn't on the file system
```
$ cat my-stack.yml && ls -alh services
name: my-stack

includes:
  - services/foo.yml
total 12K
drwxr-xr-x 2 root root 4.0K Nov  2 11:10 .
drwxr-xr-x 4 root root 4.0K Nov  2 11:10 ..
-rw-r--r-- 1 root root   60 Nov  2 11:07 bar.yml
```
```
$ dspp my-stack.yml --ir://run=parse --ir://raw
Hi dspp v9.0.0
Empty expansion from services/foo.yml
# my-stack @8a805 (dspp v9.0.0)
{}
```

## Dropping the entire stack

When in doubt, starting over is a simple matter of dropping the entire stack:
```bash
$ docker stack rm my-stack
Removing service my-stack_service1
Removing service my-stack_service2
Removing network my-stack_default
```


# Credits
* [131](https://github.com/131)


