const CATEGORY_KEYWORDS = [
  ['led_module', ['led module', '모듈', '模组', 'led显示单元', 'led unit', 'full color', '全彩', '全全彩']],
  ['receiving_card', ['receiving card', '수신카드', '接收卡']],
  ['processor', ['play box', 'playbox', 'processor', '프로세서', '컨트롤러', '播放器', '播控', '控制器', 'video board', 'multimedia player', 'sending card']],
  ['smps', ['smps', 'power supply', '전원', '电源']],
  ['cable_16p', ['16p']],
  ['cable_cat6', ['cat6', '网络线', '网线', 'network cable']],
  ['cable_220v', ['cable', '케이블', '电缆']],
  ['wood_box', ['wooden crate', 'wood box', '우드박스', '木箱', 'packaging', '包装']],
  ['freight', ['freight', 'transportation', '운송', '运费', '운송비']],
  ['box', ['die-casting', '다이캐스팅', '箱体', '철함체', '함체', 'aluminum box']],
];

function matchCategory(text) {
  if (!text) return null;
  const low = String(text).toLowerCase().replace(/\s+/g, ' ');
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => low.includes(kw))) return category;
  }
  return null;
}

function classifyItem(name, desc) {
  return matchCategory(name) || matchCategory(desc);
}

const BRAND_MAP = {
  nova: 'Novastar', '诺瓦': 'Novastar', '노바': 'Novastar', novastar: 'Novastar',
  huidu: 'Huidu', '후이두': 'Huidu',
  colorlight: 'Colorlight',
  linsn: 'Linsn',
};

function detectBrand(text) {
  const low = text.toLowerCase();
  for (const key of Object.keys(BRAND_MAP)) {
    if (low.includes(key)) return BRAND_MAP[key];
  }
  return null;
}

function detectModel(text, brand) {
  const tokens = text.match(/[A-Za-z]{1,6}-?[A-Za-z0-9-]*\d[A-Za-z0-9-]*/g) || [];
  const filtered = brand ? tokens.filter((t) => t.toLowerCase() !== brand.toLowerCase()) : tokens;
  return (filtered[0] || tokens[0] || text.trim());
}

function extractAttributes(category, name, desc) {
  const text = `${name || ''} ${desc || ''}`;

  if (category === 'led_module') {
    const pitchM = /[Pp](\d+\.?\d*)/.exec(text);
    const sizeM = /(\d{2,4}\s*\*\s*\d{2,4}\s*mm)/.exec(text);
    const low = text.toLowerCase();
    let indoorOutdoor = 'indoor';
    if (low.includes('outdoor') || text.includes('户外') || text.includes('실외')) indoorOutdoor = 'outdoor';
    else if (low.includes('indoor') || text.includes('室内') || text.includes('실내')) indoorOutdoor = 'indoor';
    let type = 'SMD';
    if (low.includes('gob')) type = 'GOB';
    else if (low.includes('cob')) type = 'COB';
    return {
      pitch: pitchM ? parseFloat(pitchM[1]) : null,
      indoor_outdoor: indoorOutdoor,
      module_size: sizeM ? sizeM[1].replace(/\s+/g, '') : null,
      type,
    };
  }

  if (category === 'receiving_card' || category === 'processor') {
    const brand = detectBrand(text);
    const model = detectModel(desc || name, brand);
    return { brand: brand || 'Unknown', model };
  }

  if (category === 'smps') {
    const voltageM = /(AC\s?\d{2,3}-\d{2,3}V)/.exec(text.replace(/\s+/g, ' '));
    const capacityM = /(\d+V\d+A)/.exec(text);
    return {
      voltage: voltageM ? voltageM[1].replace(/\s+/g, '') : null,
      capacity: capacityM ? capacityM[1] : null,
    };
  }

  if (category === 'box') {
    const sizeM = /(\d{2,4}\s*\*\s*\d{2,4}\s*mm)/.exec(text);
    const material = (text.includes('철') || text.toLowerCase().includes('steel') || text.includes('铁')) ? 'steel' : 'aluminum';
    return {
      size: sizeM ? sizeM[1].replace(/\s+/g, '') : null,
      material,
    };
  }

  if (category === 'cable_220v' || category === 'cable_cat6' || category === 'cable_16p') {
    const lengths = text.match(/(\d{3,5})\s*mm/g) || [];
    const last = lengths[lengths.length - 1];
    return { length_mm: last ? parseInt(last, 10) : null };
  }

  return {};
}

module.exports = { classifyItem, extractAttributes, CATEGORY_KEYWORDS };
