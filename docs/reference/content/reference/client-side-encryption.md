+++
date = "2019-06-13T09:00:01+01:00"
title = "Client Side Encryption"
[menu.main]
  parent = "Reference"
  identifier = "Client Side Encryption"
  weight = 100
  pre = "<i class='fa'></i>"
+++

# Client Side Encryption

New in MongoDB 4.2 client side encryption allows administrators and developers to encrypt specific data fields in addition to other
MongoDB encryption features.

With field level encryption, developers can encrypt fields client side without any server-side
configuration or directives. Client-side field level encryption supports workloads where applications must guarantee that
unauthorized parties, including server administrators, cannot read the encrypted data.

## Installation

Using client side encryption requires installing the [`mongodb-client-encryption`](https://www.npmjs.com/package/mongodb-client-encryption) package:

```sh
npm install mongodb-client-encryption
```

### Prebuilds and manual compilation

`mongodb-client-encryption` has dependencies on the `libbson` and `libmongocrypt` C libraries, and requires C++ to be compiled. We have leveraged the [`prebuild`](https://www.npmjs.com/package/prebuild) package to pre-compile the project in advance, so that in most cases, you should be able to automatically install a pre-built version of `mongodb-client-encryption` when running `npm install`. However, if you are running on an architecture we have not created a prebuild for, or if you need to install without network access to github.com, you will need to manually build and compile these dependencies. Follow the instructions [here](https://github.com/mongodb/libmongocrypt/blob/master/README.md#building-libmongocrypt) for more information.


### mongocryptd configuration

`libmongocrypt` requires the `mongocryptd` daemon / process to be running. A specific daemon / process uri can be configured in the
`autoEncryption` options by setting `mongocryptdURI` in the `extraOptions`.

More information about mongocryptd will soon be available from the official documentation.

## Examples

The following is a sample app that assumes the **key** and **schema** have already been created in MongoDB. The example uses a local key,
however using AWS Key Management Service is also an option. The data in the `encryptedField` field is automatically encrypted on the
insert and decrypted when using find on the client side.

```js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// This would have to be the same master key as was used to create the encryption key
const localMasterKey = crypto.randomBytes(96);

const autoEncryption = {
  keyVaultNamespace: 'admin.datakeys',
  kmsProviders: {
    local: {
      key: localMasterKey
    }
  }
};

const URL = 'mongodb://localhost:27017';
const client = new MongoClient(URL, { autoEncryption, useUnifiedTopology: true });

main();

async function main() {
  try {
    await client.connect();

    const db = mongoClient.db('test');
    await db.dropCollection('coll');

    const collection = db.collection('coll');
    await collection.insertOne({ encryptedField: '123456789' });
    const result = await collection.findOne({});
    console.log(result);
  } finally {
    await client.close();
  }
}
```

{{% note %}}
Auto encryption is an **enterprise** only feature.
{{% /note %}}

The following example shows how to leverage a `ClientEncryption` instance to create a new key and use that key in the json schema map.

```js
const mongodb = require('mongodb');
const { MongoClient } = mongodb;

// Note: you need to inject the mongodb library you are using to get the classes within
// mongodb-client-encryption
const { ClientEncryption } = require('mongodb-client-encryption')(mongodb);

const crypto = require('crypto');

const keyVaultNamespace = 'admin.datakeys';
// This would have to be the same master key as was used to create the encryption key
const localMasterKey = crypto.randomBytes(96);
const kmsProviders = { local: { key: localMasterKey } };

const URL = 'mongodb://localhost:27017';

main();

async function main() {
  const unencryptedClient = new MongoClient(URL, { useUnifiedTopology: true });
  try {
    await unencryptedClient.connect();
    const clientEncryption = new ClientEncryption(unencryptedClient, { kmsProviders, keyVaultNamespace });

    const dataKeyId = await clientEncryption.createDataKey('local');

    const dbName = 'test';
    const collName = 'coll';

    const schemaMap = {
      [`${dbName}.${collName}`]: {
        properties: {
          encryptedField: {
            encrypt: {
              keyId: [ dataKeyId ],
              bsonType: 'string',
              algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            }
          }
        }
      }
    };

    const encryptedClient = new MongoClient(URL, {
      useUnifiedTopology: true,
      autoEncryption: {
        keyVaultNamespace,
        kmsProviders,
        schemaMap
      }
    });
    try {
      await encryptedClient.connect();
      // Do stuff here
    } finally {
      await encryptedClient.close();
    }
  } finally {
    await unencryptedClient.close();
  }
}
```

**Coming soon:** An example using the community version and demonstrating explicit encryption/decryption.
