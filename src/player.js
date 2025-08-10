export class Player {
    constructor(className) {
        this.className = className;
        this.x = 100;
        this.y = 100;
        this.hp = 100;
        this.maxHp = 100;
        this.mp = 50;
        this.maxMp = 50;
        this.attackSpeed = 1; // attacks/sec
        this.skillCooldowns = {}; // { skillName: nextAvailableTime }
        this.skillRange = {};     // per-skill range
        this.manaCost = {};       // per-skill mana cost
        this.baseDamage = 5;
        this.speed = 2;
        this.stealthed = false;
        this.stealthEndTime = 0;

        this.setClassStats(className);
    }

    setClassStats(cls) {
        if (cls === 'warrior') {
            this.maxHp = 200;
            this.hp = 200;
            this.maxMp = 40;
            this.mp = 40;
            this.baseDamage = 12;
            this.attackSpeed = 0.8;
        }
        if (cls === 'mage') {
            this.maxHp = 80;
            this.hp = 80;
            this.maxMp = 150;
            this.mp = 150;
            this.baseDamage = 20;
            this.attackSpeed = 0.6;
        }
        if (cls === 'rogue') {
            this.maxHp = 120;
            this.hp = 120;
            this.maxMp = 60;
            this.mp = 60;
            this.baseDamage = 10;
            this.attackSpeed = 1.5;
        }
        if (cls === 'ranger') {
            this.maxHp = 100;
            this.hp = 100;
            this.maxMp = 80;
            this.mp = 80;
            this.baseDamage = 8;
            this.attackSpeed = 1.2;
        }

        // Example skill setups
        this.skillRange = {
            basic: cls === 'ranger' ? 300 : 150,
            fireball: 200,
            vanish: 0
        };
        this.manaCost = {
            basic: 0,
            fireball: 20,
            vanish: 15
        };
        this.skillCooldowns = {
            basic: 0,
            fireball: 0,
            vanish: 0
        };
    }

    canUseSkill(skill) {
        const now = performance.now();
        return (
            now >= this.skillCooldowns[skill] &&
            this.mp >= this.manaCost[skill]
        );
    }

    useSkill(skill, targetX, targetY) {
        const now = performance.now();
        if (!this.canUseSkill(skill)) return false;

        // Check range
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this.skillRange[skill] > 0 && dist > this.skillRange[skill]) {
            console.log(`${skill} is out of range`);
            return false;
        }

        // Deduct mana & set cooldown
        this.mp -= this.manaCost[skill];
        if (skill === 'basic') {
            this.skillCooldowns[skill] = now + (1000 / this.attackSpeed);
        } else if (skill === 'fireball') {
            this.skillCooldowns[skill] = now + 1500; // 1.5s cooldown
        } else if (skill === 'vanish') {
            this.skillCooldowns[skill] = now + 10000; // 10s cooldown
            this.stealthed = true;
            this.stealthEndTime = now + 5000; // 5s stealth
        }

        console.log(`Used ${skill} on (${targetX}, ${targetY})`);
        return true;
    }

    update() {
        const now = performance.now();
        if (this.stealthed && now > this.stealthEndTime) {
            this.stealthed = false;
        }
    }
}
