import {helper} from "../../helpers/helper";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";
import {SurveyAnalyzer} from "./SurveyAnalyzer";

export class SurveyMission extends Mission {

    public surveyors: Agent[];
    public needsVision: string;
    public chosenRoom: { roomName: string, orderDemolition: boolean };
    public memory: {
        surveyComplete: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "survey");
    }

    public initMission() {
        if (this.memory.surveyComplete) { return; }
        const analyzer = new SurveyAnalyzer(this);
        this.needsVision = analyzer.run();
    }

    public maxSurveyors = () => {
        if (this.needsVision && !this.room.findStructures(STRUCTURE_OBSERVER)[0] || this.chosenRoom) {
            return 1;
        }
        else {
            return 0;
        }
    };

    public roleCall() {

        this.surveyors = this.headCount("surveyor", () => this.workerBody(0, 0, 1), this.maxSurveyors);
    }

    public missionActions() {

        for (const surveyor of this.surveyors) {
            if (this.needsVision) {
                this.explorerActions(surveyor);
            }
        }

        if (this.needsVision) {
            const observer = this.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (!observer) { return; }
            observer.observeRoom(this.needsVision);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    public explorerActions(explorer: Agent) {
        if (this.needsVision) {
            explorer.travelTo({pos: helper.pathablePosition(this.needsVision)});
        }
    }
}
