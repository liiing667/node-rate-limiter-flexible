const RateLimiterAbstract = require('./RateLimiterAbstract');
const MemoryStorage = require('./component/MemoryStorage/MemoryStorage');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMemory extends RateLimiterAbstract {
  constructor(opts = {}) {
    super(opts);

    this._memoryStorage = new MemoryStorage();
    /**
     * Blocked keys: rlKey => expiresAt timestamp in ms (null = blocked forever)
     * @type {Map<string, number|null>}
     * @private
     */
    this._blockedKeys = new Map();
  }

  /**
   * Mark key as blocked for msDuration milliseconds (msDuration <= 0 blocks forever)
   *
   * @param rlKey
   * @param msDuration
   * @private
   */
  _blockKey(rlKey, msDuration) {
    this._blockedKeys.set(rlKey, msDuration > 0 ? Date.now() + msDuration : null);
    if (this._blockedKeys.size > 999) {
      this._collectExpiredBlockedKeys();
    }
  }

  _collectExpiredBlockedKeys() {
    const now = Date.now();
    this._blockedKeys.forEach((expiresAt, rlKey) => {
      if (expiresAt !== null && expiresAt <= now) {
        this._blockedKeys.delete(rlKey);
      }
    });
  }

  /**
   * RateLimiterRes of the blocked record if the key is currently blocked, null otherwise.
   * A blocked record is immutable until the block expires or the key is deleted:
   * consume is rejected without consuming points and neither penalty nor reward can change it
   *
   * @param rlKey
   * @returns {RateLimiterRes|null}
   * @private
   */
  _getBlockedRes(rlKey) {
    const expiresAt = this._blockedKeys.get(rlKey);
    if (typeof expiresAt === 'undefined') {
      return null;
    }
    if (expiresAt !== null && expiresAt <= Date.now()) {
      this._blockedKeys.delete(rlKey);
      return null;
    }
    const res = this._memoryStorage.get(rlKey);
    if (res === null || (res.msBeforeNext !== -1 && res.msBeforeNext <= 0)) {
      // Blocked record is already gone or expired
      this._blockedKeys.delete(rlKey);
      return null;
    }
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    return res;
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @param {Object} options
   * @returns {Promise<RateLimiterRes>}
   */
  consume(key, pointsToConsume = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);
      const secDuration = this._getKeySecDuration(options);

      const blockedRes = this._getBlockedRes(rlKey);
      if (blockedRes !== null) {
        // Reject without consuming points, so the blocked record stays intact
        reject(blockedRes);
        return;
      }

      let res = this._memoryStorage.incrby(rlKey, pointsToConsume, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);

      if (res.consumedPoints > this.points) {
        // Block only first time when consumed more than points
        if (this.blockDuration > 0 && res.consumedPoints <= (this.points + pointsToConsume)) {
          // Block key
          res = this._memoryStorage.set(rlKey, res.consumedPoints, this.blockDuration);
          this._blockKey(rlKey, this.msBlockDuration);
        }
        reject(res);
      } else if (this.execEvenly && this.points > 0 && res.msBeforeNext > 0 && !res.isFirstInDuration) {
        // Execute evenly
        let delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
        if (delay < this.execEvenlyMinDelayMs) {
          delay = res.consumedPoints * this.execEvenlyMinDelayMs;
        }
        // Adjust msBeforeNext to reflect time already waited before resolving
        res.msBeforeNext = Math.max(res.msBeforeNext - delay, 0);

        setTimeout(resolve, delay, res);
      } else {
        resolve(res);
      }
    });
  }

  penalty(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const blockedRes = this._getBlockedRes(rlKey);
      if (blockedRes !== null) {
        // Penalty cannot change a blocked record
        resolve(blockedRes);
        return;
      }
      const secDuration = this._getKeySecDuration(options);
      const res = this._memoryStorage.incrby(rlKey, points, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      resolve(res);
    });
  }

  reward(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const blockedRes = this._getBlockedRes(rlKey);
      if (blockedRes !== null) {
        // Reward cannot lift a block
        resolve(blockedRes);
        return;
      }
      const secDuration = this._getKeySecDuration(options);
      const res = this._memoryStorage.incrby(rlKey, -points, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      resolve(res);
    });
  }

  /**
   * Block any key for secDuration seconds
   *
   * @param key
   * @param secDuration
   */
  block(key, secDuration) {
    const msDuration = secDuration * 1000;
    const initPoints = this.points + 1;
    const rlKey = this.getKey(key);

    this._memoryStorage.set(rlKey, initPoints, secDuration);
    this._blockKey(rlKey, msDuration);
    return Promise.resolve(
      new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, initPoints)
    );
  }

  set(key, points, secDuration) {
    const msDuration = (secDuration >= 0 ? secDuration : this.duration) * 1000;
    const rlKey = this.getKey(key);

    this._memoryStorage.set(rlKey, points, secDuration);
    // Explicit set resets the key state, including its block
    this._blockedKeys.delete(rlKey);
    return Promise.resolve(
      new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, points)
    );
  }

  get(key) {
    const res = this._memoryStorage.get(this.getKey(key));
    if (res !== null) {
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    }

    return Promise.resolve(res);
  }

  delete(key) {
    this._blockedKeys.delete(this.getKey(key));
    return Promise.resolve(this._memoryStorage.delete(this.getKey(key)));
  }

  dump() {
    const storage = [];
    for (const [key, record] of this._memoryStorage._storage) {
      storage.push({
        key: this.parseKey(key),
        value: record.value,
        expiresAt: record.expiresAt,
      });
    }

    return {
      version: 1,
      dumpedAt: Date.now(),
      storage,
    };
  }

  /**
   * Restores rate-limiter state from a previously dumped snapshot.
   *
   * Each entry is classified into one of three buckets:
   *  - **invalid**  – the item is not an object or has a malformed schema (bad key, value or expiry type).
   *  - **expired**  – the item has logically expired based on current timestamp.
   *  - **restored** – the item was valid and successfully loaded into storage.
   *
   * @param {Object}  data            - Snapshot produced by {@link dump}.
   * @param {boolean} [detailResponse=false] - When `true`, each bucket also
   *   carries a `keys` array listing every affected key.
   * @returns {{ invalid, expired, restored } | undefined} Summary counts (and
   *   optionally keys).  Returns `undefined` when `data` fails schema checks.
   */
  restore(data, detailResponse = false) {
    if (!data || typeof data !== 'object' || data.version !== 1) {
      return undefined;
    }

    const response = detailResponse
      ? {
        invalid: { count: 0, keys: [] },
        expired: { count: 0, keys: [] },
        restored: { count: 0, keys: [] },
      }
      : { invalid: 0, expired: 0, restored: 0 };

    /**
     * Increments the named bucket and, in detail mode, appends the key.
     * @param {'invalid'|'expired'|'restored'} bucket
     * @param {string|number} key
     */
    const record = (bucket, key) => {
      if (detailResponse) {
        response[bucket].count += 1;
        response[bucket].keys.push(key);
      } else {
        response[bucket] += 1;
      }
    };

    if (!Array.isArray(data.storage)) {
      return response;
    }

    for (const item of data.storage) {
      if (!item || typeof item !== 'object') {
        //in array if we don't get object we push N/A
        record('invalid', 'N/A');
        continue;
      }

      const isValidKey = typeof item.key === 'string' || typeof item.key === 'number';
      const isValidValue = Number.isFinite(item.value);
      const isValidExpiry = item.expiresAt === null || Number.isFinite(item.expiresAt);

      if (!isValidKey || !isValidValue || !isValidExpiry) {
        record('invalid', item.key);
        continue;
      }

      if (item.expiresAt !== null && item.expiresAt <= Date.now()) {
        record('expired', item.key);
        continue;
      }

      this._memoryStorage._restoreRecord(this.getKey(item.key), item.value, item.expiresAt);
      if (item.value > this.points && this.blockDuration > 0) {
        // Restored record holds more points than allowed, keep it blocked until it expires
        this._blockedKeys.set(this.getKey(item.key), item.expiresAt);
      }
      record('restored', item.key);
    }

    return response;
  }
}

module.exports = RateLimiterMemory;
