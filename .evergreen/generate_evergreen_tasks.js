'use strict';

const semver = require('semver');
const fs = require('fs');
const yaml = require('js-yaml');

const LATEST_EFFECTIVE_VERSION = '5.0';
const MONGODB_VERSIONS = ['latest', '4.2', '4.0', '3.6', '3.4', '3.2', '3.0', '2.6'];
const NODE_VERSIONS = ['dubnium', 'carbon', 'boron', 'argon'];
const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'].concat([
  'server-unified',
  'replica_set-unified',
  'sharded_cluster-unified'
]);

const OPERATING_SYSTEMS = [
  // ArchLinux
  {
    name: 'archlinux-test',
    display_name: 'Archlinux',
    run_on: 'archlinux-test',
    mongoVersion: '<4.2',
    auth: false
  },
  // Debian
  {
    name: 'debian71-test',
    display_name: 'Debian 7.1',
    run_on: 'debian71-test',
    mongoVersion: '<4.0',
    nodeVersions: ['argon', 'boron']
  },
  {
    name: 'debian81-test',
    display_name: 'Debian 8.1',
    run_on: 'debian81-test',
    mongoVersion: '>=3.4 <4.2'
  },
  // TODO: once we know how to test debian 9.x
  // {
  //   name: 'debian91-test',
  //   display_name: 'Debian 9.1',
  //   run_on: 'debian91-test',
  //   mongoVersion: '>=4.0'
  // },
  // Amazon Linux
  {
    name: 'linux-64-amzn-test',
    display_name: 'Amazon Linux (Enterprise)',
    run_on: 'linux-64-amzn-test',
    mongoVersion: '<4.0',
    nodeVersions: ['argon', 'boron']
  },
  // macos
  {
    name: 'macos-1012',
    display_name: 'macOS 10.12',
    run_on: 'macos-1012',
    auth: false
  },
  // rhel
  {
    name: 'rhel70',
    display_name: 'RHEL 7.0',
    run_on: 'rhel70-small'
  },
  {
    name: 'rhel71-power8-test',
    display_name: 'RHEL 7.1 (POWER8)',
    run_on: 'rhel71-power8-test',
    mongoVersion: '>=3.2'
  },
  //suse
  {
    name: 'suse12-x86-64-test',
    display_name: 'SUSE 12 (x86_64)',
    run_on: 'suse12-test',
    mongoVersion: '>=3.2'
  },
  // Ubuntu
  {
    name: 'ubuntu-14.04',
    display_name: 'Ubuntu 14.04',
    run_on: 'ubuntu1404-test',
    mongoVersion: '<4.2'
  },
  {
    name: 'ubuntu-16.04',
    display_name: 'Ubuntu 16.04',
    run_on: 'ubuntu1604-test',
    mongoVersion: '>=3.2',
    clientEncryption: true
  },
  {
    name: 'ubuntu1604-arm64-small',
    display_name: 'Ubuntu 16.04 (ARM64)',
    run_on: 'ubuntu1604-arm64-small',
    mongoVersion: '>=3.4 <4.2'
  },
  {
    name: 'ubuntu1604-power8-test',
    display_name: 'Ubuntu 16.04 (POWER8)',
    run_on: 'ubuntu1604-power8-test',
    mongoVersion: '>=3.4 <4.2'
  },
  {
    name: 'ubuntu1804-arm64-test',
    display_name: 'Ubuntu 18.04 (ARM64)',
    run_on: 'ubuntu1804-arm64-test',
    mongoVersion: '>=4.2'
  }

  // reenable when these are actually running 7.2, or we release a 7.4 rpm
  // {
  //   name: 'rhel72-zseries-test',
  //   display_name: 'RHEL 7.2 (zSeries)',
  //   run_on: 'rhel72-zseries-test',
  //   mongoVersion: '>=3.4'
  // },

  // Windows. reenable this when nvm supports windows, or we settle on an alternative tool
  // {
  //   name: 'windows-64-vs2010-test',
  //   display_name: 'Windows (VS2010)',
  //   run_on: 'windows-64-vs2010-test'
  // },
  // {
  //   name: 'windows-64-vs2013-test',
  //   display_name: 'Windows (VS2013)',
  //   run_on: 'windows-64-vs2013-test'
  // },
  // {
  //   name: 'windows-64-vs2015-test',
  //   display_name: 'Windows (VS2015)',
  //   run_on: 'windows-64-vs2015-test'
  // }
].map(osConfig =>
  Object.assign(
    {
      mongoVersion: '>=2.6',
      nodeVersion: 'argon',
      auth: false
    },
    osConfig
  )
);

const TASKS = [];

function makeTask({ mongoVersion, topology }) {
  let topologyForTest = topology;
  let runTestsCommand = { func: 'run tests' };
  if (topology.indexOf('-unified') !== -1) {
    topologyForTest = topology.split('-unified')[0];
    runTestsCommand = { func: 'run tests', vars: { UNIFIED: 1 } };
  }

  return {
    name: `test-${mongoVersion}-${topology}`,
    tags: [mongoVersion, topology],
    commands: [
      {
        func: 'install dependencies'
      },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: mongoVersion,
          TOPOLOGY: topologyForTest
        }
      },
      runTestsCommand
    ]
  };
}

MONGODB_VERSIONS.forEach(mongoVersion => {
  TOPOLOGIES.forEach(topology => {
    TASKS.push(makeTask({ mongoVersion, topology }));
  });
});

TASKS.push({
  name: 'test-atlas-connectivity',
  tags: ['atlas-connect'],
  commands: [
    {
      func: 'install dependencies'
    },
    {
      func: 'run atlas tests',
      vars: {
        VERSION: 'latest'
      }
    }
  ]
});

const BUILD_VARIANTS = [];

const getTaskList = (() => {
  const memo = {};
  return function(mongoVersion) {
    const key = mongoVersion;

    if (memo[key]) {
      return memo[key];
    }

    const ret = TASKS.filter(task => {
      const { VERSION } = task.commands.filter(task => !!task.vars)[0].vars;

      if (VERSION === 'latest') {
        return semver.satisfies(semver.coerce(LATEST_EFFECTIVE_VERSION), mongoVersion);
      }

      return semver.satisfies(semver.coerce(VERSION), mongoVersion);
    }).map(x => x.name);

    memo[key] = ret;
    return ret;
  };
})();

OPERATING_SYSTEMS.forEach(
  ({
    name: osName,
    display_name: osDisplayName,
    run_on,
    mongoVersion = '>=2.6',
    nodeVersions = NODE_VERSIONS,
    clientEncryption
  }) => {
    const testedNodeVersions = NODE_VERSIONS.filter(version => nodeVersions.includes(version));
    const tasks = getTaskList(mongoVersion);

    testedNodeVersions.forEach(NODE_LTS_NAME => {
      const nodeLtsDisplayName = `Node ${NODE_LTS_NAME[0].toUpperCase()}${NODE_LTS_NAME.substr(1)}`;
      const name = `${osName}-${NODE_LTS_NAME}`;
      const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
      const expansions = { NODE_LTS_NAME };

      if (clientEncryption) {
        expansions.CLIENT_ENCRYPTION = true;
      }

      BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks });
    });
  }
);

const fileData = yaml.safeLoad(fs.readFileSync(`${__dirname}/config.yml.in`, 'utf8'));

fileData.tasks = (fileData.tasks || []).concat(TASKS);
fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(`${__dirname}/config.yml`, yaml.safeDump(fileData, { lineWidth: 120 }), 'utf8');
