/* eslint-disable security/detect-object-injection */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterStoreAbstract = require('../lib/RateLimiterStoreAbstract');
const RateLimiterAbstract = require('../lib/RateLimiterAbstract');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const RateLimiterRes = require('../lib/RateLimiterRes');

// Test implementation of RateLimiterStoreAbstract
class TestRateLimiterStoreMemory extends RateLimiterStoreAbstract {
  constructor(opts) {
    super(opts);
    this._inMemoryDataAsStorage = {};
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
    const result = this._inMemoryDataAsStorage[rlKey];
    return Promise.resolve(typeof result === 'undefined' ? null : result);
  }

  _delete(rlKey) {
    const value = this._inMemoryDataAsStorage[rlKey];
    if (typeof value === 'undefined') {
      return Promise.resolve(false);
    }
    delete this._inMemoryDataAsStorage[rlKey];
    return Promise.resolve(true);
  }

  _upsert(rlKey, points, msDuration) {
    const now = Date.now();
    const result = {
      points,
      msBeforeNext: msDuration,
    };

    if (typeof this._inMemoryDataAsStorage[rlKey] === 'undefined') {
      this._inMemoryDataAsStorage[rlKey] = {
        points,
        expired: now + msDuration,
      };
    } else {
      const value = this._inMemoryDataAsStorage[rlKey];
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

describe('RateLimiterInsuredAbstract - Backward Compatibility Tests', () => {
  describe('Without insuranceLimiter', () => {
    it('consume should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      // Simulate error by making _upsert throw
      const originalUpsert = rateLimiter._upsert;
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('penalty should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      const originalUpsert = rateLimiter._upsert;
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.penalty('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('reward should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.reward('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('get should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._get = () => Promise.reject(new Error('Store error'));

      rateLimiter.get('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('delete should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._delete = () => Promise.reject(new Error('Store error'));

      rateLimiter.delete('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('block should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.block('test-key', 5)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('set should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.set('test-key', 5, 10)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });
  });

  describe('With insuranceLimiter', () => {
    it('consume should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.remainingPoints).to.equal(4);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should not use insuranceLimiter when rate limit is reached', (done) => {
      const insuranceLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      const rateLimiterRes = new RateLimiterRes(6, 0, 5000, false);

      rateLimiter._upsert = () => Promise.reject(rateLimiterRes);

      rateLimiter.consume('test-key').then(() => {
        done(new Error('Should have rejected'));
      }).catch((err) => {
        expect(err).to.equal(rateLimiterRes);
        done();
      });

    });

    it('penalty should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.penalty('test-key', 2)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.consumedPoints).to.equal(2);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('reward should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some points
      insuranceLimiter.consume('test-key', 3)
        .catch(() => {});

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.reward('test-key', 1)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('get should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some data
      insuranceLimiter.consume('test-key')
        .catch(() => {});

      rateLimiter._get = () => Promise.reject(new Error('Store error'));

      rateLimiter.get('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('delete should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some data
      insuranceLimiter.consume('test-key')
        .catch(() => {});

      rateLimiter._delete = () => Promise.reject(new Error('Store error'));

      rateLimiter.delete('test-key')
        .then((res) => {
          expect(res).to.equal(true);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('block should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.block('test-key', 5)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('set should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.set('test-key', 5, 10)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should work normally when store succeeds (no fallback needed)', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.remainingPoints).to.equal(1);
          expect(res.consumedPoints).to.equal(1);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('insuranceLimiter should inherit blockDuration and execEvenly', () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
        blockDuration: 0,
        execEvenly: false,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        blockDuration: 10,
        execEvenly: true,
        insuranceLimiter,
      });

      expect(insuranceLimiter.blockDuration).to.equal(10);
      expect(insuranceLimiter.execEvenly).to.equal(true);
    });

    it('consume should NOT use insuranceLimiter when rate limit is exceeded (not enough points)', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 10,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // Track if insuranceLimiter.consume is called
      let insuranceConsumeCalled = false;
      const originalConsume = insuranceLimiter.consume;
      insuranceLimiter.consume = function(...args) {
        insuranceConsumeCalled = true;
        return originalConsume.apply(this, args);
      };

      // First consume to use up all points (points: 2, so consume 2 points)
      rateLimiter.consume('test-key', 2)
        .then(() => {
          // Second consume should exceed rate limit (now at 2 points, trying to consume 1 more = 3 > 2)
          return rateLimiter.consume('test-key');
        })
        .then(() => {
          done(new Error('Should have rejected when rate limit exceeded'));
        })
        .catch((err) => {
          // Should reject with RateLimiterRes (rate limit exceeded)
          expect(err).to.be.instanceOf(RateLimiterRes);
          expect(err.consumedPoints).to.be.greaterThan(rateLimiter.points);
          // Insurance limiter should NOT be called for rate limit exceeded
          expect(insuranceConsumeCalled).to.equal(false);
          done();
        });
    });
  });

  it('insuranceLimiter falls back to points + 1 blocking, blockOnConsumed is not copied', async () => {
    const insuranceLimiter = new RateLimiterMemory({
      points: 10,
      duration: 10,
    });

    const rateLimiter = new TestRateLimiterStoreMemory({
      points: 10,
      duration: 10,
      blockDuration: 60,
      blockOnConsumed: 15,
      insuranceLimiter,
    });

    rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

    expect(insuranceLimiter.blockOnConsumed).to.equal(undefined);

    for (let i = 0; i < 10; i++) {
      await rateLimiter.consume('test-key'); // eslint-disable-line no-await-in-loop
    }

    let rejection = null;
    try {
      await rateLimiter.consume('test-key');
    } catch (err) {
      rejection = err;
    }

    expect(rejection).to.be.instanceOf(RateLimiterRes);
    expect(rejection.consumedPoints).to.equal(11);
    expect(rejection.msBeforeNext).to.equal(60000);
  });

  describe('fail-open / fail-closed contract', () => {
    it('rejects with the store error by default (fail-closed) without insuranceLimiter', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err).to.not.be.instanceOf(RateLimiterRes);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('failOpen=true resolves consume with an unlimited result when no insuranceLimiter is set', async () => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        failOpen: true,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      const res = await rateLimiter.consume('test-key');
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.remainingPoints).to.equal(Number.MAX_SAFE_INTEGER);
      expect(res.consumedPoints).to.equal(0);
    });

    it('failOpen=true resolves get() with null and delete() with false', async () => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        failOpen: true,
      });
      rateLimiter._get = () => Promise.reject(new Error('Store error'));
      rateLimiter._delete = () => Promise.reject(new Error('Store error'));

      expect(await rateLimiter.get('test-key')).to.equal(null);
      expect(await rateLimiter.delete('test-key')).to.equal(false);
    });

    it('failOpen=true never overrides an ordinary rate limit denial', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 1,
        duration: 1,
        failOpen: true,
      });

      rateLimiter.consume('test-key')
        .then(() => rateLimiter.consume('test-key'))
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(RateLimiterRes);
          expect(err.consumedPoints).to.be.greaterThan(rateLimiter.points);
          done();
        });
    });

    it('throws when failOpen is not a boolean', () => {
      expect(() => new TestRateLimiterStoreMemory({
        points: 1,
        duration: 1,
        failOpen: 'yes',
      })).to.throw('failOpen must be a boolean');
    });

    it('failOpen can be changed at runtime', async () => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      try {
        await rateLimiter.consume('test-key');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
      }

      rateLimiter.failOpen = true;
      const res = await rateLimiter.consume('test-key');
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.remainingPoints).to.equal(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('cancellable failure state', () => {
    it('marks the store as failed with the original error on a system error', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .catch(() => {
          expect(rateLimiter.isStoreFailed()).to.equal(true);
          expect(rateLimiter.getStoreFailureError()).to.be.instanceOf(Error);
          expect(rateLimiter.getStoreFailureError().message).to.equal('Store error');
          done();
        });
    });

    it('never marks the store as failed on an ordinary RateLimiterRes rejection', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 1,
        duration: 1,
      });

      rateLimiter.consume('test-key')
        .then(() => rateLimiter.consume('test-key'))
        .catch(() => {
          expect(rateLimiter.isStoreFailed()).to.equal(false);
          expect(rateLimiter.getStoreFailureError()).to.equal(null);
          done();
        });
    });

    it('clearStoreFailure() cancels the failure state manually', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .catch(() => {
          expect(rateLimiter.isStoreFailed()).to.equal(true);
          rateLimiter.clearStoreFailure();
          expect(rateLimiter.isStoreFailed()).to.equal(false);
          expect(rateLimiter.getStoreFailureError()).to.equal(null);
          done();
        });
    });

    it('cancels the failure state automatically after a successful consume', async () => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      try {
        await rateLimiter.consume('test-key');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
      }
      expect(rateLimiter.isStoreFailed()).to.equal(true);

      rateLimiter._upsert = TestRateLimiterStoreMemory.prototype._upsert;
      await rateLimiter.consume('other-key');
      expect(rateLimiter.isStoreFailed()).to.equal(false);
    });

    it('cancels the failure state automatically after a successful get()', async () => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });
      rateLimiter._get = () => Promise.reject(new Error('Store error'));

      try {
        await rateLimiter.get('test-key');
      } catch (err) {
        expect(err).to.be.instanceOf(Error);
      }
      expect(rateLimiter.isStoreFailed()).to.equal(true);

      rateLimiter._get = TestRateLimiterStoreMemory.prototype._get;
      await rateLimiter.get('test-key');
      expect(rateLimiter.isStoreFailed()).to.equal(false);
    });
  });

  describe('joint validation of operation params against insurance policy', () => {
    it('rejects (fail-closed) when requested points exceed insuranceLimiter points', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 3,
        duration: 1,
      });
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 10,
        duration: 1,
        insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key', 5)
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.contain('exceeds insuranceLimiter');
          done();
        });
    });

    it('fail-open applies when params cannot be served by the insurance policy', async () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 3,
        duration: 1,
      });
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 10,
        duration: 1,
        insuranceLimiter,
        failOpen: true,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      const res = await rateLimiter.consume('test-key', 5);
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.remainingPoints).to.equal(Number.MAX_SAFE_INTEGER);
    });

    it('does not reject when requested points fit the insurance policy', async () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 10,
        duration: 1,
        insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      const res = await rateLimiter.consume('test-key', 5);
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.consumedPoints).to.equal(5);
    });

    it('fail-closed when insuranceLimiter does not implement the requested method', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });
      insuranceLimiter.block = undefined;
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.block('test-key', 5)
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.contain('does not implement block');
          done();
        });
    });
  });

  describe('insurance limiter failure handling', () => {
    it('keeps an ordinary insurance denial as a RateLimiterRes rejection even with failOpen', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 1,
        duration: 1,
      });
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 10,
        duration: 1,
        insuranceLimiter,
        failOpen: true,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then(() => rateLimiter.consume('test-key'))
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(RateLimiterRes);
          done();
        });
    });

    it('fail-closed with the insurance system error when both layers fail', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });
      insuranceLimiter.consume = () => Promise.reject(new Error('Insurance boom'));
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then(() => done(new Error('Should have rejected')))
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Insurance boom');
          done();
        });
    });

    it('fail-open when both the store and the insurance limiter fail with system errors', async () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });
      insuranceLimiter.consume = () => Promise.reject(new Error('Insurance boom'));
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
        failOpen: true,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      const res = await rateLimiter.consume('test-key');
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(res.remainingPoints).to.equal(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('healthy main store path', () => {
    it('never invokes the insuranceLimiter and keeps no failure state', async () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 1,
      });
      let insuranceCalls = 0;
      const originalConsume = insuranceLimiter.consume;
      insuranceLimiter.consume = (...args) => {
        insuranceCalls += 1;
        return originalConsume.apply(insuranceLimiter, args);
      };

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 5,
        duration: 1,
        insuranceLimiter,
      });

      const res = await rateLimiter.consume('test-key');
      expect(res).to.be.instanceOf(RateLimiterRes);
      expect(insuranceCalls).to.equal(0);
      expect(rateLimiter.isStoreFailed()).to.equal(false);
    });
  });
});
