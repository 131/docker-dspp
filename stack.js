#!/usr/bin/env node
'use strict';


const {version : DSPP_VERSION } = require('./package.json');

const fs    = require('fs');
const url   = require('url');
const path  = require('path');
const zlib  = require('zlib');

const spawn = require('child_process').spawn;
const {PassThrough} = require('stream');

const deepMixIn  = require('mout/object/deepMixIn');
const glob       = require('glob').sync;

const walk       = require('nyks/object/walk');
const ProgressBar = require('progress');
const prompt     = require('cnyks/prompt/prompt');
const md5        = require('nyks/crypto/md5');
const tmppath    = require('nyks/fs/tmppath');
const wait       = require('nyks/child_process/wait');
const pipe       = require('nyks/stream/pipe');
const passthru   = require('nyks/child_process/passthru');
const eachLimit = require('nyks/async/eachLimit');
const ns         = require('mout/object/namespace');
const semver     = require('semver');
const stripStart = require('nyks/string/stripStart');
const guid       = require('mout/random/guid');
const trim       = require('mout/string/trim');
const get        = require('mout/object/get');
const readline   = require('readline');
const request    = require('nyks/http/request');
const drain      = require('nyks/stream/drain');

const {dict}  = require('nyks/process/parseArgs')();

const {stringify, parseDocument,  Parser, Composer, visit, isAlias} = require('yaml');

const DockerSDK = require('@131/docker-sdk');
const {escape}  = DockerSDK;

const Cas       = require('./cas');
const replaceEnv = require('./replaceEnv');


const DOCKER_STACK_NS = 'com.docker.stack.namespace';
const DSPP_NS         = 'dspp.namespace';
const DSPP_STATE      = 'dspp.state';
const DSPP_TASK_NAME  = 'dspp.task.name';

function shellExec(cmd) {
  let shell = process.env['SHELL'] || true;
  let child = spawn(cmd, {shell, stdio : 'inherit'});
  return wait(child);
}

const yamlStyle = {singleQuote : false, lineWidth : 0};
const CACHE_STACK_PATH = ".docker-stack";
const CACHE_CAS_PATH   = path.posix.join(CACHE_STACK_PATH, ".cas");
const flatten = obj => JSON.parse(JSON.stringify(obj));

const SOURCE_FILE = Symbol("x-source-file");
const CONFIG_NAME = Symbol("x-config-name");

const readFileSync = function(file_path) {
  let fp = path.resolve(file_path);
  if(readFileSync[fp])
    return readFileSync[fp];
  return readFileSync[fp] = fs.readFileSync(fp, 'utf-8');
};


const laxParser = function(body) {
  const tokens = new Parser().parse(body);
  const docs = new Composer({merge : true, uniqueKeys : false}).compose(tokens);
  return docs.next().value;
};

class dspp {

