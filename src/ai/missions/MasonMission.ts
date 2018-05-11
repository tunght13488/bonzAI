import {DefenseGuru} from "../operations/DefenseGuru";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Guru} from "./Guru";
import {Mission} from "./Mission";

const SANDBAG_THRESHOLD = 1000000;

export class MasonMission extends Mission {

    public masons: Agent[];
    public carts: Agent[];
    public defenseGuru: DefenseGuru;

    private _sandbags: RoomPosition[];

    constructor(operation: Operation, defenseGuru: DefenseGuru) {
        super(operation, "mason");
        this.defenseGuru = defenseGuru;
    }

    public initMission() {
    }

    public maxMasons = () => {
        return this.needMason ? Math.ceil(this.room.storage.store.energy / 500000) : 0;
    };

    public maxCarts = () => {
        if (this.needMason && this.defenseGuru.hostiles.length > 0) { return 1; }
        else { return 0; }
    };

    public roleCall() {
        let boosts;
        let allowUnboosted = true;
        if (this.defenseGuru.hostiles.length > 0) {
            boosts = [RESOURCE_CATALYZED_LEMERGIUM_ACID];
            allowUnboosted = !(this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 1000);
        }
        this.masons = this.headCount("mason", () => this.workerBody(16, 8, 12), this.maxMasons, {
            boosts,
            allowUnboosted,
            prespawn: 1,
        });
        this.carts = this.headCount("masonCart", () => this.workerBody(0, 4, 2), this.maxCarts);
    }

    public missionActions() {

        for (const mason of this.masons) {
            if (this.defenseGuru.hostiles.length > 0) {
                this.sandbagActions(mason);
            }
            else {
                this.masonActions(mason);
            }
        }

        for (const cart of this.carts) {
            this.masonCartActions(cart);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
        this.memory.needMason = undefined;
    }

    private masonActions(agent: Agent) {

        const rampart = this.getRampart(agent);
        if (!rampart) {
            agent.idleOffRoad();
            return;
        }

        agent.creep.repair(rampart);

        let stolen = false;
        if (!agent.isFull(200)) {
            stolen = agent.stealNearby(STRUCTURE_EXTENSION) === OK;
        }

        if (agent.isFull(300) || stolen) {
            agent.idleNear(rampart, 3, true);
            return;
        }
        else {
            const extension = this.getExtension(agent, rampart);
            const outcome = agent.retrieve(extension, RESOURCE_ENERGY);
            if (outcome === OK && !agent.creep.pos.inRangeTo(rampart, 3)) {
                agent.travelTo(rampart);
            }
        }
    }

    private sandbagActions(agent: Agent) {

        if (agent.creep.ticksToLive > 400 &&
            !agent.creep.body.find((p: BodyPartDefinition) => p.boost === RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
            if (this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 1000) {
                agent.resetPrep();
            }
        }

        const construction = this.findConstruction(agent);
        if (construction) {
            agent.travelToAndBuild(construction);
            return;
        }

        const emergencySandbag = this.getEmergencySandbag(agent);
        if (emergencySandbag) {
            if (agent.pos.inRangeTo(emergencySandbag, 3)) {
                agent.creep.repair(emergencySandbag);
            }
            else {
                agent.travelTo(emergencySandbag);
            }
        }
    }

    private masonCartActions(agent: Agent) {

        const lowestMason = _(this.masons).sortBy((a: Agent) => a.creep.carry.energy).head();
        if (!lowestMason || !this.room.storage) {
            agent.idleOffRoad();
            return;
        }

        if (agent.isFull()) {
            const outcome = agent.deliver(lowestMason.creep, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(this.room.storage);
            }
        }
        else {
            const outcome = agent.retrieve(this.room.storage, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(lowestMason);
            }
        }
    }

    get needMason() {
        if (!this.memory.needMason) {
            if (this.room.controller.level < 8) {
                this.memory.needMason = false;
            }
            else {
                const MIN_RAMPART_HITS = 50000000;
                const lowestRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART)).sortBy("hits").head();
                this.memory.needMason = lowestRampart && lowestRampart.hits < MIN_RAMPART_HITS;
            }
        }
        return this.memory.needMason;
    }

