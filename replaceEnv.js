"use strict";

const jqdive     = require('nyks/object/jqdive');



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

module.exports = replaceEnv;
