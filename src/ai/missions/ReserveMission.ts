import {helper} from "../../helpers/helper";
import {empire} from "../../helpers/loopHelper";
import {notifier} from "../../notifier";
import {Operation} from "../operations/Operation";
import {ARTROOMS} from "../WorldMap";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class ReserveMission extends Mission {

    public reservers: Agent[];
    public bulldozers: Agent[];
    public controller: StructureController;

    public memory: {
        wallCheck: boolean;
        needBulldozer: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public initMission() {
        if (!this.hasVision) return; //
        this.controller = this.room.controller;

        if (this.memory.needBulldozer === undefined) {
            this.memory.needBulldozer = this.checkBulldozer();
        }
    }

    public roleCall() {
        const needReserver = () => !this.controller.my && (!this.controller.reservation ||
            this.controller.reservation.ticksToEnd < 3000) ? 1 : 0;
        const potency = this.spawnGroup.room.controller.level === 8 ? 5 : 2;
        const reserverBody = () => this.configBody({
            claim: potency,
            move: potency,
        });
        this.reservers = this.headCount("claimer", reserverBody, needReserver);
        this.bulldozers = this.headCount("dozer", () => this.bodyRatio(4, 0, 1, 1),
            () => this.memory.needBulldozer ? 1 : 0);
    }

    public missionActions() {
        for (const reserver of this.reservers) {
            this.reserverActions(reserver);
        }

        for (const dozer of this.bulldozers) {
            this.bulldozerActions(dozer);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private reserverActions(reserver: Agent) {
        if (!this.controller) {
            reserver.travelTo(this.flag);
            return; // early
        }

        if (reserver.pos.isNearTo(this.controller)) {
            reserver.reserveController(this.controller);
            if (!this.memory.wallCheck) {
                this.memory.wallCheck = this.destroyWalls(reserver, this.room);
            }
        }
        else {
            reserver.travelTo(this.controller);
        }
    }

    private destroyWalls(surveyor: Agent, room: Room): boolean {
        if (!room.controller) return true;

        if (room.controller.my) {
            room.findStructures(STRUCTURE_WALL).forEach((w: Structure) => w.destroy());
            if (room.controller.level === 1) {
                room.controller.unclaim();
            }
            return true;
        }
        else {
            const roomAvailable = Game.gcl.level - _.filter(Game.rooms, (r: Room) => r.controller && r.controller.my).length;
            if (this.room.findStructures(STRUCTURE_WALL).length > 0 && !ARTROOMS[room.name] && roomAvailable > 0) {
                surveyor.claimController(room.controller);
                return false;
            }
            else {
                return true;
            }
        }
    }

    private checkBulldozer(): boolean {
        const ret = empire.traveler.findTravelPath(this.spawnGroup, this.room.controller);
        if (!ret.incomplete) {
            console.log(`RESERVER: No bulldozer necessary in ${this.operation.name}`);
            return false;
        }

        const ignoredStructures = empire.traveler.findTravelPath(this.spawnGroup, this.room.controller,
            {range: 1, ignoreStructures: true});
        if (ignoredStructures.incomplete) {
            notifier.log(`RESERVER: bad bulldozer path in ${this.operation.name}, please investigate.`);
            console.log(helper.debugPath(ret.path, this.operation.name));
            return false;
        }

        for (const position of ignoredStructures.path) {
            if (position.roomName !== this.room.name) { continue; }
            if (position.isPassable(true)) { continue; }
            if (position.lookForStructure(STRUCTURE_WALL) || position.lookForStructure(STRUCTURE_RAMPART)) {
                return true;
            }
        }
    }

    private bulldozerActions(dozer: Agent) {

        if (dozer.pos.isNearTo(this.room.controller)) {
            this.memory.needBulldozer = false;
            notifier.log(`RESERVER: bulldozer cleared path in ${this.operation.name}`);
            dozer.suicide();
        }
        else {
            if (dozer.room === this.room) {
                const returnData: { nextPos: RoomPosition } = {nextPos: undefined};
                dozer.travelTo(this.room.controller, {
                    ignoreStructures: true,
                    ignoreStuck: true,
                    returnData,
                });

                if (returnData.nextPos) {
                    const structure = returnData.nextPos.lookFor<Structure>(LOOK_STRUCTURES)[0];
                    if (structure) {
                        dozer.dismantle(structure);
                    }
                }
            }
            else {
                dozer.travelTo(this.room.controller);
            }
        }
    }
}
