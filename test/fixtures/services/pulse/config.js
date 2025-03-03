"use strict";

const config = {
  daemon : {
    port   : 8081,
    notify : "foo@bar.com"
  },

  docker : {
    "socketPath" : "/var/run/docker.sock",
    "host" : "localhost"
  },

  registries :  {},

};


module.exports = config;
