(function () {
  const FLOWERS = [
    {
      id: 'clover',
      nameKey: 'flowerClover',
      base: 6,
      bonus: 0.01,
      heightVw: 1.55,
      shape: 'clover',
      palette: {
        stem: '#2f7a45',
        leaf: '#3e9a4a',
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
      heightVw: 1.75,
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
      heightVw: 2.05,
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
      heightVw: 1.95,
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
      heightVw: 2.25,
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
      heightVw: 2.35,
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

  const WIDTH = 18;
  const HEIGHT = 16;

  function copySpec(spec) {
    return Object.assign({}, spec, { palette: Object.assign({}, spec.palette) });
  }

  function dot(cells, x, y, color) {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    cells.push({ x: x, y: y, color: color });
  }

  function rect(cells, x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) dot(cells, xx, yy, color);
    }
  }

  function line(cells, x1, y1, x2, y2, color) {
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);
    let x = x1;
    let y = y1;
    dot(cells, x, y, color);
    while (x !== x2 || y !== y2) {
      if (x !== x2) x += dx;
      if (y !== y2) y += dy;
      dot(cells, x, y, color);
    }
  }

  function leafBase(cells, y) {
    rect(cells, 3, y, 12, 3, 'leaf');
    rect(cells, 2, y + 1, 14, 2, 'leaf');
    rect(cells, 5, y - 1, 8, 2, 'leafLight');
    rect(cells, 4, y + 2, 10, 1, 'shadow');
    dot(cells, 1, y + 2, 'shadow');
    dot(cells, 16, y + 2, 'shadow');
  }

  function stem(cells, x, top, bottom) {
    rect(cells, x, top, 1, bottom - top + 1, 'stem');
    rect(cells, x + 1, top + 1, 1, Math.max(1, bottom - top), 'shadow');
    dot(cells, x - 1, bottom - 3, 'leaf');
    dot(cells, x - 2, bottom - 2, 'leafLight');
    dot(cells, x + 2, bottom - 4, 'leaf');
    dot(cells, x + 3, bottom - 5, 'leafLight');
    rect(cells, x - 2, bottom, 5, 1, 'shadow');
  }

  function roundBloom(cells, cx, cy) {
    rect(cells, cx - 2, cy - 1, 5, 3, 'petal');
    rect(cells, cx - 1, cy - 2, 3, 5, 'petal');
    dot(cells, cx - 2, cy - 2, 'petalLight');
    dot(cells, cx + 2, cy - 2, 'petalLight');
    dot(cells, cx - 3, cy, 'shadow');
    dot(cells, cx + 3, cy, 'shadow');
    rect(cells, cx - 1, cy, 2, 2, 'center');
    dot(cells, cx + 1, cy + 1, 'center');
  }

  function daisyBloom(cells, cx, cy) {
    rect(cells, cx - 1, cy - 2, 3, 5, 'petal');
    rect(cells, cx - 2, cy - 1, 5, 3, 'petalLight');
    dot(cells, cx - 2, cy + 2, 'shadow');
    dot(cells, cx + 2, cy + 1, 'shadow');
    dot(cells, cx, cy, 'center');
  }

  function dahliaBloom(cells, cx, cy) {
    rect(cells, cx - 1, cy - 3, 3, 7, 'petal');
    rect(cells, cx - 3, cy - 1, 7, 3, 'petal');
    rect(cells, cx - 2, cy - 2, 5, 5, 'petalLight');
    rect(cells, cx - 1, cy - 1, 3, 3, 'petal');
    dot(cells, cx - 1, cy - 1, 'center');
    dot(cells, cx + 1, cy, 'center');
    dot(cells, cx + 2, cy + 2, 'shadow');
  }

  function amaranthPlume(cells, x, top, height) {
    for (let i = 0; i < height; i++) {
      const y = top + i;
      rect(cells, x, y, 2, 1, i % 2 ? 'petalLight' : 'petal');
      dot(cells, x - 1, y, i % 3 ? 'petal' : 'shadow');
      if (i % 2 === 0) dot(cells, x + 2, y, 'petal');
    }
    dot(cells, x, top + height, 'shadow');
  }

  function lupineSpike(cells, x, top, height) {
    for (let i = 0; i < height; i++) {
      const y = top + i;
      dot(cells, x, y, i % 2 ? 'petalLight' : 'petal');
      if (i > 1) dot(cells, x - 1, y, 'petal');
      if (i > 2 && i % 2 === 0) dot(cells, x + 1, y, 'petalLight');
    }
    dot(cells, x + 1, top + height - 1, 'shadow');
  }

  function cloverLeaf(cells, cx, cy) {
    dot(cells, cx - 1, cy, 'leaf');
    dot(cells, cx, cy - 1, 'leafLight');
    dot(cells, cx + 1, cy, 'leaf');
    dot(cells, cx, cy + 1, 'leaf');
    dot(cells, cx + 1, cy + 1, 'shadow');
    dot(cells, cx, cy, 'leafLight');
  }

  function cloverCluster(cells, cx, cy) {
    rect(cells, cx, cy + 2, 1, 3, 'stem');
    cloverLeaf(cells, cx - 1, cy);
    cloverLeaf(cells, cx + 1, cy);
    cloverLeaf(cells, cx, cy + 1);
    dot(cells, cx, cy, 'center');
  }

  function cellsFor(spec) {
    const cells = [];
    if (spec.shape === 'clover') {
      leafBase(cells, 11);
      rect(cells, 2, 12, 14, 2, 'shadow');
      rect(cells, 3, 10, 12, 3, 'leaf');
      rect(cells, 5, 9, 8, 2, 'leafLight');
      cloverCluster(cells, 4, 8);
      cloverCluster(cells, 8, 6);
      cloverCluster(cells, 12, 8);
      cloverCluster(cells, 15, 10);
      dot(cells, 6, 7, 'petal');
      dot(cells, 10, 5, 'petalLight');
      return cells;
    }
    if (spec.shape === 'amaranth') {
      leafBase(cells, 11);
      stem(cells, 5, 5, 12);
      stem(cells, 9, 4, 12);
      stem(cells, 13, 6, 12);
      amaranthPlume(cells, 4, 3, 7);
      amaranthPlume(cells, 8, 2, 8);
      amaranthPlume(cells, 12, 4, 6);
      return cells;
    }
    if (spec.shape === 'cosmos') {
      leafBase(cells, 10);
      line(cells, 4, 11, 5, 5, 'stem');
      line(cells, 8, 11, 8, 3, 'stem');
      line(cells, 12, 11, 14, 6, 'stem');
      daisyBloom(cells, 5, 5);
      daisyBloom(cells, 8, 3);
      daisyBloom(cells, 14, 6);
      daisyBloom(cells, 12, 9);
      return cells;
    }
    if (spec.shape === 'dahlias') {
      leafBase(cells, 11);
      stem(cells, 4, 6, 12);
      stem(cells, 9, 4, 12);
      stem(cells, 14, 6, 12);
      dahliaBloom(cells, 4, 6);
      dahliaBloom(cells, 9, 4);
      dahliaBloom(cells, 14, 6);
      roundBloom(cells, 12, 10);
      return cells;
    }
    if (spec.shape === 'lupine') {
      leafBase(cells, 12);
      stem(cells, 4, 5, 13);
      stem(cells, 9, 3, 13);
      stem(cells, 14, 6, 13);
      lupineSpike(cells, 4, 3, 7);
      lupineSpike(cells, 9, 1, 9);
      lupineSpike(cells, 14, 4, 6);
      dot(cells, 6, 10, 'petalLight');
      dot(cells, 12, 11, 'petal');
      return cells;
    }
    leafBase(cells, 10);
    stem(cells, 4, 6, 12);
    stem(cells, 8, 4, 12);
    stem(cells, 13, 6, 12);
    roundBloom(cells, 4, 6);
    roundBloom(cells, 8, 4);
    roundBloom(cells, 13, 6);
    daisyBloom(cells, 15, 10);
    dot(cells, 6, 11, 'petalLight');
    return cells;
  }

  class FlowerCatalog {
    constructor(specs) {
      this._specs = specs.slice();
      this._byId = {};
      this._specs.forEach((spec) => { this._byId[spec.id] = spec; });
      this.priceGrowth = 1.12;
      this.width = WIDTH;
      this.height = HEIGHT;
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
        aspect: WIDTH / HEIGHT
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
      el.style.setProperty('--flower-w', WIDTH);
      el.style.setProperty('--flower-h', HEIGHT);
      el.textContent = '';
      const inner = document.createElement('span');
      inner.className = 'pixel-flower-inner';
      inner.style.setProperty('--flower-w', WIDTH);
      inner.style.setProperty('--flower-h', HEIGHT);
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
