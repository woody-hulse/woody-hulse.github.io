(function () {
  const FLOWERS = [
    {
      id: 'clover',
      nameKey: 'flowerClover',
      base: 6,
      bonus: 0.01,
      width: 18,
      height: 12,
      heightVw: 1.32,
      shape: 'clover',
      palette: {
        stem: '#2f7a45',
        leaf: '#3f9849',
        leafLight: '#8bd96f',
        petal: '#fff4d2',
        petalLight: '#ffffff',
        center: '#f1c85b',
        shadow: '#26663b'
      }
    },
    {
      id: 'zinnias',
      nameKey: 'flowerZinnias',
      base: 10,
      bonus: 0.02,
      width: 20,
      height: 16,
      heightVw: 1.76,
      shape: 'zinnias',
      palette: {
        stem: '#2f7a45',
        leaf: '#4fa858',
        leafLight: '#8bd36b',
        petal: '#cf4668',
        petalLight: '#f08aa4',
        center: '#f1c85b',
        shadow: '#8f2d40'
      }
    },
    {
      id: 'amaranth',
      nameKey: 'flowerAmaranth',
      base: 45,
      bonus: 0.04,
      width: 22,
      height: 20,
      heightVw: 2.2,
      shape: 'amaranth',
      palette: {
        stem: '#2d7443',
        leaf: '#4a9c55',
        leafLight: '#83c963',
        petal: '#9f2d55',
        petalLight: '#d94e76',
        center: '#f0ad58',
        shadow: '#6f2347'
      }
    },
    {
      id: 'cosmos',
      nameKey: 'flowerCosmos',
      base: 180,
      bonus: 0.06,
      width: 20,
      height: 17,
      heightVw: 1.87,
      shape: 'cosmos',
      palette: {
        stem: '#317851',
        leaf: '#4fac65',
        leafLight: '#83cd73',
        petal: '#e88bc1',
        petalLight: '#ffd7ef',
        center: '#e0ad3e',
        shadow: '#b6508a'
      }
    },
    {
      id: 'dahlias',
      nameKey: 'flowerDahlias',
      base: 620,
      bonus: 0.08,
      width: 24,
      height: 20,
      heightVw: 2.2,
      shape: 'dahlias',
      palette: {
        stem: '#2b7142',
        leaf: '#4b9c58',
        leafLight: '#8cc96a',
        petal: '#c84a42',
        petalLight: '#f08b4e',
        center: '#ffd35c',
        shadow: '#8f2d35'
      }
    },
    {
      id: 'lupine',
      nameKey: 'flowerLupine',
      base: 1900,
      bonus: 0.11,
      width: 22,
      height: 22,
      heightVw: 2.42,
      shape: 'lupine',
      palette: {
        stem: '#286b5a',
        leaf: '#3f9782',
        leafLight: '#71c2a8',
        petal: '#6d65c9',
        petalLight: '#b7a8ff',
        center: '#fff0a8',
        shadow: '#4d4398'
      }
    }
  ];

  function copySpec(spec) {
    return Object.assign({}, spec, { palette: Object.assign({}, spec.palette) });
  }

  function dot(cells, spec, x, y, color) {
    if (x < 0 || y < 0 || x >= spec.width || y >= spec.height) return;
    cells.push({ x: x, y: y, color: color });
  }

  function rect(cells, spec, x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) dot(cells, spec, xx, yy, color);
    }
  }

  function line(cells, spec, x1, y1, x2, y2, color) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      dot(cells, spec, Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), color);
    }
  }

  function leafMound(cells, spec, y, inset) {
    const left = inset || 2;
    const width = spec.width - left * 2;
    rect(cells, spec, left + 1, y, width - 2, 3, 'leaf');
    rect(cells, spec, left, y + 1, width, 2, 'leaf');
    rect(cells, spec, left + 3, y - 1, Math.max(4, width - 6), 2, 'leafLight');
    rect(cells, spec, left + 2, y + 3, Math.max(3, width - 4), 1, 'shadow');
    dot(cells, spec, left - 1, y + 2, 'shadow');
    dot(cells, spec, left + width, y + 2, 'shadow');
  }

  function plantStem(cells, spec, x, top, bottom, lean) {
    const endX = x + (lean || 0);
    line(cells, spec, x, bottom, endX, top, 'stem');
    line(cells, spec, x + 1, bottom, endX + 1, top + 1, 'shadow');
    dot(cells, spec, x - 2, bottom - 2, 'leaf');
    dot(cells, spec, x - 3, bottom - 3, 'leafLight');
    dot(cells, spec, x + 2, bottom - 3, 'leaf');
    dot(cells, spec, x + 3, bottom - 4, 'leafLight');
  }

  function roundBloom(cells, spec, cx, cy, scale) {
    const s = scale || 1;
    rect(cells, spec, cx - 2 * s, cy - s, 4 * s + 1, 2 * s + 1, 'petal');
    rect(cells, spec, cx - s, cy - 2 * s, 2 * s + 1, 4 * s + 1, 'petal');
    rect(cells, spec, cx - s, cy - s, 2 * s + 1, 2 * s + 1, 'petalLight');
    dot(cells, spec, cx - 2 * s - 1, cy, 'shadow');
    dot(cells, spec, cx + 2 * s + 1, cy + 1, 'shadow');
    rect(cells, spec, cx, cy, Math.max(1, s), Math.max(1, s), 'center');
    dot(cells, spec, cx + 1, cy + 1, 'center');
  }

  function daisyBloom(cells, spec, cx, cy) {
    rect(cells, spec, cx - 1, cy - 2, 3, 5, 'petal');
    rect(cells, spec, cx - 2, cy - 1, 5, 3, 'petalLight');
    dot(cells, spec, cx - 2, cy + 2, 'shadow');
    dot(cells, spec, cx + 2, cy + 1, 'shadow');
    rect(cells, spec, cx, cy, 1, 1, 'center');
  }

  function dahliaBloom(cells, spec, cx, cy, size) {
    const s = size || 1;
    rect(cells, spec, cx - s, cy - 3, s * 2 + 1, 7, 'petal');
    rect(cells, spec, cx - 3, cy - s, 7, s * 2 + 1, 'petal');
    rect(cells, spec, cx - 2, cy - 2, 5, 5, 'petalLight');
    rect(cells, spec, cx - 1, cy - 1, 3, 3, 'petal');
    dot(cells, spec, cx - 1, cy - 1, 'center');
    dot(cells, spec, cx + 1, cy, 'center');
    dot(cells, spec, cx + 2, cy + 2, 'shadow');
  }

  function amaranthPlume(cells, spec, x, top, height) {
    for (let i = 0; i < height; i++) {
      const y = top + i;
      rect(cells, spec, x, y, 2, 1, i % 2 ? 'petalLight' : 'petal');
      dot(cells, spec, x - 1, y, i % 3 ? 'petal' : 'shadow');
      if (i % 2 === 0) dot(cells, spec, x + 2, y, 'petal');
    }
    dot(cells, spec, x, top + height, 'shadow');
  }

  function lupineSpike(cells, spec, x, top, height) {
    for (let i = 0; i < height; i++) {
      const y = top + i;
      dot(cells, spec, x, y, i % 2 ? 'petalLight' : 'petal');
      if (i > 1) dot(cells, spec, x - 1, y, 'petal');
      if (i > 2 && i % 2 === 0) dot(cells, spec, x + 1, y, 'petalLight');
      if (i > 5 && i % 3 === 0) dot(cells, spec, x + 2, y, 'shadow');
    }
  }

  function cloverLeaf(cells, spec, cx, cy) {
    dot(cells, spec, cx - 1, cy, 'leaf');
    dot(cells, spec, cx, cy - 1, 'leafLight');
    dot(cells, spec, cx + 1, cy, 'leaf');
    dot(cells, spec, cx, cy + 1, 'leaf');
    dot(cells, spec, cx, cy, 'leafLight');
    dot(cells, spec, cx + 1, cy + 1, 'shadow');
  }

  function cloverCluster(cells, spec, cx, cy) {
    rect(cells, spec, cx, cy + 2, 1, 3, 'stem');
    cloverLeaf(cells, spec, cx - 1, cy);
    cloverLeaf(cells, spec, cx + 1, cy);
    cloverLeaf(cells, spec, cx, cy + 1);
    dot(cells, spec, cx, cy, 'center');
  }

  function cellsFor(spec) {
    const cells = [];
    const baseY = spec.height - 5;
    leafMound(cells, spec, baseY, spec.width > 20 ? 3 : 2);

    if (spec.shape === 'clover') {
      rect(cells, spec, 2, spec.height - 3, spec.width - 4, 2, 'shadow');
      rect(cells, spec, 3, spec.height - 4, spec.width - 6, 2, 'leaf');
      [
        [4, 7], [7, 5], [10, 6], [13, 7], [15, 9], [6, 9]
      ].forEach(function (p) { cloverCluster(cells, spec, p[0], p[1]); });
      dot(cells, spec, 9, 4, 'petalLight');
      dot(cells, spec, 12, 5, 'petal');
      return cells;
    }

    if (spec.shape === 'amaranth') {
      [
        [5, 5, baseY + 2, -1, 7],
        [10, 3, baseY + 2, 0, 10],
        [16, 5, baseY + 2, 1, 8]
      ].forEach(function (p) {
        plantStem(cells, spec, p[0], p[1], p[2], p[3]);
        amaranthPlume(cells, spec, p[0] + p[3] - 1, p[1] - 2, p[4]);
      });
      return cells;
    }

    if (spec.shape === 'cosmos') {
      [
        [5, 6, baseY + 1, -1],
        [9, 3, baseY + 1, 0],
        [14, 6, baseY + 1, 2],
        [16, 10, baseY + 1, 0]
      ].forEach(function (p) {
        plantStem(cells, spec, p[0], p[1], p[2], p[3]);
        daisyBloom(cells, spec, p[0] + p[3], p[1]);
      });
      return cells;
    }

    if (spec.shape === 'dahlias') {
      [
        [5, 7, baseY + 2, -1, 1],
        [11, 5, baseY + 2, 0, 1],
        [18, 7, baseY + 2, 1, 1],
        [15, 11, baseY + 2, 0, 1]
      ].forEach(function (p) {
        plantStem(cells, spec, p[0], p[1], p[2], p[3]);
        dahliaBloom(cells, spec, p[0] + p[3], p[1], p[4]);
      });
      return cells;
    }

    if (spec.shape === 'lupine') {
      [
        [5, 5, baseY + 2, -1, 8],
        [11, 2, baseY + 2, 0, 12],
        [17, 6, baseY + 2, 1, 8]
      ].forEach(function (p) {
        plantStem(cells, spec, p[0], p[1], p[2], p[3]);
        lupineSpike(cells, spec, p[0] + p[3], p[1] - 2, p[4]);
      });
      dot(cells, spec, 8, 15, 'petalLight');
      dot(cells, spec, 14, 16, 'petal');
      return cells;
    }

    [
      [5, 7, baseY + 2, -1],
      [9, 5, baseY + 2, 0],
      [14, 7, baseY + 2, 1],
      [16, 11, baseY + 2, 0]
    ].forEach(function (p, index) {
      plantStem(cells, spec, p[0], p[1], p[2], p[3]);
      if (index === 3) daisyBloom(cells, spec, p[0] + p[3], p[1]);
      else roundBloom(cells, spec, p[0] + p[3], p[1], 1);
    });
    return cells;
  }

  class FlowerCatalog {
    constructor(specs) {
      this._specs = specs.slice();
      this._byId = {};
      this._specs.forEach((spec) => { this._byId[spec.id] = spec; });
      this.priceGrowth = 1.12;
      this.width = 20;
      this.height = 16;
    }

    all() {
      return this._specs.map(copySpec);
    }

    ids() {
      return this._specs.map(function (spec) { return spec.id; });
    }

    get(id) {
      return this._byId[id] || this._specs[0];
    }

    has(id) {
      return !!this._byId[id];
    }

    bonusFor(id) {
      const spec = this._byId[id];
      return spec ? spec.bonus : 0;
    }

    totalBonus(flowers) {
      if (!Array.isArray(flowers)) return 0;
      const sum = flowers.reduce((total, flower) => {
        return total + this.bonusFor(flower && flower.type);
      }, 0);
      return Math.round(sum * 10000) / 10000;
    }

    multiplier(flowers) {
      return 1 + this.totalBonus(flowers);
    }

    sizeFor(id) {
      const spec = this.get(id);
      return {
        heightVw: spec.heightVw,
        aspect: spec.width / spec.height
      };
    }

    render(id) {
      const el = document.createElement('span');
      return this.paint(el, id);
    }

    paint(el, id) {
      const spec = this.get(id);
      el.className = (el.className || '')
        .split(/\s+/)
        .filter(function (name) { return name && name !== 'pixel-flower-art' && name.indexOf('pixel-flower-') !== 0; })
        .concat(['pixel-flower-art', 'pixel-flower-' + spec.id])
        .join(' ');
      el.dataset.flowerType = spec.id;
      el.style.setProperty('--flower-w', spec.width);
      el.style.setProperty('--flower-h', spec.height);
      el.style.setProperty('--flower-aspect', spec.width / spec.height);
      el.textContent = '';
      const inner = document.createElement('span');
      inner.className = 'pixel-flower-inner';
      inner.style.setProperty('--flower-w', spec.width);
      inner.style.setProperty('--flower-h', spec.height);
      cellsFor(spec).forEach(function (cell) {
        const px = document.createElement('span');
        px.className = 'pixel-flower-cell';
        px.style.gridColumn = String(cell.x + 1);
        px.style.gridRow = String(cell.y + 1);
        px.style.backgroundColor = spec.palette[cell.color] || cell.color;
        inner.appendChild(px);
      });
      el.appendChild(inner);
      return el;
    }
  }

  window.StudyFlowers = new FlowerCatalog(FLOWERS);
})();
