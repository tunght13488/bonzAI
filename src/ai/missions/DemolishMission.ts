import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class DemolishMission extends Mission {

    public demolishers: Agent[];
    public scavangers: Agent[];

    public demoFlags: Flag[] = [];
    public demoStructures: Structure[] = [];
    public potency: number;
    public storeStructure: StructureContainer | StructureStorage | StructureTerminal;

    /**
     * Spawn a demolisher when there are flags that match his pattern ("Flag + n"), he will visit those flags and remove the
     * structures underneath. This pattern happens to be the default flag pattern used by the game UI, be careful
     * @param operation
     * @param potency
     * @param storeStructure When a storeStructure is provided, it will spawn a scavanger to deliver energy
     * @param allowSpawn
     */
    constructor(operation: Operation) {
        super(operation, "demolish");
    }

    public initMission() {
        for (let i = 0; i <= 50; i++) {
            const flag = Game.flags["Flag" + i];
            if (!flag) continue;
            this.demoFlags.push(flag);
            if (!flag.room) continue;
            const structure = flag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure) {
                this.demoStructures.push(structure);
            }
            else {
                flag.remove();
            }
        }

        this.storeStructure = this.checkStoreStructure();
    }

    public getMaxDemolishers = () => {
        if (this.demoFlags.length === 0) { return 0; }
        if (this.memory.max !== undefined) { return this.memory.max; }
        return 1;
    };
    public getMaxScavengers = () => this.demoFlags.length > 0 && this.storeStructure ? 1 : 0;

    public roleCall() {

        this.demolishers = this.headCount("demolisher", () => this.bodyRatio(1, 0, 1, 1), this.getMaxDemolishers);
        this.scavangers = this.headCount("scavanger", () => this.bodyRatio(0, 1, 1, 1), this.getMaxScavengers);
    }

    public missionActions() {
        for (const demolisher of this.demolishers) {
            this.demolisherActions(demolisher);
        }

        for (const scavanger of this.scavangers) {
            this.scavangerActions(scavanger, _.head(this.demolishers));
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private demolisherActions(demolisher: Agent) {
        const structure = _.head(this.demoStructures);
        if (structure) {
            if (demolisher.pos.isNearTo(structure)) {
                demolisher.dismantle(structure);
            }
            else {
                demolisher.travelTo(structure);
            }
            return;
        }

        const flag = _.head(this.demoFlags);
        if (flag) {
            demolisher.travelTo(flag);
            return;
        }

        demolisher.idleOffRoad(this.flag);
    }

    private scavangerActions(scavanger: Agent, demolisher: Agent) {

        if (!demolisher || scavanger.room !== demolisher.room) {
            if (this.demoFlags.length > 0) {
                scavanger.travelTo(this.demoFlags[0]);
            }
            else {
                scavanger.idleOffRoad();
            }
            return;
        }

        const hasLoad = scavanger.hasLoad();
        if (!hasLoad) {

            const resource = this.findScavangerResource(scavanger, demolisher);
            if (resource) {
                if (scavanger.pos.isNearTo(resource)) {
                    scavanger.pickup(resource);
                }
                else {
                    scavanger.travelTo(resource);
                }
            }
            else {
                scavanger.travelTo(demolisher);
            }
            return; // early
        }

        if (_.sum(this.storeStructure.store) === this.storeStructure.storeCapacity) {
            scavanger.idleOffRoad(demolisher);
            return; // early
        }

        if (scavanger.pos.isNearTo(this.storeStructure)) {
            scavanger.transfer(this.storeStructure, RESOURCE_ENERGY);
            scavanger.memory.resourceId = undefined;
        }
        else {
            scavanger.travelTo(this.storeStructure);
        }

    }

    private findScavangerResource(scavanger: Agent, demolisher: Agent): Resource {
        if (scavanger.memory.resourceId) {
            const resource = Game.getObjectById(scavanger.memory.resourceId) as Resource;
            if (resource) {
                return resource;
            }
            else {
                scavanger.memory.resourceId = undefined;
                return this.findScavangerResource(scavanger, demolisher);
            }
        }
        else {
            const resources = _.filter(demolisher.room.find(FIND_DROPPED_RESOURCES),
                (r: Resource) => r.resourceType === RESOURCE_ENERGY);
            const closest = scavanger.pos.findClosestByRange(resources) as Resource;
            if (closest) {
                scavanger.memory.resourceId = closest.id;
                return closest;
            }
        }
    }

    private checkStoreStructure(): StructureContainer | StructureStorage | StructureTerminal {

        const flag = Game.flags[`${this.operation.name}_store`];
        if (flag && flag.room) {
            const storeStructure = _(flag.pos.lookFor(LOOK_STRUCTURES))
                .filter((s: any) => s.store !== undefined)
                .head() as StructureContainer | StructureStorage | StructureTerminal;
            if (storeStructure) return storeStructure;
        }
    }
}
