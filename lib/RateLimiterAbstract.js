const {
  DEFAULT_KEY_PREFIX,
  MAX_KEY_LENGTH,
  buildStorageKey,
  parseStorageKey,
} = require('./helper/quotaKey');

module.exports = class RateLimiterAbstract {
  /**
   *
   * @param opts Object {
   *   points: <required>, // Number of points (must be a number, can be negative)
   *   duration: <required>, // Per seconds (must be a non-negative number, 0 = never expires)
   *   blockDuration: 0, // Block if consumed more than points in current duration for blockDuration seconds
   *   execEvenly: false, // Execute allowed actions evenly over duration
   *   execEvenlyMinDelayMs: duration * 1000 / points, // ms, works with execEvenly=true option
   *   keyPrefix: 'rlflx',
   * }
   */
  constructor(opts = {}) {
    this.points = opts.points;
    this.duration = opts.duration;
    this.blockDuration = opts.blockDuration;
    this.execEvenly = opts.execEvenly;
    this.execEvenlyMinDelayMs = opts.execEvenlyMinDelayMs;
    this.keyPrefix = opts.keyPrefix;
  }

  get points() {
    return this._points;
  }

  set points(value) {
    if (Number.isFinite(value)) {
      this._points = value;
    } else {
      throw new Error('points must be set and must be a finite number');
    }
  }

  get duration() {
    return this._duration;
  }

  set duration(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      this._duration = value;
    } else {
      throw new Error('duration must be set and must be a finite, non-negative number');
    }
  }

  get msDuration() {
    return this.duration * 1000;
  }

  get blockDuration() {
    return this._blockDuration;
  }

  set blockDuration(value) {
    this._blockDuration = typeof value === 'undefined' ? 0 : value;
  }

  get msBlockDuration() {
    return this.blockDuration * 1000;
  }

  get execEvenly() {
    return this._execEvenly;
  }

  set execEvenly(value) {
    this._execEvenly = typeof value === 'undefined' ? false : Boolean(value);
  }

  get execEvenlyMinDelayMs() {
    return this._execEvenlyMinDelayMs === undefined
      ? this._getExecEvenlyMinDelayMsDefault()
      : this._execEvenlyMinDelayMs;
  }

  set execEvenlyMinDelayMs(value) {
    this._execEvenlyMinDelayMs = value;
  }

  _getExecEvenlyMinDelayMsDefault() {
    return this.points > 0
      ? Math.ceil(this.msDuration / this.points)
      : 0;
  }

  get keyPrefix() {
    return this._keyPrefix;
  }

  set keyPrefix(value) {
    if (typeof value === 'undefined') {
      value = DEFAULT_KEY_PREFIX;
    }
    if (typeof value !== 'string') {
      throw new Error('keyPrefix must be string');
    }
    if (value.indexOf(':') !== -1) {
      throw new Error('keyPrefix must not contain ":" character');
    }
    this._keyPrefix = value;
  }

  /**
   * Maximum length of an application key accepted by {@link getKey}.
   * @returns {number}
   */
  static get MAX_KEY_LENGTH() {
    return MAX_KEY_LENGTH;
  }

  get MAX_KEY_LENGTH() {
    return MAX_KEY_LENGTH;
  }

  _getKeySecDuration(options = {}) {
    return options && options.customDuration >= 0
      ? options.customDuration
      : this.duration;
  }

  /**
   * Maps an application key to a collision-free storage key.
   * Plain keys keep the legacy `prefix:key` layout (existing data stays
   * readable); keys containing ':' are base64-encoded behind a `b64`
   * marker so the mapping is injective and fully reversible.
   *
   * @param {string|number} key
   * @returns {string}
   */
  getKey(key) {
    return buildStorageKey(this.keyPrefix, key);
  }

  /**
   * Inverse of {@link getKey}, including legacy plain storage keys.
   *
   * @param {string} rlKey
   * @returns {string}
   */
  parseKey(rlKey) {
    return parseStorageKey(this.keyPrefix, rlKey);
  }

  consume() {
    throw new Error("You have to implement the method 'consume'!");
  }

  penalty() {
    throw new Error("You have to implement the method 'penalty'!");
  }

  reward() {
    throw new Error("You have to implement the method 'reward'!");
  }

  get() {
    throw new Error("You have to implement the method 'get'!");
  }

  set() {
    throw new Error("You have to implement the method 'set'!");
  }

  block() {
    throw new Error("You have to implement the method 'block'!");
  }

  delete() {
    throw new Error("You have to implement the method 'delete'!");
  }
};
