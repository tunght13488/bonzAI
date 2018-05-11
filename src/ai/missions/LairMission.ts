import {helper} from "../../helpers/helper";
import {Operation} from "../operations/Operation";
import {traveler} from "../Traveler";
import {Agent} from "./Agent";
import {HostileAgent} from "./HostileAgent";
import {InvaderGuru} from "./InvaderGuru";
import {Mission} from "./Mission";

export class LairMission extends Mission {

    public memory: {
        bestLairOrder: string[];
        nextLairCheck: number;
    };

    private trappers: Agent[];
    private scavengers: Agent[];
    private rangers: Agent[];
    private lairs: StructureKeeperLair[];
    private targetLair: StructureKeeperLair;
    private storeStructure: StructureStorage | StructureContainer | StructureTerminal;
    private invaderGuru: InvaderGuru;

    constructor(operation: Operation, invaderGuru: InvaderGuru) {
        super(operation, "lair");
        this.invaderGuru = invaderGuru;
    }

    public initMission() {
        if (!this.hasVision) return; // early

        this.lairs = this.findLairs();
        this.assignKeepers();
        this.targetLair = this.findTargetLair();
        this.storeStructure = this.spawnGroup.room.storage;
        this.distanceToSpawn = this.operation.remoteSpawn.distance;
    }

    private maxTrappers = () => 1;
    private trapperBody = () => this.configBody({move: 25, attack: 19, heal: 6});
    private maxScavangers = () => 1;
    private scavangerBody = () => this.workerBody(0, 33, 17);
    private maxRangers = () => this.invaderGuru.invadersPresent || this.invaderGuru.invaderProbable ? 1 : 0;
    private rangerBody = () => this.configBody({[RANGED_ATTACK]: 25, [MOVE]: 17, [HEAL]: 8});

    public roleCall() {
        this.trappers = this.headCount("trapper", this.trapperBody, this.maxTrappers, {
            prespawn: this.distanceToSpawn + 100,
            skipMoveToRoom: true,
        });

        this.scavengers = this.headCount("scavenger", this.scavangerBody, this.maxScavangers, {
            prespawn: this.distanceToSpawn,
        });

        this.rangers = [];
        // this.rangers = this.headCount("ranger", this.rangerBody, this.maxRangers, {
        //   prespawn: this.distanceToSpawn + 50,
        // });
    }

