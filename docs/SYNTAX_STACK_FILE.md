
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
    "dspp": "^9.0.0"
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
# my-stack @58464 (dspp v9.0.0)
version: "3.3"
services:
  service1:
    image: httpd:2.4
```

Now deploy this compose file, either interactively or like this:
```bash
$ dspp my-stack.yml --ir://run=plan --commit --ir://run=apply --ir://raw
Hi dspp v9.0.0
Working with stack 'my-stack' from 2 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-v2bUqHHM.current b/-
index a3197a0e0..000000000 100644
--- a/tmp/current-v2bUqHHM.current
+++ b/-
@@ -1,1676 +1,5 @@
+# my-stack @58464 (dspp v9.0.0)
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
# my-stack @282ec (dspp v9.0.0)
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
Hi dspp v9.0.0
Working with stack 'my-stack' from 3 files and 0 env files
Reading remote tasks state
diff --git a/tmp/current-9gWSOOC2.current b/-
index 5d3507364..000000000 100644
--- a/tmp/current-9gWSOOC2.current
+++ b/-
@@ -1,5 +1,7 @@
-# my-stack @58464 (dspp v9.0.0)
+# my-stack @282ec (dspp v9.0.0)
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
    "dspp": "^9.0.0"
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
