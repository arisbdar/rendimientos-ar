const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// These mirror the pure functions used in cafci.js and server.js
function daysBetween(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
}

function filterValid(data) {
  return data.filter(d => d.fecha && d.vcp);
}

function calculateTNA(fundVcp, prevVcp, days) {
  if (days <= 0 || !prevVcp || !fundVcp) return null;
  const dailyReturn = (fundVcp - prevVcp) / prevVcp / days;
  return Math.round(dailyReturn * 365 * 100 * 100) / 100;
}

describe('daysBetween', () => {
  it('returns 1 for consecutive days', () => {
    assert.equal(daysBetween('2025-03-20', '2025-03-21'), 1);
  });

  it('returns positive value regardless of order', () => {
    assert.equal(daysBetween('2025-03-21', '2025-03-20'), 1);
  });

  it('returns 0 for same date', () => {
    assert.equal(daysBetween('2025-03-20', '2025-03-20'), 0);
  });

  it('handles multi-day gaps', () => {
    assert.equal(daysBetween('2025-03-15', '2025-03-20'), 5);
  });

  it('handles month boundaries', () => {
    assert.equal(daysBetween('2025-01-31', '2025-02-01'), 1);
  });
});

describe('filterValid', () => {
  it('keeps entries with fecha and vcp', () => {
    const data = [
      { fecha: '2025-03-20', vcp: 1.5 },
      { fecha: '2025-03-20', vcp: 0 },
      { fecha: null, vcp: 1.5 },
      { fecha: '2025-03-20', vcp: null },
      { vcp: 1.5 },
    ];
    const result = filterValid(data);
    assert.equal(result.length, 1);
    assert.equal(result[0].vcp, 1.5);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(filterValid([]), []);
  });
});

describe('calculateTNA', () => {
  it('calculates positive TNA for growing VCP', () => {
    // VCP went from 100 to 100.1 in 1 day
    const tna = calculateTNA(100.1, 100, 1);
    // dailyReturn = 0.1/100/1 = 0.001 → TNA = 0.001 * 365 * 100 = 36.50
    assert.equal(tna, 36.5);
  });

  it('calculates negative TNA for declining VCP', () => {
    const tna = calculateTNA(99.9, 100, 1);
    assert.ok(tna < 0, 'TNA should be negative');
  });

  it('returns null when days is 0 (same date)', () => {
    assert.equal(calculateTNA(100.1, 100, 0), null);
  });

  it('returns null when days is negative', () => {
    assert.equal(calculateTNA(100.1, 100, -1), null);
  });

  it('returns null when prevVcp is 0', () => {
    assert.equal(calculateTNA(100.1, 0, 1), null);
  });

  it('returns null when fundVcp is null', () => {
    assert.equal(calculateTNA(null, 100, 1), null);
  });

  it('scales correctly over multiple days', () => {
    // Same total return over 2 days should give half the daily return
    const tna1day = calculateTNA(100.1, 100, 1);
    const tna2day = calculateTNA(100.1, 100, 2);
    assert.equal(tna2day, tna1day / 2);
  });

  it('rounds to 2 decimal places', () => {
    const tna = calculateTNA(100.0333, 100, 1);
    const decimals = tna.toString().split('.')[1]?.length || 0;
    assert.ok(decimals <= 2, `Expected at most 2 decimal places, got ${decimals}`);
  });
});
