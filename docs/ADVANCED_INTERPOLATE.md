
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
# my-stack @a47af (dspp v9.0.0)
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
