import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class ScoutMission extends Mission {

    public scouts: Agent[];

    constructor(operation) {
        super(operation, "scout");
    }

    public initMission() {
    }

    public roleCall() {
        const maxScouts = () => this.hasVision ? 0 : 1;
        this.scouts = this.headCount(this.name, () => this.workerBody(0, 0, 1), maxScouts, {blindSpawn: true});
    }

    public missionActions() {
        for (const scout of this.scouts) {

            if (!scout.pos.isNearTo(this.flag)) {
                scout.avoidSK(this.flag);
            }
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }
}
