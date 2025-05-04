"use strict";

const path  = require('path');
const url   = require('url');

const {laxParser, readFileSync} = require('./replaceEnv');
const deepMixIn  = require('mout/object/deepMixIn');
const trim       = require('mout/string/trim');

const request    = require('nyks/http/request');
const drain      = require('nyks/stream/drain');


class Secrets {

  constructor({secrets_list, wd}) {
    this.secrets_list = secrets_list;
    this.wd           = wd;
  }

  async _process_file({file_path}) {
    let file_realpath = path.join(this.wd, file_path);
    let doc  = laxParser(readFileSync(file_realpath, 'utf8'));
    return doc && doc.toJSON() || {};
  }


  async _process_vault(vault_conf) {
    let {vault_addr, secret_path} = vault_conf;
    let {VAULT_TOKEN} = process.env;

    if(!VAULT_TOKEN)
      throw `Could not log into the vault`;

    let secrets = {};

    if(typeof secret_path == "string")
      secret_path = [secret_path];
    for(let ppath of secret_path) {
      let [ns, ...paths] = trim(ppath, '/').split('/'), path = paths.join('/');
      let remote_url = `${trim(vault_addr, '/')}/v1/${ns}/data/${path}`;
      let query = {...url.parse(remote_url), headers : {'x-vault-token' : VAULT_TOKEN}};
      let req = await request(query);
      if(req.statusCode !== 200)
        throw `Could not retrieve vault secret ${secret_path}`;
      let {data : {data : body }} = JSON.parse(await drain(req));
      deepMixIn(secrets, body);
    }
    return secrets;
  }

  async retrieve() {
    let secrets = {};
    for(let secret of this.secrets_list) {
      if(secret.driver == "file") {
        let body = await this._process_file(secret);
        deepMixIn(secrets, body);
      }

      if(secret.driver == "vault") {
        let body = await this._process_vault(secret);
        deepMixIn(secrets, body);
      }
    }

    return secrets;
  }

}

module.exports = Secrets;