  constructor(entry_file, filter = null) {
    console.error("Hi", `dspp v${DSPP_VERSION}`);

    if(!fs.existsSync(entry_file)) {
      console.error("No entry file");
      return;
    }

    let {dependencies = {}} = require(path.resolve('package.json'));

    for(let [module_name, module_version]  of Object.entries(dependencies)) {
      let {version} = require(require.resolve(`${module_name}/package.json`));
      if(!semver.satisfies(version, module_version))
        throw `Unsupported ${module_name} version (requires ${module_version})`;
    }

    this.stack_name    = null;
    this.header_files  = [];
    this.compose_files = [];
    this.headers       = "";
    this.cwd           = path.dirname(entry_file);
    this.rc = {};

    let config = laxParser(readFileSync(entry_file));

    this.stack_name = config.has("name") ? config.get("name") : path.basename(entry_file, '.yml');
    if(process.env.STACK_NAME && process.env.STACK_NAME != this.stack_name) {
      console.error("Conflicting stack name %s vs %s, cowardly aborting", process.env.STACK_NAME, this.stack_name);
      process.exit(1);
    }

    for(let rcfile of [`.dspprc`, `.${this.stack_name}.dspprc`]) {
      if(fs.existsSync(rcfile)) {try {
        this.rc = laxParser(readFileSync(rcfile)).toJSON();
      } catch(e) {}}
    }


    this.secrets_list = config.has('x-secrets') ? config.get('x-secrets').toJSON() : [];
    this.secrets_list = walk(this.secrets_list, v =>  replaceEnv(v, { env : process.env, stack_name : this.stack_name}));

    let noProgress  = !!(dict['no-progress'] || dict['cli://unattended']);
    this.progressOpts = {width : 60, incomplete : ' ', clear : true,  stream : noProgress ? new PassThrough() : process.stderr };

    this.docker_sdk  = new DockerSDK(this.stack_name);
    this.filter   = filter;


    process.stderr.write("Parsing entries");
    const load = (file_path) => {
      readline.clearLine(process.stderr, 0);
      process.stderr.write(`\rParsing ${file_path}`);

      if(this.compose_files.includes(file_path))
        return;

      this.compose_files.push(file_path);
      let config = laxParser(readFileSync(file_path));

      if(config.has("headers"))
        this.headers += stringify(config.get("headers"));

      if(!config.has("includes"))
        return;

      for(let line of config.get("includes").items || []) {
        line = line.toJSON();

        if(typeof line == "string")
          line = {type : 'compose', path : line};

        let type = line.type, paths = glob(line.path, {absolute : true, cwd : path.dirname(file_path)});
        if(!paths.length)
          console.error("Empty expansion from", line.path);

        if(type == "header")
          this.header_files.push(...paths);
        if(type == "compose")
          paths.forEach(load, this);
      }
    }; load(entry_file);
    readline.clearLine(process.stderr, 0);
    console.error(`\rWorking with stack '%s' from %d files and %d env files`, this.stack_name, this.compose_files.length, this.header_files.length);

  }


