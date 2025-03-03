## Config examples

To add configs and other native Compose Spec elements to your services, follow the same rules as the services. Split them into individual files, reference them in your dspp stack file, and redeploy.

## config type: "exec"
## config type: "require"
## config type: "contents"
### config format yml/json


## config type: "file"

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
# my-stack @0f9b9 (dspp v9.0.0)
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
Hi dspp v9.0.0
Working with stack 'my-stack' from 3 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-jV4Jt+p+.current b/-
index 5d3507364..000000000 100644
--- a/tmp/current-jV4Jt+p+.current
+++ b/-
@@ -1,5 +1,11 @@
-# my-stack @58464 (dspp v9.0.0)
+# my-stack @8e447 (dspp v9.0.0)
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


## config type: "directory"

This config type makes an entire folder available as one config name (here the example is `folder1`).

`env/configs.yml`
```
version: "3.3"

configs:

  folder1:
    directory: ./foobar
```


## config type: "bundle"

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
# my-stack @0c8b5 (dspp v9.0.0)
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

## Config standalone parsing

This is meant for use cases where the config is described as a script, perhaps with network fetches and so on, which can take a while to run in the middle of a deployment.

In these cases, it may be preferrable to pre-compute the config as a flat file, and that's the file you would typically mount in your service.

```
$ dspp my-stack.yml --ir://run=config --config_name=file1 --ir://raw 2>/dev/null | tee env/file1.plain.txt
lorem ipsum
```

## Config tracing: x-trace

Let's reuse the example from config type: "file"
```yaml
$ dspp my-stack.yml --ir://run=parse --ir://raw 2>/dev/null
# my-stack @71d73 (dspp v9.0.0)
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
# my-stack @f6580 (dspp v9.0.0)
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
