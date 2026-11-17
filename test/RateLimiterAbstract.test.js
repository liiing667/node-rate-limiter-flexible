const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterAbstract = require('../lib/RateLimiterAbstract');

describe('RateLimiterAbstract', function () {
  this.timeout(5000);

  it('do not prefix key, if keyPrefix is empty string', () => {
    const testKey = 'test1';
    const rateLimiter = new RateLimiterAbstract({ keyPrefix: '', points: 4, duration: 1 });
    expect(rateLimiter.getKey(testKey)).to.equal(testKey);
  });

  it('accepts number as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 10, duration: 1 });
    expect(rateLimiter.points).to.equal(10);
  });

  it('accepts zero as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 0, duration: 1 });
    expect(rateLimiter.points).to.equal(0);
  });

  it('accepts negative number as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: -5, duration: 1 });
    expect(rateLimiter.points).to.equal(-5);
  });

  it('throws error if points is not set', () => {
    expect(() => {
      new RateLimiterAbstract({ duration: 1 });
    }).to.throw('points must be set and must be a finite number');
  });

  it('throws error if points is null', () => {
    expect(() => {
      new RateLimiterAbstract({ points: null, duration: 1 });
    }).to.throw('points must be set and must be a finite number');
  });

  it('throws error if points is a string', () => {
    expect(() => {
      new RateLimiterAbstract({ points: '10', duration: 1 });
    }).to.throw('points must be set and must be a finite number');
  });

  it('throws error if points is an object', () => {
    expect(() => {
      new RateLimiterAbstract({ points: {}, duration: 1 });
    }).to.throw('points must be set and must be a finite number');
  });

  it('throws error if points is a boolean', () => {
    expect(() => {
      new RateLimiterAbstract({ points: true, duration: 1 });
    }).to.throw('points must be set and must be a finite number');
  });

  it('accepts positive number as duration value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 5 });
    expect(rateLimiter.duration).to.equal(5);
  });

  it('accepts zero as duration value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 0 });
    expect(rateLimiter.duration).to.equal(0);
  });

  it('throws error if duration is not set', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4 });
    }).to.throw('duration must be set and must be a finite, non-negative number');
  });

  it('throws error if duration is negative', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: -1 });
    }).to.throw('duration must be set and must be a finite, non-negative number');
  });

  it('throws error if duration is null', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: null });
    }).to.throw('duration must be set and must be a finite, non-negative number');
  });

  it('throws error if duration is a string', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: '5' });
    }).to.throw('duration must be set and must be a finite, non-negative number');
  });

  it('throws error if duration is an object', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: {} });
    }).to.throw('duration must be set and must be a finite, non-negative number');
  });

  describe('execEvenlyMinDelayMs', () => {
    it('re-derives from points after points is mutated', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 1, duration: 1 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(1000);
      rateLimiter.points = 10;
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(100);
    });

    it('re-derives from duration after duration is mutated', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 10, duration: 1 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(100);
      rateLimiter.duration = 5;
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(500);
    });

    it('keeps explicit value after points is mutated', () => {
      const rateLimiter = new RateLimiterAbstract({
        points: 10, duration: 1, execEvenlyMinDelayMs: 42,
      });
      rateLimiter.points = 100;
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(42);
    });

    it('returns to derived value when explicit value is reset to undefined', () => {
      const rateLimiter = new RateLimiterAbstract({
        points: 10, duration: 1, execEvenlyMinDelayMs: 42,
      });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(42);

      rateLimiter.execEvenlyMinDelayMs = undefined;
      rateLimiter.points = 20;
      rateLimiter.duration = 2;

      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(100);
    });

    it('returns zero when points is zero in auto mode', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 0, duration: 5 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(0);
    });

    it('returns zero when points is negative in auto mode', () => {
      const rateLimiter = new RateLimiterAbstract({ points: -5, duration: 5 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(0);
    });

    it('returns zero after points is mutated to zero in auto mode', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 10, duration: 1 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(100);

      rateLimiter.points = 0;

      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(0);
    });

    it('returns zero when duration is zero in auto mode', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 10, duration: 0 });
      expect(rateLimiter.execEvenlyMinDelayMs).to.equal(0);
    });
  });

  describe('parseKey', () => {
    it('removes default keyPrefix and colon from key', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      const rlKey = rateLimiter.getKey('test-key');
      expect(rlKey).to.equal('rlflx:test-key');
      expect(rateLimiter.parseKey(rlKey)).to.equal('test-key');
    });

    it('removes custom keyPrefix and colon from key', () => {
      const rateLimiter = new RateLimiterAbstract({ keyPrefix: 'custom', points: 4, duration: 1 });
      const rlKey = rateLimiter.getKey('test-key');
      expect(rlKey).to.equal('custom:test-key');
      expect(rateLimiter.parseKey(rlKey)).to.equal('test-key');
    });

    it('returns key as-is when keyPrefix is empty', () => {
      const rateLimiter = new RateLimiterAbstract({ keyPrefix: '', points: 4, duration: 1 });
      const rlKey = rateLimiter.getKey('test-key');
      // When keyPrefix is empty, getKey returns the key as-is (no colon added)
      expect(rlKey).to.equal('test-key');
      // parseKey with empty prefix returns the key as-is
      expect(rateLimiter.parseKey(rlKey)).to.equal('test-key');
    });

    it('encodes key with colon behind a b64 marker and parses it back', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      const rlKey = rateLimiter.getKey('user:123:action');
      expect(rlKey).to.equal(`rlflx:b64:${Buffer.from('user:123:action', 'utf8').toString('base64')}`);
      expect(rateLimiter.parseKey(rlKey)).to.equal('user:123:action');
    });

    it('encodes key with colon when keyPrefix is empty and parses it back', () => {
      const rateLimiter = new RateLimiterAbstract({ keyPrefix: '', points: 4, duration: 1 });
      const rlKey = rateLimiter.getKey('tenant:user');
      expect(rlKey).to.equal(`b64:${Buffer.from('tenant:user', 'utf8').toString('base64')}`);
      expect(rateLimiter.parseKey(rlKey)).to.equal('tenant:user');
    });

    it('round-trips arbitrary keys, including colons and unicode', () => {
      const rateLimiter = new RateLimiterAbstract({ keyPrefix: 'custom', points: 4, duration: 1 });
      ['plain', 'a:b', 'a:b:c:', ':', '日本語:キー'].forEach((key) => {
        expect(rateLimiter.parseKey(rateLimiter.getKey(key))).to.equal(key);
      });
    });

    it('keeps plain keys collision-free against encoded keys', () => {
      const rateLimiter = new RateLimiterAbstract({ keyPrefix: 'p', points: 4, duration: 1 });
      const colonKey = 'a:b';
      const encoded = rateLimiter.getKey(colonKey);
      // A plain key that literally resembles the encoded layout stays plain,
      // because the raw key contains no ':' of its own.
      const plainLookalike = encoded.substring('p:'.length);
      expect(rateLimiter.getKey(plainLookalike)).to.not.equal(encoded);
      expect(rateLimiter.parseKey(rateLimiter.getKey(plainLookalike))).to.equal(plainLookalike);
    });

    it('keeps two prefixes collision-free when keys contain separators', () => {
      const limiterA = new RateLimiterAbstract({ keyPrefix: 'a', points: 4, duration: 1 });
      const limiterB = new RateLimiterAbstract({ keyPrefix: 'b', points: 4, duration: 1 });
      expect(limiterA.getKey('x:y')).to.not.equal(limiterB.getKey('x:y'));
      // Cross-decoding must never yield a valid key of the other limiter.
      expect(limiterA.getKey('b:x')).to.not.equal(limiterB.getKey('x'));
    });

    it('parses legacy plain storage keys, including keys containing colons', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      const legacyKey = 'rlflx:legacy:tenant:user';
      expect(rateLimiter.parseKey(legacyKey)).to.equal('legacy:tenant:user');
    });

    it('parses correctly when a legacy keyPrefix itself contains a colon', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      rateLimiter._keyPrefix = 'legacy:prefix';
      const legacyStorageKey = 'legacy:prefix:tenant:user';
      expect(rateLimiter.parseKey(legacyStorageKey)).to.equal('tenant:user');
    });
  });

  describe('key validation', () => {
    it('throws on empty string key', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      expect(() => rateLimiter.getKey('')).to.throw('key must be a non-empty string or number');
    });

    it('throws on null and undefined keys', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      expect(() => rateLimiter.getKey(null)).to.throw();
      expect(() => rateLimiter.getKey(undefined)).to.throw();
    });

    it('accepts finite numeric keys', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      expect(rateLimiter.getKey(123)).to.equal('rlflx:123');
      expect(rateLimiter.parseKey(rateLimiter.getKey(123))).to.equal('123');
    });

    it('rejects non-finite numeric keys', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      expect(() => rateLimiter.getKey(NaN)).to.throw();
      expect(() => rateLimiter.getKey(Infinity)).to.throw();
    });

    it('throws when key exceeds MAX_KEY_LENGTH', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      const longKey = 'a'.repeat(rateLimiter.MAX_KEY_LENGTH + 1);
      expect(() => rateLimiter.getKey(longKey))
        .to.throw(`key length must not exceed ${rateLimiter.MAX_KEY_LENGTH} characters`);
    });

    it('accepts a key exactly at MAX_KEY_LENGTH', () => {
      const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 1 });
      const maxKey = 'a'.repeat(rateLimiter.MAX_KEY_LENGTH);
      expect(() => rateLimiter.getKey(maxKey)).to.not.throw();
    });

    it('rejects a keyPrefix containing the colon delimiter', () => {
      expect(() => new RateLimiterAbstract({ keyPrefix: 'a:b', points: 4, duration: 1 }))
        .to.throw('keyPrefix must not contain ":" character');
    });
  });
});