  async _parse(redacted = false) {

    let secrets = await this._analyze_secrets();
    if(redacted)
      secrets = walk(secrets, () => "<redacted>");


    let cas = new Cas(CACHE_CAS_PATH, this.rc);
    let {stack_name, header_files, headers, compose_files} = this;

    for(let header_file of header_files)
      headers += readFileSync(header_file) + `\n`;

    let stack = '';
    let out = {};

    let progress = new ProgressBar('Computing stack files [:bar]', {...this.progressOpts, total : compose_files.length});

    const merged = [];


    for(let compose_file of compose_files || []) {
      let body = headers + readFileSync(compose_file);
      stack += `${body}\n---\n`;
      progress.tick();

      try {
        let ctx = {...dict};
        let token = guid();

        body = body.replace(new RegExp('\\$\\$\\{', "g"), token);
        body = Function('{ctx, secrets}', "return `" + body + "`;").call(null, {ctx, secrets});
        body = body.replace(new RegExp(token, "g"), '$$$${'); // $ is a special replacement char

        let doc = laxParser(body);

        //custom behavior for non alias merges
        visit(doc, (key, node, path) => {
          if(key == "key" && node.value == "<<<" && !isAlias(path[path.length - 1].value)) {
            node.value = guid();
            merged.push(node.value);
          }
        });

        doc = doc.toJS({maxAliasCount : -1});
        deepMixIn(out, doc);
        //deepMixin will not merge Symbols
        for(let obj of ['services', 'configs', 'tasks', 'secrets']) {
          for(let id of Object.keys(doc[obj] || {}))
            out[obj][id][SOURCE_FILE] = compose_file;
        }

      } catch(err) {
        console.error("\n", "Parsing failure in", compose_file);
        throw err;
      }
    }


    out = sortObjByKey(out);
    out = walk(out, v =>  replaceEnv(v, {...out, env : process.env, stack_name, secrets}));

    let processEnvFile = async (obj) => {
      if(!obj.env_file)
        return obj;

      if(Array.isArray(obj.env_file)) {
        for(let [k, env_file] of Object.entries(obj.env_file))
          obj.env_file[k] = await cas.env(env_file,  obj[SOURCE_FILE]);

      }

      if(typeof obj.env_file == "string")
        obj.env_file = await cas.env(obj.env_file, obj[SOURCE_FILE]);

      return obj;
    };

    for(let [task_name, task] of Object.entries(out.tasks || {}))
      out.tasks[task_name]  = walk(task, v =>  replaceEnv(v, {...task, task_name, service_name : task_name}));

    for(let [service_name, service] of Object.entries(out.services || {})) {
      service = await processEnvFile(service);

      out.services[service_name] = walk(service, v =>  replaceEnv(v, {...service, service_name}));
    }


    let objects_map = { configs : {}, secrets : {}};
    let total  = Object.keys(out.configs || {}).length + Object.keys(out.secrets || {}).length;

    progress = new ProgressBar('Computing (:total) objects [:bar]', {...this.progressOpts, total});


    // remap volume
    let volumes_map = {};
    let volumes = Object.entries(out.volumes || {});

    for(let [volume_name, volume] of volumes) {
      if(volume.external)
        continue;

      let hash = volume_hash(volume_name, volume);
      volumes_map[volume_name] = hash, out.volumes[hash] = volume;
      delete out.volumes[volume_name];
    }

    for(let obj of Object.values({...out.services, ...out.tasks})) {
      for(let volume of obj.volumes || []) {
        if(volumes_map[volume.source])
          volume.source = volumes_map[volume.source];
      }
    }


    // maybe we should move that in config multi-pass below
    deepWalk(out, (v) => {
      if(typeof v !== "object" || v === null)
        return v;

      let keys = Object.keys(v);
      for(let k of keys) {
        if(merged.includes(k)) {
          let drop = v[k];
          delete v[k];
          Object.assign(v, drop);
        }
      }
      return v;
    });

    let objects = Object.entries(out.configs || {}).map(entry => (entry.push('configs'), entry));
    objects.push(...Object.entries(out.secrets || {}).map(entry => (entry.push('secrets'), entry)));

    let done = Symbol("done");
    for(let skip of [
      // 1st pass : skip serialized
      object => !!object.external || !!object.format || !!object.bundle || !!object[done],
      // 2nd pass : skip bundle
      object => !!object.external || !!object.file  || !!object.bundle || !!object[done],
      // 2nd pass : skip processed
      object => !!object.external || !!object.file || !!object[done],
    ]) {



      for(let [object_name, object, object_type] of objects) {
        if(skip(object))
          continue;

        object[done] = true;

        progress.tick();
        objects_map[object_type][object_name] = [];
        for await(let line of cas.config(objects_map[object_type], object_name, object, object[SOURCE_FILE])) {
          let {cas_path, cas_name, trace} = line;
          objects_map[object_type][object_name].push(line);
          out[object_type][cas_name] = {name : object.name, file : cas_path, [CONFIG_NAME] : object_name};
          if(trace)
          //walk(trace, v =>  v.replace(/\$(?![a-z${])/gi, '$$$')); //this is no longer necessary since x-traces are not deployed
            out[object_type][cas_name]['x-trace'] = trace;
        }
        delete out[object_type][object_name];
      }



      // this need to be proceseed before 2nd pass
      for(let obj of Object.values({...out.services, ...out.tasks})) {
        for(let object_type of ['configs', 'secrets']) {
          if(!obj[object_type])
            continue;
          let base = obj[object_type] || [];
          obj[object_type] = [];

          for(let object of  base) {
            if(!objects_map[object_type][object.source]) {
              obj[object_type].push(object);
              continue;
            }
            for(let line of objects_map[object_type][object.source]) {
              let target = line.target ? path.join(object.target, line.target) : object.target;
              obj[object_type].push({...object, target, source : line.cas_name, mode : object.mode || line.mode});
            }
          }
        }
      }
    }



    let stack_guid = md5(stack);

    return {out : {
      services : {},
      tasks    : {},
      configs  : {},
      volumes  : {},
      secrets  : {},
      networks : {},
      ...out
    }, stack_guid, cas};
  }

