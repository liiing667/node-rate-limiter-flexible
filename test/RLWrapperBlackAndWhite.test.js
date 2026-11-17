const { describe, it } = require('mocha');
const { expect } = require('chai');
const RLWrapperBlackAndWhite = require('../lib/RLWrapperBlackAndWhite');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const RateLimiterRes = require('../lib/RateLimiterRes');
const RateLimiterStoreAbstract = require('../lib/RateLimiterStoreAbstract');

class TestStoreLimiter extends RateLimiterStoreAbstract {
  constructor(opts) {
    super(opts);
    this._data = {};
  }

  _getRateLimiterRes(rlKey, changedPoints, storeResult) {
    const res = new RateLimiterRes();
    res.consumedPoints = storeResult.points;
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = storeResult.msBeforeNext;
    return res;
  }

  _get(rlKey) {
    return Promise.resolve(this._data[rlKey] === undefined ? null : this._data[rlKey]);
  }

  _delete(rlKey) {
    if (this._data[rlKey] === undefined) {
      return Promise.resolve(false);
    }
    delete this._data[rlKey];
    return Promise.resolve(true);
  }

  _upsert(rlKey, points, msDuration) {
    const now = Date.now();
    const result = { points, msBeforeNext: msDuration };
    if (this._data[rlKey] === undefined) {
      this._data[rlKey] = { points, expired: now + msDuration };
    } else {
      const value = this._data[rlKey];
      if (value.expired > now) {
        value.points += points;
        result.points = value.points;
        result.msBeforeNext = value.expired - now;
      } else {
        value.points = points;
        value.expired = now + msDuration;
      }
    }
    return Promise.resolve(result);
  }
}

class FailingStoreLimiter extends TestStoreLimiter {
  constructor(opts) {
    super(opts);
    this._failing = true;
  }

  _upsert(rlKey, points, msDuration, forceExpire, options) {
    if (this._failing) {
      return Promise.reject(new Error('Store error'));
    }
    return super._upsert(rlKey, points, msDuration, forceExpire, options);
  }
}

