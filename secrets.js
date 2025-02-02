"use strict";

const path  = require('path');
const url   = require('url');
const net   = require('net');


const {laxParser, readFileSync} = require('./replaceEnv');
const deepMixIn  = require('mout/object/deepMixIn');
const SSHAgent   = require('ssh-agent-js/client');
const trim       = require('mout/string/trim');
const get        = require('mout/object/get');
const eachLimit = require('nyks/async/eachLimit');

const request    = require('nyks/http/request');
const drain      = require('nyks/stream/drain');

const debug = require('debug');

const logger  = {
  debug : debug('dspp:secrets:debug'),
  info  : debug('dspp:secrets:info'),
  error : debug('dspp:secrets:error'),
};


class Secrets {

  constructor({secrets_list, wd, rc}) {
    this.secrets_list = secrets_list;
    this.wd           = wd;
    this.rc           = rc;
  }

  async _process_file({file_path}) {
    let file_realpath = path.join(this.wd, file_path);
    let body  = laxParser(readFileSync(file_realpath)).toJSON();
    return body;
  }

  async _login_vault_ssh({vault_addr, path = 'ssh', role}) {
    let sock;
    await new Promise(resolve => (sock = net.connect(process.env.SSH_AUTH_SOCK, resolve)));
    let agent = new SSHAgent(sock);
    let keys = Object.values(await agent.list_keys());

    let token;
    await eachLimit(keys, 1, async ({type, ssh_key, fingerprint, comment}) => {
      if(token)
        return;

      let remote_url = `${trim(vault_addr, '/')}/v1/auth/${path}/nonce`;
      let query = {...url.parse(remote_url), json : true};
      let res = await request(query);
      let {data : {nonce}} = JSON.parse(String(await drain(res)));

      const public_key = `${type} ${ssh_key}`;
      const {signature} =  await agent.sign(fingerprint, Buffer.from(nonce));

      const payload = {public_key, role, nonce : Buffer.from(nonce).toString('base64'), signature};
      try {
        token = await this._login_vault(vault_addr, path, payload);
      } catch(err) {
        logger.debug("ssh : invalid challenge for public key", comment);
      }
    });

    sock.destroy();

    if(!token)
      throw `Could not login to vault`;

    return token;
  }

  async _login_vault(vault_addr, path, payload) {
    let remote_url = `${trim(vault_addr, '/')}/v1/auth/${path}/login`;
    let query = {...url.parse(remote_url), json : true};
    let res = await request(query, payload);
    let response = String(await drain(res));

    if(res.statusCode !== 200)
      throw `Could not login to vault : ${response}`;

    let token = get(JSON.parse(response), 'auth.client_token');
    return token;
  }


  async _process_vault({vault_addr, secret_path, jwt_auth, ssh_auth}) {
    let token = this.rc.VAULT_TOKEN;
    if(!token && ssh_auth && process.env.SSH_AUTH_SOCK)
      token = await this._login_vault_ssh({...ssh_auth, vault_addr});



    if(!token && jwt_auth && jwt_auth.jwt) {
      let {path, jwt, role} = jwt_auth, payload = {jwt, role};
      token = await this._login_vault(vault_addr, path, payload);
    }


    // allow other auths
    if(!token)
      return {};

    this.rc.VAULT_TOKEN = token;
    let secrets = {};

    if(typeof secret_path == "string")
      secret_path = [secret_path];
    for(let path of secret_path) {
      let remote_url = `${trim(vault_addr, '/')}/v1/secrets/data/${trim(path, '/')}`;
      let query = {...url.parse(remote_url), headers : {'x-vault-token' : this.rc.VAULT_TOKEN}};
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
