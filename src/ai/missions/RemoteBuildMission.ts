import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class RemoteBuildMission extends Mission {

    public builders: Agent[];
    public construction: ConstructionSite[];
    public recycleWhenDone: boolean;
    private boost: boolean;

    /**
     * Builds construction in remote locations, can recycle self when finished
     * @param operation
     * @param recycleWhenDone - recycles creep in spawnroom if there are no available construction sites
     * @param allowSpawn
     */

    constructor(operation: Operation, recycleWhenDone: boolean, allowSpawn = true) {
        super(operation, "remoteBuild");
        this.recycleWhenDone = recycleWhenDone;
        this.allowSpawn = allowSpawn;
    }

    public initMission() {
        if (!this.hasVision) {
            return; // early
        }

        this.construction = this.room.find<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }

    public roleCall() {
        const maxBuilders = () => this.construction && this.construction.length > 0 ? 1 : 0;
        const getBody = () => {
            return this.bodyRatio(1, 1, 1, .8, 10);
        };
        let memory;
        if (this.memory.activateBoost || (this.room.controller && this.room.controller.my)) {
            memory = {boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID], allowUnboosted: true};
        }
        this.builders = this.headCount("remoteBuilder", getBody, maxBuilders, {memory});
    }

    public missionActions() {
        for (const builder of this.builders) {
            if (!this.waypoints && this.recycleWhenDone && this.construction.length === 0) {
                this.recycleBuilder(builder);
            }
            else {
                this.builderActions(builder);
            }
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private builderActions(builder: Agent) {

        const fleeing = builder.fleeHostiles();
        if (fleeing) return; // early

        if (!this.hasVision) {
            if (!builder.pos.isNearTo(this.flag)) {
                builder.travelTo(this.flag);
            }
            return; // early
        }

        builder.stealNearby("creep");

        const hasLoad = builder.hasLoad();
        if (!hasLoad) {
            builder.procureEnergy(undefined, true, true);
            return; // early
        }

        const closest = this.findConstruction(builder);
        if (!closest) {
            builder.idleNear(this.flag);
            return; // early
        }

        if (builder.pos.inRangeTo(closest, 3)) {
            builder.build(closest);
            builder.yieldRoad(closest);
        }
        else {
            builder.travelTo(closest);
        }
    }

    private recycleBuilder(builder: Agent) {
        const spawn = this.spawnGroup.spawns[0];
        if (builder.carry.energy > 0 && spawn.room.storage) {
            if (builder.pos.isNearTo(spawn.room.storage)) {
                builder.transfer(spawn.room.storage, RESOURCE_ENERGY);
            }
            else {
                builder.travelTo(spawn.room.storage);
            }
        }
        else {
            const _spawn = this.spawnGroup.spawns[0];
            if (builder.pos.isNearTo(_spawn)) {
                _spawn.recycleCreep(builder.creep);
            }
            else {
                builder.travelTo(_spawn);
            }
        }
    }

    private findConstruction(builder: Agent): ConstructionSite {
        if (builder.memory.siteId) {
            const site = Game.getObjectById<ConstructionSite>(builder.memory.siteId);
            if (site) {
                return site;
            }
            else {
                delete builder.memory.siteId;
                return this.findConstruction(builder);
            }
        }
        else {
            const site = builder.pos.findClosestByRange<ConstructionSite>(this.construction);
            if (site) {
                builder.memory.siteId = site.id;
                return site;
            }
        }
    }
}
