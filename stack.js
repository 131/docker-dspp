#!/usr/bin/env node
'use strict';

const {version : DSPP_VERSION } = require('./package.json');

const fs    = require('fs');
const path  = require('path');
const spawn = require('child_process').spawn;

const deepMixIn  = require('mout/object/deepMixIn');
const jqdive     = require('nyks/object/jqdive');
const glob       = require('glob').sync;

const walk       = require('nyks/object/walk');
const ProgressBar = require('progress');
const mkdirpSync = require('nyks/fs/mkdirpSync');
const prompt     = require('cnyks/prompt/prompt');
const md5        = require('nyks/crypto/md5');
const tmppath    = require('nyks/fs/tmppath');
const wait       = require('nyks/child_process/wait');
const eachLimit = require('nyks/async/eachLimit');

const {dict}  = require('nyks/process/parseArgs')();

const {stringify, parse, parseDocument,  Parser, Composer} = require('yaml');

const DockerSDK = require('@131/docker-sdk');
const DOCKER_STACK_NS = 'com.docker.stack.namespace';
const DSPP_NS         = 'dspp.namespace';


function passthru(cmd) {
  let child = spawn(cmd, {shell : '/bin/bash', stdio : 'inherit'});
  return wait(child);
}

const yamlStyle = {singleQuote : false, lineWidth : 0};
const CACHE_STACK_PATH = ".docker-stack";
const CACHE_CAS_PATH   = path.join(CACHE_STACK_PATH, ".cas");
const flatten = obj => JSON.parse(JSON.stringify(obj));

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

    this.stack_name  = config.name;
    this.docker_sdk  = new DockerSDK(this.stack_name);

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
    this.labels = {
      [DOCKER_STACK_NS] : this.stack_name,
      [DSPP_NS]         : "true",
    };
  }

  async _parse() {

    let {stack_name, header_files, compose_files} = this;

    let env = '';
    for(let header_file of header_files)
      env += fs.readFileSync(header_file, 'utf-8') + `\n`;

    let stack = '';
    let out = {};

    let total =  compose_files.length;
    let progress = new ProgressBar('Computing stack [:bar]', {total, width : 60, incomplete : ' ', clear : true });

    for(let compose_file of compose_files || []) {
      let body = env + fs.readFileSync(compose_file, 'utf-8');
      stack += `${body}\n---\n`;
      progress.tick();

      try {
        let doc = parseDocument(body, {merge : true});
        deepMixIn(out, doc.toJS({maxAliasCount : -1 }));
      } catch(err) {
        console.error("\n", "Parsing failure in", compose_file);
        throw err;
      }
    }

    out = sortObjByKey(out);

    let cas = {};

    out = walk(out, v =>  replaceEnv(v, {...out, stack_name}));

    for(let [task_name, task] of Object.entries(out.tasks || {}))
      out.tasks[task_name]  = walk(task, v =>  replaceEnv(v, {...task, task_name, service_name : task_name}));

    for(let [service_name, service] of Object.entries(out.services || {}))
      out.services[service_name] = walk(service, v =>  replaceEnv(v, {...service, service_name}));


    let config_map = {}, configs = Object.entries(out.configs || {});
    total =  configs.length;
    progress = new ProgressBar('Computing configs [:bar]', {total, width : 60, incomplete : ' ', clear : true });

    for(let [config_name, config] of configs) {
      progress.tick();

      if(config.external)
        continue;
      let {cas_path, cas_name, cas_content, trace} = config_map[config_name] = await this._cas(config_name, config);
      cas[cas_path] = cas_content;

      let {external, name} = out.configs[config_name];
      out.configs[cas_name] = {external, name, file : cas_path};
      if(trace)
        out.configs[cas_name]['x-trace'] = trace;
      delete out.configs[config_name];
    }

    for(let service of Object.values(out.services || {})) {
      for(let config of service.configs || []) {
        if(config_map[config.source])
          config.source = config_map[config.source]['cas_name'];
      }
    }

    let stack_guid = md5(stack);
    return {out, stack_guid, cas};
  }

  async _compute(filter = false) {
    let {stack_name} = this;

    let stack_file = `${stack_name}.yml`;

    let {out, stack_guid, cas} = await this._parse();

    if(filter) {
      out = this._filter(out, filter);
      stack_file = `${stack_name}.${filter}.yml`;
    }

    let body = stringify(flatten({
      version   : out.version,
      configs   : isEmpty(out.configs)  ? undefined : out.configs,
      secrets   : isEmpty(out.secrets)  ? undefined : out.secrets,
      networks  : isEmpty(out.networks) ? undefined : out.networks,
      volumes   : isEmpty(out.volumes)  ? undefined : out.volumes,
      services  : isEmpty(out.services) ? undefined : out.services,
    }), yamlStyle);

    let stack_revision = md5(stack_guid + body).substr(0, 5); //source + compiled

    let header = `# ${stack_name} @${stack_revision} (dspp v${DSPP_VERSION})\n`;

    return {
      stack_file,
      stack_revision,
      cas,
      compiled : header + body
    };

  }

  _filter(out, filter) {
    let f_configs  = [];
    let f_volumes  = [];
    let f_secrets  = [];
    let f_networks = [];

    for(let [service_name, service] of Object.entries(out.services)) {
      if(!service_name.includes(filter)) {
        delete out.services[service_name];
        continue;
      }
      for(let config of service.configs || [])
        f_configs.push(config.source);
      for(let secret of service.secrets || [])
        f_secrets.push(secret.source);
      for(let volume of service.volumes || [])
        f_volumes.push(volume.source);
      for(let [k, v] of Object.entries(service.networks || {}))
        f_networks.push(typeof v == "string" ? v : k);
    }


    for(let config_name in out.configs) {
      if(!f_configs.includes(config_name))
        delete out.configs[config_name];
    }
    for(let secret_name in out.secrets) {
      if(!f_secrets.includes(secret_name))
        delete out.secrets[secret_name];
    }
    for(let volume_name in out.volumes) {
      if(!f_volumes.includes(volume_name))
        delete out.volumes[volume_name];
    }

    for(let network_name in out.networks) {
      if(!f_networks.includes(network_name))
        delete out.networks[network_name];
    }

    return out;
  }

  async parse() {
    let {compiled} = await this._compute();
    return compiled;
  }


  async compile(commit = false) {

    let {filter, compose_files, header_files, stack_name} = this;

    console.error(`Working with stack '%s' from %d files and %d env files`, stack_name, compose_files.length, header_files.length);

    if(filter)
      console.error("Filter stack for '%s'", filter);

    let {compiled, stack_revision, stack_file} = await this._compute(filter);
    let result = {stack_revision};

    let stack_path = path.join(CACHE_STACK_PATH, stack_file);

    console.error("Working in %s", stack_file);

    let approve = () => {
      console.log("Approved");
      this.approved = compiled;
      return result;
    };

    let current = await this.docker_sdk.config_read(stack_file) || "";

    // init from fs
    if(current === "" && fs.existsSync(stack_path))
      current = fs.readFileSync(stack_path, 'utf-8');

    if(current == compiled || this.approved == compiled) {
      console.error("No changes detected");
      return result;
    }

    if(commit)
      return approve();

    let before = tmppath(), next = tmppath();
    fs.writeFileSync(before, current);
    fs.writeFileSync(next, compiled);

    let style = 0;

    do {
      if(style == 1)
        await passthru(`diff -y <(echo -e "current stack\\n---"; cat "${before}") <(echo -e "next stack\n---"; cat  "${next}") | colordiff | most`);

      if(style == 0)
        await passthru(`cat "${next}" | git diff --no-index "${before}" - || true`);

      try {
        commit = await prompt("Confirm [y/N/q] (q : toggle diff style):");
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

  async deploy() {

    let {filter} = this;

    let {compiled, stack_file, cas} = await this._compute(filter);
    let current = await this.docker_sdk.config_read(stack_file) || "";

    if(current != compiled && compiled != this.approved)
      return console.error("Change detected, please compile first");

    let stack_path = path.join(CACHE_STACK_PATH, stack_file);

    let write = function() {
      mkdirpSync(CACHE_STACK_PATH);
      mkdirpSync(CACHE_CAS_PATH);

      fs.writeFileSync(stack_path, compiled);
      console.error("Stack wrote in", stack_path);

      for(let [cas_path, cas_content] of Object.entries(cas)) {
        if(!fs.existsSync(cas_path))
          fs.writeFileSync(cas_path, cas_content);
      }
    };
    write();

    await passthru(`docker stack deploy --with-registry-auth --compose-file - ${this.stack_name} < "${stack_path}"`);
    await this.docker_sdk.config_write(stack_file, compiled, this.labels);
    await passthru(`docker service ls`);
  }

  // import
  async _cas(config_name, config) {
    let config_body;
    let {file, contents, format, 'x-trace' : trace = true} = config;

    if(file) {
      config_body = fs.readFileSync(file, 'utf-8');
      if(trace)
        trace = config_body;
    }

    if(contents) {
      if(format == "json")
        config_body = JSON.stringify(contents, null, 2);
      else if(format == "yaml")
        config_body = stringify(contents, yamlStyle);
      else
        config_body = String(contents);

      if(trace)
        trace = contents;
    }

    if(config_body == undefined)
      throw `No body for config '${config_name}'`;


    let hash     = md5(config_body);
    let cas_path = path.join(CACHE_CAS_PATH, hash);
    let cas_name = config_name + '-' + hash.substr(0, 5);

    return {hash, cas_path, cas_name, cas_content : config_body, trace};
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
      console.log("Pruning", id, name, res.statusCode);
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
        console.log("Set %s to %s in %s", path, value, compose_file);
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
      Object.keys(value).sort().reduce(
        (o, key) => {
          const v = value[key];
          o[key] = sortObjByKey(v);
          return o;
        }, {})
    ) :
    value;
}

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


