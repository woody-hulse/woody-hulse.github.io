(function () {
  const SPECIES = ['chickens', 'sheep', 'ducks', 'retrievers', 'pigs', 'fish', 'bison', 'horse', 'squid', 'giraffe', 'cat', 'lizard'];
  const STATES = ['stand', 'walk', 'sit', 'lie', 'sleep'];

  class PixelCanvas {
    constructor(width, height, palette) {
      this.width = width;
      this.height = height;
      this.palette = palette || {};
      this.cells = [];
      this._seen = {};
    }

    dot(x, y, color) {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
      const key = x + ':' + y;
      this._seen[key] = this.palette[color] || color;
      return this;
    }

    rect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) this.dot(xx, yy, color);
      }
      return this;
    }

    line(x1, y1, x2, y2, color) {
      const dx = Math.sign(x2 - x1);
      const dy = Math.sign(y2 - y1);
      let x = x1;
      let y = y1;
      this.dot(x, y, color);
      while (x !== x2 || y !== y2) {
        if (x !== x2) x += dx;
        if (y !== y2) y += dy;
        this.dot(x, y, color);
      }
      return this;
    }

    list() {
      const out = [];
      Object.keys(this._seen).forEach((key) => {
        const parts = key.split(':');
        out.push({ x: Number(parts[0]), y: Number(parts[1]), color: this._seen[key] });
      });
      out.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      return out;
    }
  }

  class AnimalSprite {
    constructor(palette) {
      this.palette = palette;
      this.width = 18;
      this.height = 16;
    }

    canvas() {
      return new PixelCanvas(this.width, this.height, this.palette);
    }

    drawSleepZ(c) {
      c.rect(13, 1, 3, 1, 'dark').dot(15, 2, 'dark').rect(13, 3, 3, 1, 'dark');
      c.rect(10, 0, 2, 1, 'dark').dot(11, 1, 'dark').rect(10, 2, 2, 1, 'dark');
    }

    legs(c, frame, color, opts) {
      opts = opts || {};
      const a = frame % 2;
      const y = opts.y == null ? 11 : opts.y;
      const h = opts.h == null ? 2 : opts.h;
      const leftX = opts.leftX == null ? 5 : opts.leftX;
      const rightX = opts.rightX == null ? 11 : opts.rightX;
      const footY = Math.min(this.height - 2, y + h);
      c.rect(leftX, y, 2, h, color).rect(rightX, y, 2, h, color);
      c.dot(leftX - 1 + a, footY, color).dot(rightX - 1 + (1 - a), footY, color);
      c.dot(leftX + 1 + a, footY, color).dot(rightX + 1 + (1 - a), footY, color);
    }
  }

  class PigSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#f092a3', shade: '#cf5d71', light: '#ffc3c9', dark: '#56303a', leg: '#df7888', belly: '#ffc3c9', profile: 'farm' },
        { body: '#d88770', shade: '#b05a4c', light: '#f3b398', dark: '#4f2e2a', leg: '#c96f5e', belly: '#f3b398', profile: 'rust' },
        { body: '#f4a2b4', shade: '#cb6a83', light: '#ffd0d5', dark: '#663443', leg: '#df7f98', belly: '#ffd0d5', spot: '#704049', profile: 'spotted' },
        { body: '#3f302f', shade: '#241a1a', light: '#e3aaa2', dark: '#171111', leg: '#b67973', belly: '#efb8ae', spot: '#efb8ae', profile: 'potbelly' },
        { body: '#f2b28b', shade: '#c8785b', light: '#ffd1ad', dark: '#5d352d', leg: '#d98a70', belly: '#ffd1ad', profile: 'ginger' }
      ];
      const picked = variants[variant % variants.length];
      super(picked);
      this.profile = picked.profile;
    }

    draw(state, frame) {
      const c = this.canvas();
      const potbelly = this.profile === 'potbelly';
      const spotted = this.profile === 'spotted';
      if (state === 'lie' || state === 'sleep') {
        c.rect(3, 9, 10, 4, 'body').rect(5, 8, 8, 1, potbelly ? 'belly' : 'light').rect(11, 7, 4, 4, 'body');
        c.rect(14, 8, 3, 2, 'light').dot(13, 7, 'dark').dot(16, 7, 'dark');
        c.rect(5, 13, 7, 1, 'shade').rect(3, 12, 2, 1, 'shade').dot(2, 10, 'shade');
        c.line(2, 9, 0, 8, 'shade');
        if (potbelly) c.rect(5, 10, 7, 2, 'belly');
        if (spotted) c.rect(7, 9, 3, 2, 'spot');
        if (state === 'sleep') this.drawSleepZ(c);
        else c.dot(13, 8, 'dark');
        return c;
      }
      if (state === 'sit') {
        c.rect(5, potbelly ? 8 : 7, 8, potbelly ? 5 : 6, 'body').rect(7, 6, 6, 1, 'light').rect(11, 5, 4, 4, 'body');
        c.rect(14, 6, 3, 2, 'light').dot(13, 5, 'dark').dot(16, 5, 'dark');
        c.rect(5, 12, 8, 2, 'shade').dot(4, 8, 'shade').line(4, 7, 2, 6, 'shade');
        if (potbelly) c.rect(6, 9, 6, 3, 'belly');
        if (spotted) c.rect(8, 8, 3, 2, 'spot');
        c.dot(13, 6, 'dark').dot(15, 7, 'shade');
        return c;
      }
      c.rect(4, 7, 9, potbelly ? 6 : 5, 'body').rect(6, 6, 7, 1, 'light').rect(12, 5, 4, 4, 'body');
      c.rect(15, 6, 3, 2, 'light').dot(13, 5, 'dark').dot(16, 5, 'dark');
      c.rect(4, 11, 9, 1, 'shade').line(3, 7, 1, 5, 'shade').dot(15, 7, 'shade');
      if (potbelly) c.rect(6, 9, 6, 3, 'belly');
      if (spotted) c.rect(7, 8, 3, 2, 'spot').dot(11, 10, 'spot');
      this.legs(c, state === 'walk' ? frame : 0, 'leg', { y: 12, h: 1 });
      c.dot(14, 6, 'dark');
      return c;
    }
  }

  class SheepSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { wool: '#f8edd4', wool2: '#d8cda8', face: '#4b3f38', dark: '#2d2522', hoof: '#2d2522' },
        { wool: '#e9e2d2', wool2: '#bbb4a5', face: '#242323', dark: '#141414', hoof: '#141414' },
        { wool: '#f5f0df', wool2: '#cfc7ad', face: '#715748', dark: '#3e3029', hoof: '#3e3029' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(3, 8, 10, 5, 'wool').rect(4, 7, 8, 1, 'wool').rect(5, 13, 7, 1, 'wool2');
        c.rect(12, 8, 4, 3, 'face').dot(15, 7, 'face').dot(13, 9, 'dark');
        c.rect(3, 12, 2, 1, 'wool2').rect(9, 12, 3, 1, 'wool2');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(5, 6, 8, 7, 'wool').rect(4, 8, 10, 4, 'wool').rect(11, 6, 4, 4, 'face');
        c.dot(13, 7, 'dark').dot(15, 6, 'face').rect(6, 12, 7, 2, 'wool2');
        return c;
      }
      c.rect(3, 6, 10, 6, 'wool').rect(4, 5, 8, 1, 'wool').rect(12, 6, 4, 4, 'face');
      c.dot(14, 7, 'dark').dot(15, 5, 'face').rect(4, 11, 9, 1, 'wool2');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof');
      return c;
    }
  }

  class ChickenSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#fff3d1', shade: '#d9b978', wing: '#f0cf8a', red: '#cf3034', beak: '#f0a329', dark: '#3a2924', hoof: '#c47b22' },
        { body: '#d7b77e', shade: '#8e6040', wing: '#b88452', red: '#d73835', beak: '#f0a329', dark: '#2e201c', hoof: '#bd761f' },
        { body: '#f6f1e0', shade: '#c9c1ac', wing: '#e3dcc7', red: '#c93434', beak: '#e39a22', dark: '#2c2721', hoof: '#bd761f' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(4, 9, 8, 4, 'body').rect(7, 8, 5, 1, 'body').rect(11, 7, 3, 3, 'body');
        c.rect(13, 8, 2, 1, 'beak').dot(12, 7, 'dark').rect(10, 10, 3, 2, 'wing');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(5, 7, 7, 6, 'body').rect(10, 5, 3, 4, 'body').rect(11, 4, 2, 1, 'red');
        c.rect(13, 6, 2, 1, 'beak').dot(12, 6, 'dark').rect(7, 9, 3, 3, 'wing');
        return c;
      }
      c.rect(4, 7, 7, 5, 'body').rect(10, 5, 3, 4, 'body').rect(11, 3, 2, 2, 'red');
      c.rect(13, 6, 2, 1, 'beak').dot(12, 6, 'dark').rect(6, 8, 3, 3, 'wing');
      const a = state === 'walk' ? frame % 2 : 0;
      c.line(7, 12, 6 - a, 13, 'hoof').line(10, 12, 11 + a, 13, 'hoof');
      return c;
    }
  }

  class DuckSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#b57b43', shade: '#754a2d', wing: '#6b8f42', head: '#2e6c50', bill: '#e9a433', dark: '#1f2b25', hoof: '#d88927' },
        { body: '#f4e7bc', shade: '#d9c78f', wing: '#ead59b', head: '#f4e7bc', bill: '#e39a24', dark: '#403529', hoof: '#d88927' },
        { body: '#30363f', shade: '#171b21', wing: '#44505e', head: '#27333a', bill: '#db9131', dark: '#101317', hoof: '#b87323' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(3, 9, 10, 4, 'body').rect(6, 8, 7, 1, 'body').rect(12, 7, 4, 3, 'head');
        c.rect(15, 8, 2, 1, 'bill').rect(6, 10, 4, 2, 'wing').dot(14, 8, 'dark');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(4, 8, 9, 5, 'body').rect(10, 5, 4, 4, 'head').rect(13, 6, 3, 1, 'bill');
        c.rect(6, 10, 4, 2, 'wing').dot(12, 6, 'dark');
        return c;
      }
      c.rect(3, 8, 10, 4, 'body').rect(10, 5, 4, 4, 'head').rect(13, 6, 3, 1, 'bill');
      c.rect(6, 9, 4, 2, 'wing').dot(12, 6, 'dark');
      const a = state === 'walk' ? frame % 2 : 0;
      c.line(7, 12, 6 - a, 13, 'hoof').line(10, 12, 11 + a, 13, 'hoof');
      return c;
    }
  }

  class RetrieverSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#d29a4c', shade: '#94612d', light: '#f0c479', dark: '#32231a', hoof: '#3b271c' },
        { body: '#6b4027', shade: '#432819', light: '#9a6b45', dark: '#21150f', hoof: '#21150f' },
        { body: '#1e2024', shade: '#101114', light: '#5b6069', dark: '#050607', hoof: '#050607' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(3, 9, 11, 4, 'body').rect(5, 8, 8, 1, 'light').rect(12, 7, 4, 4, 'body');
        c.rect(14, 9, 2, 1, 'dark').dot(13, 8, 'dark').line(3, 9, 1, 7, 'shade');
        c.rect(5, 13, 8, 1, 'shade');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(6, 6, 7, 7, 'body').rect(11, 5, 4, 4, 'body').rect(7, 7, 4, 2, 'light');
        c.dot(13, 6, 'dark').rect(14, 7, 2, 1, 'dark').line(5, 7, 3, 5, 'shade');
        c.rect(6, 12, 7, 2, 'shade');
        return c;
      }
      c.rect(3, 7, 10, 5, 'body').rect(5, 6, 7, 1, 'light').rect(12, 5, 4, 4, 'body');
      c.dot(14, 6, 'dark').rect(15, 7, 2, 1, 'dark').line(3, 7, 1, 5, 'shade');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof');
      return c;
    }
  }

  class FishSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#ee8b2f', shade: '#b85b22', light: '#ffd16a', fin: '#315fbd', dark: '#2a2522' },
        { body: '#3a88cf', shade: '#245b94', light: '#8fc5f1', fin: '#f2c046', dark: '#182b3b' },
        { body: '#df4c4c', shade: '#952f38', light: '#ff9d8e', fin: '#ffffff', dark: '#2c2024' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      const y = state === 'sit' ? 9 : 8;
      const tail = state === 'walk' ? frame % 2 : 0;
      c.rect(5, y - 2, 7, 5, 'body').rect(7, y - 3, 4, 1, 'light').rect(7, y + 3, 4, 1, 'shade');
      c.rect(12, y - 1, 2, 3, 'light').dot(11, y - 1, 'dark');
      c.line(4, y, 1 + tail, y - 3, 'fin').line(4, y, 1 + tail, y + 3, 'fin').rect(8, y - 4, 2, 2, 'fin');
      if (state === 'lie' || state === 'sleep') c.rect(6, y + 3, 6, 1, 'shade');
      if (state === 'sleep') this.drawSleepZ(c);
      return c;
    }
  }

  class BisonSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#6a3e25', shade: '#3d2418', hump: '#7f5333', face: '#2b1c15', horn: '#dfc991', dark: '#170f0b', hoof: '#24160f' },
        { body: '#4e3425', shade: '#2b1d16', hump: '#6a4730', face: '#201711', horn: '#d9bd82', dark: '#120d09', hoof: '#1d120d' },
        { body: '#8a5b37', shade: '#55361f', hump: '#9b7044', face: '#342116', horn: '#ecd494', dark: '#20140f', hoof: '#2a1910' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(2, 9, 11, 4, 'body').rect(3, 8, 8, 2, 'hump').rect(12, 8, 4, 3, 'face');
        c.rect(4, 12, 8, 1, 'shade').dot(13, 9, 'dark').dot(11, 7, 'horn').dot(15, 7, 'horn');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(4, 7, 9, 6, 'body').rect(4, 5, 7, 3, 'hump').rect(12, 6, 4, 4, 'face');
        c.rect(5, 12, 8, 2, 'shade').dot(13, 7, 'dark').dot(11, 5, 'horn').dot(15, 5, 'horn');
        return c;
      }
      c.rect(3, 7, 10, 5, 'body').rect(4, 5, 7, 3, 'hump').rect(12, 6, 4, 4, 'face');
      c.rect(4, 11, 8, 1, 'shade').dot(13, 7, 'dark').dot(11, 5, 'horn').dot(15, 5, 'horn');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof', { y: 11, h: 2 });
      return c;
    }
  }

  class HorseSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#9a6437', shade: '#5c3822', light: '#c58a52', mane: '#342018', dark: '#20130f', hoof: '#241510' },
        { body: '#d6a15e', shade: '#8f6034', light: '#f0c37e', mane: '#f5dfb3', dark: '#42291a', hoof: '#342018' },
        { body: '#3d322c', shade: '#201a17', light: '#75645b', mane: '#151211', dark: '#0c0a09', hoof: '#151211' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(3, 9, 10, 4, 'body').rect(5, 8, 7, 1, 'light').rect(11, 7, 4, 3, 'body');
        c.line(3, 9, 1, 7, 'mane').rect(13, 8, 3, 1, 'dark').dot(13, 7, 'dark').rect(5, 13, 7, 1, 'shade');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(5, 7, 8, 6, 'body').rect(8, 6, 5, 1, 'light').rect(11, 4, 4, 4, 'body');
        c.rect(10, 5, 1, 4, 'mane').rect(14, 5, 2, 1, 'dark').dot(13, 5, 'dark').rect(5, 12, 8, 2, 'shade');
        return c;
      }
      c.rect(3, 8, 10, 4, 'body').rect(5, 7, 7, 1, 'light').rect(11, 5, 4, 4, 'body');
      c.rect(10, 6, 1, 4, 'mane').rect(14, 6, 3, 1, 'dark').dot(13, 6, 'dark').line(3, 8, 1, 6, 'mane');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof', { y: 12, h: 1 });
      return c;
    }
  }

  class SquidSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#be5aa1', shade: '#81376f', light: '#ef91cf', dark: '#2d1a2b', hoof: '#81376f' },
        { body: '#de7552', shade: '#9a3f35', light: '#f2aa7a', dark: '#321713', hoof: '#9a3f35' },
        { body: '#5d78c9', shade: '#324c96', light: '#9fb3ff', dark: '#172449', hoof: '#324c96' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      const wave = state === 'walk' ? frame % 2 : 0;
      const low = state === 'sit' || state === 'lie' || state === 'sleep';
      const y = low ? 6 : 4;
      c.rect(6, y, 6, 6, 'body').rect(7, y - 1, 4, 1, 'light').rect(5, y + 2, 8, 3, 'body');
      c.dot(7, y + 3, 'dark').dot(11, y + 3, 'dark').rect(8, y + 5, 3, 1, 'shade');
      c.line(5, y + 7, 3 + wave, 14, 'shade').line(7, y + 7, 6 - wave, 14, 'body');
      c.line(10, y + 7, 11 + wave, 14, 'body').line(12, y + 7, 14 - wave, 14, 'shade');
      if (state === 'lie' || state === 'sleep') c.rect(5, 11, 8, 2, 'shade');
      if (state === 'sleep') this.drawSleepZ(c);
      return c;
    }
  }

  class GiraffeSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#d9a342', shade: '#a86b2d', light: '#f0c86a', spot: '#8a4d24', mane: '#5b351d', dark: '#2a1a12', hoof: '#3a2417' },
        { body: '#c98e3d', shade: '#88592a', light: '#efbd62', spot: '#70401f', mane: '#4b2c19', dark: '#24160e', hoof: '#302015' },
        { body: '#e1b460', shade: '#aa7534', light: '#f5d384', spot: '#91602d', mane: '#6a3f20', dark: '#2d1b10', hoof: '#3b2517' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(2, 10, 10, 3, 'body').rect(4, 9, 7, 1, 'light').rect(11, 7, 2, 4, 'body').rect(12, 6, 4, 2, 'body');
        c.dot(13, 6, 'dark').dot(12, 5, 'mane').dot(15, 5, 'mane').rect(5, 11, 2, 1, 'spot').rect(9, 10, 2, 1, 'spot');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(4, 9, 8, 4, 'body').rect(7, 8, 5, 1, 'light').rect(11, 4, 2, 6, 'body').rect(12, 3, 4, 3, 'body');
        c.dot(13, 4, 'dark').dot(12, 2, 'mane').dot(15, 2, 'mane').rect(6, 10, 2, 1, 'spot').rect(9, 11, 2, 1, 'spot');
        return c;
      }
      c.rect(3, 9, 9, 3, 'body').rect(5, 8, 6, 1, 'light').rect(11, 3, 2, 7, 'body').rect(12, 2, 4, 3, 'body');
      c.rect(10, 4, 1, 5, 'mane').dot(13, 3, 'dark').dot(12, 1, 'mane').dot(15, 1, 'mane');
      c.rect(5, 10, 2, 1, 'spot').rect(8, 9, 2, 1, 'spot').dot(12, 6, 'spot');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof', { y: 12, h: 1 });
      return c;
    }
  }

  class CatSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#d68a44', shade: '#9d572b', light: '#f2b56a', dark: '#2a1a13', hoof: '#9d572b' },
        { body: '#25282f', shade: '#111318', light: '#6d7480', dark: '#050608', hoof: '#111318' },
        { body: '#e9dfc9', shade: '#b8a98d', light: '#fff2d6', dark: '#4b3d31', hoof: '#9f886f' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      if (state === 'lie' || state === 'sleep') {
        c.rect(4, 10, 8, 3, 'body').rect(11, 8, 4, 3, 'body').dot(12, 7, 'body').dot(14, 7, 'body');
        c.line(4, 10, 1, 8, 'shade').rect(6, 12, 5, 1, 'shade').dot(13, 9, 'dark');
        if (state === 'sleep') this.drawSleepZ(c);
        return c;
      }
      if (state === 'sit') {
        c.rect(6, 7, 6, 6, 'body').rect(11, 5, 4, 4, 'body').dot(12, 4, 'body').dot(14, 4, 'body');
        c.line(5, 8, 3, 5, 'shade').rect(7, 11, 4, 2, 'light').dot(13, 6, 'dark');
        return c;
      }
      c.rect(4, 8, 8, 4, 'body').rect(11, 6, 4, 3, 'body').dot(12, 5, 'body').dot(14, 5, 'body');
      c.line(4, 8, 1, 6, 'shade').rect(6, 9, 4, 1, 'light').dot(13, 7, 'dark');
      this.legs(c, state === 'walk' ? frame : 0, 'hoof', { y: 12, h: 1, leftX: 5, rightX: 10 });
      return c;
    }
  }

  class LizardSprite extends AnimalSprite {
    constructor(variant) {
      const variants = [
        { body: '#4f9a49', shade: '#2f6530', light: '#86c95f', dark: '#17331c', hoof: '#2f6530' },
        { body: '#6aa0bf', shade: '#3c6680', light: '#a5d1e1', dark: '#1b3342', hoof: '#3c6680' },
        { body: '#b96f3d', shade: '#7d4225', light: '#e4a25f', dark: '#3b2117', hoof: '#7d4225' }
      ];
      super(variants[variant % variants.length]);
    }

    draw(state, frame) {
      const c = this.canvas();
      const wave = state === 'walk' ? frame % 2 : 0;
      const y = state === 'sit' ? 9 : 10;
      c.rect(5, y, 8, 3, 'body').rect(7, y - 1, 5, 1, 'light').rect(12, y - 1, 4, 3, 'body');
      c.dot(14, y, 'dark').line(5, y + 1, 1 + wave, y - 1, 'shade');
      c.dot(6, y + 3, 'hoof').dot(9, y + 3, 'hoof').dot(12, y + 3, 'hoof').dot(15, y + 2, 'hoof');
      if (state === 'lie' || state === 'sleep') c.rect(5, y + 2, 8, 1, 'shade');
      if (state === 'sleep') this.drawSleepZ(c);
      return c;
    }
  }

  const animalClasses = {
    chickens: ChickenSprite,
    sheep: SheepSprite,
    ducks: DuckSprite,
    retrievers: RetrieverSprite,
    pigs: PigSprite,
    fish: FishSprite,
    bison: BisonSprite,
    horse: HorseSprite,
    squid: SquidSprite,
    giraffe: GiraffeSprite,
    cat: CatSprite,
    lizard: LizardSprite
  };

  const iconPalette = {
    ink: '#2b2118',
    light: '#fff1bb',
    mid: '#c9903e',
    green: '#4c9b42',
    blue: '#4b72c9',
    red: '#c6453d',
    wood: '#8a532e',
    white: '#f8f0d0',
    yellow: '#ffe05d',
    pink: '#f092a3'
  };

  function drawIcon(name) {
    const c = new PixelCanvas(12, 12, iconPalette);
    if (name === 'study') c.rect(2, 3, 8, 6, 'white').rect(2, 3, 8, 1, 'ink').rect(2, 8, 8, 1, 'ink').rect(2, 3, 1, 6, 'ink').rect(9, 3, 1, 6, 'ink').rect(4, 5, 4, 1, 'blue').rect(4, 7, 3, 1, 'blue');
    else if (name === 'nests') c.rect(2, 7, 8, 2, 'wood').rect(3, 6, 6, 1, 'mid').rect(4, 5, 2, 2, 'white').rect(7, 5, 2, 2, 'white').dot(5, 6, 'blue').dot(8, 6, 'blue');
    else if (name === 'edit') c.rect(3, 2, 6, 8, 'white').rect(3, 2, 6, 1, 'ink').rect(3, 9, 6, 1, 'ink').rect(8, 4, 2, 2, 'mid').line(7, 6, 4, 9, 'mid');
    else if (name === 'stats') c.rect(2, 9, 8, 1, 'ink').rect(3, 6, 2, 3, 'green').rect(6, 3, 2, 6, 'blue').rect(9, 5, 2, 4, 'red');
    else if (name === 'farm') c.rect(2, 4, 8, 1, 'wood').rect(2, 7, 8, 1, 'wood').rect(3, 3, 1, 6, 'wood').rect(8, 3, 1, 6, 'wood');
    else if (name === 'store') c.rect(3, 4, 6, 6, 'white').rect(2, 3, 8, 2, 'red').rect(4, 2, 4, 1, 'ink').rect(5, 6, 2, 1, 'mid');
    else if (name === 'settings') c.rect(5, 0, 2, 2, 'ink').rect(5, 10, 2, 2, 'ink').rect(0, 5, 2, 2, 'ink').rect(10, 5, 2, 2, 'ink').rect(3, 2, 6, 8, 'ink').rect(2, 3, 2, 2, 'ink').rect(8, 3, 2, 2, 'ink').rect(2, 7, 2, 2, 'ink').rect(8, 7, 2, 2, 'ink').rect(4, 3, 4, 6, 'mid').rect(3, 4, 6, 4, 'mid').rect(5, 5, 2, 2, 'light').dot(5, 5, 'blue');
    else if (name === 'focus') c.rect(3, 3, 6, 1, 'blue').rect(2, 4, 1, 4, 'blue').rect(9, 4, 1, 4, 'blue').rect(3, 8, 6, 1, 'blue').rect(4, 4, 4, 4, 'light').rect(5, 5, 2, 2, 'ink');
    else if (name === 'sit') c.rect(5, 3, 3, 2, 'pink').rect(3, 5, 6, 3, 'pink').rect(4, 8, 5, 1, 'pink').rect(2, 9, 8, 1, 'ink').dot(7, 4, 'ink').dot(8, 5, 'ink').rect(4, 7, 1, 2, 'ink').rect(8, 7, 1, 2, 'ink');
    else if (name === 'moon' || name === 'sleep') c.rect(4, 1, 4, 1, 'yellow').rect(3, 2, 5, 1, 'yellow').rect(2, 3, 5, 2, 'yellow').rect(2, 5, 4, 2, 'yellow').rect(3, 7, 4, 2, 'yellow').rect(4, 9, 3, 1, 'yellow').rect(6, 2, 2, 1, 'blue').rect(6, 3, 3, 2, 'blue').rect(5, 5, 3, 2, 'blue').rect(6, 7, 2, 1, 'blue').dot(9, 1, 'white').dot(10, 4, 'white').dot(8, 8, 'white');
    else if (name === 'help') c.rect(4, 2, 4, 1, 'ink').rect(3, 3, 1, 2, 'ink').rect(8, 3, 1, 3, 'ink').rect(6, 5, 2, 1, 'ink').rect(5, 6, 2, 1, 'ink').rect(5, 7, 1, 1, 'ink').rect(5, 9, 2, 2, 'ink').rect(5, 3, 2, 1, 'light').rect(7, 4, 1, 1, 'light');
    else if (name === 'trash') c.rect(3, 3, 6, 1, 'ink').rect(4, 4, 4, 6, 'red').rect(5, 2, 2, 1, 'ink').rect(5, 5, 1, 4, 'ink').rect(7, 5, 1, 4, 'ink');
    else if (name === 'fence') c.rect(1, 4, 10, 1, 'wood').rect(1, 7, 10, 1, 'wood').rect(2, 2, 2, 8, 'mid').rect(8, 2, 2, 8, 'mid');
    else if (name === 'trough') c.rect(1, 5, 10, 1, 'ink').rect(2, 4, 8, 1, 'mid').rect(3, 5, 6, 1, 'blue').rect(1, 6, 10, 3, 'ink').rect(2, 6, 8, 1, 'mid').rect(2, 7, 8, 1, 'wood').rect(2, 8, 8, 1, 'ink').rect(2, 9, 2, 2, 'wood').rect(8, 9, 2, 2, 'wood').dot(3, 10, 'ink').dot(8, 10, 'ink');
    else if (name === 'coop') c.rect(3, 5, 6, 5, 'ink').rect(4, 6, 4, 3, 'wood').rect(2, 4, 8, 2, 'red').rect(4, 3, 4, 1, 'red').rect(5, 7, 2, 3, 'mid').rect(8, 8, 1, 1, 'yellow').rect(9, 9, 1, 1, 'white');
    else c.rect(3, 3, 6, 6, 'mid').rect(4, 4, 4, 4, 'light');
    return c;
  }

  function normalizeState(state) {
    return STATES.indexOf(state) === -1 ? 'stand' : state;
  }

  function renderCells(el, canvas) {
    el.style.setProperty('--sprite-w', canvas.width);
    el.style.setProperty('--sprite-h', canvas.height);
    el.dataset.spriteAspect = String(canvas.width / canvas.height);
    let inner = el.querySelector(':scope > .pixel-sprite-inner');
    if (!inner) {
      inner = document.createElement('span');
      inner.className = 'pixel-sprite-inner';
      el.textContent = '';
      el.appendChild(inner);
    }
    inner.innerHTML = '';
    canvas.list().forEach((cell) => {
      const px = document.createElement('span');
      px.className = 'pixel-cell';
      px.style.gridColumn = String(cell.x + 1);
      px.style.gridRow = String(cell.y + 1);
      px.style.backgroundColor = cell.color;
      inner.appendChild(px);
    });
  }

  function animalCanvas(species, state, frame, variant) {
    const Klass = animalClasses[species] || PigSprite;
    const sprite = new Klass(Number(variant) || 0);
    return sprite.draw(normalizeState(state), Number(frame) || 0);
  }

  function paintAnimal(el, species, opts) {
    opts = opts || {};
    species = SPECIES.indexOf(species) === -1 ? 'pigs' : species;
    const state = normalizeState(opts.state || el.dataset.state || 'stand');
    const frame = Number(opts.frame || 0);
    const variant = Number(opts.variant || el.dataset.variant || 0);
    el.classList.add('pixel-sprite', 'pixel-animal', 'pixel-animal-' + species);
    el.dataset.pixelSprite = species;
    el.dataset.species = species;
    el.dataset.state = state;
    el.dataset.frame = String(frame);
    el.dataset.variant = String(variant);
    renderCells(el, animalCanvas(species, state, frame, variant));
    return el;
  }

  function renderAnimal(species, opts) {
    const el = document.createElement('span');
    return paintAnimal(el, species, opts);
  }

  function paintIcon(el, name) {
    Array.prototype.slice.call(el.classList).forEach((klass) => {
      if (klass.indexOf('pixel-icon-') === 0) el.classList.remove(klass);
    });
    el.classList.add('pixel-sprite', 'pixel-icon', 'pixel-icon-' + name);
    el.dataset.pixelIcon = name;
    renderCells(el, drawIcon(name));
    return el;
  }

  function renderIcon(name) {
    const el = document.createElement('span');
    return paintIcon(el, name);
  }

  function stop(el) {
    if (!el || !el._pixelSpriteTimer) return;
    clearInterval(el._pixelSpriteTimer);
    el._pixelSpriteTimer = null;
  }

  function setState(el, state, frame) {
    if (!el) return null;
    if (el.dataset.pixelIcon) return paintIcon(el, el.dataset.pixelIcon);
    return paintAnimal(el, el.dataset.pixelSprite || el.dataset.species || 'pigs', {
      state: state,
      frame: frame || 0,
      variant: el.dataset.variant || 0
    });
  }

  function animate(el, state, fps) {
    if (!el) return function () {};
    stop(el);
    const speed = Math.max(120, Math.round(1000 / (fps || 4)));
    let frame = Number(el.dataset.frame || 0);
    setState(el, state || el.dataset.state || 'walk', frame);
    el._pixelSpriteTimer = setInterval(function () {
      frame = (frame + 1) % 2;
      setState(el, state || el.dataset.state || 'walk', frame);
    }, speed);
    return function () {
      stop(el);
    };
  }

  function frame(species, opts) {
    opts = opts || {};
    return animalCanvas(species, opts.state || 'stand', opts.frame || 0, opts.variant || 0).list();
  }

  function frames(species, opts) {
    opts = opts || {};
    const state = opts.state || 'walk';
    const count = state === 'walk' ? 4 : 1;
    const out = [];
    for (let i = 0; i < count; i++) out.push(frame(species, Object.assign({}, opts, { state: state, frame: i })));
    return out;
  }

  function create(species, opts) {
    return renderAnimal(species, opts);
  }

  function mount(target, species, opts) {
    if (!target) return null;
    const sprite = renderAnimal(species, opts);
    target.textContent = '';
    target.appendChild(sprite);
    return sprite;
  }

  function hydrateAll(root) {
    const scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-pixel-sprite]'), function (el) {
      paintAnimal(el, el.getAttribute('data-pixel-sprite'), {
        state: el.getAttribute('data-pixel-state') || 'stand',
        variant: el.getAttribute('data-pixel-variant') || 0
      });
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-pixel-icon]'), function (el) {
      paintIcon(el, el.getAttribute('data-pixel-icon'));
    });
  }

  window.PixelSprites = {
    species: SPECIES.slice(),
    states: STATES.slice(),
    create: create,
    render: renderAnimal,
    renderAnimal: renderAnimal,
    paintAnimal: paintAnimal,
    renderIcon: renderIcon,
    paintIcon: paintIcon,
    setState: setState,
    animate: animate,
    stop: stop,
    frame: frame,
    frames: frames,
    mount: mount,
    hydrateAll: hydrateAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { hydrateAll(document); });
  } else {
    hydrateAll(document);
  }
})();
