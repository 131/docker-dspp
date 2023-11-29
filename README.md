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

* Write your Docker stack as individual YAML service files, use dspp to compile it
* Deploy an entire stack or filtered by service name
* Availability of YAML macros
* Each YAML file is parsed as a JavaScript literal: they can have embedded JS code
* Configs can be written as files, directories, bundles, embedded YAML converted to JSON on the fly, or other formats


# Usage

## Basic examples

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
dspp production.yml service_name
# verify local update
dspp production.yml service_name --ir://run=parse
# deploy service only
dspp production.yml service_name --ir://run=plan --commit --ir://run=apply
```

## Commands list

```
Hi dspp v9.0.2
╔═══════════════════════════════════ `runner` commands list ═══════════════════════════════════╗
║list_commands (?)                                               Display all available commands║
║quit (q)                                                                                      ║
╠════════════════════════════════════ `dspp` commands list ════════════════════════════════════╣
║config $config_name                                                                           ║
║parse                                                                                         ║
║plan [$commit]                                                                                ║
║apply [$force_config]                                                                         ║
║version                                                                                       ║
║config_prune                                                                                  ║
║update $path, $value                                                                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
```

### "config" command: precompile a dynamic config into a flat file

This command has no need for the Docker socket.

Automate with:
```yml
dspp production.yml --ir://run=config --config_name=configs/azerty.yml --ir://raw > configs/azerty.flat.ext
```

### "config_prune" command: prune orphan configs from the stack

This command requires a read-write connection to the Docker socket.

Automate with:
```yml
dspp production.yml --ir://run=config_prune
```

### "parse" command: output the raw compose file

This command has no need for the Docker socket.

The `write` parameter instructs `dspp` to write on disk all the files required by the current filter. This is what `apply` would also do before calling `docker stack deploy`.

Automate with:
```yml
# output the parsed stack and redirect to a YAML file of your choice
dspp production.yml --ir://raw --ir://run=parse > production.flat.yml
# deploy the stack (replace "my-stack" with our own stack name)
dspp production.yml --ir://raw --ir://run=parse --write | docker stack deploy --compose-file - my-stack
```

### "plan" command: prepare the compose file and diff against the running stack

This command requires a read-only connection to the Docker socket.

In an interactive session, can be used to observe the difference of local changes against the current stack.

The `commit` parameter does not affect the live stack, but only the internal representation in-memory for `dspp`.

Automate with:
```yml
# plan and ask for confirmation
dspp production.yml --ir://run=plan --ir://raw
# plan and skip confirmation
dspp production.yml --ir://run=plan --commit --ir://raw
```

### "apply" command: send the contents of the current plan to the stack for deployment

This command requires a read-write connection to the Docker socket.

In an interactive session, can only be used after `plan`. After the `docker stack deploy` command it is meant to do, this function also runs a `docker service ls` command.

Automate with:
```yml
# plan, ask for confirmation and apply
dspp production.yml --ir://run=plan --ir://run=apply --ir://raw
# plan and apply in one go
dspp production.yml --ir://run=plan --commit --ir://run=apply --ir://raw
```

### "update" command: used internally

This command requires a read-write connection to the Docker socket.

Do not use.

### "version" command: show Docker version information

This command requires a read-only connection to the Docker socket.

Automate with:
```yml
# dspp version number (plain text) and docker version (JSON)
dspp --ir://run=version --ir://json
```


# Installation instructions
```

# requires git, most & colordiff
apt-get install git most colordiff

# Install using npm globally
npm install -g dspp

# However if you handle multiple stacks, you probably want one dspp version per project
cat package.json | jq -r ".dependencies"
{
  "dspp": "^9.0.2"
}
npm install
./node_modules/.bin/dspp my-stack.yml

# for ease of use (choose one):
alias dspp="./node_modules/.bin/dspp"
dspp my-stack.yml
# or:
PATH="./node_modules/.bin:$PATH"
dspp my-stack.yml


# Install npm using

# default is 2.15.5
# export npm_install=7.11.2