describe('RLWrapperBlackAndWhite ', () => {
  it('consume if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === 0 && res.consumedPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('rejected on consume if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .consume('blacked')
      .then(() => {
        done(Error('must not consume'));
      })
      .catch((rej) => {
        expect(rej.remainingPoints === 0 && rej.consumedPoints === 0).to.equal(true);
        done();
      });
  });

  it('block if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .block('test', 30)
      .then((res) => {
        expect(res.msBeforeNext > 1000 && res.msBeforeNext <= 30000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('block resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .block('blacked', 30)
      .then((res) => {
        expect(res.msBeforeNext > 30000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 2,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .penalty('test', 1)
      .then((res) => {
        expect(res.consumedPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .penalty('blacked', 1)
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reward if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped.consume('test').then(() => {
      limiterWrapped
        .reward('test', 1)
        .then((res) => {
          expect(res.consumedPoints === 0).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });

  it('reward resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .reward('blacked', 1)
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('get if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped.consume('test').then(() => {
      limiterWrapped
        .get('test')
        .then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });

  it('get resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .get('blacked')
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('set if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 2,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .set('test', 1, 30)
      .then((res) => {
        expect(res.consumedPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('set resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .set('blacked', 1, 30)
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve consume if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .consume('white', 3)
      .then((res) => {
        expect(res.consumedPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve block if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .block('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve penalty if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .penalty('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve reward if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .reward('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve get if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .get('white')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve set if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .set('white', 1, 30)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume resolved if in white and in black', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['test'],
      blackList: ['test'],
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume resolved if isWhiteListed func returns true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isWhiteListed: key => key === 'test',
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume rejected if isBlackListed func returns true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
    });
    limiterWrapped
      .consume('test')
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej.msBeforeNext === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      });
  });

  it('consume even if black listed when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .consume('test')
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        });
      });
  });

  it('block even if black listed when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .block('test', 30)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.msBeforeNext > 1000).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty even if blacked when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .penalty('test', 1)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reward even if blacked when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .reward('test', 1)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === -1).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('set even if blacked when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 2,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .set('test', 1, 30)
      .then(() => {
        limiter.get('test').then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('delete data straight on limiter even if key is black or white listed', (done) => {
    const testKey = 'test';
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === testKey,
      isWhiteListed: key => key === testKey,
    });
    limiter.consume(testKey)
      .then(() => {
        limiterWrapped.delete(testKey)
          .then((res) => {
            expect(res).to.equal(true);
            done();
          });
      });
  });

  describe('options forwarding', () => {
    it('consume forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalConsume = limiter.consume.bind(limiter);
      limiter.consume = (key, points, options) => {
        receivedOptions = options;
        return originalConsume(key, points, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customDuration: 2 };

      limiterWrapped.consume('test', 1, options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('penalty forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalPenalty = limiter.penalty.bind(limiter);
      limiter.penalty = (key, points, options) => {
        receivedOptions = options;
        return originalPenalty(key, points, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customDuration: 2 };

      limiterWrapped.penalty('test', 1, options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('reward forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalReward = limiter.reward.bind(limiter);
      limiter.reward = (key, points, options) => {
        receivedOptions = options;
        return originalReward(key, points, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customDuration: 2 };

      limiterWrapped.reward('test', 1, options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('get forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalGet = limiter.get.bind(limiter);
      limiter.get = (key, options) => {
        receivedOptions = options;
        return originalGet(key, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customOption: 'test' };

      limiterWrapped.get('test', options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('set forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalSet = limiter.set.bind(limiter);
      limiter.set = (key, points, secDuration, options) => {
        receivedOptions = options;
        return originalSet(key, points, secDuration, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customOption: 'test' };

      limiterWrapped.set('test', 1, 30, options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('block forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalBlock = limiter.block.bind(limiter);
      limiter.block = (key, secDuration, options) => {
        receivedOptions = options;
        return originalBlock(key, secDuration, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customOption: 'test' };

      limiterWrapped.block('test', 30, options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('delete forwards options to inner limiter', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalDelete = limiter.delete.bind(limiter);
      limiter.delete = (key, options) => {
        receivedOptions = options;
        return originalDelete(key, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({ limiter });
      const options = { customOption: 'test' };

      limiterWrapped.delete('test', options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });

    it('consume forwards options with runActionAnyway', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalConsume = limiter.consume.bind(limiter);
      limiter.consume = (key, points, options) => {
        receivedOptions = options;
        return originalConsume(key, points, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({
        limiter,
        blackList: ['blacked'],
        runActionAnyway: true,
      });
      const options = { customDuration: 2 };

      limiterWrapped.consume('blacked', 1, options)
        .catch(() => {
          setTimeout(() => {
            expect(receivedOptions).to.deep.equal(options);
            done();
          }, 10);
        });
    });

    it('get forwards options with runActionAnyway', (done) => {
      let receivedOptions = null;
      const limiter = new RateLimiterMemory({
        points: 5,
        duration: 10,
      });
      const originalGet = limiter.get.bind(limiter);
      limiter.get = (key, options) => {
        receivedOptions = options;
        return originalGet(key, options);
      };

      const limiterWrapped = new RLWrapperBlackAndWhite({
        limiter,
        runActionAnyway: true,
      });
      const options = { customOption: 'test' };

      limiterWrapped.get('test', options)
        .then(() => {
          expect(receivedOptions).to.deep.equal(options);
          done();
        })
        .catch((err) => done(err));
    });
  });

  describe('insurance fail-open / fail-closed contract', () => {
    it('falls back through the wrapped insurance limiter and records the store failure', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      const rateLimiter = new FailingStoreLimiter({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res.remainingPoints).to.equal(4);
          expect(rateLimiter.isStoreFailed()).to.equal(true);
          done();
        })
        .catch((err) => done(err));
    });

    it('fail-open resolves with an unlimited result when the wrapped insurance also fails', async () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      innerLimiter.consume = () => Promise.reject(new Error('Insurance boom'));
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      const rateLimiter = new FailingStoreLimiter({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
        failOpen: true,
      });

      const res = await rateLimiter.consume('test-key');
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.remainingPoints).to.equal(Number.MAX_SAFE_INTEGER);
    });

    it('a black-list denial from the wrapped insurance stays a denial even with failOpen', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({
        limiter: innerLimiter,
        blackList: ['blocked-key'],
      });
      const rateLimiter = new FailingStoreLimiter({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
        failOpen: true,
      });

      rateLimiter.consume('blocked-key')
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(RateLimiterRes);
          done();
        });
    });

    it('cancels the failure state once the main store recovers', async () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      const rateLimiter = new FailingStoreLimiter({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      await rateLimiter.consume('test-key');
      expect(rateLimiter.isStoreFailed()).to.equal(true);

      rateLimiter._failing = false;
      await rateLimiter.consume('test-key');
      expect(rateLimiter.isStoreFailed()).to.equal(false);
    });
  });
});
