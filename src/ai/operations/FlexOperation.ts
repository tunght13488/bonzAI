import {helper} from "../../helpers/helper";
import {Coord} from "../../interfaces";
import {FlexGenerator} from "../FlexGenerator";
import {ControllerOperation} from "./ControllerOperation";

export class FlexOperation extends ControllerOperation {

    public staticStructures = {
        [STRUCTURE_STORAGE]: [{x: 0, y: -3}],
        [STRUCTURE_TERMINAL]: [{x: -2, y: -1}],
        [STRUCTURE_SPAWN]: [{x: -2, y: 1}, {x: -1, y: 2}, {x: 0, y: 3}],
        [STRUCTURE_NUKER]: [{x: 3, y: 0}],
        [STRUCTURE_POWER_SPAWN]: [{x: -3, y: 0}],
        [STRUCTURE_LAB]: [
            {x: 1, y: 0}, {x: 2, y: 1}, {x: 0, y: 1},
            {x: 1, y: 2}, {x: 2, y: 0}, {x: 0, y: 2},
            {x: 0, y: -1}, {x: -1, y: 0}, {x: 1, y: -1}, {x: -1, y: 1}],
    };

    protected temporaryPlacement(level: number) {
        if (!this.memory.temporaryPlacement) this.memory.temporaryPlacement = {};
        if (!this.memory.temporaryPlacement[level]) {

            const actions: Array<{ actionType: string, structureType: string, coord: Coord }> = [];

            // links
            if (level === 5) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: -1}});
            }
            if (level === 6) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 1, y: -1}});
            }
            if (level === 7) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 0, y: -1}});
            }
            if (level === 8) {
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 1, y: -1}});
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 0, y: -1}});
            }

            for (const action of actions) {
                let outcome;
                const position = helper.coordToPosition(action.coord, this.memory.centerPosition, this.memory.rotation);
                if (action.actionType === "place") {
                    outcome = position.createConstructionSite(action.structureType);
                }
                else {
                    const structure = position.lookForStructure(action.structureType);
                    if (structure) {
                        outcome = structure.destroy();
                    }
                    else {
                        outcome = "noStructure";
                    }
                }

                if (outcome === OK) {
                    console.log(`LAYOUT: ${action.actionType}d temporary ${action.structureType} (${this.name}, level: ${level})`);
                }
                else {
                    console.log(`LAYOUT: problem with temp placement, please follow up in ${this.name}`);
                    console.log(`tried to ${action.actionType} ${action.structureType} at level ${level}, outcome: ${outcome}`);
                }
            }

            this.memory.temporaryPlacement[level] = true;
        }
    }

    protected initAutoLayout() {
        if (!this.memory.layoutMap) {
            if (this.memory.flexLayoutMap) {
                // temporary patch for variable identifier change
                this.memory.layoutMap = this.memory.flexLayoutMap;
                this.memory.radius = this.memory.flexRadius;
            }
            else {
                const map = new FlexGenerator(this.memory.centerPosition, this.memory.rotation, this.staticStructures);
                this.memory.layoutMap = map.generate();
                this.memory.radius = map.radius + 1;
            }
        }
    }
}
