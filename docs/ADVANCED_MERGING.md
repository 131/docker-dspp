
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
    "dspp": "^9.0.0"
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
# my-stack @58464 (dspp v9.0.0)
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
# devel-stack @2d144 (dspp v9.0.0)
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
Hi dspp v9.0.0
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
Hi dspp v9.0.0
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
