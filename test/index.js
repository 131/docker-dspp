"use strict";

const fs   = require('fs');
const path = require('path');

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

    let {cas, stack} = await tmp._analyze_local();
    let {compiled} = tmp._format(stack);

    let challenge = fs.readFileSync("compiled.yml", "utf-8");

    challenge = challenge.replace(/dspp v[0-9.]+/, `dspp v${version}`);

    // to record challenge, just uncomment this
    // cas.write(); fs.writeFileSync("compiled.yml", compiled); process.exit();


    expect(challenge).to.eql(compiled);
    for(let [file_path, file_contents] of Object.entries(cas.store)) {
      console.log("Checking", file_path);
      if(!fs.existsSync(file_path))
        throw `Missing ${file_path} with ${file_contents}`;

      let challenge = fs.readFileSync(file_path, 'utf-8');
      expect(challenge).to.eql(file_contents);
    }


  });

  it("Should keep only the last config mapped to a given target", async function() {
    let tmp = new Dspp("override-manifest.yml");

    let {stack} = await tmp._analyze_local();
    let {configs = []} = stack.services.override;

    expect(configs).to.have.length(1);
    expect(configs[0].target).to.eql("/etc/demo");
    expect(configs[0].source).to.match(/^override-config-/);
  });



});