    get sandbags(): RoomPosition[] {
        if (!this._sandbags) {
            if (!this.memory.sandbags) {
                const sandbags = this.findSandbags();
                this.memory.sandbags = Guru.serializePositions(sandbags);
            }
            this._sandbags = Guru.deserializePositions(this.memory.sandbags, this.room.name);
        }
        return this._sandbags;
    }

    public getEmergencySandbag(agent: Agent): Structure {

        const emergencyThreshold = SANDBAG_THRESHOLD / 10;

        const nextConstruction: RoomPosition[] = [];
        for (const sandbag of this.sandbags) {
            const rampart = sandbag.lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < emergencyThreshold) {
                return rampart;
            }
            if (!rampart) {
                nextConstruction.push(sandbag);
            }
        }

        if (this.room.find(FIND_CONSTRUCTION_SITES).length > 0) { return; }

        const bestPosition = agent.pos.findClosestByRange(this.defenseGuru.hostiles).pos.findClosestByRange(nextConstruction);
        if (bestPosition) {
            bestPosition.createConstructionSite(STRUCTURE_RAMPART);
        }
    }

    private findSandbags(): RoomPosition[] {

        let leftBound = 50;
        let rightBound = 0;
        let topBound = 50;
        let bottomBound = 0;
        const wallRamparts = [];
        for (const rampart of this.room.findStructures<Structure>(STRUCTURE_RAMPART)) {
            if (rampart.pos.lookForStructure(STRUCTURE_ROAD)) continue;
            if (rampart.pos.lookForStructure(STRUCTURE_EXTENSION)) continue;
            wallRamparts.push(rampart);
            if (rampart.pos.x < leftBound) { leftBound = rampart.pos.x; }
            if (rampart.pos.x > rightBound) { rightBound = rampart.pos.x; }
            if (rampart.pos.y < topBound) { topBound = rampart.pos.y; }
            if (rampart.pos.y > bottomBound) { bottomBound = rampart.pos.y; }
        }

        console.log(leftBound, rightBound, topBound, bottomBound);

        const sandbags = [];
        for (const structure of this.room.find<Structure>(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_RAMPART) continue;
            if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) continue;
            const nearbyRampart = structure.pos.findInRange(wallRamparts, 2)[0];
            if (!nearbyRampart) continue;
            if (structure.pos.x < leftBound || structure.pos.x > rightBound) continue;
            if (structure.pos.y < topBound || structure.pos.y > bottomBound) continue;
            sandbags.push(structure.pos);
        }

        return sandbags;
    }

    public getRampart(agent: Agent): Structure {
        const findRampart = () => {
            let lowestHits = 100000;
            const lowestRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART)).sortBy("hits").head();
            if (lowestRampart) {
                lowestHits = lowestRampart.hits;
            }
            const myRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART))
                .filter((s: Structure) => s.hits < lowestHits + 100000)
                .sortBy((s: Structure) => agent.pos.getRangeTo(s))
                .head();
            if (myRampart) return myRampart;
        };
        const forgetRampart = (s: Structure) => agent.creep.ticksToLive % 500 === 0;
        return agent.rememberStructure(findRampart, forgetRampart, "rampartId") as Structure;
    }

    public getExtension(agent: Agent, rampart: Structure): StructureExtension | StructureStorage {
        const fullExtensions = _.filter(this.room.findStructures<StructureExtension>(STRUCTURE_EXTENSION),
            (e: StructureExtension) => e.energy > 0);
        const extension = rampart.pos.findClosestByRange<StructureExtension>(fullExtensions);
        return agent.pos.findClosestByRange([this.room.storage, extension]);
    }

    public findConstruction(agent: Agent): ConstructionSite {
        return agent.pos.findClosestByRange<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }
}
