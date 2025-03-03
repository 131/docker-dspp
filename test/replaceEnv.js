"use strict";

const expect = require('expect.js');

const {replaceEnv} = require('../replaceEnv');

describe("Testing replaceEnv", function() {

  const body = "Hi $$name, $${env['color']} is great";


  it("should do basic interpolation", async function() {
    let env = { color : 'blue'};

    let test = replaceEnv(body, {name : 'Joe', env});
    expect(test).to.be("Hi Joe, blue is great");
  });

  it("should do incomplete interpolation", async function() {
    let env = { color : 'blue'};

    let test = replaceEnv(body, {env});
    expect(test).to.be("Hi $$name, blue is great");
  });

  it("should full object remap", async function() {
    let env = { color : 'blue'};
    let test = replaceEnv("noize $$env noize", {env});
    expect(test).to.eql(env);
  });



});
