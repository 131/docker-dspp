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