curl -L https://131.github.io/docker-dspp/install-npm.sh |  sh

```


# The dspp stack file: syntax and examples

The dspp stack file is a meta file written in YAML and describing how to compile the stack. It is in fact just a list of YAML files to merge.

## Basic example

Set this up to your liking, here with Docker (but that isn't a requirement):
```bash
$ docker run --rm -it -v "/var/run/docker.sock:/var/run/docker.sock" node:16 /bin/bash
apt update && apt install git most colordiff nano jq
mkdir stack && cd stack
# (create the files here)
npm install
which dspp || export PATH="./node_modules/.bin:$PATH"
```

`my-stack.yml`
```yml
name: my-stack

includes:
  - services/service1.yml
```

`package.json`
```json
{
  "name": "my-stack",
  "version": "0.0.1",
  "description": "",
  "private": true,
  "author": "",
  "license": "",
  "dependencies": {
    "dspp": "^9.0.2"
  },
  "devDependencies": {}
}
```

`services/service1.yml`
```yml
version: "3.3"

services:

  service1:
    image: httpd:2.4
```

Out of curiosity, you can output the parsed compose file:
```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @58464 (dspp v9.0.2)
version: "3.3"
services:
  service1:
    image: httpd:2.4
```

Now deploy this compose file, either interactively or like this:
```bash
$ dspp my-stack.yml --ir://run=plan --commit --ir://run=apply --ir://raw
Hi dspp v9.0.2
Working with stack 'my-stack' from 2 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-v2bUqHHM.current b/-
index a3197a0e0..000000000 100644
--- a/tmp/current-v2bUqHHM.current
+++ b/-
@@ -1,1676 +1,5 @@
+# my-stack @58464 (dspp v9.0.2)
+version: "3.3"
+services:
+  service1:
+    image: httpd:2.4
Approved
Reading remote tasks state
Stack file wrote in .docker-stack/.cas/6655b6f7eac985f04e6827919a8660f1 (full stack)
Creating network my-stack_default
Creating service my-stack_service1
ID             NAME                MODE         REPLICAS   IMAGE
f38zvbruq7rr   my-stack_service1   replicated   1/1        httpd:2.4
```

Now add a new service:
`services/service2.yml`
```yml
version: "3.3"

services:

  service2:
    image: nginx
```

Reference it from your dspp stack file:
`my-stack.yml`
```yml
name: my-stack

includes:
  - services/service1.yml
  - services/service2.yml
```

(tip: this works too):
```yml
name: my-stack

