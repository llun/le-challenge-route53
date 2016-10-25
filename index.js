'use strict';

const dns = require('dns');
const fs = require('fs');
const {
  getZoneIDByName,
  route53CreatePayload,
  route53DeletePayload,
  changeResourceRecordSets
} = require('./lib/route53');

const {
  encrypt,
  mergeOptions
} = require('./lib/helpers');

const store = require('./lib/store');

const Challenge = module.exports;

const defaults = {
  debug: false,
  delay: 1000 * 10,
  acmeChallengeDns: '_acme-challenge.',
  AWSConfigFile: './config.json'
};

Challenge.create = function (options) {
  const opts = mergeOptions(defaults, options);

  // AWS authentication is loaded from config file if its path is provided and
  // the file exists.
  if(opts.AWSConfigFile && fs.existsSync(opts.AWSConfigFile)){
    // TODO: commented out while debugging
    // AWS.config.loadFromPath(opts.AWSConfigFile);
  }

  return {
    getOptions: function () {
      return Object.assign({}, defaults) ;
    },
    set: Challenge.set,
    get: Challenge.get,
    remove: Challenge.remove,
    loopback: Challenge.loopback,
    test: Challenge.test
  };
};

Challenge.set = function (opts, domain, token, keyAuthorization, cb) {
  const keyAuthDigest = encrypt(keyAuthorization);
  if (!token || !keyAuthorization) {
    console.warn("SANITY FAIL: missing challenge or keyAuthorization", domain, token, keyAuthorization);
  }
  return getZoneIDByName(domain)
    .then(id => {
      const params = route53CreatePayload(id, domain, keyAuthDigest);
      return changeResourceRecordSets(params)
        .then(() => store.setPayload(domain, {
          id,
          domain,
          value: keyAuthDigest
        }));
    })
    .then(() => {
      setTimeout(cb, opts.delay, null);
    })
    .catch(cb);
};
/* eslint-disable no-unused-vars */
Challenge.get = function (opts, domain, token, cb) { /* Not to be implemented */ };
Challenge.remove = function (opts, domain, token, cb) {
  store.getPayload(domain)
    .then(({id, domain, value}) => {
      const params = route53DeletePayload(id, domain, value);
      return changeResourceRecordSets(params);
    })
    .then(() => {
      cb(null);
    })
    .catch(cb);
};
Challenge.loopback = function (opts, domain, token, cb) {
  const challengeDomain = `${opts.acmeChallengeDns}${domain}`;
  dns.resolveTxt(challengeDomain, (err, records) => {
    if(err){
      cb(err);
    }
    const [[record]] = records;
    console.log(record);
    cb(null, record);
  });
};
/* eslint-enable no-unused-vars */
