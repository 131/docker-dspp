"use strict";

const path  = require('path');
const fs    = require('fs');

const md5   = require('nyks/crypto/md5');
const mkdirpSync = require('nyks/fs/mkdirpSync');

const Progress = require('progress');
const drain    = require('nyks/stream/drain');
const request =  require('nyks/http/request');
const walk       = require('nyks/object/walk');

const wait = require('nyks/child_process/wait');
const spawn =  require('child_process').spawn;

const glob       = require('glob').sync;

const yaml = require('yaml');

const {stringify, parseDocument} = yaml;
const yamlStyle = {singleQuote : false, lineWidth : 0};

const replaceEnv = require('./replaceEnv');

const here = process.cwd();


const ctx = {progress : Progress, request, drain, replaceEnv, yaml};

class Cas {

  constructor(wd = null) {
    this.store = {};
    this.wd    = wd;
  }

  write() {
    mkdirpSync(this.wd);

    for(let [cas_path, cas_content] of Object.entries(this.store)) {
      if(!fs.existsSync(cas_path))
        fs.writeFileSync(cas_path, cas_content);
    }
  }


  feed(contents) {
    let hash     = md5(contents);
    let cas_path = path.posix.join(this.wd, hash);
    this.store[cas_path] = contents;
    return {hash, cas_path};
  }

  async env(env_file, source_file) {
    let wd = path.dirname(source_file);
    let file_path = path.join(wd, env_file);
    let body = fs.readFileSync(file_path, 'utf-8');
    let {cas_path} = this.feed(body);
    return cas_path;
  }



  // import
  async * config(config_map, config_name, config, source_file, target = "") {

    let config_body;
    let wd = path.dirname(source_file);
    let {file, args, exec, bundle, require : require_file, contents, format, directory, 'x-trace' : trace = true} = config;

    if(exec) {
      let script = path.resolve(wd, exec);
      let child = spawn(script);
      ([, contents] = await Promise.all([wait(child), drain(child.stdout)]));
      contents = String(contents);
    }

    if(require_file) {
      let file_path;

      try {
        file_path = require.resolve(require_file);
      } catch(err) {
        //manual lookup algo
        file_path = path.resolve(wd, require_file);
        if(!file_path.startsWith(here))
          file_path = path.join(here, file_path);
      }

      if(file_path.endsWith('.yml')) {
        let body = fs.readFileSync(file_path, 'utf-8');
        let doc = parseDocument(body, {merge : true});
        contents = doc.toJS({maxAliasCount : -1 });
      } else {
        let largs = Array.isArray(args) ? args : [args];
        let script = require(file_path);
        contents = typeof script == "function" ? await script({...ctx, wd, source_file}, ...largs) : script;
      }
    }

    if(bundle) {
      for(let {source, target, mode} of  bundle) {
        if(!config_map[source])
          continue;
        for(let line of config_map[source])
          yield {...line, target : `${target}${line.target}`, mode};

      }
      return;
    }

    if(directory) {
      let dir_path = path.resolve(wd, directory);

      if(!dir_path.startsWith(here))
        dir_path = path.join(here, dir_path);

      let files = glob("**", {nodir : true, cwd : dir_path});

      let progress = new Progress('Processing directory [:bar]',
        {width : 60, incomplete : ' ', clear : true, total : files.length});

      for(let file of files) {
        let fp = path.join(directory, file), ctx = md5(fp).substr(0, 4);
        progress.tick();
        for await(const conf of this.config(config_map, `${config_name}_${ctx}`, {file : fp, 'x-trace' : trace, args}, source_file, `/${file}`))
          yield conf;
      }
      return;
    }

    if(file) {
      let file_path = path.resolve(wd, file);

      if(!file_path.startsWith(here))
        file_path = path.join(here, file_path);

      contents = fs.readFileSync(file_path, 'utf-8');
    }

    if(contents !== undefined) {
      if(args)
        contents = walk(contents, v =>  replaceEnv(v, args));
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


    let {hash, cas_path} = this.feed(config_body);
    let cas_name = config_name + '-' + hash.substr(0, 5);

    yield {hash, cas_path, cas_name, trace, target};
  }

}

module.exports = Cas;