  async _delete_task(task_name) {
    let id = escape(`${this.stack_name}_tasks.${task_name}`);
    let res = await this.docker_sdk.request('DELETE', `/configs/${id}`);
    return res.statusCode;
  }

  async _read_task_remote_spec(task_name) {
    let task_key = escape(`${this.stack_name}_tasks.${task_name}`);
    let specs = await this._read_tasks_remote_spec({name : task_key});
    return (specs[task_name] || {}).spec || "";
  }

  async _read_tasks_remote_spec(filter = {}) {
    let configs = await this.docker_sdk.configs_list({label : DSPP_TASK_NAME, namespace : this.stack_name, ...filter});
    let specs = {};
    configs.forEach(config => {
      let {[DSPP_STATE] : spec, [DSPP_TASK_NAME] : name} = config.Spec.Labels;
      let body = JSON.parse(Buffer.from(config.Spec.Data, 'base64'));
      specs[name] = { spec, image : body.image, plan : body.plan, id : config.ID};
    });
    return specs;
  }

  async _write_task_remote_spec(task_name, task, compiled) {
    let task_key = escape(`${this.stack_name}_tasks.${task_name}`);
    let body = JSON.stringify({...task, name : task_name});
    console.error("Update task %s (id:%s)", task_name, task_key);
    let labels = {
      [DOCKER_STACK_NS] : this.stack_name,
      [DSPP_NS]         : "true",
      [DSPP_STATE]      : compiled,
      [DSPP_TASK_NAME]  : task_name,
    };
    await this.docker_sdk.config_write(task_key, body, labels);
  }

  async _read_service_remote_spec(service_name) {
    let labels = await this.docker_sdk.service_labels_read(service_name);
    let spec = labels[DSPP_STATE];
    return this._state_decode(spec || "", service_name);
  }

  async _write_service_remote_spec(service_name, compiled) {
    await this.docker_sdk.service_label_write(service_name, DSPP_STATE, compiled);
  }

  _state_decode(state, object_name) {
    try {
      return zlib.gunzipSync(Buffer.from(state, 'base64')).toString();
    } catch{
      console.error("Reading legacy state format for", object_name);
      return state;
    }
  }

  _state_encode(state) {
    return zlib.gzipSync(state).toString('base64');
  }

  _format(stack) {
    stack  = sortObjByKey(stack);
    let {stack_name} = this;

    const body = stringify(flatten({
      version   : stack.version,
      configs   : isEmpty(stack.configs)  ? undefined : stack.configs,
      secrets   : isEmpty(stack.secrets)  ? undefined : stack.secrets,
      networks  : isEmpty(stack.networks) ? undefined : stack.networks,
      volumes   : isEmpty(stack.volumes)  ? undefined : stack.volumes,
      services  : isEmpty(stack.services) ? undefined : stack.services,
      tasks     : isEmpty(stack.tasks)    ? undefined : stack.tasks,
    }), yamlStyle);

    const stack_revision = md5(body).substr(0, 5);
    const header = `# ${stack_name} @${stack_revision} (dspp v${DSPP_VERSION})\n`;
    const compiled = header + body;


    return {stack_revision, compiled};
  }

  async config(config_name) {
    let {out : {...input}, cas} = await this._parse();

    let out = {};
    for(let [, config] of Object.entries(input.configs)) {
      let config_name = config[CONFIG_NAME];
      out[config_name] = cas.store[config.file];
    }

    return out[config_name];
  }

  async secret(secret_name) {
    let {out : {...input}, cas} = await this._parse();

    let out = {};
    for(let [, secret] of Object.entries(input.secrets)) {
      let secret_name = secret[CONFIG_NAME];
      out[secret_name] = cas.store[secret.file];
    }

    return out[secret_name];
  }

