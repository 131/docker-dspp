#!/usr/bin/env node
'use strict';

const {version : DSPP_VERSION } = require('./package.json');

const fs    = require('fs');
const path  = require('path');
const spawn = require('child_process').spawn;
const {PassThrough} = require('stream');

const deepMixIn  = require('mout/object/deepMixIn');
const jqdive     = require('nyks/object/jqdive');
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
const semver     = require('semver');

const {dict}  = require('nyks/process/parseArgs')();

const {stringify, parse, parseDocument,  Parser, Composer} = require('yaml');

const DockerSDK = require('@131/docker-sdk');
const {escape}  = DockerSDK;

const Cas       = require('./cas');

const DOCKER_STACK_NS = 'com.docker.stack.namespace';
const DSPP_NS         = 'dspp.namespace';


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

class dspp {

  constructor(config_file = null, filter = null) {
    console.error("Hi", `dspp v${DSPP_VERSION}`);

    let config   = {files : [], name : "stack"};
    if(!config_file && 'file' in dict) {
      let {file, header} = dict;
      config.files = typeof file == "string" ? [file] : file;

      if(header)
        (typeof header == "string"  ? [header]  : header).forEach(path => config.files.push({type : 'header', path}));
    }

    if(fs.existsSync(config_file)) {
      let body = fs.readFileSync(config_file, 'utf-8');
      config = {name : path.basename(config_file, '.yml'), ...parse(body)};
    }

    let {require = {}} = config;
    if(require.dspp) {
      if(!semver.satisfies(DSPP_VERSION, require.dspp))
        throw `Unsupported dspp version (requires ${require.dspp})`;
    }

    this.stack_name  = config.name;
    this.docker_sdk  = new DockerSDK(this.stack_name);

    let noProgress  = !!dict['no-progress'];
    this.progressOpts = {width : 60, incomplete : ' ', clear : true,  stream : noProgress ? new PassThrough() : process.stderr };

    this.header_files = config.header_files || [];
    this.compose_files = config.compose_files || [];

    for(let line of config.files) {
      if(typeof line == 'string')
        line = {type : 'compose', path : line};

      let type = line.type, path = glob(line.path);
      if(!path.length)
        console.error("Empty expansion from", line.path);

      if(type == "header")
        this.header_files.push(...path);
      if(type == "compose")
        this.compose_files.push(...path);
    }

    this.filter   = filter;
  }

  async _parse() {

    let cas = new Cas(CACHE_CAS_PATH);
    let {stack_name, header_files, compose_files} = this;

    let env = '';
    for(let header_file of header_files)
      env += fs.readFileSync(header_file, 'utf-8') + `\n`;

    let stack = '';
    let out = {};

    let progress = new ProgressBar('Computing stack files [:bar]', {...this.progressOpts, total : compose_files.length});

    for(let compose_file of compose_files || []) {
      let body = env + fs.readFileSync(compose_file, 'utf-8');
      stack += `${body}\n---\n`;
      progress.tick();

      try {
        let doc = parseDocument(body, {merge : true});
        doc = doc.toJS({maxAliasCount : -1 });
        deepMixIn(out, doc);
        //deepMixin will not merge Symbols
        for(let obj of ['services', 'configs']) {
          for(let id of Object.keys(doc[obj] || {}))
            out[obj][id][SOURCE_FILE] = compose_file;
        }

      } catch(err) {
        console.error("\n", "Parsing failure in", compose_file);
        throw err;
      }
    }


    out = sortObjByKey(out);
    out = walk(out, v =>  replaceEnv(v, {...out, stack_name}));

    let processEnv = async (obj) => {
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
      service = await processEnv(service);
      out.services[service_name] = walk(service, v =>  replaceEnv(v, {...service, service_name}));
    }

    let config_map = {};

    progress = new ProgressBar('Computing (:total) configs [:bar]', {...this.progressOpts, total : Object.keys(out.configs || {}).length});


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


    for(let skip of [
      // 1st pass : skip serialized
      config => !!config.format,
      // 2nd pass : skip processed
      config => !!config.file,
    ]) {

      let configs = Object.entries(out.configs || {});

      for(let [config_name, config] of configs) {
        if(config.external || skip(config))
          continue;
        progress.tick();

        let {cas_path, cas_name, trace} = config_map[config_name] = await cas.config(config_name, config, config[SOURCE_FILE]);
        out.configs[cas_name] = {name : config.name, file : cas_path};
        if(trace)
          out.configs[cas_name]['x-trace'] = trace;
        delete out.configs[config_name];
      }


      // this need to be proceseed before 2nd pass
      for(let obj of Object.values({...out.services, ...out.tasks})) {
        for(let config of obj.configs || []) {
          if(config_map[config.source])
            config.source = config_map[config.source]['cas_name'];
        }
      }
    }

    let stack_guid = md5(stack);

    return {out : {
      services : {},
      configs  : {},
      volumes  : {},
      secrets  : {},
      networks : {},
      ...out
    }, stack_guid, cas};
  }

  async _read_remote_state(service_name) {
    let entry = escape(`${this.stack_name}.dspp.${service_name}`);
    return (await this.docker_sdk.config_read(entry)) || "";
  }

