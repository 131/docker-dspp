
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
# my-stack @282ec (dspp v9.0.0)
version: "3.3"
services:
  service1:
    image: httpd:2.4
  service2:
    image: nginx
```
```yaml
$ dspp my-stack.yml --debug --ir://run=parse --ir://raw 2>/dev/null
# my-stack @9fab8 (dspp v9.0.0)
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