  async _analyze_local(filter = false, redacted = false) {
    filter = new RegExp(filter || ".*");

    let {out : {version, ...input}, cas} = await this._parse(redacted);

    let item_slices = [];
    let stack = {version};

    let services =  Object.entries(input.services || {});
    services.forEach(line => line.push('service'));

    let tasks    =  Object.entries(input.tasks || {});
    tasks.forEach(line => line.push('task'));

    let items = [...services, ...tasks];
    let progress = new ProgressBar('Computing (:total) items [:bar]', {...this.progressOpts, total : items.length});

    for(let [service_name, service, service_type] of items) {
      progress.tick();

      if(dict['tasks'] && service_type != "task")
        continue;

      if(!filter.test(service_name))
        continue;

      let stack_slice = {
        version,
        services : {},
        tasks    : {},
        configs  : {},
        volumes  : {},
        secrets  : {},
        networks : {},
      };

      stack_slice[service_type == "service" ? 'services' : 'tasks'][service_name] = service;

      for(let config of service.configs || []) {
        if(input.configs[config.source])
          stack_slice.configs[config.source] = input.configs[config.source];
      }

      for(let secret of service.secrets || []) {
        if(input.secrets[secret.source])
          stack_slice.secrets[secret.source] = input.secrets[secret.source];
      }

      for(let volume of service.volumes || []) {
        if(input.volumes[volume.source])
          stack_slice.volumes[volume.source] = input.volumes[volume.source];
      }

      for(let [k, v] of Object.entries(service.networks || {})) {
        let source = typeof v == "string" ? v : k;
        if(input.networks[source]) //should throw instead
          stack_slice.networks[source] = input.networks[source];
      }

      stack.services = {...stack.services, ...stack_slice.services};
      stack.tasks    = {...stack.tasks,    ...stack_slice.tasks};
      stack.configs  = {...stack.configs,  ...stack_slice.configs};
      stack.networks = {...stack.networks, ...stack_slice.networks};
      stack.secrets  = {...stack.secrets,  ...stack_slice.secrets};
      stack.volumes  = {...stack.volumes,  ...stack_slice.volumes};

      item_slices.push({service_type, service_name, ...this._format(stack_slice)});
    }

    return {cas, stack, item_slices};
  }

  async _analyze_secrets() {
    let secrets = {};
    for(let secret of this.secrets_list) {
      if(secret.driver == "file") {
        let file_path = path.join(this.cwd, secret.file_path);
        let body  = laxParser(readFileSync(file_path)).toJSON();
        deepMixIn(secrets, body);
      }

      if(secret.driver == "vault") {
        let {vault_addr, secret_path, jwt_auth} =  secret;
        if(!this.rc.VAULT_TOKEN && jwt_auth) {
          let {login, jwt, role} = jwt_auth;
          let remote_url = `${trim(vault_addr, '/')}/v1/${trim(login, '/')}`, data = {jwt, role};
          let query = {...url.parse(remote_url), json : true};
          let res = await request(query, data);
          let response = String(await drain(res));

          if(res.statusCode !== 200) {
            console.error("Could not login to vault", response, {vault_addr, login});
            continue;
          }
          this.rc.VAULT_TOKEN = get(JSON.parse(response), 'auth.client_token');
        }

        let remote_url = `${trim(vault_addr, '/')}/v1/secrets/data/${trim(secret_path, '/')}`;
        let query = {...url.parse(remote_url), headers : {'x-vault-token' : this.rc.VAULT_TOKEN}};
        let req = await request(query);
        if(req.statusCode !== 200) {
          console.error("Could not retrieve vault secret", remote_url);
          continue;
        }
        let {data : {data : body }} = JSON.parse(await drain(req));
        deepMixIn(secrets, body);
      }
    }
    return secrets;
  }