  async _write_remote_state(service_name, compiled) {
    let entry = escape(`${this.stack_name}.dspp.${service_name}`);
    const labels = {
      [DOCKER_STACK_NS] : this.stack_name,
      [DSPP_NS]         : "true",
    };

    await this.docker_sdk.config_write(entry, compiled, labels);
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
    }), yamlStyle);

    const stack_revision = md5(body).substr(0, 5);
    const header = `# ${stack_name} @${stack_revision} (dspp v${DSPP_VERSION})\n`;
    const compiled = header + body;


    return {stack_revision, compiled};
  }

  async _analyze_local(filter = false) {

    let {out : {version, ...input}, cas} = await this._parse();

    let services_slices = [];
    let stack = {version};

    // reading remote states
    let services =  Object.entries(input.services || {});
    let tasks    =  Object.entries(input.tasks || {});
    let progress = new ProgressBar('Computing (:total) services [:bar]', {...this.progressOpts, total : services.length});

    for(let [service_name, service] of services) {
      progress.tick();

      if(filter && !service_name.includes(filter))
        continue;

      let stack_slice = {
        version,
        services : {},
        configs  : {},
        volumes  : {},
        secrets  : {},
        networks : {},
      };

      stack_slice.services[service_name] = service;
      if('x-tasks-config' in service) {
        for(let [, task] of tasks) {
          for(let config of task.configs || []) {
            if(input.configs[config.source])
              stack_slice.configs[config.source] = input.configs[config.source];
          }
        }
      }

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
      stack.configs  = {...stack.configs, ...stack_slice.configs};
      stack.networks = {...stack.networks, ...stack_slice.networks};
      stack.secrets  = {...stack.secrets, ...stack_slice.secrets};
      stack.volumes  = {...stack.volumes, ...stack_slice.volumes};

      services_slices.push({service_name, ...this._format(stack_slice)});
    }

    let {compiled, stack_revision} = this._format(stack);

    return {cas, compiled, stack_revision, services_slices};
  }


  //parse local stack, and fetch remote stack status
  async _analyze(filter) {
    let tmp = await this._analyze_local(filter);

    let total = (tmp.services_slices || []).length;
    let progress = new ProgressBar('Reading (:total) remote services [:bar]', {...this.progressOpts, total});

    let remote_stack    = {};
    for(let {service_name} of (tmp.services_slices || [])) {
      progress.tick();
      let service_current = await this._read_remote_state(service_name);
      let doc = parseDocument(service_current, {merge : true});
      deepMixIn(remote_stack, doc.toJS({maxAliasCount : -1 }));
    }

    let {compiled : current}    = this._format(remote_stack);
    return {...tmp, current};
  }

  //public helper
  async parse() {
    let {compiled} = await this._analyze_local();
    return compiled;
  }


  async plan(commit = false) {

    let {filter, compose_files, header_files, stack_name} = this;

    console.error(`Working with stack '%s' from %d files and %d env files`, stack_name, compose_files.length, header_files.length);

    if(filter)
      console.error("Filter stack for '%s'", filter);

    let {compiled, current, stack_revision, services_slices} = await this._analyze(filter);
    let result = {stack_revision};

    if(filter) {
      console.error(`Found ${services_slices.length} matching services`);
      if(!services_slices.length)
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
      await shellExec(`cat "${next}" | git diff --no-index --color "${before}" - 1>&2 | cat`);
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

  async apply() {

    let {filter} = this;

    let {cas, compiled, current, services_slices} = await this._analyze(filter);

    if(current != compiled && compiled != this.approved)
      return console.error("Change detected, please compile first");

    let {cas_path : stack_path} = cas.feed(compiled);
    console.error("Stack file wrote in %s (%s)", stack_path, filter ? `filter ${filter}` : "full stack");
    cas.write();

    let stack = fs.createReadStream(stack_path);
    let child = spawn('docker', ['stack', 'deploy', '--with-registry-auth', '--compose-file', '-', this.stack_name], {stdio : ['pipe', 'inherit', 'inherit']});

    await pipe(stack, child.stdin);
    await wait(child);

    for(let {service_name, compiled} of services_slices)
      await this._write_remote_state(service_name, compiled);

    await passthru('docker', ['service', 'ls']);
  }



  async version() {
    return this.docker_sdk.version();
  }

  async config_prune() {
    let configs = await this.docker_sdk.configs_list({namespace : this.stack_name});
    await eachLimit(configs, 5, async ({ID : id, Spec : { Name : name, Labels}}) => {
      if(Labels[DSPP_NS])
        return; //preserve meta dspp entries
      let res = await this.docker_sdk.request('DELETE', `/configs/${id}`);
      console.error("Pruning", id, name, res.statusCode);
    });

  }


  update(path, value) {
    path = path.split(".");

    let replaced = false;

    for(let compose_file of this.compose_files) {
      let body = fs.readFileSync(compose_file, 'utf8');

      const tokens = new Parser().parse(body);
      const docs = new Composer({merge : true}).compose(tokens);
      let doc = docs.next().value;

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


if(module.parent === null) //ensure module is called directly, i.e. not required
  require('cnyks/lib/bundle')(dspp); //start runner



const replaceEnv = function(str, dict) {
  let mask = /(?:\$\$([a-z0-9._-]+))|(?:\$\$\{([^}]+)\})/i, match;
  if((match = mask.exec(str))) {
    const key = match[1] || match[2];
    let v = jqdive(dict, key);
    if(v !== undefined) {
      if(typeof v == "object")
        return v;
      return replaceEnv(str.replace(match[0], v), dict);
    }
  }
  return str;
};



module.exports = dspp;


