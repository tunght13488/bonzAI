import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class ClaimMission extends Mission {

    public claimers: Agent[];
    public controller: StructureController;
    public getMax = () => (this.controller && !this.controller.my) || !this.hasVision ? 1 : 0;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public initMission() {
        // if (!this.hasVision) return; // early
        if (this.room) {
            this.controller = this.room.controller;
        }
    }

    public roleCall() {
        this.claimers = this.headCount("claimer", () => [CLAIM, MOVE], this.getMax, {blindSpawn: true});
    }

    public missionActions() {

        for (const claimer of this.claimers) {
            this.claimerActions(claimer);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private claimerActions(claimer: Agent) {
        console.log(`ey`);
        if (!this.controller) {
            claimer.idleOffRoad();
            return; // early
        }

        if (claimer.pos.isNearTo(this.controller)) {
            claimer.claimController(this.controller);
        }
        else {
            claimer.travelTo(this.controller);
        }
    }
}