  //parse local stack, and fetch remote stack status
  async _analyze(filter) {

    let tmp = await this._analyze_local(filter);

    let remote_stack    = {};
    let orphan_tasks    = [];
    let prune = !filter;

    const merge = (spec) => {
      let doc = parseDocument(spec, {merge : true});
      deepMixIn(remote_stack, doc.toJS({maxAliasCount : -1 }));
    };

    // when not working with any filter, we can prune orphan
    if(prune) {
      console.error("Reading remote tasks state");
      let tasks = Object.entries(await this._read_tasks_remote_spec());

      for(let [task_name, {spec : task_spec}] of tasks) {
        if(tmp.item_slices.find(item => item.service_name == task_name))
          continue;
        orphan_tasks.push(task_name);
        merge(task_spec);
      }
      // we might want to deal here with orphan services
    }

    let total = tmp.item_slices.length;
    let progress = new ProgressBar('Reading (:total) remote services [:bar]', {...this.progressOpts, total});

    for(let {service_name, service_type} of tmp.item_slices) {
      progress.tick();
      let service_current;
      if(service_type == "service")
        service_current = await this._read_service_remote_spec(service_name);
      if(service_type == "task")
        service_current = await this._read_task_remote_spec(service_name);

      merge(service_current);
    }


    let {compiled : current}       = this._format(remote_stack);
    let {compiled, stack_revision} = this._format(tmp.stack);

    return {...tmp, compiled, stack_revision, current, orphan_tasks};
  }

  //public helper
  async parse(write = false, trace = false, redacted = false) {
    let {filter} = this;

    let {cas, stack} = await this._analyze_local(filter, redacted);
    // strip invalid $ interpolation in x-traces
    if(!trace) {
      for(let [, config] of Object.entries(stack.configs))
        delete config['x-trace'];
    }

    let {compiled} = this._format(stack);
    if(write)
      cas.write();

    return compiled;
  }


  async plan(commit = false) {

    let {filter, compose_files, header_files, stack_name} = this;

    console.error(`Working with stack '%s' from %d files and %d env files`, stack_name, compose_files.length, header_files.length);

    if(filter)
      console.error("Filter stack for '%s'", filter);

    let {compiled, current, stack_revision, item_slices} = await this._analyze(filter);

    let result = {stack_revision};

    if(filter) {
      console.error(`Found ${item_slices.length} matching items`);
      if(!item_slices.length)
        return result;
    }

    let approve = () => {
      console.error("Approved");
      this.approved = compiled;
      return result;
    };

    if(current == compiled || this.approved == compiled) {
      console.error("No changes detected");
      return result;
    }
    let before = tmppath("current"), next = tmppath("next");
    fs.writeFileSync(before, current);
    fs.writeFileSync(next, compiled);


    if(commit) {
      await shellExec(`cat "${next}" | git --no-pager diff --no-index --color "${before}" - 1>&2 || true`);
      return approve();
    }

    let style = 0;

    do {

      if(process.platform == "win32") {
        await passthru('fc', [before, next]).catch(() => false);
      } else {
        if(style == 1)
          await shellExec(`diff -y <(echo -e "current stack\\n---"; cat "${before}") <(echo -e "next stack\\n---"; cat  "${next}") | colordiff | most`);

        if(style == 0)
          await shellExec(`cat "${next}" | git diff --no-index "${before}" - || true`);
      }

      try {
        commit = await prompt("Confirm [y/N/q] (q : toggle diff style): ");
      } catch(err) {
        break;
      }
      commit = commit.toLowerCase();
      if(commit != "q")
        break;

      style ^= 1;
    } while(true);

    if(commit == "y")
      return approve();

    return result;
  }

