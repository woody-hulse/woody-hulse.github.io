(function () {
  const SPECIES = [
    { id: 'chickens', base: 15, yield: 1 },
    { id: 'sheep', base: 100, yield: 4 },
    { id: 'ducks', base: 1100, yield: 15 },
    { id: 'retrievers', base: 12000, yield: 55 },
    { id: 'pigs', base: 130000, yield: 190 },
    { id: 'fish', base: 1400000, yield: 650 },
    { id: 'bison', base: 8500000, yield: 1700 },
    { id: 'horse', base: 45000000, yield: 4300 },
    { id: 'squid', base: 210000000, yield: 11000 },
    { id: 'giraffe', base: 980000000, yield: 27000 },
    { id: 'cat', base: 4200000000, yield: 64000 },
    { id: 'lizard', base: 18000000000, yield: 150000 }
  ];

  const SAME_SPECIES_PRICE_GROWTH = 1.22;
  const REPEAT_YIELD_DECAY = 0.92;
  const DIVERSITY_BONUS_PER_SPECIES = 0.05;
  const MAX_DIVERSITY_BONUS = 0.25;
  const FARM_BONUS_SOFT_CAP = 3;
  const FLOWER_PRICE_GROWTH = 1.18;
  const PASSIVE_CARD_EQUIVALENTS_PER_HOUR = 4;
  const PASSIVE_FULL_HOURS = 2;
  const PASSIVE_OFFLINE_CAP_HOURS = 8;
  const PASSIVE_DAMPED_HOUR_VALUE = 0.5;
  const PASSIVE_INACTIVE_MULTIPLIER = 0.35;

  function roundMoney(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function safeCount(animals, id) {
    const n = animals && Number(animals[id]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function copySpecies(spec) {
    return Object.assign({}, spec);
  }

  class EconomyCatalog {
    constructor(species) {
      this._species = species.slice();
      this._byId = {};
      this._species.forEach((spec, index) => {
        this._byId[spec.id] = Object.assign({ index: index }, spec);
      });
      this.priceGrowth = SAME_SPECIES_PRICE_GROWTH;
      this.flowerPriceGrowth = FLOWER_PRICE_GROWTH;
    }

    species() {
      return this._species.map(copySpecies);
    }

    speciesIds() {
      return this._species.map(function (spec) { return spec.id; });
    }

    spec(id) {
      return this._byId[id] || null;
    }

    buyPrice(speciesId, ownedCount) {
      const spec = this.spec(speciesId);
      if (!spec) return 0;
      const owned = Math.max(0, Math.floor(Number(ownedCount) || 0));
      return roundMoney(spec.base * Math.pow(this.priceGrowth, owned));
    }

    sellPrice(speciesId, ownedCount) {
      return roundMoney(this.buyPrice(speciesId, ownedCount) * 0.5);
    }

    incomeBase(animals) {
      let total = 1;
      let speciesOwned = 0;
      this._species.forEach((spec) => {
        const count = safeCount(animals, spec.id);
        if (!count) return;
        speciesOwned += 1;
        for (let i = 0; i < count; i++) {
          total += spec.yield * Math.pow(REPEAT_YIELD_DECAY, i);
        }
      });
      const diversityBonus = Math.min(
        MAX_DIVERSITY_BONUS,
        Math.max(0, speciesOwned - 1) * DIVERSITY_BONUS_PER_SPECIES
      );
      return roundMoney(total * (1 + diversityBonus));
    }

    farmMultiplier(troughMultiplier, flowerMultiplier) {
      const trough = Number.isFinite(Number(troughMultiplier)) ? Math.max(1, Number(troughMultiplier)) : 1;
      const flower = Number.isFinite(Number(flowerMultiplier)) ? Math.max(1, Number(flowerMultiplier)) : 1;
      const rawBonus = Math.max(0, trough * flower - 1);
      const softBonus = rawBonus / (1 + rawBonus / FARM_BONUS_SOFT_CAP);
      return roundMoney(1 + softBonus);
    }

    cardReward(animals, farmMultiplier) {
      const farm = Number.isFinite(Number(farmMultiplier)) ? Math.max(1, Number(farmMultiplier)) : 1;
      return roundMoney(this.incomeBase(animals) * farm);
    }

    passiveHourly(animals, farmMultiplier) {
      const farm = Number.isFinite(Number(farmMultiplier)) ? Math.max(1, Number(farmMultiplier)) : 1;
      const animalCardValue = Math.max(0, this.incomeBase(animals) - 1) * farm;
      return roundMoney(animalCardValue * PASSIVE_CARD_EQUIVALENTS_PER_HOUR);
    }

    passiveAccrual(animals, farmMultiplier, elapsedMs, carry, active) {
      const elapsedHours = Math.max(0, (Number(elapsedMs) || 0) / 3600000);
      const cappedHours = Math.min(elapsedHours, PASSIVE_OFFLINE_CAP_HOURS);
      const effectiveHours = cappedHours <= PASSIVE_FULL_HOURS
        ? cappedHours
        : PASSIVE_FULL_HOURS + ((cappedHours - PASSIVE_FULL_HOURS) * PASSIVE_DAMPED_HOUR_VALUE);
      const activityMultiplier = active ? 1 : PASSIVE_INACTIVE_MULTIPLIER;
      const raw = (this.passiveHourly(animals, farmMultiplier) * effectiveHours * activityMultiplier) + Math.max(0, Number(carry) || 0);
      const amount = Math.floor((raw + 1e-9) * 100) / 100;
      return {
        amount: roundMoney(amount),
        carry: Math.max(0, raw - amount),
        creditedSeconds: Math.floor(effectiveHours * 3600),
        elapsedSeconds: Math.floor(cappedHours * 3600),
        capped: elapsedHours > cappedHours
      };
    }

    highestUnlockedIndex(animals, unlockedAnimals) {
      const unlocked = Array.isArray(unlockedAnimals) ? unlockedAnimals : [];
      let index = -1;
      this._species.forEach((spec, i) => {
        if (safeCount(animals, spec.id) > 0 || unlocked.indexOf(spec.id) !== -1) {
          index = Math.max(index, i);
        }
      });
      return index;
    }

    unlockedAnimals(animals, unlockedAnimals) {
      const out = [];
      const seen = {};
      const unlocked = Array.isArray(unlockedAnimals) ? unlockedAnimals : [];
      this._species.forEach((spec) => {
        if (safeCount(animals, spec.id) > 0 || unlocked.indexOf(spec.id) !== -1) {
          out.push(spec.id);
          seen[spec.id] = true;
        }
      });
      unlocked.forEach((id) => {
        if (this.spec(id) && !seen[id]) out.push(id);
      });
      return out;
    }

    visibilityFor(animals, unlockedAnimals, speciesId) {
      const spec = this.spec(speciesId);
      if (!spec) return { tier: 'hidden', offset: Infinity };
      const last = this.highestUnlockedIndex(animals, unlockedAnimals);
      const offset = spec.index - last;
      if (offset <= 2) return { tier: 'visible', offset: offset };
      if (offset <= 4) return { tier: 'silhouette', offset: offset };
      return { tier: 'hidden', offset: offset };
    }

    percentFromMultiplier(multiplier) {
      return Math.round((Math.max(1, Number(multiplier) || 1) - 1) * 100);
    }
  }

  window.StudyEconomy = new EconomyCatalog(SPECIES);
})();
