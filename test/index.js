"use strict";

const fs   = require('fs');
const path = require('path');
const glob = require('glob').sync;

const expect = require('expect.js');

const Dspp   = require('../');
const {version} = require('../package.json');

describe("Initial dspp check", function() {
  let fixture_path = path.join(__dirname, "fixtures");
  before("Change WD to fixture dir", function() {
    process.chdir(fixture_path);
  });

  it("Should compile a basic stack", async function() {
    let tmp = new Dspp("manifest.yml");

    let {cas, compiled} = await tmp._analyze_local();
    let challenge = fs.readFileSync("compiled.yml", "utf-8");

    challenge = challenge.replace(/dspp v[0-9.]+/, `dspp v${version}`);

    // to record challenge, just uncomment this
    // cas.write();


    expect(challenge).to.eql(compiled);
    for(let [file_path, file_contents] of Object.entries(cas.store)) {
      console.log("Checking", file_path);
      if(!fs.existsSync(file_path))
        throw `Missing ${file_path} with ${file_contents}`;

      let challenge = fs.readFileSync(file_path, 'utf-8');
      expect(challenge).to.eql(file_contents);
    }


  });



});