  async apply(force_config = false) {

    let {filter} = this;

    let {cas, stack, compiled, current, item_slices, orphan_tasks} = await this._analyze(filter);

    if(current != compiled && compiled != this.approved)
      return console.error("Change detected, please compile first");

    if(!force_config) {
      // tag existing configuration as external, as they are immutable
      let configs = (await this.docker_sdk.configs_list({namespace : this.stack_name})).map(({Spec : {Name}}) => stripStart(Name, `${this.stack_name}_`));
      let stripped = 0;
      for(let config_name of Object.keys(stack.configs)) {
        if(!configs.includes(config_name))
          continue;
        stripped++;
        delete stack.configs[config_name];
        stack.configs[`${this.stack_name}_${config_name}`] = { external : true};
        for(let [, service] of Object.entries(stack.services)) {
          for(let config of service.configs || []) {
            if(config.source == config_name)
              config.source = `${this.stack_name}_${config_name}`;
          }
        }
      }

      if(stripped)
        console.error("Stripped %d existing configs from stack", stripped);
    }

    // strip invalid $ interpolation in x-traces
    for(let [, config] of Object.entries(stack.configs))
      delete config['x-trace'];

    // sign stuffs here
    for(let {service_name, compiled, service_type} of item_slices) {
      let encoded = this._state_encode(compiled);
      if(service_type == "service") {
        let labels = ns(stack, `services.${service_name}.deploy.labels`);
        if(Array.isArray(labels))
          labels.push(`${DSPP_STATE}=${encoded}`);
        else
          labels[DSPP_STATE] = encoded;
      }
    }

    let tasks = stack.tasks;
    delete stack['tasks'];

    ({compiled} = this._format(stack));


    let {cas_path : stack_path} = cas.feed(compiled);
    console.error("Stack file wrote in %s (%s)", stack_path, filter ? `filter ${filter}` : "full stack");
    cas.write();

    let stack_contents = fs.createReadStream(stack_path);
    let child = spawn('docker', ['stack', 'deploy', '--with-registry-auth', '--compose-file', '-', this.stack_name], {stdio : ['pipe', 'inherit', 'inherit']});

    await pipe(stack_contents, child.stdin);
    await wait(child);

    for(let task_name of orphan_tasks) {
      let res = await this._delete_task(task_name);
      console.error("Pruning orphan task", task_name, res);
    }

    for(let {service_name, compiled, service_type} of item_slices) {
      if(service_type == "task") {
        let task = tasks[service_name];
        await this._write_task_remote_spec(service_name, task, compiled);
      }
    }

    await passthru('docker', ['service', 'ls']);
  }



  async version() {
    return this.docker_sdk.version();
  }

  async tasks_ls() {
    return this._read_tasks_remote_spec();
  }


  async config_prune() {
    let {stack} = await this._analyze_local(), legitimates = Object.keys(stack.configs);

    let configs = await this.docker_sdk.configs_list({namespace : this.stack_name});

    await eachLimit(configs, 5, async ({ID : id, Spec : { Name : name, Labels}}) => {
      if(legitimates.includes(stripStart(name, `${this.stack_name}_`)) || Labels[DSPP_NS])
        return; //preserve meta dspp entries

      let res = await this.docker_sdk.request('DELETE', `/configs/${id}`);
      console.error("Pruning", id, name, res.statusCode);
    });

  }


  update(path, value) {
    path = path.split(".");

    let replaced = false;

    for(let compose_file of this.compose_files) {
      let body = readFileSync(compose_file);

      let doc = laxParser(body);

      if(doc.hasIn(path)) {
        doc.setIn(path, value);
        body = doc.toString({...yamlStyle, verifyAliasOrder : false});

        fs.writeFileSync(compose_file, body);
        console.error("Set %s to %s in %s", path, value, compose_file);
        replaced = true;
      }
    }

    if(!replaced)
      throw `${path} not found in stack`;
  }

}


function sortObjByKey(value) {
  if(value === null)
    return value;

  return (typeof value === 'object') ?
    (Array.isArray(value) ?
      value.map(sortObjByKey) :
      Object.getOwnPropertySymbols(value).concat(Object.keys(value).sort()).reduce(
        (o, key) => {
          const v = value[key];
          o[key] = sortObjByKey(v);
          return o;
        }, {})
    ) :
    value;
}


const volume_hash = function(volume_name, spec) {
  return `${volume_name}_` + md5(JSON.stringify(spec)).substr(0, 5);
};


const isEmpty = function(obj) {
  return Object.keys(obj || {}).length === 0;
};


const deepWalk = function(obj, processor) {
  if(typeof obj !== "object" || obj === null)
    return obj;

  for(let k in obj)
    obj[k] = processor(deepWalk(obj[k], processor), k);

  return obj;
};



if(module.parent === null) //ensure module is called directly, i.e. not required
  require('cnyks/lib/bundle')(dspp); //start runner






module.exports = dspp;


