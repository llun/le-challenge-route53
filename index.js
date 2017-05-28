'use strict';

const fs = require('fs');
const {
  changeResourceRecordSets,
  getChange,
  getZoneIDByName,
  route53Config,
  route53CreatePayload,
  route53DeletePayload,
} = require('./lib/route53');

const {
  encrypt,
  getChallengeDomain,
  mergeOptions
} = require('./lib/helpers');

const store = require('./lib/store');

const Challenge = module.exports;

const defaults = {
  debug: false,
  delay: 2e4,
  acmeChallengeDns: '_acme-challenge.'
};

Challenge.create = function (options) {
  const opts = mergeOptions(defaults, options);

  // AWS authentication is loaded from config file if its path is provided and
  // the file exists.
  if(opts.AWSConfigFile && fs.existsSync(opts.AWSConfigFile)){
    route53Config.loadFromPath(opts.AWSConfigFile);
  }

  return {
    getOptions: function () {
      return Object.assign({}, defaults);
    },
    set: Challenge.set,
    get: Challenge.get,
    remove: Challenge.remove
  };
};

Challenge.set = function (opts, domain, token, keyAuthorization, cb) {
  const keyAuthDigest = encrypt(keyAuthorization);
  const prefixedDomain = getChallengeDomain(opts.acmeChallengeDns, domain);
  return getZoneIDByName(domain).then(id => {
      const params = route53CreatePayload(id, prefixedDomain, keyAuthDigest);
      console.log('route53', prefixedDomain, keyAuthDigest)
      return changeResourceRecordSets(params)
        .then((change) => {
          store.set(domain, {
            id,
            domain,
            value: keyAuthDigest
          })
          return change
        })
    })
    .then((change) => {
      console.log(change)
      let interval = setInterval(() => {
        getChange(change.ChangeInfo.Id)
          .then(result => {
            if (result.ChangeInfo.Status === 'INSYNC') {
              clearInterval(interval)
              cb()
            }
          })
      }, 2000)
    })
    .catch(cb);
};

/* eslint-disable no-unused-vars */
Challenge.get = function (opts, domain, token, cb) { /* Not to be implemented */ };
/* eslint-enable no-unused-vars */

Challenge.remove = function (opts, domain, token, cb) {
  store.get(domain)
    .then(({id, domain, value}) => {
      const prefixedDomain = getChallengeDomain(opts.acmeChallengeDns, domain);
      const params = route53DeletePayload(id, prefixedDomain, value);
      return changeResourceRecordSets(params)
        .then(() => store.remove(domain));
    })
    .then(() => {
      cb(null);
    })
    .catch(cb);
};
