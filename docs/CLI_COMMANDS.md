
## Commands list

```
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
