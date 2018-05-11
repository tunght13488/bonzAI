import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class PaverMission extends Mission {

    public pavers: Agent[];
    public potency: number;

    constructor(operation) {
        super(operation, "paver");
    }

    public initMission() {
        if (!this.hasVision) return; // early

        if (!this.memory.potency) {
            const roads = this.room.findStructures(STRUCTURE_ROAD) as StructureRoad[];
            let sum = 0;
            for (const road of roads) {
                sum += road.hitsMax;
            }
            this.memory.potency = Math.max(Math.ceil(sum / 500000), 1);
        }
        this.potency = this.memory.potency;
    }

    public roleCall() {

        const max = () => this.room && this.room.findStructures(STRUCTURE_ROAD).length > 0 ? 1 : 0;
        const body = () => {
            if (this.spawnGroup.maxSpawnEnergy <= 550) {
                return this.bodyRatio(1, 3, 1, 1);
            }
            else {
                return this.workerBody(this.potency, 3 * this.potency, 2 * this.potency);
            }
        };
        this.pavers = this.headCount(this.name, body, max, {prespawn: 10});
    }

    public missionActions() {
        for (const paver of this.pavers) {
            this.deprecatedPaverActions(paver);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
        if (Math.random() < .01) this.memory.potency = undefined;
    }

    private deprecatedPaverActions(paver: Agent) {

        const fleeing = paver.fleeHostiles();
        if (fleeing) return; // early

        const withinRoom = paver.pos.roomName === this.flag.pos.roomName;
        if (!withinRoom) {
            paver.travelTo(this.flag);
            return;
        }

        // I'm in the missionRoom
        paver.memory.scavanger = RESOURCE_ENERGY;
        const hasLoad = paver.hasLoad();
        if (!hasLoad) {
            paver.procureEnergy();
            return;
        }

        // I'm in the missionRoom and I have energy
        const findRoad = () => {
            return _.filter(paver.room.findStructures(STRUCTURE_ROAD),
                (s: Structure) => s.hits < s.hitsMax - 1000)[0] as Structure;
        };
        const forget = (s: Structure) => s.hits === s.hitsMax;
        const target = paver.rememberStructure(findRoad, forget);
        if (!target) {
            let repairing = false;
            if (this.room.controller && this.room.controller.my) {
                repairing = this.repairContainers(paver);
            }
            if (!repairing) {
                paver.memory.hasLoad = paver.carry.energy === paver.carryCapacity;
                paver.idleOffRoad(this.flag);
            }
            return;
        }

        // and I have a target
        const range = paver.pos.getRangeTo(target);
        if (range > 3) {
            paver.travelTo(target);
            // repair any damaged road i'm standing on
            const road = paver.pos.lookForStructure(STRUCTURE_ROAD);
            if (road && road.hits < road.hitsMax - 100) {
                paver.repair(road);
            }
            return;
        }

        // and i'm in range
        paver.repair(target);
        paver.yieldRoad(target);
    }

    private repairContainers(paver: Agent): boolean {
        const disrepairedContainer = paver.rememberStructure(() => {
            return _(this.room.findStructures(STRUCTURE_CONTAINER))
                .filter((c: StructureContainer) => {
                    return c.hits < c.hitsMax * .5
                        && !c.pos.isNearTo(c.room.find<Mineral>(FIND_MINERALS)[0]);
                })
                .head() as StructureContainer;
        }, (s: Structure) => {
            return s.hits === s.hitsMax;
        });

        if (disrepairedContainer) {
            if (paver.pos.isNearTo(disrepairedContainer)) {
                paver.repair(disrepairedContainer);
                paver.yieldRoad(disrepairedContainer);
            }
            else {
                paver.travelTo(disrepairedContainer);
            }
            return true;
        }
        else {
            return false;
        }
    }
}
