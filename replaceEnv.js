"use strict";
const fs    = require('fs');
const path  = require('path');

const {Parser, Composer} = require('yaml');
const jqdive     = require('nyks/object/jqdive');



const replaceEnv = function(str, dict) {
  let mask = /(?:\$\$([a-z0-9._-]+))|(?:\$\$\{([^}]+)\})/ig, match;

  let touched = false;
  while((match = mask.exec(str))) {
    const key = match[1] || match[2];
    let v = jqdive(dict, key);
    if(v === undefined)
      continue;
    if(typeof v == "object")
      return v;
    touched = true;

    str = str.replace(match[0], v);
  }

  if(touched)
    return replaceEnv(str, dict);
  return str;
};

const laxParser = function(body) {
  const tokens = new Parser().parse(body);
  const docs = new Composer({merge : true, uniqueKeys : false}).compose(tokens);
  return docs.next().value;
};

const readFileSync = function(file_path) {
  let fp = path.resolve(file_path);
  if(readFileSync[fp])
    return readFileSync[fp];
  return readFileSync[fp] = fs.readFileSync(fp, 'utf-8');
};

module.exports = {replaceEnv, laxParser, readFileSync};
