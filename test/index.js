"use strict";

const fs   = require('fs');
const path = require('path');

const expect = require('expect.js');

const dspp   = require('../');


describe("Initial dspp check", function(){
  let fixture_path = path.join(__dirname, "fixtures");
  before("Change WD to fixture dir", function() {
    process.chdir(fixture_path)
  });

  it("Should compile a basic stack", async function(){
    let tmp = new dspp("manifest.yml");
    let compiled = await tmp.parse();
    let challenge = fs.readFileSync("compiled.yml", "utf-8");

    expect(compiled).to.eql(challenge);
  });



});