    public missionActions() {
        if (this.invaderGuru.invadersPresent) {
            const invaderKiller = this.findInvaderDuty();
            // if (!invaderKiller) { this.assignInvaderDuty(); }
        }

        for (const trapper of this.trappers) {
            if (trapper.memory.invaderDuty && this.invaderGuru.invadersPresent) {
                this.invaderDutyActions(trapper);
            }
            else {
                this.trapperActions(trapper);
            }
        }

        for (const scavenger of this.scavengers) {
            this.scavengersActions(scavenger);
        }

        for (const ranger of this.rangers) {
            this.rangerActions(ranger);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private trapperActions(trapper: Agent) {
        if (!this.targetLair) {
            if (trapper.hits < trapper.hitsMax) {
                trapper.heal(trapper);
            }
            trapper.travelTo(this.flag);
            return; // early
        }

        let isAttacking = false;
        let range;
        const nearestHostile = trapper.pos.findClosestByRange(this.room.hostiles) as Creep;
        if (nearestHostile && trapper.pos.isNearTo(nearestHostile)) {
            isAttacking = trapper.attack(nearestHostile) === OK;
            trapper.move(trapper.pos.getDirectionTo(nearestHostile));
        }
        else {
            const keeper = this.targetLair.keeper;
            if (keeper) {
                range = trapper.pos.getRangeTo(keeper);
                if (range > 1) {
                    trapper.travelTo(keeper);
                }
            }
            else {
                trapper.travelTo(this.targetLair, {range: 1});
            }
        }

        if (!isAttacking && (trapper.hits < trapper.hitsMax || range <= 3)) {
            trapper.heal(trapper);
        }
    }

    private scavengersActions(scavenger: Agent) {

        const fleeing = scavenger.fleeHostiles();
        if (fleeing) return; // early

        const hasLoad = scavenger.hasLoad();
        if (hasLoad) {
            const storage = this.storeStructure;
            if (scavenger.pos.isNearTo(storage)) {
                scavenger.transfer(storage, RESOURCE_ENERGY);
                scavenger.travelTo(this.flag);
            }
            else {
                scavenger.travelTo(storage);
            }
            return;
        }

        const closest = this.findDroppedEnergy(scavenger);
        if (closest) {
            if (scavenger.pos.isNearTo(closest)) {
                scavenger.pickup(closest);
                scavenger.say("yoink!", true);
            }
            else {
                scavenger.travelTo(closest);
            }
        }
        else {
            scavenger.idleNear(this.flag);
        }
    }

    private assignKeepers() {
        if (!this.lairs) return;
        const lairs = this.room.findStructures(STRUCTURE_KEEPER_LAIR);
        const hostiles = this.room.hostiles;
        for (const hostile of hostiles) {
            if (hostile.owner.username === "Source Keeper") {
                const closestLair = hostile.pos.findClosestByRange(lairs) as StructureKeeperLair;
                if (!_.includes(this.lairs, closestLair)) continue;
                closestLair.keeper = hostile;
            }
        }
    }

    private findTargetLair() {
        if (this.lairs.length > 0) {
            let lowestTicks = Number.MAX_VALUE;
            let lowestLair;
            for (const lair of this.lairs) {
                let lastTicks = 0;
                if (lair.keeper) {
                    return lair;
                }
                else {
                    // if this lair is going to spawn sooner than the last one in the list, return it
                    if (lair.ticksToSpawn < lastTicks) {
                        return lair;
                    }
                    lastTicks = lair.ticksToSpawn;
                    if (lair.ticksToSpawn < lowestTicks) {
                        lowestLair = lair;
                        lowestTicks = lair.ticksToSpawn;
                    }
                }
            }
            return lowestLair;
        }
    }

    private findDroppedEnergy(scavenger: Agent): Resource {
        if (scavenger.memory.resourceId) {
            const resource = Game.getObjectById(scavenger.memory.resourceId) as Resource;
            if (resource) {
                return resource;
            }
            else {
                scavenger.memory.resourceId = undefined;
                return this.findDroppedEnergy(scavenger);
            }
        }
        else {
            const resource = scavenger.pos.findClosestByRange(
                _.filter(this.room.find(FIND_DROPPED_RESOURCES),
                    (r: Resource) => r.amount > 100 && r.resourceType === RESOURCE_ENERGY) as Resource[]);
            if (resource) {
                scavenger.memory.resourceId = resource.id;
                return resource;
            }
        }
    }

    private bestLairOrder(): string[] {
        const keeperLairs: StructureKeeperLair[] = this.room.findStructures<StructureKeeperLair>(STRUCTURE_KEEPER_LAIR);
        const distanceBetweenLairAB: { [AtoB: string]: number } = {};

        let order = 0;
        const indices = _.map(keeperLairs, lair => order++);

        console.log(`Finding best keeper path in ${this.room.name}`);

        let bestPermutation: number[];
        let bestSum = Number.MAX_VALUE;
        for (const permutation of helper.permutator(indices)) {
            let sum = 0;
            for (let i = 0; i < permutation.length; i++) {
                const indexA = permutation[i];
                const indexB = permutation[(i + 1) % permutation.length];
                const key = _.sortBy([indexA, indexB]).join("");
                if (!distanceBetweenLairAB[key]) {
                    distanceBetweenLairAB[key] = traveler.findTravelPath(keeperLairs[indexA], keeperLairs[indexB]).path.length;
                }

                sum += distanceBetweenLairAB[key];
            }

            if (sum < bestSum) {
                console.log(`new shortest (${sum}) `, _.map(permutation,
                    i => [keeperLairs[i].pos.x, keeperLairs[i].pos.y] + " to ").join(""));
                bestSum = sum;
                bestPermutation = permutation;
            }
        }

        return _.map(bestPermutation, index => keeperLairs[index].id);
    }

    private findLairs(): StructureKeeperLair[] {
        if (!this.memory.bestLairOrder || Game.time >= this.memory.nextLairCheck) {
            this.memory.bestLairOrder = this.bestLairOrder();
            this.memory.nextLairCheck = Game.time + helper.randomInterval(10000);
        }

        return _.map(this.memory.bestLairOrder, id => Game.getObjectById<StructureKeeperLair>(id));
    }

    private assignInvaderDuty() {
        const lastTrapperSpawned = _.last(this.trappers);
        if (!lastTrapperSpawned) { return; }

        const keepersInRange = _.filter(lastTrapperSpawned.pos.findInRange<Creep>(FIND_HOSTILE_CREEPS, 1),
            creep => creep.owner.username === "Source Keeper");
        if (keepersInRange.length > 0) { return; }

        lastTrapperSpawned.memory.invaderDuty = true;
    }

    private rangerActions(ranger: Agent) {
        if (!this.invaderGuru.invadersPresent) {
            this.medicActions(ranger);
            return;
        }

        // attacking
        ranger.standardRangedAttack();

        // healing
        ranger.standardHealing(this.rangers.concat(this.trappers));

        if (Game.time === ranger.memory.leaderControl) { return; }

        const tactic = this.rangerTactic(ranger);

        // charge
        if (tactic === RangerTactic.Charge) {
            const bestTarget = this.findBestTarget(ranger);

            let movingTarget = false;
            if (ranger.room !== this.room) {
                movingTarget = true;
            }
            ranger.travelTo(bestTarget, {range: 0, movingTarget});
            return;
        }

        const chasers = _.filter(this.invaderGuru.invaders,
            hostileAgent => hostileAgent.potentials[RANGED_ATTACK] > 0);
        if (tactic === RangerTactic.Retreat) {
            ranger.fleeByPath(chasers, 5, 5);
        }
        else if (tactic === RangerTactic.HitAndRun) {
            ranger.fleeByPath(chasers, 2, 0);
        }
    }

    private findInvaderDuty(): Agent {
        return _.find(this.trappers, t => t.memory.invaderDuty);
    }

    private invaderDutyActions(trapper: Agent) {
        const ranger = trapper.pos.findClosestByRange(this.rangers);
        if (!ranger) {
            this.soloDutyActions(trapper);
            return;
        }

        const attackedCreep = trapper.standardMelee(2000);

        if (!trapper.isNearTo(ranger)) {
            if (!trapper.memory.needHeal && trapper.hits < trapper.hitsMax - 500) {
                trapper.memory.needHeal = true;
            }
            if (trapper.memory.needHeal && trapper.hits === trapper.hitsMax) {
                trapper.memory.needHeal = false;
            }

            if (trapper.memory.needHeal) {
                if (!attackedCreep) { trapper.heal(trapper); }
                trapper.fleeByPath(this.room.fleeObjects, 5, 5);
                return;
            }

            if (!attackedCreep && trapper.hits < trapper.hitsMax) { trapper.heal(trapper); }
            trapper.travelTo(ranger);
            return;
        }

        ranger.memory.leaderControl = Game.time;

        const target = this.findBestTarget(trapper);
        if (target.potentials[HEAL] > 0) {
            trapper.travelTo(target, {range: 0});
            ranger.travelTo(trapper, {range: 0});
            return;
        }
        else {
            ranger.travelTo(target, {range: 0});
            trapper.travelTo(target, {range: 0});
        }
    }

    private soloDutyActions(trapper: Agent) {
        const fleeing = trapper.fleeByPath(this.invaderGuru.invaders, 10, 5);
        if (!fleeing) {
            this.trapperActions(trapper);
        }
    }

    private rangerTactic(ranger: Agent): RangerTactic {
        const healPotential = ranger.getActiveBodyparts(HEAL) * 12;
        if (ranger.hits < ranger.hitsMax - healPotential) {
            return RangerTactic.Retreat;
        }

        const expectedDamage = _.sum(ranger.pos.findInRange(this.invaderGuru.invaders, 5),
            hostileAgent => hostileAgent.potentials[RANGED_ATTACK]);
        if (expectedDamage > healPotential) {
            return RangerTactic.HitAndRun;
        }
        else {
            return RangerTactic.Charge;
        }
    }

    private findBestTarget(agent: Agent): HostileAgent {
        let bestTarget = _(this.invaderGuru.invaders)
            .filter(hostileAgent => hostileAgent.potentials[HEAL] > 0)
            .sortBy(hostileAgent => hostileAgent.pos.getRangeTo(agent))
            .head();
        if (!bestTarget) {
            bestTarget = _(this.invaderGuru.invaders)
                .sortBy(hostileAgent => hostileAgent.pos.getRangeTo(agent))
                .head();
        }
        return bestTarget;
    }
}

enum RangerTactic { Retreat, HitAndRun, Charge }
