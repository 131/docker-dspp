#!/usr/bin/env node
'use strict';

const {version : DSPP_VERSION } = require('./package.json');

const fs    = require('fs');
const path  = require('path');
const spawn = require('child_process').spawn;

const deepMixIn  = require('mout/object/deepMixIn');
const jqdive     = require('nyks/object/jqdive');

const walk       = require('nyks/object/walk');
const mkdirpSync = require('nyks/fs/mkdirpSync');
const prompt     = require('cnyks/prompt/prompt');
const md5        = require('nyks/crypto/md5');
const tmppath    = require('nyks/fs/tmppath');
const wait       = require('nyks/child_process/wait');

const {dict}  = require('nyks/process/parseArgs')();


const yaml = require('js-yaml');

function passthru(cmd) {
  let child = spawn(cmd, {shell : '/bin/bash', stdio : 'inherit'});
  return wait(child);
}

const CACHE_STACK_PATH = ".docker-stack";
const CACHE_CAS_PATH   = path.join(CACHE_STACK_PATH, ".cas");

class dspp {

  constructor(config_file = null, filter = null) {
    console.error("Hi", `dspp v${DSPP_VERSION}`);

    this.config   = {};
    if(!config_file && 'file' in dict) {
      let {file, env} = dict;
      this.config.files        = typeof file == "string" ? [file] : file;
      this.config['env-files'] = typeof env == "string"  ? [env]  : env;
    }

    if(fs.existsSync(config_file)) {
      let config = fs.readFileSync(config_file, 'utf-8');
      this.config = {name : path.basename(config_file, '.yml'), ...yaml.load(config)};
    }
    this.stack_name  = this.config.name || "stack";
    this.filter   = filter;
  }

  async _parse() {

    let {filter, config, stack_name} = this;
    let stack_file = `${stack_name}.yml`;

    let env = '';
    for(let compose_file of config['env-files'] || [])
      env += fs.readFileSync(compose_file, 'utf-8') + `\n`;

    let stack = '';
    for(let compose_file of config.files || [])
      stack += env + fs.readFileSync(compose_file, 'utf-8') + `\n---\n`;

    let out = {};
    yaml.loadAll(stack, doc => deepMixIn(out, doc));
    out = sortObjByKey(out);

    let cas = {};

    out = walk(out, v =>  replaceEnv(v, {...out, stack_name}));

    for(let [task_name, task] of Object.entries(out.tasks || {}))
      out.tasks[task_name]  = walk(task, v =>  replaceEnv(v, {...task, task_name, service_name : task_name}));

    for(let [service_name, service] of Object.entries(out.services || {}))
      out.services[service_name] = walk(service, v =>  replaceEnv(v, {...service, service_name}));

    // strip all filtered services
    if(filter) {
      stack_file = `${stack_name}.${filter}.yml`;

      let f_configs  = [];
      let f_volumes  = [];
      let f_networks = [];

      for(let [service_name, service] of Object.entries(out.services)) {
        if(!service_name.includes(filter)) {
          delete out.services[service_name];
          continue;
        }
        for(let config of service.configs || [])
          f_configs.push(config.source);
        for(let volume of service.volumes || [])
          f_volumes.push(volume.source);
        for(let [k, v] of Object.entries(service.networks || {}))
          f_networks.push(typeof v == "string" ? v : k);
      }


      for(let config_name in out.configs) {
        if(!f_configs.includes(config_name))
          delete out.configs[config_name];
      }
      for(let volume_name in out.volumes) {
        if(!f_volumes.includes(volume_name))
          delete out.volumes[volume_name];
      }

      for(let network_name in out.networks) {
        if(!f_networks.includes(network_name))
          delete out.networks[network_name];
      }
    }

    let config_map = {};
    for(let [config_name, config] of Object.entries(out.configs || {})) {
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

    let body = yaml.dump({
      version   : out.version,
      configs   : isEmpty(out.configs)  ? undefined : out.configs,
      secrets   : isEmpty(out.secrets)  ? undefined : out.secrets,
      networks  : isEmpty(out.networks) ? undefined : out.networks,
      volumes   : isEmpty(out.volumes)  ? undefined : out.volumes,
      services  : isEmpty(out.services) ? undefined : out.services,
    }, {quotingType : '"', lineWidth : -1, noCompatMode : true, noRefs : true});

    let stack_revision = md5(stack + body).substr(0, 5); //source + compiled

    let header = `# ${stack_name} @${stack_revision} (dspp v${DSPP_VERSION})\n`;
    return {
      stack_revision,
      cas,
      compiled : header + body,
      stack_file,
    };
  }

  async parse() {
    let {compiled} = await this._parse();
    return compiled;
  }


  async compile(commit = false) {

    let {filter, config, stack_name} = this;

    console.error(`Working with stack '%s' from %d files and %d env files`, stack_name, config.files.length, (config['env-files'] || []).length);

    if(filter)
      console.error("Filter stack for '%s'", filter);

    let {compiled, stack_revision, cas, stack_file} = await this._parse();
    let stack_path = path.join(CACHE_STACK_PATH, stack_file);

    let result = {stack_revision};

    console.error("Working in %s", stack_path);

    let write = function() {
      mkdirpSync(CACHE_STACK_PATH);
      mkdirpSync(CACHE_CAS_PATH);

      fs.writeFileSync(stack_path, compiled);
      console.error("Stack wrote in", stack_path);

      for(let [cas_path, cas_content] of Object.entries(cas)) {
        if(!fs.existsSync(cas_path))
          fs.writeFileSync(cas_path, cas_content);
      }

      return result;
    };



    let before = fs.existsSync(stack_path) ? stack_path : "/dev/null";

    if(fs.readFileSync(before, 'utf-8') == compiled) {
      console.error("No changes detected");
      return result;
    }

    if(commit)
      return write();

    let style = 0;
    let next = tmppath();
    fs.writeFileSync(next, compiled);

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
      return write();

    return result;
  }

  async deploy() {

    let {compiled, stack_file} = await this._parse();
    let stack_path = path.join(CACHE_STACK_PATH, stack_file);

    if(!fs.existsSync(stack_path) || fs.readFileSync(stack_path, 'utf-8') != compiled)
      return console.error("Change detected, please compile first");

    await passthru(`docker stack deploy --with-registry-auth --compose-file - ${this.stack_name} < "${stack_path}"`);
    await passthru(`docker service ls`);
  }

  // import
  async _cas(config_name, config) {
    let config_body;
    let {file, contents, format, trace = true} = config;

    if(file) {
      config_body = fs.readFileSync(file, 'utf-8');
      if(trace)
        trace = config_body;
    }

    if(contents) {
      if(format == "json")
        config_body = JSON.stringify(contents, null, 2);
      else if(format == "yaml")
        config_body = yaml.dump(contents, {quotingType : '"', lineWidth : -1, noCompatMode : true});
      else
        config_body = String(contents);

      if(trace)
        trace = contents;
    }

    if(!config_body)
      throw 'You did not provide any config in your config directive';


    let hash     = md5(config_body);
    let cas_path = path.join(CACHE_CAS_PATH, hash);
    let cas_name = config_name + '-' + hash.substr(0, 5);

    return {hash, cas_path, cas_name, cas_content : config_body, trace};
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


