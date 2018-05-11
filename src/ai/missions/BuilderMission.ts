import {PRIORITY_BUILD} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {TransportAnalysis} from "../../interfaces";
import {DefenseGuru} from "../operations/DefenseGuru";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class BuilderMission extends Mission {

    public builders: Agent[];
    public supplyCarts: Agent[];
    public sites: ConstructionSite[];
    public prioritySites: ConstructionSite[];
    public walls: Structure[];
    public remoteSpawn: boolean;
    public activateBoost: boolean;
    public defenseGuru: DefenseGuru;

    public memory: {
        maxHitsToBuild: number
        max: number
        transportAnalysis: TransportAnalysis
        rampartPos: RoomPosition
        manualTargetId: string
        manualTargetHits: number
        prespawn: number,
    };
    private _analysis: TransportAnalysis;

    /**
     * Spawns a creep to build construction and repair walls. Construction will take priority over walls
     * @param operation
     * @param defenseGuru
     * @param activateBoost
     */
    constructor(operation: Operation, defenseGuru: DefenseGuru, activateBoost = false) {
        super(operation, "builder");
        this.defenseGuru = defenseGuru;
        this.activateBoost = activateBoost;
    }

    public initMission() {
        if (this.room !== this.spawnGroup.room) {
            this.remoteSpawn = true;
        }

        this.sites = this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
        this.prioritySites = _.filter(this.sites, s => PRIORITY_BUILD.indexOf(s.structureType) > -1);

        if (Game.time % 10 === 5) {
            // this should be a little more cpu-friendly since it basically will only run in missionRoom that has construction
            for (const site of this.sites) {
                if (site.structureType === STRUCTURE_RAMPART || site.structureType === STRUCTURE_WALL) {
                    this.memory.maxHitsToBuild = 2000;
                    break;
                }
            }
        }

        if (!this.memory.maxHitsToBuild) this.memory.maxHitsToBuild = 2000;
    }

    public maxBuilders = () => {
        if (this.sites.length === 0 || this.defenseGuru.hostiles.length > 0) {
            return 0;
        }

        const potency = this.findBuilderPotency();
        const builderCost = potency * 100 + Math.ceil(potency / 2) * 50 + 150 * potency;
        return Math.min(Math.ceil(builderCost / this.spawnGroup.maxSpawnEnergy), 3);
    };

    public maxCarts = () => {
        if (this.sites.length === 0 || this.defenseGuru.hostiles.length > 0) {
            return 0;
        }
        return this.analysis.cartsNeeded;
    };

    public builderBody = () => {
        const potency = this.findBuilderPotency();
        if (this.spawnGroup.maxSpawnEnergy < 550) {
            return this.bodyRatio(1, 3, .5, 1, potency);
        }

        const potencyCost = potency * 100 + Math.ceil(potency / 2) * 50;
        const energyForCarry = this.spawnGroup.maxSpawnEnergy - potencyCost;
        const cartCarryCount = this.analysis.carryCount;
        const carryCount = Math.min(Math.floor(energyForCarry / 50), cartCarryCount);
        if (this.spawnGroup.room === this.room) {
            return this.workerBody(potency, carryCount, Math.ceil(potency / 2));
        }
        else {
            return this.workerBody(potency, carryCount, potency);
        }
    };

    public roleCall() {

        let builderMemory;
        if (this.activateBoost) {
            builderMemory = {
                scavanger: RESOURCE_ENERGY,
                boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
                allowUnboosted: true,
            };
        }
        else {
            builderMemory = {scavanger: RESOURCE_ENERGY};
        }

        this.builders = this.headCount(this.name, this.builderBody, this.maxBuilders,
            {prespawn: this.memory.prespawn, memory: builderMemory});
        this.builders = _.sortBy(this.builders, (c: Creep) => c.carry.energy);

        const cartMemory = {
            scavanger: RESOURCE_ENERGY,
        };
        this.supplyCarts = this.headCount(this.name + "Cart",
            () => this.workerBody(0, this.analysis.carryCount, this.analysis.moveCount), this.maxCarts,
            {prespawn: this.memory.prespawn, memory: cartMemory});
    }

    public missionActions() {
        for (const builder of this.builders) {
            this.builderActions(builder);
        }

        for (const cart of this.supplyCarts) {
            this.builderCartActions(cart);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
        this.memory.transportAnalysis = undefined;
        if (Math.random() < 0.01) this.memory.maxHitsToBuild = undefined;
    }

    private builderActions(builder: Agent) {

        this.registerPrespawn(builder);

        const hasLoad = builder.hasLoad() || this.supplyCarts.length > 0;
        if (!hasLoad) {
            builder.procureEnergy();
            return;
        }

        // repair the rampart you just built
        if (this.memory.rampartPos) {
            const rampart = helper.deserializeRoomPosition(this.memory.rampartPos).lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < 10000) {
                if (rampart.pos.inRangeTo(builder, 3)) {
                    builder.repair(rampart);
                }
                else {
                    builder.travelTo(rampart);
                }
                return;
            }
            else {
                this.memory.rampartPos = undefined;
            }
        }

        // has energy
        let closest;
        if (this.prioritySites.length > 0) {
            closest = builder.pos.findClosestByRange(this.prioritySites);
        }
        else {
            closest = builder.pos.findClosestByRange(this.sites);
        }

        if (!closest) {
            this.buildWalls(builder);
            return;
        }

        // has target
        const range = builder.pos.getRangeTo(closest);
        if (range <= 3) {
            const outcome = builder.build(closest);
            if (outcome === OK) {
                builder.yieldRoad(closest);
            }
            if (outcome === OK && closest.structureType === STRUCTURE_RAMPART) {
                this.memory.rampartPos = closest.pos;
            }

            // standing on top of target
            if (range === 0) {
                builder.travelTo(this.flag);
            }
        }
        else {
            builder.travelTo(closest);
        }
    }

    private buildWalls(builder: Agent) {
        const target = this.findMasonTarget(builder);
        if (!target) {
            if (builder.room.controller && builder.room.controller.level < 8) {
                this.upgradeController(builder);
            }
            else {
                builder.idleOffRoad(this.flag);
            }
            return;
        }

        if (builder.pos.inRangeTo(target, 3)) {
            const outcome = builder.repair(target);
            if (outcome === OK) {
                builder.yieldRoad(target);
            }
        }
        else {
            builder.travelTo(target);
        }
    }

    private findMasonTarget(builder: Agent): Structure {
        const manualTarget = this.findManualTarget();
        if (manualTarget) return manualTarget;

        if (this.room.hostiles.length > 0 && this.room.hostiles[0].owner.username !== "Invader") {
            if (!this.walls) {
                this.walls = _(this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL)))
                    .filter((s: Structure) => s.hits)
                    .sortBy("hits")
                    .value() as Structure[];
            }
            const lowest = this.walls[0];
            _.pull(this.walls, lowest);
            if (builder.memory.emergencyRepairId) {
                const structure = Game.getObjectById(builder.memory.emergencyRepairId) as Structure;
                if (structure && !builder.pos.inRangeTo(lowest, 3)) {
                    return structure;
                }
                else {
                    builder.memory.emergencyRepairId = undefined;
                }
            }
            return lowest;
        }

        if (builder.memory.wallId) {
            const wall = Game.getObjectById(builder.memory.wallId) as Structure;
            if (wall && wall.hits < this.memory.maxHitsToBuild) {
                return wall;
            }
            else {
                builder.memory.wallId = undefined;
                return this.findMasonTarget(builder);
            }
        }
        else {
            // look for ramparts under maxHitsToBuild
            let structures = _.filter(this.room.findStructures(STRUCTURE_RAMPART),
                (s: Structure) => s.hits < this.memory.maxHitsToBuild * .9);
            // look for walls under maxHitsToBuild
            if (structures.length === 0) {
                structures = _.filter(this.room.findStructures(STRUCTURE_WALL),
                    (s: Structure) => s.hits < this.memory.maxHitsToBuild * .9);
            }

            if (structures.length === 0) {
                // increase maxHitsToBuild if there are walls/ramparts in missionRoom and re-call function
                if (this.room.findStructures(STRUCTURE_RAMPART).concat(this.room.findStructures(STRUCTURE_WALL).filter((s: Structure) => s.hits)).length > 0) {
                    // TODO: seems to produce some pretty uneven walls, find out why
                    this.memory.maxHitsToBuild += Math.pow(10, Math.floor(Math.log(this.memory.maxHitsToBuild) / Math.log(10)));
                    return this.findMasonTarget(builder);
                }
                // do nothing if there are no walls/ramparts in missionRoom
            }

            const closest = builder.pos.findClosestByRange(structures) as Structure;
            if (closest) {
                builder.memory.wallId = closest.id;
                return closest;
            }
        }
    }

    private findManualTarget() {
        if (this.memory.manualTargetId) {
            const target = Game.getObjectById(this.memory.manualTargetId) as Structure;
            if (target && target.hits < this.memory.manualTargetHits) {
                return target;
            }
            else {
                this.memory.manualTargetId = undefined;
                this.memory.manualTargetHits = undefined;
            }
        }
    }

    private upgradeController(builder: Agent) {
        if (builder.pos.inRangeTo(builder.room.controller, 3)) {
            builder.upgradeController(builder.room.controller);
            builder.yieldRoad(builder.room.controller);
        }
        else {
            builder.travelTo(builder.room.controller);
        }
    }

    private findBuilderPotency() {
        if (this.room.storage) {
            if (this.room.storage.store.energy < 50000) {
                return 1;
            }
            else {
                return Math.min(Math.floor(this.room.storage.store.energy / 7500), 10);
            }
        }
        else {
            return this.room.find(FIND_SOURCES).length * 2;
        }
    }

    private builderCartActions(cart: Agent) {

        const suppliedAgent = _.head(this.builders);
        if (!suppliedAgent) {
            cart.idleOffRoad(this.flag);
            return;
        }

        const hasLoad = cart.hasLoad();
        if (!hasLoad) {
            cart.procureEnergy(suppliedAgent);
            return;
        }

        const rangeToBuilder = cart.pos.getRangeTo(suppliedAgent);
        if (rangeToBuilder > 3) {
            cart.travelTo(suppliedAgent);
            return;
        }

        const overCapacity = cart.carry.energy > suppliedAgent.carryCapacity - suppliedAgent.carry.energy;
        if (suppliedAgent.carry.energy > suppliedAgent.carryCapacity * .5 && overCapacity) {
            cart.yieldRoad(suppliedAgent);
            return;
        }

        if (rangeToBuilder > 1) {
            cart.travelTo(suppliedAgent);
            return;
        }

        cart.transfer(suppliedAgent.creep, RESOURCE_ENERGY);
        if (!overCapacity && this.room.storage) {
            cart.travelTo(this.room.storage);
        }
    }

    get analysis(): TransportAnalysis {
        if (!this._analysis) {
            const potency = this.findBuilderPotency();
            let distance = 20;
            if (this.room.storage) {
                distance = 10;
            }
            this._analysis = this.cacheTransportAnalysis(distance, potency * 5);
        }
        return this._analysis;
    }
}
