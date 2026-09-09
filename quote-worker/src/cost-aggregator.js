function makeSkuKey(category, attributes) {
  const keys = Object.keys(attributes).sort();
  const parts = [category, ...keys.map((k) => `${k}=${attributes[k]}`)];
  return parts.join('|');
}

function aggregateByCategory(lineItems) {
  const groups = {};
  for (const item of lineItems) {
    const key = makeSkuKey(item.category, item.attributes);
    groups[key] = groups[key] || [];
    groups[key].push(item);
  }

  const byCategory = {};
  for (const key of Object.keys(groups)) {
    const items = groups[key];
    const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const latest = sorted[sorted.length - 1];
    const prices = items.map((i) => i.price);
    const row = {
      skuKey: key,
      attributes: latest.attributes,
      representativePrice: latest.price,
      currency: latest.currency,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      avgPrice: prices.reduce((s, p) => s + p, 0) / prices.length,
      observationCount: items.length,
      latestDate: latest.date,
    };
    byCategory[items[0].category] = byCategory[items[0].category] || [];
    byCategory[items[0].category].push(row);
  }
  return byCategory;
}

const OUTLIER_RATIO = 2;

function judgeConfidence(newPrice, existingRepresentativePrice) {
  if (existingRepresentativePrice === null || existingRepresentativePrice === undefined) {
    return { status: 'pending', reason: '신규 SKU — 비교 기준 없음, 검토 필요' };
  }
  const ratio = newPrice / existingRepresentativePrice;
  if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) {
    return {
      status: 'pending',
      reason: `기존 대표단가(¥${existingRepresentativePrice}) 대비 ${ratio.toFixed(1)}배 — 이상치 의심`,
    };
  }
  return { status: 'approved', reason: null };
}

module.exports = { makeSkuKey, aggregateByCategory, judgeConfidence, OUTLIER_RATIO };
