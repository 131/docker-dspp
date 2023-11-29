
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
# my-stack @93acf (dspp v9.0.0)
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