includes:
  - services/*.yml
```

If you are curious about the updated compose file:

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @282ec (dspp v9.0.2)
version: "3.3"
services:
  service1:
    image: httpd:2.4
  service2:
    image: nginx
```

Then deploy again:
```bash
$ dspp my-stack.yml --ir://run=plan --commit --ir://run=apply --ir://raw
Hi dspp v9.0.2
Working with stack 'my-stack' from 3 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-9gWSOOC2.current b/-
index 5d3507364..000000000 100644
--- a/tmp/current-9gWSOOC2.current
+++ b/-
@@ -1,5 +1,7 @@
-# my-stack @58464 (dspp v9.0.2)
+# my-stack @282ec (dspp v9.0.2)
 version: "3.3"
 services:
   service1:
     image: httpd:2.4
+  service2:
+    image: nginx
Approved
Reading remote tasks state
Stack file wrote in .docker-stack/.cas/7692881b3d9516c2a12f09c8653e3523 (full stack)
Updating service my-stack_service1 (id: c5nnfi6ame5bz6k7hmijte443)
ID             NAME                MODE         REPLICAS   IMAGE
f38zvbruq7rr   my-stack_service1   replicated   1/1        httpd:2.4
7bvw327jb5w2   my-stack_service2   replicated   1/1        nginx:latest
```

For reference, this is the contents of that stack:
```bash
$ find . -type f -not -path "./node_modules/*" -not -path ".cas/*" -not -name "package-lock.json" -print -exec cat {} \;
```
```
./services/service2.yml
version: "3.3"

services:

  service2:
    image: nginx
./services/service1.yml
version: "3.3"

services:

  service1:
    image: httpd:2.4
./package.json
{
  "name": "my-stack",
  "version": "0.0.1",
  "description": "",
  "private": true,
  "author": "",
  "license": "",
  "dependencies": {
    "dspp": "^9.0.2"
  },
  "devDependencies": {}
}
./my-stack.yml
name: my-stack

includes:
  - services/service1.yml
  - services/service2.yml
```

Now you can update individual service files, change environment variables etc., and deploy with the same command: `dspp my-stack.yml` followed by `plan` and then `apply`.

The syntax for individual service files is the Compose Spec.


## Config examples

To add configs and other native Compose Spec elements to your services, follow the same rules as the services. Split them into individual files, reference them in your dspp stack file, and redeploy.

### config type: "file"

This is the simplest config type. It maps one file as a named config in the stack, and that config can be mounted into the service's containers.

`env/configs.yml`
```yaml
version: "3.3"

configs:

  file1:
    file: ./foo.txt
```

`env/foo.txt`
```
lorem ipsum
```

`services/service1.yml`
```yml
version: "3.3"

services:

  service1:
    image: httpd:2.4
    configs:
      - source: file1
        target: /usr/local/apache2/htdocs/plain.txt
```

`my-stack.yml`
```yml
name: my-stack

includes:
  - env/configs.yml

  - services/service1.yml
```

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @0f9b9 (dspp v9.0.2)
version: "3.3"
configs:
  file1-3bc34:
    file: .docker-stack/.cas/3bc34a45d26784b5bea8529db533ae84
    x-trace: |
      lorem ipsum
services:
  service1:
    configs:
      - source: file1-3bc34
        target: /usr/local/apache2/htdocs/plain.txt
    image: httpd:2.4
```

```bash
$ dspp my-stack.yml --ir://run=plan --commit --ir://run=apply --ir://raw
Hi dspp v9.0.2
Working with stack 'my-stack' from 3 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-jV4Jt+p+.current b/-
index 5d3507364..000000000 100644
--- a/tmp/current-jV4Jt+p+.current
+++ b/-
@@ -1,5 +1,11 @@
-# my-stack @58464 (dspp v9.0.2)
+# my-stack @8e447 (dspp v9.0.2)
 version: "3.3"
+configs:
+  file1-3bc34:
+    file: .docker-stack/.cas/3bc34a45d26784b5bea8529db533ae84
+    x-trace: |
+      lorem ipsum
 services:
   service1:
+    configs:
+      - source: file1-3bc34
+        target: /usr/local/apache2/htdocs/plain.txt
     image: httpd:2.4
Approved
Reading remote tasks state
Stack file wrote in .docker-stack/.cas/b99a086d0686fd64cc9242b5b71cfb38 (full stack)
Creating config my-stack_file1-3bc34
Updating service my-stack_service1 (id: nrhxsunfe65wh6tgqeoemxd5l)
ID             NAME                MODE         REPLICAS   IMAGE
nrhxsunfe65w   my-stack_service1   replicated   1/1        httpd:2.4
```

```bash
$ CONTAINER_ID="$(docker ps | grep my-stack_service1 | cut -d ' ' -f 1)"
$ docker exec -it "$CONTAINER_ID" bash -c "cat /usr/local/apache2/htdocs/plain.txt"
lorem ipsum
$ docker exec -it "$CONTAINER_ID" bash -c "mount | grep plain.txt"
tmpfs on /usr/local/apache2/htdocs/plain.txt type tmpfs (ro,relatime)
```


### config type: "directory"

This config type makes an entire folder available as one config name (here the example is `folder1`).

`env/configs.yml`
```
version: "3.3"

configs:

  folder1:
    directory: ./foobar
```


### config type: "bundle"

This is meant to facilitate sharing of configs that are made of several files with complex options (for example a chmod), and to get around YAML array merging limitations. Macros can't help much in this respect.

Define each individual file as a config directive, then add a "bundle" config with target filenames (essentially basenames). This target filename is handled as a suffix, and the service that imports the bundle is the one that defines the prefix.

Here with an example named `etc-sshd`:

`env/sshd_config`
```
copy paste sshd config here
```

`env/ed25519_key`
```
copy paste an ed25519 private key here
```

`env/configs.yml`
```
version: "3.3"

configs:

  # referenced in the bundle below
  sshd-config:
    file: ./sshd_config

  # referenced in the bundle below
  ssh-host-key:
    file: ./ed25519_key

  # to get around YAML array merging limitations
  etc-sshd:
    bundle:
      - source: sshd-config
        target: /sshd_config
        mode: 0o644
      - source: ssh-host-key
        target: /ssh_host_ed25519_key
        mode: 0o600
```

`services/service1.yml`
```yaml
version: "3.3"

services:

  service1:
    image: httpd:2.4
    configs:
      - source: etc-sshd
        target: /etc/ssh
```

```bash
# filtered on service1 for ease of reading
$ dspp my-stack.yml service1 --ir://run=parse --ir://raw 2>/dev/null
# my-stack @0c8b5 (dspp v9.0.2)
version: "3.3"
configs:
  ssh-host-key-05fca:
    file: .docker-stack/.cas/05fcaa3048b0224a847c0b2f6f9075c2
    x-trace: copy paste an ed25519 private key here
  sshd-config-b6b65:
    file: .docker-stack/.cas/b6b65060bad4cdb11aa4059e93762b5c
    x-trace: copy paste sshd config here
services:
  service1:
    configs:
      - mode: 420
        source: sshd-config-b6b65
        target: /etc/ssh/sshd_config
      - mode: 384
        source: ssh-host-key-05fca
        target: /etc/ssh/ssh_host_ed25519_key
    image: httpd:2.4
```

### Config standalone parsing

This is meant for use cases where the config is described as a script, perhaps with network fetches and so on, which can take a while to run in the middle of a deployment.

In these cases, it may be preferrable to pre-compute the config as a flat file, and that's the file you would typically mount in your service.

```
$ dspp my-stack.yml --ir://run=config --config_name=file1 --ir://raw 2>/dev/null | tee env/file1.plain.txt
lorem ipsum
```

### Config tracing: x-trace

Let's reuse the example from config type: "file"
```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @71d73 (dspp v9.0.2)
version: "3.3"
configs:
  file1-3bc34:
    file: .docker-stack/.cas/3bc34a45d26784b5bea8529db533ae84
    x-trace: |
      lorem ipsum
services:
  service1:
    configs:
      - source: file1-3bc34
        target: /usr/local/apache2/htdocs/plain.txt
    image: httpd:2.4
```

If we add a boolean `x-trace` attribute on the config:
```yaml
$ cat env/configs.yml
version: "3.3"

configs:

  file1:
    file: ./foo.txt
    x-trace: false
```

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @f6580 (dspp v9.0.2)
version: "3.3"
configs:
  file1-3bc34:
    file: .docker-stack/.cas/3bc34a45d26784b5bea8529db533ae84
services:
  service1:
    configs:
      - source: file1-3bc34
        target: /usr/local/apache2/htdocs/plain.txt
    image: httpd:2.4
```

This is what happens with `x-trace: false`:
* the contents of the file aren't displayed in the console;
* the actual config is still created the same way in the Docker stack;
* the "cas" file is the same on disk.


# Advanced usage

## Simple interpolation

`dspp` gives access to both the global context and the current service's context with a `$${varname}` syntax. This is plain JavaScript object traversal syntax, only with a double `$` symbol.

What this means is that any element in the stack, can be recalled with this syntax at any point in the stack.

NB: This is different from the fact that `dspp` parses each YAML file as a JavaScript literal.


`services/service1.yml`
```yaml
version: "3.3"

services:

  service1:
    image: httpd:2.4
    environment:
      X_HARDCODED: azerty
      # "stack_name" comes from the stack
      STACK_NAME: $${stack_name}
      # "image" & "service_name" come from this service
      THIS_SERVICE_IMAGE: $${image}
      SERVICE_NAME: $${service_name}
      # more complex syntax to traverse the stack for a specific value elsewhere
      OTHER_SERVICE_IMAGE: $${services['service2'].image}
```

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @a47af (dspp v9.0.2)
version: "3.3"
services:
  service1:
    environment:
      OTHER_SERVICE_IMAGE: nginx
      SERVICE_NAME: service1
      STACK_NAME: my-stack
      THIS_SERVICE_IMAGE: httpd:2.4
      X_HARDCODED: azerty
    image: httpd:2.4
  service2:
    image: nginx
```


## YAML Macros

Enables more flexible configuration by programming macros that preconfigure services, possibly build on one another, etc.

`env/macros.yml`
```yaml
# the root element can be named anything, as long as it is not a reserved keyword in the Compose Spec
x-macros:
  - &env-stack
    X_HARDCODED: azerty
    # "stack_name" is global to the stack
    STACK_NAME: $${stack_name}
    # "image" & "service_name" is local to each service, but they are evaluated later
    SERVICE_IMAGE: $${image}
    SERVICE_NAME: $${service_name}
```

`services/service1.yml`
```yaml
version: "3.3"

services:

  service1:
    image: httpd:2.4

    # simply run the macro, no changes
    environment: *env-stack
```

`services/service2.yml`
```yaml
version: "3.3"

services:

  service2:
    image: nginx

    # run the macro and apply some local overrides
    environment:
      <<: *env-stack
      OTHER_SERVICE_IMAGE: $${services['service1'].image}
      X_FOO: bar
```

`my-stack.yml`
```yaml
name: my-stack

includes:
  - type: header
    path: env/macros.yml

  - services/service1.yml
  - services/service2.yml
```

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @93acf (dspp v9.0.2)
version: "3.3"
services:
  service1:
    environment:
      SERVICE_IMAGE: httpd:2.4
      SERVICE_NAME: service1
      STACK_NAME: my-stack
      X_HARDCODED: azerty
    image: httpd:2.4
  service2:
    environment:
      OTHER_SERVICE_IMAGE: httpd:2.4
      SERVICE_IMAGE: nginx
      SERVICE_NAME: service2
      STACK_NAME: my-stack
      X_FOO: bar
      X_HARDCODED: azerty
    image: nginx
```

## Command-line flags

### flag: "--no-progress"

Meant for automated CLI usage (CI tooling & co).

### flag: "--debug"

Available by accessing `${ctx.debug}` in the YAML includes: this is actually a JavaScript syntax that allows switching features on/off within YAML files. This works because `dspp` reads each YAML file as a JavaScript Literal.

For this example, we'll use it to toggle the debug feature in the nginx service (taken from the basic example above).

Either:
```yaml
version: "3.3"

services:
  service2:
    image: nginx
    ${ctx.debug ? "command: ['nginx-debug', '-g', 'daemon off;']": ''}
```
Or:
```yaml
version: "3.3"

services:
  service2:
    image: nginx
    ${ctx.debug ? `
    command: ['nginx-debug', '-g', 'daemon off;']
    `: ''}
```

```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @282ec (dspp v9.0.2)
version: "3.3"
services:
  service1:
    image: httpd:2.4
  service2:
    image: nginx
```
```yaml
$ dspp my-stack.yml --debug --ir://run=parse --ir://raw 2>/dev/null
# my-stack @9fab8 (dspp v9.0.2)
version: "3.3"
services:
  service1:
    image: httpd:2.4
  service2:
    command:
      - nginx-debug
      - -g
      - daemon off;
    image: nginx
```


## YAML object merging: overrides, or how to set up qa/staging/local alternate stacks

Since `dspp` compiles the stack by using YAML merges, there is an opportunity to write "overrides".

In this example, the main stack file is called `production.yml` and it includes one service with some environment variables. There is also an alternate stack file called `devel/devel.yml` and it includes the same service description, but it adds another YAML file that re-describes a service with the same name, which `dspp` merges into the description of the production service and the environment gets merged.

`package.json`
```json
{
  "name": "my-stack",
  "version": "0.0.1",
  "description": "",
  "private": true,
  "author": "",
  "license": "",
  "dependencies": {
    "dspp": "^9.0.2"
  },
  "devDependencies": {}
}
```

`production.yml`
```yaml
name: my-stack

includes:
  - services/service1.yml
```

`services/service1.yml`
```yaml
version: "3.3"

services:

  service1:
    image: httpd:2.4
    environment:
      FOO: azerty
```

`devel/devel.yml`
```yaml
name: devel-stack

includes:
  - services/service1.yml
  - devel/services/service1-override.yml
```

`devel/services/service1-override.yml`
```yaml
version: "3.3"

services:

  service1:
    environment:
      BAR: lorem ipsum
```

Let's build the "production" stack:
```yaml
$ dspp production.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @58464 (dspp v9.0.2)
version: "3.3"
services:
  service1:
    environment:
      FOO: azerty
    image: httpd:2.4
```

And here is what happens with the "devel" stack:

```yaml
$ dspp devel/devel.yml --ir://run=parse --ir://raw 2>/dev/null
# devel-stack @2d144 (dspp v9.0.2)
version: "3.3"
services:
  service1:
    environment:
      FOO: azerty
      BAR: lorem ipsum
    image: httpd:2.4
```

Let's deploy both stacks and see what happens.
```
$ dspp production.yml --ir://run=plan --commit --ir://run=apply
Hi dspp v9.0.2
╔═══════════════════════════════════ `runner` commands list ═══════════════════════════════════╗
║list_commands (?)                                               Display all available commands║
║quit (q)                                                                                      ║
╠════════════════════════════════════ `dspp` commands list ════════════════════════════════════╣
║config $config_name                                                                           ║
║parse                                                                                         ║
║plan [$commit]                                                                                ║
║apply [$force_config]                                                                         ║
║version                                                                                       ║
║config_prune                                                                                  ║
║update $path, $value                                                                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Working with stack 'my-stack' from 2 files and 0 env files
Reading remote tasks state
Approved
╔══════════════════════════════════════════ Response ══════════════════════════════════════════╗
║{                                                                                             ║
║  "stack_revision": "d3711"                                                                   ║
║}                                                                                             ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Reading remote tasks state
Stack file wrote in .docker-stack/.cas/12853ce582f34cdef23f3de50668d09e (full stack)
Creating network my-stack_default
Creating service my-stack_service1
ID                  NAME                                                         MODE                REPLICAS            IMAGE                                                                                            PORTS
z2y8nsf5oh3w        my-stack_service1                                            replicated          1/1                 httpd:2.4
```

```
$ dspp devel/devel.yml --ir://run=plan --commit --ir://run=apply
Hi dspp v9.0.2
╔═══════════════════════════════════ `runner` commands list ═══════════════════════════════════╗
║list_commands (?)                                               Display all available commands║
║quit (q)                                                                                      ║
╠════════════════════════════════════ `dspp` commands list ════════════════════════════════════╣
║config $config_name                                                                           ║
║parse                                                                                         ║
║plan [$commit]                                                                                ║
║apply [$force_config]                                                                         ║
║version                                                                                       ║
║config_prune                                                                                  ║
║update $path, $value                                                                          ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Working with stack 'devel-stack' from 3 files and 0 env files
Reading remote tasks state
Approved
╔══════════════════════════════════════════ Response ══════════════════════════════════════════╗
║{                                                                                             ║
║  "stack_revision": "bc87a"                                                                   ║
║}                                                                                             ║
╚══════════════════════════════════════════════════════════════════════════════════════════════╝
Reading remote tasks state
Stack file wrote in .docker-stack/.cas/6a3516fa3a9aefa88f56d9e034b79dca (full stack)
Creating network devel-stack_default
Creating service devel-stack_service1
ID                  NAME                                                         MODE                REPLICAS            IMAGE                                                                                            PORTS
8o76r3werzti        devel-stack_service1                                         replicated          0/1                 httpd:2.4
z2y8nsf5oh3w        my-stack_service1                                            replicated          1/1                 httpd:2.4
```

Now let's inspect the stacks and their services:
```bash
# each stack has its own namespace
$ docker stack ls
NAME                SERVICES            ORCHESTRATOR
devel-stack         1                   Swarm
my-stack            1                   Swarm
$ docker stack services my-stack
ID                  NAME                MODE                REPLICAS            IMAGE               PORTS
z2y8nsf5oh3w        my-stack_service1   replicated          1/1                 httpd:2.4
$ docker stack services devel-stack
ID                  NAME                   MODE                REPLICAS            IMAGE               PORTS
8o76r3werzti        devel-stack_service1   replicated          1/1                 httpd:2.4
# inspect the "production" service
$ docker service inspect my-stack_service1 | jq -r ".[0].Spec.TaskTemplate.ContainerSpec.Env"
[
  "FOO=azerty"
]
$ CONTAINER_ID="$(docker ps | grep my-stack_service1 | cut -d ' ' -f1)"
$ docker exec -it "$CONTAINER_ID" bash -c 'echo $FOO'
azerty
$ docker exec -it "$CONTAINER_ID" bash -c 'echo $BAR'

# inspect the "devel" service
$ docker service inspect devel-stack_service1 | jq -r ".[0].Spec.TaskTemplate.ContainerSpec.Env"
[
  "BAR=lorem ipsum",
  "FOO=azerty"
]
$ CONTAINER_ID="$(docker ps | grep devel-stack_service1 | cut -d ' ' -f1)"
$ docker exec -it "$CONTAINER_ID" bash -c 'echo $FOO'
azerty
$ docker exec -it "$CONTAINER_ID" bash -c 'echo $BAR'
lorem ipsum
```

We can see here that while parsing the `devel/devel.yml` stack, `dspp` included the `service1` description from the `production.yml` stack and merged its definition. The original environment was kept and new variables were added.

The way this works is different for key/value pairs and for lists, which are two ways that Docker allows environment variables specifically to be written:
* key/value pairs listed as objects can be merged;
* lists can not be merged, they are overwritten at each step.

For example, if we rewrite our services like this:
```yaml
$ cat services/service1.yml
version: "3.3"

services:

  service1:
    image: httpd:2.4
    environment:
      - "FOO=azerty"
```
```yaml
$ cat devel/services/service1-override.yml
version: "3.3"

services:

  service1:
    environment:
      - "BAR=lorem ipsum"
```

Deploy both stacks:
```bash
$ dspp production.yml
$ dspp devel/devel.yml
```

And inspect everything again:
```bash
$ docker service inspect my-stack_service1 | jq -r ".[0].Spec.TaskTemplate.ContainerSpec.Env"
[
  "FOO=azerty"
]
$ docker service inspect devel-stack_service1 | jq -r ".[0].Spec.TaskTemplate.ContainerSpec.Env"
[
  "BAR=lorem ipsum"
]
```

Now the "production" service hasn't changed, but the "devel" service has lost the "FOO" variable because the original environment was overwritten.

Choose whichever syntax works best for your use case.

This entire object merging feature is global to YAML and isn't specific to Compose Spec "services". It also works on other root elements like configs, networks, volumes, etc. However, it doesn't work on YAML macros: those can't be overwritten.


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
Hi dspp v9.0.2
Empty expansion from services/foo.yml
# my-stack @8a805 (dspp v9.0.2)
{}
```

# Tips

Find the CAS files with the latest changes:
```bash
$ find .docker-stack/.cas -mmin -60 -type f -ls
```

Replay a diff between two versions:
```bash
$ cat .docker-stack/.cas/7692881b3d9516c2a12f09c8653e3523 | git diff --no-index --color ".docker-stack/.cas/6655b6f7eac985f04e6827919a8660f1" - 1>&2 | cat
```

When in doubt, starting over is a simple matter of dropping the entire stack:
```bash
$ docker stack rm my-stack
Removing service my-stack_service1
Removing service my-stack_service2
Removing network my-stack_default
```


# Credits
* [131](https://github.com/131)


